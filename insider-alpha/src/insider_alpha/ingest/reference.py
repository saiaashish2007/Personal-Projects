"""CIK to ticker mapping and issuer reference data (SIC, exchange, entity type).

Two facts drive the design here.

First, ``company_tickers.json`` is a *current* snapshot. It says what ticker a CIK
trades under today, and it contains no entry at all for a company that has since been
acquired or liquidated. Using it alone to attach prices to historical filings both
misdates every ticker change and silently deletes the delisted names.

Second, the Form 4 table already carries a ``ticker`` column stamped at filing time.
Twelve thousand issuers filing several times a year for fifteen years is a dense,
genuinely historical CIK-to-ticker panel that costs nothing extra to build. The
point-in-time map below is assembled from that panel and reconciled against the
current snapshot, which contributes the tail interval for still-listed names.

SIC codes and listing venue come from ``data.sec.gov/submissions/CIK##########.json``,
one request per issuer, rate limited and cached to disk.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

from insider_alpha.config import DATA_RAW, SEC_USER_AGENT
from insider_alpha.utils import normalize_cik, normalize_ticker, with_columns

log = logging.getLogger(__name__)

_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"

_HEADERS = {"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate"}

# The SEC's published ceiling is 10 requests/second. Sitting at 8 leaves headroom for
# the burstiness of a thread pool without ever touching the limit.
_MAX_REQUESTS_PER_SECOND = 8.0
_SUBMISSION_WORKERS = 4
_MAX_RETRIES = 3

# A ticker that appears on only one or two filings for an issuer is far more likely to
# be a filer-agent typo than a real listing, and typos are what create phantom
# collisions with another issuer's genuine symbol.
_MIN_FILINGS_FOR_TICKER = 2

_FAR_PAST = pd.Timestamp("1900-01-01")
_FAR_FUTURE = pd.Timestamp("2262-01-01")

# SIC divisions per the SEC's own grouping. Used for the sector neutralization in
# SPEC.md 7.3; a two-digit major group would slice the cross-section too thin for the
# realized event density.
_SIC_DIVISIONS: tuple[tuple[int, int, str], ...] = (
    (100, 999, "Agriculture, Forestry, Fishing"),
    (1000, 1499, "Mining"),
    (1500, 1799, "Construction"),
    (2000, 3999, "Manufacturing"),
    (4000, 4999, "Transportation & Utilities"),
    (5000, 5199, "Wholesale Trade"),
    (5200, 5999, "Retail Trade"),
    (6000, 6799, "Finance, Insurance, Real Estate"),
    (7000, 8999, "Services"),
    (9100, 9999, "Public Administration"),
)

SIC_REIT = 6798
SIC_CLOSED_END_FUND = 6726
SIC_BLANK_CHECK = 6770


class _RateLimiter:
    """Token-bucket limiter shared across the submissions thread pool."""

    def __init__(self, per_second: float) -> None:
        self._interval = 1.0 / per_second
        self._lock = threading.Lock()
        self._next_allowed = 0.0

    def acquire(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = max(0.0, self._next_allowed - now)
            self._next_allowed = max(now, self._next_allowed) + self._interval
        if wait:
            time.sleep(wait)


def sic_division(sic: pd.Series) -> pd.Series:
    """Map four-digit SIC codes onto their division label."""
    codes = pd.to_numeric(sic, errors="coerce")
    out = pd.Series(pd.NA, index=sic.index, dtype="string")
    for low, high, label in _SIC_DIVISIONS:
        out = out.mask(codes.between(low, high), label)
    return out


def fetch_company_tickers(*, cache_dir: Path | None = None, force: bool = False) -> pd.DataFrame:
    """Current CIK to ticker snapshot from the SEC, cached on disk.

    Returns columns ``cik``, ``ticker``, ``company_name``.
    """
    cache_dir = cache_dir or (DATA_RAW / "sec")
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / "company_tickers.json"

    if force or not path.exists():
        response = requests.get(_COMPANY_TICKERS_URL, headers=_HEADERS, timeout=60)
        response.raise_for_status()
        path.write_bytes(response.content)
        log.info("downloaded company_tickers.json (%.1f KB)", path.stat().st_size / 1e3)

    payload = json.loads(path.read_text())
    frame = pd.DataFrame(list(payload.values()))
    frame = frame.rename(columns={"cik_str": "cik", "title": "company_name"})
    return with_columns(
        frame.drop(columns=["cik", "ticker"]),
        cik=normalize_cik(frame["cik"]),
        ticker=normalize_ticker(frame["ticker"]),
    ).dropna(subset=["cik", "ticker"])[["cik", "ticker", "company_name"]]


def historical_ticker_spans(trades: pd.DataFrame) -> pd.DataFrame:
    """Observed (issuer, ticker) intervals from Form 4 filing-time trading symbols.

    One row per issuer-ticker pair with the first and last filing date on which the
    issuer reported that symbol, plus the filing count backing it.
    """
    frame = trades[["issuer_cik", "ticker", "filing_date"]].dropna(subset=["issuer_cik"])
    frame = with_columns(
        frame.drop(columns=["issuer_cik", "ticker"]),
        cik=normalize_cik(frame["issuer_cik"]),
        ticker=normalize_ticker(frame["ticker"]),
    ).dropna(subset=["cik", "ticker"])

    spans = frame.groupby(["cik", "ticker"], as_index=False).agg(
        first_seen=("filing_date", "min"),
        last_seen=("filing_date", "max"),
        n_filings=("filing_date", "size"),
    )
    return spans.sort_values(["cik", "first_seen"]).reset_index(drop=True)


def build_pit_ticker_map(
    trades: pd.DataFrame,
    current: pd.DataFrame,
    *,
    min_filings: int = _MIN_FILINGS_FOR_TICKER,
) -> pd.DataFrame:
    """Assemble a point-in-time CIK to ticker map with validity intervals.

    Returns ``cik``, ``ticker``, ``valid_from``, ``valid_to`` (half-open, so a date
    belongs to the interval when ``valid_from <= date < valid_to``), plus provenance.

    Interval construction, per issuer:

    - Sort the observed symbols by the filing date they first appear on. Each symbol is
      valid from that date until the next symbol's first appearance.
    - The issuer's current symbol from ``company_tickers.json`` extends to the far
      future. An issuer absent from the current snapshot has been acquired or
      liquidated, so its last observed symbol is closed out at the last filing date it
      appeared on plus a short grace window — leaving it open to the far future is what
      lets a *recycled* symbol pull another company's prices into this one's history.

    Then, per symbol, the earliest claim is back-extended to the far past, so the fact
    that Form 4 history only starts in 2011 does not leave the beginning of the price
    panel unmapped. Back-extending after collision resolution rather than before is
    deliberate: doing it first would give a successor company a claim reaching back
    before the predecessor even existed.

    Ticker changes are therefore dated to the first filing that used the new symbol,
    which lags the actual change by up to a filing interval. Symbols supported by fewer
    than ``min_filings`` filings are discarded as filer-agent typos.
    """
    spans = historical_ticker_spans(trades)
    spans = spans[spans["n_filings"] >= min_filings]

    current_by_cik = current.drop_duplicates("cik", keep="first").set_index("cik")["ticker"]

    rows: list[dict[str, object]] = []
    for cik, group in spans.groupby("cik", sort=False):
        group = group.sort_values(["first_seen", "n_filings"], ascending=[True, False])
        symbols = list(group.itertuples(index=False))
        live_ticker = current_by_cik.get(cik)

        for i, span in enumerate(symbols):
            if i + 1 < len(symbols):
                valid_to = symbols[i + 1].first_seen
            elif live_ticker is not None and live_ticker == span.ticker:
                valid_to = _FAR_FUTURE
            else:
                # Still listed but under a symbol we never observed, or gone entirely.
                # Either way the evidence for this symbol stops at the last filing.
                valid_to = span.last_seen + pd.Timedelta(days=90)
            rows.append(
                {
                    "cik": cik,
                    "ticker": span.ticker,
                    "valid_from": span.first_seen,
                    "valid_to": valid_to,
                    "n_filings": span.n_filings,
                    "source": "form4",
                }
            )

        if live_ticker is not None and live_ticker not in {s.ticker for s in symbols}:
            rows.append(
                {
                    "cik": cik,
                    "ticker": live_ticker,
                    "valid_from": symbols[-1].last_seen,
                    "valid_to": _FAR_FUTURE,
                    "n_filings": 0,
                    "source": "sec_current",
                }
            )

    # Issuers in the current snapshot that never filed a Form 4 in the window are still
    # valid universe candidates. They take over a symbol only once the filing evidence
    # for it runs out — a company that reorganizes into a fresh registrant inherits its
    # own ticker, and Exxon does exactly this, so treating the new CIK as the owner from
    # the beginning of time would erase fifteen years of Exxon's identity.
    evidence_ends = (
        pd.DataFrame(rows).groupby("ticker")["valid_to"].max() if rows else pd.Series(dtype="O")
    )
    seen_ciks = set(spans["cik"].unique())
    extra = current[~current["cik"].isin(seen_ciks)]
    for row in extra.itertuples(index=False):
        rows.append(
            {
                "cik": row.cik,
                "ticker": row.ticker,
                "valid_from": evidence_ends.get(row.ticker, _FAR_PAST),
                "valid_to": _FAR_FUTURE,
                "n_filings": 0,
                "source": "sec_current",
            }
        )

    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    frame = frame[frame["valid_from"] < frame["valid_to"]]
    resolved = _resolve_ticker_collisions(frame)
    return _backfill_earliest_claims(resolved).sort_values(
        ["ticker", "valid_from"]
    ).reset_index(drop=True)


def _backfill_earliest_claims(spans: pd.DataFrame) -> pd.DataFrame:
    """Extend a claim back to the far past when it opens both its symbol and its issuer.

    Both conditions are needed. Extending every symbol's first claim would hand a
    company's *second* ticker a validity window covering the years it traded under the
    first one; extending every issuer's first claim would let a successor's history
    reach back over the predecessor that used to own the symbol.
    """
    first_for_ticker = spans.groupby("ticker")["valid_from"].transform("min")
    first_for_cik = spans.groupby("cik")["valid_from"].transform("min")
    opens_both = spans["valid_from"].eq(first_for_ticker) & spans["valid_from"].eq(first_for_cik)
    return with_columns(
        spans.drop(columns=["valid_from"]),
        valid_from=spans["valid_from"].mask(opens_both, _FAR_PAST),
    )[spans.columns]


def _resolve_ticker_collisions(spans: pd.DataFrame) -> pd.DataFrame:
    """Truncate overlapping claims on the same symbol by different issuers.

    Symbols are reused. When one company is acquired or delisted the exchange hands its
    symbol to someone else, and a naive ticker join then attributes the successor's
    prices to the predecessor. Within each symbol, claims are ordered by start date and
    each is truncated at the next claimant's start, which is the honest reading of the
    evidence: the predecessor owned the symbol until the successor started using it.

    Claims left with an empty interval are dropped and logged.
    """
    resolved: list[pd.DataFrame] = []
    collisions = 0

    for ticker, group in spans.groupby("ticker", sort=False):
        group = group.sort_values(["valid_from", "n_filings"], ascending=[True, False])
        if len(group) == 1:
            resolved.append(group)
            continue

        collisions += 1
        starts = group["valid_from"].to_numpy()
        next_start = pd.Series(list(starts[1:]) + [_FAR_FUTURE], index=group.index)
        truncated = with_columns(
            group.drop(columns=["valid_to"]),
            valid_to=group["valid_to"].where(group["valid_to"] <= next_start, next_start),
        )
        kept = truncated[truncated["valid_from"] < truncated["valid_to"]]
        if len(kept) < len(truncated):
            log.debug("ticker %s: dropped %d empty claims", ticker, len(truncated) - len(kept))
        resolved.append(kept[spans.columns])

    if collisions:
        log.info("resolved %d tickers claimed by more than one CIK", collisions)
    return pd.concat(resolved, ignore_index=True)


def cik_for_ticker_at(pit_map: pd.DataFrame, pairs: pd.DataFrame) -> pd.Series:
    """Resolve ``ticker`` as of ``date`` to the CIK that owned the symbol then.

    ``pairs`` needs ``ticker`` and ``date`` columns. Returns a CIK series aligned to
    ``pairs.index``, NA where the symbol has no claimant covering that date.
    """
    # merge_asof requires the join keys to match exactly on dtype. Datetime resolution
    # survives a parquet round trip as seconds rather than nanoseconds, and a ticker
    # column arrives as either object or the pandas string dtype depending on which
    # stage produced it.
    left = pd.DataFrame(
        {
            "ticker": pairs["ticker"].astype(object),
            "date": pairs["date"].astype("datetime64[ns]"),
        },
        index=pairs.index,
    ).sort_values("date")
    right = pd.DataFrame(
        {
            "ticker": pit_map["ticker"].astype(object),
            "cik": pit_map["cik"].astype(object),
            "valid_to": pit_map["valid_to"].astype("datetime64[ns]"),
            "valid_from": pit_map["valid_from"].astype("datetime64[ns]"),
        }
    ).sort_values("valid_from")

    merged = pd.merge_asof(
        left,
        right[["ticker", "valid_from", "valid_to", "cik"]],
        left_on="date",
        right_on="valid_from",
        by="ticker",
        direction="backward",
        allow_exact_matches=True,
    )
    merged.index = left.index
    return merged["cik"].where(merged["date"] < merged["valid_to"]).reindex(pairs.index)


def _fetch_submission(cik: str, limiter: _RateLimiter) -> dict[str, object] | None:
    url = _SUBMISSIONS_URL.format(cik=cik)
    delay = 1.0
    for attempt in range(1, _MAX_RETRIES + 1):
        limiter.acquire()
        try:
            response = requests.get(url, headers=_HEADERS, timeout=30)
        except requests.RequestException as exc:
            log.debug("submissions request error for %s (attempt %d): %s", cik, attempt, exc)
            time.sleep(delay)
            delay *= 2
            continue
        if response.status_code == 404:
            return None
        if response.status_code == 200:
            payload = response.json()
            return {
                "cik": cik,
                "company_name": payload.get("name"),
                "sic": payload.get("sic") or None,
                "sic_description": payload.get("sicDescription") or None,
                "entity_type": payload.get("entityType") or None,
                # Both lists occasionally contain a bare null for a company that
                # deregistered without a venue on file.
                "exchanges": ",".join(x for x in (payload.get("exchanges") or []) if x),
                "tickers": ",".join(t for t in (payload.get("tickers") or []) if t),
                "state_of_incorporation": payload.get("stateOfIncorporation") or None,
            }
        log.debug("HTTP %d for %s (attempt %d)", response.status_code, cik, attempt)
        time.sleep(delay)
        delay *= 2
    return None


def fetch_issuer_reference(
    ciks: list[str],
    *,
    cache_path: Path | None = None,
    force: bool = False,
) -> pd.DataFrame:
    """SIC code, listing venue, and entity type per issuer from EDGAR submissions.

    Results accumulate in a single JSON-lines cache so a re-run only fetches CIKs it
    has never seen. There is no bulk equivalent small enough to be worth preferring
    here — the alternative is the 1.4 GB ``submissions.zip`` — so this is the one place
    in the pipeline that makes thousands of individual SEC requests, held to 8 per
    second against the published ceiling of 10.
    """
    cache_path = cache_path or (DATA_RAW / "sec" / "issuer_reference.jsonl")
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    cached: dict[str, dict[str, object]] = {}
    if cache_path.exists() and not force:
        for line in cache_path.read_text().splitlines():
            if line.strip():
                record = json.loads(line)
                cached[record["cik"]] = record

    wanted = sorted({c for c in ciks if isinstance(c, str)})
    missing = [c for c in wanted if c not in cached]
    log.info("issuer reference: %d cached, %d to fetch", len(wanted) - len(missing), len(missing))

    if missing:
        limiter = _RateLimiter(_MAX_REQUESTS_PER_SECOND)
        written = 0
        with cache_path.open("a") as handle, ThreadPoolExecutor(_SUBMISSION_WORKERS) as pool:
            for record in pool.map(lambda c: _fetch_submission(c, limiter), missing):
                if record is None:
                    continue
                handle.write(json.dumps(record) + "\n")
                cached[str(record["cik"])] = record
                written += 1
                if written % 500 == 0:
                    handle.flush()
                    log.info("  fetched %d/%d submissions", written, len(missing))
        log.info("issuer reference: fetched %d new records", written)

    frame = pd.DataFrame([cached[c] for c in wanted if c in cached])
    if frame.empty:
        return pd.DataFrame(
            columns=[
                "cik", "company_name", "sic", "sic_description", "entity_type",
                "exchanges", "tickers", "state_of_incorporation", "sic_division",
            ]
        )
    return with_columns(frame, sic_division=sic_division(frame["sic"]))
