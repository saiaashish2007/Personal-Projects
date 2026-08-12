"""Flatten DERA quarterly archives into one insider transaction table.

Each archive contains eight tab-delimited files keyed on ACCESSION_NUMBER. Three
matter here:

    SUBMISSION.tsv      one row per filing  (issuer, filing date, form type, 10b5-1 flag)
    REPORTINGOWNER.tsv  one or more rows per filing (the insider(s))
    NONDERIV_TRANS.tsv  one or more rows per filing (common stock transactions)

The output is one row per (filing, transaction), attributed to the primary reporting
owner, with every field needed downstream for classification and signal construction.
"""

from __future__ import annotations

import csv
import logging
import zipfile
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

# DERA writes dates as 31-JAN-2024.
_DATE_FORMAT = "%d-%b-%Y"

_SUBMISSION_COLS = [
    "ACCESSION_NUMBER",
    "FILING_DATE",
    "PERIOD_OF_REPORT",
    "DOCUMENT_TYPE",
    "ISSUERCIK",
    "ISSUERNAME",
    "ISSUERTRADINGSYMBOL",
    "AFF10B5ONE",
]

_OWNER_COLS = [
    "ACCESSION_NUMBER",
    "RPTOWNERCIK",
    "RPTOWNERNAME",
    "RPTOWNER_RELATIONSHIP",
    "RPTOWNER_TITLE",
]

_TRANS_COLS = [
    "ACCESSION_NUMBER",
    "NONDERIV_TRANS_SK",
    "SECURITY_TITLE",
    "TRANS_DATE",
    "TRANS_CODE",
    "TRANS_TIMELINESS",
    "TRANS_SHARES",
    "TRANS_PRICEPERSHARE",
    "TRANS_ACQUIRED_DISP_CD",
    "SHRS_OWND_FOLWNG_TRANS",
    "DIRECT_INDIRECT_OWNERSHIP",
]

_FORM4_TYPES = {"4", "4/A"}


def _read_tsv(zf: zipfile.ZipFile, name: str, usecols: list[str]) -> pd.DataFrame:
    """Read one member of the archive as strings, tolerating schema drift.

    Everything is read as text and coerced explicitly afterwards. Reading as string
    preserves the leading zeros in CIKs, which are zero-padded ten-digit identifiers
    that pandas would otherwise silently turn into integers.

    The DERA schema has gained columns over time — AFF10B5ONE, for instance, only
    appears once the 2022 Rule 10b5-1 amendments took effect in 2023. Columns absent
    from an older archive are returned as all-null rather than raising, so a single
    code path spans the full 2011-2025 history.
    """
    with zf.open(name) as handle:
        header = pd.read_csv(handle, sep="\t", nrows=0, quoting=csv.QUOTE_NONE)
    available = [c for c in usecols if c in header.columns]
    missing = [c for c in usecols if c not in header.columns]

    with zf.open(name) as handle:
        frame = pd.read_csv(
            handle,
            sep="\t",
            dtype=str,
            usecols=available,
            quoting=csv.QUOTE_NONE,
            on_bad_lines="warn",
            encoding="utf-8",
            encoding_errors="replace",
        )

    if missing:
        frame = with_columns(frame, **{c: pd.Series(pd.NA, index=frame.index, dtype="string") for c in missing})
    # Detach from the reader's block manager so downstream column building does not
    # trip pandas copy-on-write chained-assignment warnings.
    return frame[usecols].copy()


def with_columns(df: pd.DataFrame, **columns: pd.Series) -> pd.DataFrame:
    """Attach derived columns without going through ``__setitem__``.

    Under pandas 2.3 copy-on-write, both ``df[col] = ...`` and ``.assign()`` raise a
    spurious ChainedAssignmentError on any frame produced by a filter or merge, because
    the internal refcount heuristic cannot tell an owned temporary from an aliased view.
    Building the new columns separately and concatenating once sidesteps that entirely
    and is also a single allocation rather than one per column.
    """
    return pd.concat([df, pd.DataFrame(columns, index=df.index)], axis=1)


def _parse_date(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, format=_DATE_FORMAT, errors="coerce")


def _to_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _normalize_10b5_1(series: pd.Series) -> pd.Series:
    """Normalize the Rule 10b5-1 affirmation flag to a nullable boolean.

    Filer agents encode this inconsistently — the same quarter contains "0", "1",
    "true", "false", and blanks. The flag only became a required checkbox with the
    2022 amendments effective in 2023, so it is mostly absent earlier in the sample.
    """
    mapping = {"1": True, "true": True, "TRUE": True, "0": False, "false": False, "FALSE": False}
    return series.str.strip().map(mapping).astype("boolean")


def _explode_relationship(series: pd.Series) -> pd.DataFrame:
    """Split the comma-joined relationship string into boolean columns.

    Values look like "Director,Officer,TenPercentOwner".
    """
    # Each relationship is a distinct comma-separated token and none is a substring of
    # another, so a vectorized substring test is both correct and far faster than
    # splitting and set-testing row by row across millions of rows.
    filled = series.fillna("")
    return pd.DataFrame(
        {
            "is_director": filled.str.contains("Director", na=False),
            "is_officer": filled.str.contains("Officer", na=False),
            "is_ten_pct_owner": filled.str.contains("TenPercentOwner", na=False),
            "is_other_relationship": filled.str.contains("Other", na=False),
        },
        index=series.index,
    )


def load_quarter(zip_path: Path) -> pd.DataFrame:
    """Flatten a single quarterly archive into a transaction-level table."""
    with zipfile.ZipFile(zip_path) as zf:
        submissions = _read_tsv(zf, "SUBMISSION.tsv", _SUBMISSION_COLS)
        owners = _read_tsv(zf, "REPORTINGOWNER.tsv", _OWNER_COLS)
        trans = _read_tsv(zf, "NONDERIV_TRANS.tsv", _TRANS_COLS)

    submissions = submissions[submissions["DOCUMENT_TYPE"].isin(_FORM4_TYPES)]
    if submissions.empty:
        return pd.DataFrame()

    submissions = with_columns(
        submissions,
        filing_date=_parse_date(submissions["FILING_DATE"]),
        period_of_report=_parse_date(submissions["PERIOD_OF_REPORT"]),
        is_amendment=submissions["DOCUMENT_TYPE"].eq("4/A"),
        aff_10b5_1=_normalize_10b5_1(submissions["AFF10B5ONE"]),
    )

    # A small share of filings (~2%) report several owners jointly. Joining them all
    # against the transaction table would multiply every transaction by the owner
    # count and inflate dollar volume. Attribute to the primary owner instead and
    # retain the count so joint filings can be flagged or excluded downstream.
    owner_counts = owners.groupby("ACCESSION_NUMBER").size().rename("n_reporting_owners")
    primary = owners.drop_duplicates("ACCESSION_NUMBER", keep="first").join(
        owner_counts, on="ACCESSION_NUMBER"
    )
    primary = pd.concat([primary, _explode_relationship(primary["RPTOWNER_RELATIONSHIP"])], axis=1)

    trans = with_columns(
        trans,
        transaction_date=_parse_date(trans["TRANS_DATE"]),
        shares=_to_numeric(trans["TRANS_SHARES"]),
        price_per_share=_to_numeric(trans["TRANS_PRICEPERSHARE"]),
        shares_owned_after=_to_numeric(trans["SHRS_OWND_FOLWNG_TRANS"]),
        is_late_filing=trans["TRANS_TIMELINESS"].fillna("").str.strip().eq("L"),
    )

    merged = trans.merge(
        submissions, on="ACCESSION_NUMBER", how="inner", validate="many_to_one"
    ).merge(primary, on="ACCESSION_NUMBER", how="left", validate="many_to_one")

    out = with_columns(
        merged,
        dollar_value=merged["shares"] * merged["price_per_share"],
        is_indirect=merged["DIRECT_INDIRECT_OWNERSHIP"].fillna("").str.strip().eq("I"),
    ).rename(
        columns={
            "ACCESSION_NUMBER": "accession",
            "NONDERIV_TRANS_SK": "trans_sk",
            "ISSUERCIK": "issuer_cik",
            "ISSUERNAME": "issuer_name",
            "ISSUERTRADINGSYMBOL": "ticker",
            "RPTOWNERCIK": "owner_cik",
            "RPTOWNERNAME": "owner_name",
            "RPTOWNER_TITLE": "owner_title",
            "RPTOWNER_RELATIONSHIP": "owner_relationship",
            "TRANS_CODE": "transaction_code",
            "TRANS_ACQUIRED_DISP_CD": "acquired_disposed",
            "SECURITY_TITLE": "security_title",
            "DOCUMENT_TYPE": "document_type",
        }
    )

    keep = [
        "accession", "trans_sk", "filing_date", "transaction_date", "period_of_report",
        "document_type", "is_amendment", "issuer_cik", "issuer_name", "ticker",
        "owner_cik", "owner_name", "owner_title", "owner_relationship",
        "is_director", "is_officer", "is_ten_pct_owner", "is_other_relationship",
        "n_reporting_owners", "security_title", "transaction_code", "acquired_disposed",
        "shares", "price_per_share", "dollar_value", "shares_owned_after",
        "is_indirect", "is_late_filing", "aff_10b5_1",
    ]
    return out[keep]


def dedupe_amendments(df: pd.DataFrame) -> pd.DataFrame:
    """Drop transactions superseded by a Form 4/A amendment.

    An amendment restates a previously reported transaction. Naively keeping both the
    original and the amendment double-counts the trade.

    Deduplication is applied only to (owner, issuer, transaction date, code, security)
    groups that actually contain an amendment. Within those groups the rows from the
    latest filing date win. Groups with no amendment are left untouched, so two genuine
    same-day trades by the same insider are never silently collapsed into one.
    """
    if df.empty:
        return df

    key = ["owner_cik", "issuer_cik", "transaction_date", "transaction_code", "security_title"]

    has_amendment = df.groupby(key, dropna=False)["is_amendment"].transform("any")
    clean = df[~has_amendment]
    amended = df[has_amendment]

    if amended.empty:
        return clean.reset_index(drop=True)

    latest = amended.groupby(key, dropna=False)["filing_date"].transform("max")
    resolved = amended[amended["filing_date"].eq(latest)]

    log.info(
        "amendment dedup: %d rows in amended groups -> %d retained (%d superseded)",
        len(amended), len(resolved), len(amended) - len(resolved),
    )
    return pd.concat([clean, resolved], ignore_index=True).sort_values(
        ["filing_date", "accession", "trans_sk"]
    ).reset_index(drop=True)


def build_trade_table(zip_paths: list[Path], *, dedupe: bool = True) -> pd.DataFrame:
    """Flatten every archive into a single transaction table.

    All transaction codes are retained. The routine/opportunistic classifier needs an
    insider's complete trading pattern, not just their purchases, so filtering to code
    `P` happens downstream at signal construction rather than here.
    """
    frames: list[pd.DataFrame] = []
    for path in sorted(zip_paths):
        try:
            frame = load_quarter(path)
        except (zipfile.BadZipFile, KeyError) as exc:
            log.error("failed to read %s: %s", path.name, exc)
            continue
        if not frame.empty:
            log.info("%s -> %d transactions", path.name, len(frame))
            frames.append(frame)

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.dropna(subset=["filing_date", "transaction_date", "issuer_cik"])
    return dedupe_amendments(combined) if dedupe else combined
