"""Point-in-time shares outstanding from SEC XBRL company facts.

Market cap is the one field in SPEC.md 3 that cannot be taken from a price vendor.
yfinance reports a *current* share count, so pairing it with a 2015 price would mark a
company that has since bought back a third of its float — or tripled its share count in
a dilutive equity raise — at today's structure. That error is not random: it correlates
with exactly the corporate actions that also drive returns, so it would bias the top-1500
cut in a direction the backtest cannot recover from.

XBRL facts carry a ``filed`` date alongside the ``end`` date the count refers to, which
makes a genuine as-of-date lookup possible: at rebalance ``t`` use the most recent count
*disclosed* on or before ``t``, never the one that turned out to be true at ``t``.

The bulk ``companyfacts.zip`` (1.4 GB, ~20k filers) is downloaded once and read by
member name, so this costs a single request instead of one per company.

**Concept fallback.** The cover-page tag ``dei:EntityCommonStockSharesOutstanding`` is
the primary source. It is absent for some multi-class filers, because the bulk file drops
dimensional breakdowns and those companies tag the count per share class, so three
us-gaap fallbacks follow in decreasing order of directness. Multi-class companies end up
with the consolidated share count valued at the observable class's price, which slightly
overstates market cap where the unlisted class trades at a discount.
"""

from __future__ import annotations

import json
import logging
import zipfile
from pathlib import Path

import pandas as pd

from insider_alpha.config import DATA_RAW
from insider_alpha.utils import normalize_cik, with_columns

log = logging.getLogger(__name__)

COMPANYFACTS_URL = "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip"

# Higher wins when two concepts were disclosed on the same day.
_CONCEPTS: tuple[tuple[str, str, int], ...] = (
    ("dei", "EntityCommonStockSharesOutstanding", 3),
    ("us-gaap", "CommonStockSharesOutstanding", 2),
    ("us-gaap", "CommonStockSharesIssued", 1),
    ("us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic", 0),
)

# Guards against unit-tagging errors, which are common enough in XBRL to matter: a
# filer reporting thousands of shares instead of shares would otherwise land a
# micro-cap in the top 1500.
_MIN_SHARES = 1_000
_MAX_SHARES = 5e11

# Same problem on the float tag, and it is not hypothetical: eBay's filings carry an
# ``EntityPublicFloat`` of 3.1e19 dollars. Anything past ten trillion is a scale error.
_MAX_PUBLIC_FLOAT = 1e13

# A share count older than this at rebalance time is treated as unusable rather than
# carried forward. Annual filers legitimately go ~12 months between disclosures, so the
# threshold has to sit above a year without letting a dead company drift in forever.
MAX_STALENESS_DAYS = 500

_FOREIGN_FORMS = frozenset({"20-F", "20-F/A", "40-F", "40-F/A", "6-K"})


def download_companyfacts(*, dest: Path | None = None, force: bool = False) -> Path:
    """Fetch the bulk companyfacts archive, skipping if already cached."""
    import requests

    from insider_alpha.config import SEC_USER_AGENT

    dest = dest or (DATA_RAW / "sec" / "companyfacts.zip")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        log.info("companyfacts.zip already cached (%.0f MB)", dest.stat().st_size / 1e6)
        return dest

    log.info("downloading companyfacts.zip — 1.4 GB, several minutes")
    headers = {"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate"}
    tmp = dest.with_suffix(".zip.partial")
    with requests.get(COMPANYFACTS_URL, headers=headers, stream=True, timeout=3600) as response:
        response.raise_for_status()
        with tmp.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 20):
                handle.write(chunk)
    tmp.replace(dest)
    log.info("downloaded companyfacts.zip (%.0f MB)", dest.stat().st_size / 1e6)
    return dest


def _public_float_for_cik(payload: dict, cik: str) -> list[dict[str, object]]:
    entries = (
        payload.get("facts", {})
        .get("dei", {})
        .get("EntityPublicFloat", {})
        .get("units", {})
        .get("USD")
    )
    if not entries:
        return []
    return [
        {
            "cik": cik,
            "as_of": entry.get("end"),
            "filed": entry.get("filed"),
            "public_float": float(entry["val"]),
        }
        for entry in entries
        if entry.get("val") is not None
        and entry.get("filed") is not None
        and 0 < entry["val"] <= _MAX_PUBLIC_FLOAT
    ]


def _facts_for_cik(payload: dict, cik: str) -> list[dict[str, object]]:
    facts = payload.get("facts", {})
    rows: list[dict[str, object]] = []
    for taxonomy, concept, priority in _CONCEPTS:
        entries = facts.get(taxonomy, {}).get(concept, {}).get("units", {}).get("shares")
        if not entries:
            continue
        for entry in entries:
            value = entry.get("val")
            filed = entry.get("filed")
            if value is None or filed is None:
                continue
            if not (_MIN_SHARES <= value <= _MAX_SHARES):
                continue
            rows.append(
                {
                    "cik": cik,
                    "as_of": entry.get("end"),
                    "filed": filed,
                    "shares_outstanding": float(value),
                    "concept": concept,
                    "priority": priority,
                    "form": entry.get("form"),
                    "accn": entry.get("accn"),
                }
            )
    return rows


def _typed(frame: pd.DataFrame) -> pd.DataFrame:
    return with_columns(
        frame.drop(columns=["cik", "as_of", "filed"]),
        cik=normalize_cik(frame["cik"]),
        as_of=pd.to_datetime(frame["as_of"], errors="coerce"),
        filed=pd.to_datetime(frame["filed"], errors="coerce"),
    ).dropna(subset=["cik", "filed"])


def extract_company_facts(
    ciks: list[str],
    *,
    zip_path: Path | None = None,
    cache_dir: Path | None = None,
    force: bool = False,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Share counts and public float for the requested issuers, in one pass.

    Both come out of the same 1.4 GB archive and parsing it twice would double a
    multi-minute step for no reason. Returns ``(shares, public_float)``:

    - shares: ``cik``, ``as_of``, ``filed``, ``shares_outstanding``, ``concept``,
      ``priority``, ``form``, ``accn``
    - public_float: ``cik``, ``as_of``, ``filed``, ``public_float`` in dollars
    """
    cache_dir = cache_dir or (DATA_RAW / "sec")
    cache_dir.mkdir(parents=True, exist_ok=True)
    shares_path = cache_dir / "shares_outstanding.parquet"
    float_path = cache_dir / "public_float.parquet"

    if shares_path.exists() and float_path.exists() and not force:
        shares = pd.read_parquet(shares_path)
        floats = pd.read_parquet(float_path)
        if set(ciks).issubset(set(shares["cik"].unique()) | set(floats["cik"].unique())):
            log.info("company facts: %d share facts from cache", len(shares))
            return shares, floats

    zip_path = zip_path or download_companyfacts()
    wanted = sorted(set(ciks))

    share_rows: list[dict[str, object]] = []
    float_rows: list[dict[str, object]] = []
    missing = 0
    with zipfile.ZipFile(zip_path) as archive:
        available = set(archive.namelist())
        for i, cik in enumerate(wanted, start=1):
            member = f"CIK{cik}.json"
            if member not in available:
                missing += 1
                continue
            try:
                payload = json.loads(archive.read(member))
            except (json.JSONDecodeError, KeyError):
                missing += 1
                continue
            share_rows.extend(_facts_for_cik(payload, cik))
            float_rows.extend(_public_float_for_cik(payload, cik))
            if i % 2500 == 0:
                log.info("  parsed %d/%d company fact files", i, len(wanted))

    log.info(
        "company facts: %d share facts, %d float facts, %d issuers (%d absent)",
        len(share_rows), len(float_rows), len(wanted) - missing, missing,
    )

    shares = _typed(pd.DataFrame(share_rows)) if share_rows else pd.DataFrame()
    floats = _typed(pd.DataFrame(float_rows)) if float_rows else pd.DataFrame()
    if not shares.empty:
        shares = shares.sort_values(["cik", "filed", "as_of", "priority"]).reset_index(drop=True)
        shares.to_parquet(shares_path, index=False, compression="snappy")
    if not floats.empty:
        floats = floats.sort_values(["cik", "filed"]).reset_index(drop=True)
        floats.to_parquet(float_path, index=False, compression="snappy")
    return shares, floats


def extract_shares_outstanding(ciks: list[str], **kwargs) -> pd.DataFrame:
    """Long table of every disclosed share count for the requested issuers."""
    return extract_company_facts(ciks, **kwargs)[0]


def drop_scale_outliers(facts: pd.DataFrame, *, tolerance: float = 50.0) -> pd.DataFrame:
    """Remove share counts that sit orders of magnitude off the issuer's own history.

    XBRL share counts carry unit and scale errors that a price screen cannot catch.
    BioNTech reports 241 billion shares against a true count near 240 million, which
    at a $232 share price puts a $56 trillion company at the top of the market cap
    ranking and pushes a real constituent out of the universe. The failure is silent
    and it corrupts the index rather than one row.

    Each fact is compared against the median count that issuer has ever disclosed. The
    band is wide on purpose: a 20-for-1 split legitimately moves the count by 20x, and
    Alphabet did exactly that inside the sample, so anything under ``tolerance`` is
    left alone.
    """
    if facts.empty:
        return facts

    reference = facts.groupby("cik")["shares_outstanding"].transform("median")
    ratio = facts["shares_outstanding"] / reference
    keep = ratio.between(1 / tolerance, tolerance) | reference.isna()

    dropped = int((~keep).sum())
    if dropped:
        log.info(
            "shares outstanding: dropped %d scale-outlier facts across %d issuers",
            dropped, facts.loc[~keep, "cik"].nunique(),
        )
    return facts[keep]


def foreign_private_issuers(facts: pd.DataFrame) -> set[str]:
    """CIKs whose XBRL facts come predominantly from 20-F or 40-F annual reports.

    A company filing those forms rather than a 10-K is a foreign private issuer, which
    on a US exchange means an ADR. SPEC.md 3 excludes ADRs from the universe, and the
    form type identifies them far more reliably than ticker syntax does — Alibaba
    trades under a plain four-letter symbol that no naming convention would flag.
    """
    if facts.empty or "form" not in facts.columns:
        return set()
    share = facts.groupby("cik")["form"].apply(lambda s: s.isin(_FOREIGN_FORMS).mean())
    return set(share[share > 0.5].index)


def shares_asof(facts: pd.DataFrame, queries: pd.DataFrame) -> pd.DataFrame:
    """Most recently *disclosed* share count for each (cik, date) pair.

    ``queries`` needs ``cik`` and ``date``. The returned frame is aligned to
    ``queries.index`` and carries ``shares_outstanding``, ``shares_filed``,
    ``shares_as_of`` and ``shares_age_days``.

    The join is on ``filed``, not ``as_of``, which is the whole point: a share count
    dated 2015-06-30 that was not published until 2015-08-05 must not be visible at a
    2015-07-01 rebalance. Facts are pre-sorted so that within a filing date the
    highest-priority concept and latest period end come last, and the backward
    as-of merge therefore lands on the best number available at the time.
    """
    columns = ["shares_outstanding", "shares_filed", "shares_as_of", "shares_age_days"]
    if facts.empty or queries.empty:
        return pd.DataFrame(
            {c: pd.Series(index=queries.index, dtype="float64") for c in columns}
        )

    # merge_asof demands identical join-key dtypes; datetime resolution survives a
    # parquet round trip as seconds rather than nanoseconds, and a CIK column arrives as
    # either object or the pandas string dtype depending on which stage produced it.
    left = pd.DataFrame(
        {
            "cik": queries["cik"].astype(object),
            "date": queries["date"].astype("datetime64[ns]"),
        },
        index=queries.index,
    ).sort_values("date")
    right = pd.DataFrame(
        {
            "cik": facts["cik"].astype(object),
            "filed": facts["filed"].astype("datetime64[ns]"),
            "as_of": facts["as_of"].astype("datetime64[ns]"),
            "shares_outstanding": facts["shares_outstanding"],
            "priority": facts["priority"],
        }
    ).sort_values(["filed", "as_of", "priority"])[
        ["cik", "filed", "as_of", "shares_outstanding"]
    ]

    merged = pd.merge_asof(
        left,
        right,
        left_on="date",
        right_on="filed",
        by="cik",
        direction="backward",
        allow_exact_matches=True,
    )
    merged.index = left.index
    merged = merged.reindex(queries.index)

    age = (merged["date"] - merged["filed"]).dt.days
    stale = age > MAX_STALENESS_DAYS
    return pd.DataFrame(
        {
            "shares_outstanding": merged["shares_outstanding"].mask(stale),
            "shares_filed": merged["filed"].mask(stale),
            "shares_as_of": merged["as_of"].mask(stale),
            "shares_age_days": age.mask(stale),
        },
        index=queries.index,
    )
