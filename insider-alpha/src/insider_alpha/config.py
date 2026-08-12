"""Project-wide paths, sample windows, and SEC access configuration."""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

# Opt into copy-on-write, which becomes the default in pandas 3. Beyond silencing the
# transitional chained-assignment warnings, it guarantees that a DataFrame derived from
# a filter never mutates its parent — worth having explicitly in a research pipeline
# where a silent aliased write would corrupt results without failing loudly.
pd.options.mode.copy_on_write = True

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
ARTIFACTS = PROJECT_ROOT / "artifacts"

for _d in (DATA_RAW, DATA_PROCESSED, ARTIFACTS):
    _d.mkdir(parents=True, exist_ok=True)

# Form 4 history starts three years before the sample so the routine/opportunistic
# classifier has the trailing history it needs on day one of the test period.
BURN_IN_START_YEAR = 2011
SAMPLE_START = "2014-01-01"
SAMPLE_END = "2025-12-31"

# SEC requires a declared User-Agent with real contact information. Requests without
# one are throttled or blocked outright.
SEC_USER_AGENT = os.environ.get(
    "SEC_USER_AGENT",
    "Sai Bharadwaj saib2@illinois.edu (academic research)",
)

# --- Form 4 transaction codes ------------------------------------------------
#
# Only `P` reflects a discretionary decision to buy on the open market with the
# insider's own capital. `A` (grant), `M` (option exercise) and `F` (shares withheld
# for tax) are compensation mechanics and together account for roughly two thirds of
# all reported transactions — including them is the fastest way to destroy this signal.

CODE_OPEN_MARKET_BUY = "P"
CODE_OPEN_MARKET_SELL = "S"

COMPENSATION_CODES = frozenset({"A", "M", "F"})

TRANSACTION_CODE_LABELS = {
    "P": "Open-market or private purchase",
    "S": "Open-market or private sale",
    "A": "Grant, award, or other acquisition",
    "M": "Exercise or conversion of derivative",
    "F": "Shares withheld for tax obligation",
    "G": "Bona fide gift",
    "C": "Conversion of derivative security",
    "D": "Disposition to the issuer",
    "J": "Other acquisition or disposition",
    "W": "Acquisition or disposition by will",
    "Z": "Voting trust deposit or withdrawal",
    "L": "Small acquisition",
    "I": "Discretionary transaction",
    "X": "Exercise of in-the-money derivative",
    "U": "Tender of shares",
    "E": "Expiration of short position",
    "H": "Expiration of long position",
}
