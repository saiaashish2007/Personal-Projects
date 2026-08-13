#!/usr/bin/env python3
"""Milestone 2 — reference data, prices, point-in-time universe, and forward returns.

    python scripts/02_universe.py

Every network step is cached under `data/raw/`, so a re-run only fetches what is
missing. The price download is the slow one: Yahoo throttles hard after a few hundred
symbols, and the loop backs off and resumes rather than recording a throttled response
as a dead ticker. If it exits early with symbols still pending, run it again.

Run this locally rather than in CI — the SEC blocks cloud-provider IP ranges.
"""

from __future__ import annotations

import argparse
import logging
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from insider_alpha.config import (  # noqa: E402
    DATA_PROCESSED,
    SAMPLE_END,
    SAMPLE_START,
    SEC_USER_AGENT,
)
from insider_alpha.ingest.factors import load_factors  # noqa: E402
from insider_alpha.ingest.prices import (  # noqa: E402
    PRICE_END,
    PRICE_START,
    candidate_tickers,
    coverage_report,
    download_prices,
    load_manifest,
    load_price_panel,
    offline_size_proxy,
    unresolved_above,
)
from insider_alpha.ingest.reference import (  # noqa: E402
    build_pit_ticker_map,
    fetch_company_tickers,
    fetch_issuer_reference,
)
from insider_alpha.ingest.shares import extract_company_facts  # noqa: E402
from insider_alpha.validate import (  # noqa: E402
    agreement_report,
    price_agreement,
    unexplained_jumps,
    unreliable_tickers,
    verified_tickers,
)
from insider_alpha.returns import (  # noqa: E402
    align_to_universe,
    forward_returns,
    summarize_returns,
)
from insider_alpha.universe import (  # noqa: E402
    TOP_N_BY_MARKET_CAP,
    build_universe,
    month_start_rebalance_dates,
    trading_calendar,
    universe_summary,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default=SAMPLE_START)
    parser.add_argument("--end", default=SAMPLE_END)
    parser.add_argument("--skip-prices", action="store_true", help="use only cached bars")
    parser.add_argument(
        "--retry-empty", action="store_true", help="re-attempt symbols cached as having no data"
    )
    parser.add_argument("--force-reference", action="store_true", help="refetch SEC reference data")
    args = parser.parse_args()

    warnings.filterwarnings("ignore", category=FutureWarning)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    log = logging.getLogger("universe")
    log.info("SEC User-Agent: %s", SEC_USER_AGENT)

    trades_path = DATA_PROCESSED / "insider_trades.parquet"
    if not trades_path.exists():
        log.error("%s missing — run scripts/01_ingest.py first", trades_path.name)
        return 1

    # --- reference: point-in-time CIK <-> ticker ---------------------------------
    log.info("-" * 68)
    log.info("building point-in-time CIK/ticker map")
    trades = pd.read_parquet(
        trades_path,
        columns=["issuer_cik", "ticker", "filing_date", "transaction_date", "price_per_share"],
    )
    current = fetch_company_tickers(force=args.force_reference)
    pit_map = build_pit_ticker_map(trades, current)
    pit_map.to_parquet(DATA_PROCESSED / "cik_ticker_map.parquet", index=False)
    log.info(
        "  %d ticker claims over %d issuers (%d currently listed)",
        len(pit_map), pit_map["cik"].nunique(), len(current),
    )

    # --- point-in-time shares outstanding and public float -----------------------
    log.info("-" * 68)
    all_ciks = sorted(pit_map["cik"].dropna().unique().tolist())
    share_facts, public_float = extract_company_facts(all_ciks)
    log.info(
        "  share facts: %s rows over %d issuers",
        f"{len(share_facts):,}", share_facts["cik"].nunique() if not share_facts.empty else 0,
    )

    # --- prices ------------------------------------------------------------------
    log.info("-" * 68)
    size_proxy = offline_size_proxy(trades, share_facts, public_float)
    tickers = candidate_tickers(pit_map, start=PRICE_START, size_proxy=size_proxy)
    log.info("price candidates: %d symbols, largest first", len(tickers))
    if args.skip_prices:
        manifest = load_manifest()
    else:
        manifest = download_prices(
            tickers, start=PRICE_START, end=PRICE_END, retry_empty=args.retry_empty
        )

    prices = load_price_panel()
    if prices.empty:
        log.error("no cached price data — re-run without --skip-prices")
        return 1
    log.info(
        "  price panel: %s rows, %d symbols, %s to %s",
        f"{len(prices):,}", prices["ticker"].nunique(),
        prices["date"].min().date(), prices["date"].max().date(),
    )
    prices.to_parquet(DATA_PROCESSED / "prices.parquet", index=False, compression="snappy")

    if manifest:
        coverage = coverage_report(manifest, pit_map)
        log.info("  price coverage by listing status:")
        for row in coverage.itertuples(index=False):
            log.info(
                "    %-14s %5d symbols, %5d with prices (%.0f%%)",
                "still listed" if row.still_listed else "delisted",
                row.symbols, row.with_prices, 100 * row.coverage,
            )

    # --- reference: SIC, exchange, entity type -----------------------------------
    log.info("-" * 68)
    priced_ciks = sorted(
        pit_map[pit_map["ticker"].isin(set(prices["ticker"]))]["cik"].dropna().unique().tolist()
    )
    reference = fetch_issuer_reference(priced_ciks, force=args.force_reference)
    reference.to_parquet(DATA_PROCESSED / "issuer_reference.parquet", index=False)
    log.info("  reference rows: %d, with SIC: %d", len(reference), int(reference["sic"].notna().sum()))

    # --- factors ------------------------------------------------------------------
    log.info("-" * 68)
    for frequency in ("monthly", "daily"):
        factors = load_factors(frequency)
        factors.to_parquet(DATA_PROCESSED / f"factors_{frequency}.parquet")

    # --- price validation against Form 4 transaction prices -----------------------
    log.info("-" * 68)
    agreement = price_agreement(prices, trades, pit_map)
    agreement.to_parquet(DATA_PROCESSED / "price_agreement.parquet", index=False)
    report = agreement_report(agreement)
    if not report.empty:
        row = report.iloc[0]
        log.info(
            "  price check: %d of %d testable symbols disagree with insider prints (%.1f%%)",
            row["tickers_disagreeing"], row["tickers_testable"], row["pct_disagreeing"],
        )
        log.info("  median deviation on the rest: %.2f%%", row["median_abs_deviation_pct"])

    jumps = unexplained_jumps(prices)
    suspect = (unreliable_tickers(agreement) | jumps) - verified_tickers(agreement)
    log.info(
        "  %d symbols with unexplained overnight jumps; %d excluded after insider "
        "confirmation", len(jumps), len(suspect),
    )

    # --- universe -------------------------------------------------------------------
    log.info("-" * 68)
    universe = build_universe(
        prices,
        pit_map,
        share_facts,
        reference,
        start=args.start,
        end=args.end,
        unreliable=suspect,
        public_float=public_float,
    )
    if universe.empty:
        log.error("universe construction produced no rows")
        return 1
    universe.to_parquet(DATA_PROCESSED / "universe.parquet", index=False)

    summary = universe_summary(universe)
    summary.to_parquet(DATA_PROCESSED / "universe_summary.parquet", index=False)

    # Whether a partial price download could have distorted the top-1500 cut. Any
    # candidate whose offline size estimate exceeds the smallest realized index member
    # is a name that might belong in the universe and is missing from it.
    # The cut only binds on dates that actually reach the 1500 cap; on earlier dates the
    # universe is smaller than the target and its smallest member says nothing about
    # where the boundary would be. Public float is the size measure here rather than the
    # download-ordering proxy: it is a reported dollar figure, and a check on
    # completeness is worth little if it is noisy in the direction of false alarms.
    binding = summary[summary["n_names"] >= TOP_N_BY_MARKET_CAP]
    if manifest and not binding.empty:
        cutoff = float(binding["min_market_cap"].median())
        float_size = public_float.groupby("cik")["public_float"].max()
        gaps = unresolved_above(float_size, pit_map, manifest, cutoff)
        log.info(
            "  completeness: %d symbols never fetched report a public float above the "
            "typical index cut ($%.0fM)", len(gaps), cutoff / 1e6,
        )
        if not gaps.empty:
            log.info("    largest: %s", ", ".join(gaps.head(8)["ticker"]))

    # --- forward returns --------------------------------------------------------------
    log.info("-" * 68)
    calendar = trading_calendar(prices)
    rebalance_dates = month_start_rebalance_dates(calendar, args.start, args.end)
    fwd = forward_returns(
        prices,
        rebalance_dates,
        calendar=calendar,
        tickers=sorted(universe["ticker"].unique().tolist()),
    )
    aligned = align_to_universe(universe, fwd)
    aligned.to_parquet(DATA_PROCESSED / "forward_returns.parquet", index=False)

    # --- summary -----------------------------------------------------------------
    purchases = pd.read_parquet(
        trades_path, columns=["issuer_cik", "transaction_code", "filing_date"]
    )
    purchases = purchases[
        purchases["transaction_code"].eq("P") & purchases["filing_date"].ge(args.start)
    ]
    purchase_ciks = set(purchases["issuer_cik"].dropna().unique())
    universe_ciks = set(universe["cik"].dropna().unique())

    log.info("-" * 68)
    log.info("universe rows        %12s", f"{len(universe):,}")
    log.info("rebalance dates      %12d", universe["rebalance_date"].nunique())
    log.info("distinct names       %12d", universe["ticker"].nunique())
    log.info("names per rebalance  median %d  min %d  max %d",
             int(summary["n_names"].median()), int(summary["n_names"].min()),
             int(summary["n_names"].max()))
    log.info("issuers with buys    %12s", f"{len(purchase_ciks):,}")
    log.info("  ... also in universe %10s  (%.1f%%)",
             f"{len(purchase_ciks & universe_ciks):,}",
             100 * len(purchase_ciks & universe_ciks) / max(1, len(purchase_ciks)))

    log.info("-" * 68)
    log.info("names per rebalance over time:")
    for row in summary.iloc[::12].itertuples(index=False):
        log.info("  %s  %5d  %s", row.rebalance_date.date(), row.n_names,
                 "#" * (row.n_names // 25))

    log.info("-" * 68)
    log.info("forward return coverage:")
    for row in summarize_returns(aligned).itertuples(index=False):
        log.info(
            "  h=%3d  n=%8s  mean=%+.4f  std=%.4f  truncated=%.2f%%",
            row.horizon, f"{row.n:,}", row.mean, row.std, 100 * row.pct_truncated,
        )

    log.info("-" * 68)
    for name in (
        "cik_ticker_map", "prices", "issuer_reference", "universe",
        "universe_summary", "forward_returns", "factors_monthly", "factors_daily",
    ):
        path = DATA_PROCESSED / f"{name}.parquet"
        if path.exists():
            log.info("wrote %-24s %8.1f MB", path.name, path.stat().st_size / 1e6)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
