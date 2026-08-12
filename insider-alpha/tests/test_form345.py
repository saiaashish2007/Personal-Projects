"""Invariants for the Form 4 parser.

These guard the two failure modes that would silently corrupt every downstream result:
amendment double-counting, and lookahead from using transaction date instead of filing date.
"""

from __future__ import annotations

import pandas as pd
import pytest

from insider_alpha.parse.form345 import dedupe_amendments, with_columns


def _row(**overrides):
    base = {
        "owner_cik": "0000000001",
        "issuer_cik": "0000000100",
        "transaction_date": pd.Timestamp("2024-03-01"),
        "transaction_code": "P",
        "security_title": "Common Stock",
        "filing_date": pd.Timestamp("2024-03-04"),
        "is_amendment": False,
        "accession": "acc-1",
        "trans_sk": "1",
        "shares": 100.0,
    }
    base.update(overrides)
    return base


def test_amendment_supersedes_original():
    df = pd.DataFrame([
        _row(accession="orig", shares=100.0),
        _row(accession="amend", shares=150.0, is_amendment=True,
             filing_date=pd.Timestamp("2024-03-10")),
    ])
    out = dedupe_amendments(df)
    assert len(out) == 1
    assert out.iloc[0]["shares"] == 150.0
    assert out.iloc[0]["accession"] == "amend"


def test_distinct_same_day_trades_are_not_collapsed():
    """Two genuine same-day trades with no amendment must both survive.

    Keying dedup on the group alone would wrongly merge these into one.
    """
    df = pd.DataFrame([
        _row(accession="a", trans_sk="1", shares=100.0),
        _row(accession="a", trans_sk="2", shares=250.0),
    ])
    out = dedupe_amendments(df)
    assert len(out) == 2
    assert set(out["shares"]) == {100.0, 250.0}


def test_unrelated_trades_untouched_by_amendment_elsewhere():
    df = pd.DataFrame([
        _row(accession="orig", shares=100.0),
        _row(accession="amend", shares=150.0, is_amendment=True,
             filing_date=pd.Timestamp("2024-03-10")),
        _row(accession="other", owner_cik="0000000002", shares=999.0),
    ])
    out = dedupe_amendments(df)
    assert len(out) == 2
    assert 999.0 in set(out["shares"])


def test_dedupe_handles_empty_frame():
    assert dedupe_amendments(pd.DataFrame()).empty


def test_with_columns_does_not_mutate_parent():
    parent = pd.DataFrame({"a": [1, 2, 3]})
    child = with_columns(parent[parent.a > 1], b=pd.Series([9, 9], index=[1, 2]))
    assert "b" not in parent.columns
    assert list(child["b"]) == [9, 9]


@pytest.mark.skipif(
    not (__import__("pathlib").Path(__file__).parents[1]
         / "data" / "processed" / "insider_trades.parquet").exists(),
    reason="requires the ingested table; run scripts/01_ingest.py first",
)
def test_no_lookahead_in_ingested_table():
    """Filing date must not precede transaction date — that would be time travel."""
    from insider_alpha.config import DATA_PROCESSED

    df = pd.read_parquet(
        DATA_PROCESSED / "insider_trades.parquet",
        columns=["filing_date", "transaction_date", "accession", "trans_sk"],
    )
    violations = df[df["filing_date"] < df["transaction_date"]]
    # A handful of filings carry genuinely malformed dates as filed with the SEC.
    # Assert the rate stays negligible rather than demanding zero.
    assert len(violations) / len(df) < 0.001, f"{len(violations)} rows filed before trade date"
    assert df.duplicated(["accession", "trans_sk"]).sum() == 0
