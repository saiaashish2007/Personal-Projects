#!/usr/bin/env python3
"""Milestone 1 — download DERA archives and build the insider transaction table.

    python scripts/01_ingest.py --start-year 2011 --end-year 2025

Downloads are cached, so re-running only fetches quarters that are missing. Run this
locally rather than in CI: the SEC blocks cloud-provider IP ranges for bulk access.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from insider_alpha.config import BURN_IN_START_YEAR, DATA_PROCESSED, SEC_USER_AGENT  # noqa: E402
from insider_alpha.ingest.dera import download_range  # noqa: E402
from insider_alpha.parse.form345 import build_trade_table  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-year", type=int, default=BURN_IN_START_YEAR)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--force", action="store_true", help="re-download cached archives")
    parser.add_argument("--no-dedupe", action="store_true", help="skip amendment dedup")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    log = logging.getLogger("ingest")

    log.info("SEC User-Agent: %s", SEC_USER_AGENT)
    log.info("downloading DERA archives %d-%d", args.start_year, args.end_year)

    paths = download_range(args.start_year, args.end_year, force=args.force)
    if not paths:
        log.error("no archives downloaded — check network access and the SEC User-Agent")
        return 1
    log.info("%d archives available", len(paths))

    trades = build_trade_table(paths, dedupe=not args.no_dedupe)
    if trades.empty:
        log.error("parser produced no rows")
        return 1

    out_path = DATA_PROCESSED / "insider_trades.parquet"
    trades.to_parquet(out_path, index=False, compression="snappy")

    purchases = trades[trades["transaction_code"].eq("P")]

    log.info("-" * 68)
    log.info("wrote %s (%.1f MB)", out_path.name, out_path.stat().st_size / 1e6)
    log.info("transactions      %10s", f"{len(trades):,}")
    log.info("open-market buys  %10s  (%.1f%%)", f"{len(purchases):,}", 100 * len(purchases) / len(trades))
    log.info("distinct issuers  %10s", f"{trades['issuer_cik'].nunique():,}")
    log.info("distinct insiders %10s", f"{trades['owner_cik'].nunique():,}")
    log.info(
        "date range        %s to %s",
        trades["filing_date"].min().date(),
        trades["filing_date"].max().date(),
    )

    by_year = purchases.groupby(purchases["filing_date"].dt.year).size()
    log.info("-" * 68)
    log.info("open-market purchases by filing year:")
    for year, count in by_year.items():
        log.info("  %d  %7s  %s", year, f"{count:,}", "#" * min(60, count // 400))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
