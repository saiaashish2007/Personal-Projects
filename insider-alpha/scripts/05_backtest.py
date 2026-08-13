#!/usr/bin/env python3
"""Milestone 5 — overlapping-portfolio backtest and transaction-cost model.

    python scripts/05_backtest.py

Reads the firm-level signal, the point-in-time universe, the price panel, and
Ken French monthly factors. Writes ``data/processed/backtest_returns.parquet``,
``artifacts/backtest.json``, and ``artifacts/costs.json``. Does not overwrite
``ic.json`` or ``classifier.json``.

This is a decay study. SPEC defaults, no Sharpe hunting.
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from insider_alpha.artifacts import merge_pipeline_stage, write_artifact  # noqa: E402
from insider_alpha.backtest.engine import (  # noqa: E402
    PRIMARY_VARIANT_ID,
    build_backtest_artifact,
    build_costs_artifact,
    monthly_returns_panel,
    run_variants,
)
from insider_alpha.config import DATA_PROCESSED  # noqa: E402


def _notes(results: dict, runtime: float) -> tuple[str, str]:
    primary = results[PRIMARY_VARIANT_ID]
    twin = results["all_etf_3m"]
    p = primary.monthly
    t = twin.monthly
    from insider_alpha.backtest.engine import performance_block

    pg = performance_block(p.set_index("date")["gross"], p.set_index("date")["rf"])
    pn = performance_block(p.set_index("date")["net"], p.set_index("date")["rf"])
    tg = performance_block(t.set_index("date")["gross"], t.set_index("date")["rf"])
    tn = performance_block(t.set_index("date")["net"], t.set_index("date")["rf"])
    to = 12.0 * float(p["turnover"].mean())
    backtest_notes = (
        "Monthly overlapping backtest on the 2014–2025 universe, SPEC defaults "
        "(top quintile of nonzero-signal names, weight ∝ max(S,0), 3% name cap "
        "and 25% sector cap relaxed only when a ~9-name opportunistic book cannot "
        "fill them, Jegadeesh-Titman overlapping vintages). Primary variant "
        f"{PRIMARY_VARIANT_ID}: gross Sharpe {pg['sharpe']:.2f} / net {pn['sharpe']:.2f}, "
        f"CAGR {pg['ann_return']:+.1%} gross / {pn['ann_return']:+.1%} net, "
        f"max DD {pn['max_drawdown']:.1%}, turnover {to:.2f}x, "
        f"avg longs {primary.avg_n_positions:.1f}, explicit round-trip "
        f"{primary.estimated_round_trip_bps:.1f} bps. Filter-off twin all_etf_3m: "
        f"gross Sharpe {tg['sharpe']:.2f} / net {tn['sharpe']:.2f}. Hedge returns "
        "are cap-weighted SIC-division portfolios standing in for SPDR sector ETFs "
        "(XL* products are not in the price panel); SPY is used for trailing betas. "
        f"Built in {runtime:.1f}s. Numbers are not retuned."
    )
    costs_notes = (
        "Explicit model plus a flat round-trip sweep on the primary variant "
        f"{PRIMARY_VARIANT_ID}. Alpha on the sweep is annualized excess versus "
        "Ken French RF (Newey-West, 3 lags), not a full FF5 alpha. Turnover is "
        "one-sided notional / NAV."
    )
    return backtest_notes, costs_notes


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    log = logging.getLogger("backtest")

    signal_path = DATA_PROCESSED / "signal.parquet"
    universe_path = DATA_PROCESSED / "universe.parquet"
    prices_path = DATA_PROCESSED / "prices.parquet"
    factors_path = DATA_PROCESSED / "factors_monthly.parquet"
    for path in (signal_path, universe_path, prices_path, factors_path):
        if not path.exists():
            log.error("%s not found — run earlier milestones first", path)
            return 1

    log.info("loading panels")
    signal = pd.read_parquet(signal_path)
    universe = pd.read_parquet(
        universe_path,
        columns=[
            "rebalance_date",
            "ticker",
            "market_cap",
            "median_dollar_volume",
            "sic_division",
        ],
    )
    prices = pd.read_parquet(prices_path, columns=["date", "ticker", "adj_close"])
    factors = pd.read_parquet(factors_path)
    log.info(
        "  signal %s rows, universe %s, prices %s, %d rebalances",
        f"{len(signal):,}",
        f"{len(universe):,}",
        f"{len(prices):,}",
        signal["rebalance_date"].nunique(),
    )

    started = time.perf_counter()
    results = run_variants(signal, universe, prices, factors)
    runtime = time.perf_counter() - started
    log.info("variants finished in %.1fs", runtime)

    backtest_notes, costs_notes = _notes(results, runtime)
    backtest = build_backtest_artifact(results, notes=backtest_notes)
    costs = build_costs_artifact(results[PRIMARY_VARIANT_ID], notes=costs_notes)
    write_artifact("backtest", backtest)
    write_artifact("costs", costs)

    panel = monthly_returns_panel(results)
    out_path = DATA_PROCESSED / "backtest_returns.parquet"
    panel.to_parquet(out_path, index=False, compression="snappy")
    log.info("wrote %s (%s rows)", out_path.name, f"{len(panel):,}")

    log.info("-" * 78)
    for vid, result in results.items():
        stats = next(v for v in backtest["variants"] if v["id"] == vid)
        log.info(
            "  %s  n=%d  longs=%.1f  turn=%.2fx  RT=%.1fbp  "
            "gross Sharpe=%.2f net=%.2f  CAGR net=%+.1f%%  mdd=%+.1f%%",
            vid,
            stats["n_months"],
            stats["avg_n_positions"],
            stats["turnover"]["annualized"],
            stats["cost_assumption_bps"],
            stats["stats"]["gross"]["sharpe"],
            stats["stats"]["net"]["sharpe"],
            100 * stats["stats"]["net"]["ann_return"],
            100 * stats["stats"]["net"]["max_drawdown"],
        )
    be = costs["break_even"]
    log.info(
        "break-even  alpha=%s  sharpe=%s",
        "none" if be["alpha_zero_bps"] is None else f"{be['alpha_zero_bps']:.1f} bps",
        "none" if be["sharpe_zero_bps"] is None else f"{be['sharpe_zero_bps']:.1f} bps",
    )
    log.info("-" * 78)

    try:
        merge_pipeline_stage(5, status="complete", artifact="backtest")
    except Exception as exc:  # noqa: BLE001
        log.warning("left meta.json untouched (%s)", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
