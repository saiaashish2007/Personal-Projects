"""Small helpers shared across ingestion, universe, and return construction."""

from __future__ import annotations

import pandas as pd


def with_columns(df: pd.DataFrame, **columns: pd.Series) -> pd.DataFrame:
    """Attach derived columns without going through ``__setitem__``.

    Under pandas 2.3 copy-on-write, both ``df[col] = ...`` and ``.assign()`` raise a
    spurious ChainedAssignmentError on any frame produced by a filter or merge, because
    the internal refcount heuristic cannot tell an owned temporary from an aliased view.
    Building the new columns separately and concatenating once sidesteps that entirely
    and is also a single allocation rather than one per column.
    """
    return pd.concat([df, pd.DataFrame(columns, index=df.index)], axis=1)


def normalize_cik(series: pd.Series) -> pd.Series:
    """Coerce any CIK representation to the canonical zero-padded ten-digit string.

    EDGAR emits CIKs three different ways depending on the endpoint — bare integers in
    ``company_tickers.json``, ``CIK0000320193`` in submissions, zero-padded strings in
    DERA. Joining across sources without normalizing silently drops every match.
    """
    text = series.astype("string").str.strip().str.upper().str.removeprefix("CIK")
    return text.str.replace(r"\D", "", regex=True).str.zfill(10).where(text.notna())


def normalize_ticker(series: pd.Series) -> pd.Series:
    """Uppercase and strip a ticker column, mapping empty and placeholder values to NA.

    The trading-symbol field is filer-entered free text and shows it. DERA writes absent
    symbols as blanks, ``NONE`` and ``N/A`` interchangeably, and because the archives are
    read with quoting disabled the same issuer appears as ``FB``, ``"FB"`` and ``[FB]``
    across quarters. Left uncleaned, those variants fragment one company's ticker history
    into three, which puts holes in the point-in-time map exactly where a symbol change
    would otherwise be dated.
    """
    text = (
        series.astype("string")
        .str.strip()
        .str.upper()
        .str.replace(r"^[\"'\[\(\s]+|[\"'\]\)\s]+$", "", regex=True)
    )
    return text.where(~text.isin(["", "NONE", "N/A", "NA", "-", "0", "N.A."]))
