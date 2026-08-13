"""Daily OHLCV for the US cross-section, with split-unadjusted prices reconstructed.

**Source choice.** Stooq's bulk daily US archive was evaluated first and rejected: the
``/db/h/`` files return HTTP 401 behind a paid subscription, and the whole site now
sits behind a JavaScript proof-of-work challenge, so neither the bulk archive nor the
per-symbol CSV endpoint is reachable programmatically. That leaves yfinance. Measured
throughput with an eight-way thread pool is ~17 symbols/second for thirteen years of
history, so the full ~18,500-symbol candidate list takes under twenty minutes — batching
makes the per-ticker request pattern a non-issue. The real cost of yfinance is
survivorship, quantified in :func:`coverage_report` and documented in SPEC.md 13.

**Split adjustment.** Yahoo back-adjusts both ``Close`` and ``Volume`` for splits, so a
stock that later split 10:1 shows a $180 close in 2015 as $18. That silently breaks two
things in SPEC.md 3: the $5 price screen, and market cap formed against a point-in-time
share count from XBRL. Both need the price actually printed on the tape. The splits are
downloaded alongside the bars and the cumulative *future* split factor is applied back
out, giving an unadjusted ``close_raw``. Dollar volume is invariant to the adjustment
(price down, volume up by the same factor) so it is computed either way.

Three price columns therefore survive into the processed table, each with one job:

    close_raw   unadjusted, as printed  -> price screens, market cap
    close       split-adjusted          -> continuity checks, plotting
    adj_close   split + dividend        -> returns
"""

from __future__ import annotations

import json
import logging
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

from insider_alpha.config import DATA_RAW
from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

# A year of runway before the 2014 sample start so the 20-day median dollar volume and
# every other trailing window is fully populated at the first rebalance.
PRICE_START = "2013-01-01"
PRICE_END = "2026-01-01"

_BATCH_SIZE = 50
_THREADS = 2
_MAX_RETRIES = 3
_SLEEP_BETWEEN_BATCHES = 2.0

# Yahoo serves a burst of symbols and then throttles the IP. The throttle is
# indistinguishable from "these symbols are all dead" at the response level — both come
# back empty — so every batch carries canaries whose history certainly exists over the
# whole window. All canaries present means the empty symbols really are dead and can be
# cached as such; any canary missing means the batch was refused, in whole or in part,
# and nothing about it may be written to the manifest.
#
# Several canaries rather than one, because throttling is partial: a single canary
# slipping through a batch that lost 90% of its symbols will happily certify hundreds of
# live large caps as delisted, which is a silent and catastrophic corruption of the
# universe. Eight independent canaries reduce the odds of that to under 1%.
_CANARIES = ("AAPL", "MSFT", "JNJ", "XOM", "KO", "PG", "GE", "WMT")
_COOLDOWNS = (60, 300, 900, 1800)

# Fifth-letter conventions on Nasdaq and the OTC markets. None of these are US-listed
# common stock, so SPEC.md 3 excludes them anyway, and skipping them cuts the request
# count by roughly a third against a rate-limited endpoint.
_NON_COMMON_FIFTH_LETTER = {
    "W": "warrant",
    "R": "right",
    "U": "unit",
    "F": "foreign ordinary",
    "Y": "ADR",
}

_FIELDS = ("Open", "High", "Low", "Close", "Adj Close", "Volume", "Stock Splits")

_OUT_COLUMNS = [
    "date", "ticker", "open", "high", "low", "close", "close_raw",
    "adj_close", "volume", "dollar_volume",
]


def _cache_dir(root: Path | None = None) -> Path:
    path = (root or DATA_RAW) / "prices"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _manifest_path(cache: Path) -> Path:
    return cache / "_manifest.json"


def _load_manifest(cache: Path) -> dict[str, dict]:
    path = _manifest_path(cache)
    return json.loads(path.read_text()) if path.exists() else {}


def load_manifest(cache_root: Path | None = None) -> dict[str, dict]:
    """The download record, including symbols that came back empty.

    Reading it without downloading is what lets a cache-only run still report coverage
    and survivorship: those measurements depend on knowing which symbols were asked for
    and refused, which the price panel alone cannot say.
    """
    return _load_manifest(_cache_dir(cache_root))


def _save_manifest(cache: Path, manifest: dict[str, dict]) -> None:
    _manifest_path(cache).write_text(json.dumps(manifest, indent=0, sort_keys=True))


def is_probable_common_stock(ticker: str) -> bool:
    """Reject symbols whose syntax marks them as something other than common stock.

    Warrants, rights, units, preferreds, foreign ordinaries and ADRs are all excluded
    by SPEC.md 3, and their symbols announce themselves: a five-letter symbol ending in
    W, R, U, F or Y, or any symbol carrying a ``-P`` class suffix. Share-class dots and
    hyphens (``BRK.B``) are common stock and are kept.

    The rule misclassifies a handful of genuine five-letter listings that happen to end
    in one of those letters. That is a deliberate trade: the alternative is spending a
    third of a rate-limited request budget on securities the universe screen would
    throw away anyway.
    """
    if not ticker or len(ticker) > 6:
        return False
    if "-P" in ticker or ticker.endswith(("-W", "-U", "-R", "-WS")):
        return False
    core = ticker.split("-")[0].split(".")[0]
    if len(core) == 5 and core.isalpha() and core[-1] in _NON_COMMON_FIFTH_LETTER:
        return False
    return True


def offline_size_proxy(
    trades: pd.DataFrame,
    share_facts: pd.DataFrame,
    public_float: pd.DataFrame,
    *,
    start: str = PRICE_START,
) -> pd.Series:
    """A dollar-size estimate per CIK that needs no price vendor at all.

    Two independent estimates, taken at their maximum:

    - ``dei:EntityPublicFloat``, the cover-page market value of shares held by
      non-affiliates, reported annually in dollars.
    - The median Form 4 price per share in a quarter times the share count disclosed in
      that same quarter, taken at the median across quarters. Form 4 prices are observed
      trade prices, which makes this a real market quote for any issuer whose insiders
      traded.

    Every robustness choice in that second estimate is load bearing, and each was put
    there by a specific failure:

    - Median price rather than maximum, because the filed price field carries keying
      errors of several orders of magnitude — one issuer reports $525 million a share.
    - Price matched to share count within a quarter, because pairing today's ten
      billion shares with a diluted shell's pre-collapse price values it at $200
      trillion.
    - Median across quarters rather than maximum, because XBRL share counts are
      restated for splits while Form 4 prices are not. In the quarter Alphabet split
      20:1, pre-split trade prices meet a post-split share count and imply a $35
      trillion company. One bad quarter cannot move a median.

    Its only job is to order and bound the price download against a throttled endpoint.
    Universe membership itself is never decided on this number.
    """
    priced = trades[
        trades["filing_date"].ge(pd.Timestamp(start))
        & trades["price_per_share"].between(0.10, 1e5)
    ]
    price_by_quarter = priced.groupby(
        [
            priced["issuer_cik"].rename("cik"),
            priced["filing_date"].dt.to_period("Q").rename("quarter"),
        ]
    )["price_per_share"].median()

    recent = share_facts[share_facts["filed"] >= pd.Timestamp(start)]
    shares_by_quarter = recent.groupby(
        [recent["cik"], recent["filed"].dt.to_period("Q").rename("quarter")]
    )["shares_outstanding"].max()

    implied = (price_by_quarter * shares_by_quarter).dropna().groupby(level="cik").median()

    recent_float = public_float[public_float["filed"] >= pd.Timestamp(start)]
    max_float = recent_float.groupby("cik")["public_float"].max()

    return pd.concat([implied, max_float], axis=1).max(axis=1).rename("size_proxy")


def candidate_tickers(
    pit_map: pd.DataFrame,
    *,
    start: str = PRICE_START,
    size_proxy: pd.Series | None = None,
) -> list[str]:
    """Symbols worth attempting, from the point-in-time CIK-to-ticker map.

    Anything whose claim interval ends before the price window opens is a pre-2013
    listing that cannot enter the universe, so it is not requested. Symbols are
    filtered to plausible US equity syntax — filer agents put company names, CUSIPs,
    and free text in the trading-symbol field often enough to matter — and then to
    plausible common stock.

    With a ``size_proxy`` the list comes back ordered largest first, symbols with no
    estimate last. Ordering matters because the endpoint throttles: a run that stops
    early has still covered every name that could plausibly reach the top 1500, and
    :func:`unresolved_above` turns that into a verifiable claim rather than a hope.
    """
    live = pit_map[pit_map["valid_to"] >= pd.Timestamp(start)]
    clean = live[live["ticker"].str.fullmatch(r"[A-Z][A-Z0-9.\-]{0,5}", na=False)]
    clean = clean[[is_probable_common_stock(t) for t in clean["ticker"]]]

    if size_proxy is None:
        return sorted(clean["ticker"].unique().tolist())

    sized = with_columns(clean, size=clean["cik"].map(size_proxy))
    by_ticker = sized.groupby("ticker")["size"].max()
    return by_ticker.sort_values(ascending=False, na_position="last").index.tolist()


def unresolved_above(
    size_proxy: pd.Series,
    pit_map: pd.DataFrame,
    manifest: dict[str, dict],
    threshold: float,
) -> pd.DataFrame:
    """Candidate symbols above a size threshold that the price panel still lacks.

    An empty result is the proof that a partial download did not distort the universe:
    if nothing plausibly larger than the smallest index member is missing, the top 1500
    cannot be missing anyone either.
    """
    # Only symbols that would actually have been requested count as gaps; the map also
    # holds filer typos like "OPGN,OPGNW" that no screen would ever have downloaded.
    plausible = pit_map[pit_map["ticker"].str.fullmatch(r"[A-Z][A-Z0-9.\-]{0,5}", na=False)]
    sized = with_columns(plausible, size=plausible["cik"].map(size_proxy))
    by_ticker = sized.groupby("ticker")["size"].max().dropna()
    big = by_ticker[by_ticker >= threshold]
    have = {t for t, record in manifest.items() if record.get("rows", 0) > 0}
    missing = big[~big.index.isin(have)]
    return missing.sort_values(ascending=False).rename("size_proxy").reset_index()


def to_yahoo_symbol(ticker: str) -> str:
    """Yahoo separates share classes with a hyphen where EDGAR uses a dot (BRK.B)."""
    return ticker.replace(".", "-")


def _to_long(frame: pd.DataFrame) -> pd.DataFrame:
    """Reshape yfinance's (field, ticker) column panel into a long bar table."""
    present = [f for f in _FIELDS if f in frame.columns.get_level_values(0)]
    stacked = (
        frame[present]
        .stack(level=1, future_stack=True)
        .rename_axis(index=["date", "ticker"])
        .reset_index()
    )
    renamed = stacked.rename(
        columns={
            "Open": "open", "High": "high", "Low": "low", "Close": "close",
            "Adj Close": "adj_close", "Volume": "volume", "Stock Splits": "split_ratio",
        }
    )
    return renamed.dropna(subset=["close"])


def _apply_split_unadjustment(long: pd.DataFrame) -> pd.DataFrame:
    """Recover the price as printed by multiplying back every subsequent split.

    Yahoo divides historical prices by the cumulative ratio of all later splits, so
    reversing it means, per ticker, the running product of split ratios strictly after
    each date. Reverse-cumulative products are computed on the descending series and
    shifted by one so the ex-date itself — already trading post-split — is untouched.
    """
    if "split_ratio" not in long.columns:
        return with_columns(long, close_raw=long["close"])

    frame = long.sort_values(["ticker", "date"])
    ratio = frame["split_ratio"].fillna(0.0).replace(0.0, 1.0)
    grouped = ratio.iloc[::-1].groupby(frame["ticker"].iloc[::-1], sort=False)
    future_factor = grouped.transform(lambda s: s.shift(1, fill_value=1.0).cumprod()).iloc[::-1]

    return with_columns(
        frame.drop(columns=["split_ratio"]),
        close_raw=frame["close"] * future_factor,
    )


def _download_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    """One yfinance call. Returns an empty frame if the request itself failed."""
    import yfinance as yf

    symbols = [to_yahoo_symbol(t) for t in tickers]
    back = dict(zip(symbols, tickers, strict=True))

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            raw = yf.download(
                symbols,
                start=start,
                end=end,
                auto_adjust=False,
                actions=True,
                progress=False,
                threads=_THREADS,
                group_by="column",
                ignore_tz=True,
            )
        except Exception as exc:  # yfinance surfaces rate limiting as several types
            log.debug("batch request raised: %s", exc)
            return pd.DataFrame()

    if raw is None or raw.empty:
        return pd.DataFrame()
    if not isinstance(raw.columns, pd.MultiIndex):
        raw.columns = pd.MultiIndex.from_product([raw.columns, [symbols[0]]])

    long = _to_long(raw)
    if long.empty:
        return long
    return with_columns(
        long.drop(columns=["ticker"]), ticker=long["ticker"].map(back).astype("string")
    ).dropna(subset=["ticker"])


def _download_batch_throttled(tickers: list[str], start: str, end: str) -> pd.DataFrame | None:
    """Fetch a batch, backing off until every canary proves the response is complete.

    Returns the bars, or None when the endpoint is still refusing after the full
    cooldown ladder — the caller must then leave the manifest untouched so a later run
    retries these symbols rather than remembering them as dead.
    """
    request = list(dict.fromkeys([*tickers, *_CANARIES]))

    for attempt in range(_MAX_RETRIES + len(_COOLDOWNS)):
        long = _download_batch(request, start, end)
        returned = set(long["ticker"]) if not long.empty else set()
        missing = [c for c in _CANARIES if c not in returned]
        if not missing:
            return long[long["ticker"].isin(tickers)]

        cooldown = _COOLDOWNS[min(attempt, len(_COOLDOWNS) - 1)]
        log.warning(
            "throttled — %d/%d canaries missing, sleeping %ds",
            len(missing), len(_CANARIES), cooldown,
        )
        time.sleep(cooldown)

    return None


def download_prices(
    tickers: list[str],
    *,
    start: str = PRICE_START,
    end: str = PRICE_END,
    cache_root: Path | None = None,
    batch_size: int = _BATCH_SIZE,
    force: bool = False,
    retry_empty: bool = False,
) -> dict[str, dict]:
    """Fetch daily bars in batches, caching each batch as parquet under ``data/raw``.

    A manifest records every symbol that has been attempted, including the ones that
    came back empty. Recording the failures is what makes a re-run cheap: roughly half
    the candidate list is dead symbols, and without the negative cache every run would
    pay for them again.

    ``retry_empty`` re-attempts the symbols previously recorded as having no data. That
    is the repair path for a cache written while the endpoint was quietly throttling —
    a false negative there silently removes a live company from the universe, so it is
    worth one cheap verification pass.
    """
    cache = _cache_dir(cache_root)
    manifest = {} if force else _load_manifest(cache)
    if retry_empty:
        manifest = {t: r for t, r in manifest.items() if r.get("rows", 0) > 0}

    pending = [t for t in tickers if t not in manifest]
    log.info(
        "prices: %d symbols requested, %d already cached, %d to fetch",
        len(tickers), len(tickers) - len(pending), len(pending),
    )

    for i in range(0, len(pending), batch_size):
        batch = pending[i : i + batch_size]
        batch_id = f"b{int(time.time() * 1000):013d}"
        long = _download_batch_throttled(batch, start, end)
        if long is None:
            log.error("giving up at symbol %d of %d — re-run to resume", i, len(pending))
            break

        returned: set[str] = set()
        if not long.empty:
            long = _apply_split_unadjustment(long)
            long = with_columns(long, dollar_volume=long["close"] * long["volume"].fillna(0))
            long.to_parquet(cache / f"{batch_id}.parquet", index=False, compression="snappy")
            counts = long.groupby("ticker").agg(
                rows=("date", "size"), first=("date", "min"), last=("date", "max")
            )
            for ticker, row in counts.iterrows():
                manifest[str(ticker)] = {
                    "batch": batch_id,
                    "rows": int(row["rows"]),
                    "first": row["first"].strftime("%Y-%m-%d"),
                    "last": row["last"].strftime("%Y-%m-%d"),
                }
                returned.add(str(ticker))

        for ticker in batch:
            if ticker not in returned:
                manifest[ticker] = {"batch": None, "rows": 0, "first": None, "last": None}

        _save_manifest(cache, manifest)
        log.info(
            "  batch %d/%d: %d/%d symbols returned data",
            i // batch_size + 1,
            (len(pending) + batch_size - 1) // batch_size,
            len(returned), len(batch),
        )
        time.sleep(_SLEEP_BETWEEN_BATCHES)

    return manifest


def load_price_panel(
    *,
    cache_root: Path | None = None,
    tickers: list[str] | None = None,
) -> pd.DataFrame:
    """Concatenate the cached batches into one long bar table."""
    cache = _cache_dir(cache_root)
    files = sorted(p for p in cache.glob("*.parquet"))
    if not files:
        return pd.DataFrame(columns=_OUT_COLUMNS)

    wanted = set(tickers) if tickers is not None else None
    frames = []
    for path in files:
        frame = pd.read_parquet(path)
        if wanted is not None:
            frame = frame[frame["ticker"].isin(wanted)]
        if not frame.empty:
            frames.append(frame)

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(["ticker", "date"], keep="last")
    for column in ("open", "high", "low", "close", "close_raw", "adj_close",
                   "volume", "dollar_volume"):
        if column in combined.columns:
            combined = with_columns(
                combined.drop(columns=[column]),
                **{column: combined[column].astype("float32")},
            )
    return combined[_OUT_COLUMNS].sort_values(["ticker", "date"]).reset_index(drop=True)


def coverage_report(manifest: dict[str, dict], pit_map: pd.DataFrame) -> pd.DataFrame:
    """Which requested symbols Yahoo serves, split by whether they are still listed.

    This is the survivorship measurement. A symbol whose point-in-time claim interval
    runs to the far future is one the SEC still lists today; anything else was acquired
    or liquidated inside the sample. The miss rate on the second group is the size of
    the hole in the price panel, and it is disclosed rather than smoothed over.
    """
    live_tickers = set(
        pit_map.loc[pit_map["valid_to"] >= pd.Timestamp("2262-01-01"), "ticker"].dropna()
    )
    rows = []
    for ticker, record in manifest.items():
        rows.append(
            {
                "ticker": ticker,
                "still_listed": ticker in live_tickers,
                "has_prices": bool(record.get("rows", 0) > 0),
                "rows": int(record.get("rows", 0) or 0),
                "last": record.get("last"),
            }
        )
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    summary = frame.groupby("still_listed").agg(
        symbols=("ticker", "size"),
        with_prices=("has_prices", "sum"),
    )
    coverage = (summary["with_prices"] / summary["symbols"].replace(0, np.nan)).fillna(0.0)
    return with_columns(summary.reset_index(), coverage=coverage.to_numpy())
