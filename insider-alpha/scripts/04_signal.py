#!/usr/bin/env python3
"""Milestone 4 — firm-level signal and pre-backtest information coefficients.

    python scripts/04_signal.py
    python scripts/04_signal.py --window-days 60 --cluster-lambda 0.5

Reads the classified trade table, the point-in-time universe, and aligned
forward returns. Writes ``data/processed/signal.parquet`` and
``artifacts/ic.json``. This is the go/no-go gate: no backtest is run here.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from insider_alpha.analysis.ic import build_ic_artifact  # noqa: E402
from insider_alpha.artifacts import merge_pipeline_stage, write_artifact  # noqa: E402
from insider_alpha.config import DATA_PROCESSED  # noqa: E402
from insider_alpha.utils import with_columns  # noqa: E402
from insider_alpha.signal.construct import (  # noqa: E402
    ARM_ALL_INSIDERS,
    ARM_OPPORTUNISTIC,
    SignalConfig,
    build_signal,
    event_coverage,
)

_TRADE_COLUMNS = [
    "accession",
    "trans_sk",
    "issuer_cik",
    "owner_cik",
    "owner_title",
    "is_director",
    "is_officer",
    "is_ten_pct_owner",
    "filing_date",
    "transaction_code",
    "shares",
    "price_per_share",
    "dollar_value",
    "shares_owned_after",
]

_UNIVERSE_COLUMNS = [
    "rebalance_date",
    "ticker",
    "cik",
    "median_dollar_volume",
    "sic_division",
]


def _notes(signal: pd.DataFrame, config: SignalConfig, runtime: float, artifact: dict) -> str:
    opp = event_coverage(signal, f"raw_{ARM_OPPORTUNISTIC}")
    all_ = event_coverage(signal, f"raw_{ARM_ALL_INSIDERS}")
    by_h = {row["horizon_days"]: row for row in artifact["headline"]}
    h21, h63 = by_h[21], by_h[63]
    gate = artifact["go_no_go"]
    return (
        "Firm-level purchase score at each monthly rebalance, timestamped on filing "
        f"date, trailing window W = {config.window_days} calendar days, cluster "
        f"λ = {config.cluster_lambda}. ADV20 is the universe 20-day median dollar "
        "volume at t (SPEC writes average; the screen is a median and the signal "
        "reuses it). "
        f"Opportunistic coverage: median {int(opp['n_event'].median())} names "
        f"({100 * opp['event_share'].median():.1f}% of the universe) with a nonzero "
        f"score per month; all-insider coverage: median {int(all_['n_event'].median())} "
        f"({100 * all_['event_share'].median():.1f}%). "
        f"Go/no-go {'passed' if gate['passed'] else 'failed'}: opportunistic 21d IC "
        f"{h21['opportunistic_mean_ic']:+.4f} (t = {h21['opportunistic_t_stat']:.2f}), "
        f"63d IC {h63['opportunistic_mean_ic']:+.4f} (t = {h63['opportunistic_t_stat']:.2f}). "
        "The CMP filter's lift versus all insiders is indistinguishable from zero at "
        "the gate horizons. The signal was not retuned to clear the hurdle. "
        f"Built in {runtime:.1f}s."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--window-days", type=int, default=90)
    parser.add_argument("--cluster-lambda", type=float, default=0.5)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    log = logging.getLogger("signal")

    config = SignalConfig(window_days=args.window_days, cluster_lambda=args.cluster_lambda)
    log.info("config: %s", config.describe())

    trades_path = DATA_PROCESSED / "insider_trades.parquet"
    labels_path = DATA_PROCESSED / "insider_classification.parquet"
    universe_path = DATA_PROCESSED / "universe.parquet"
    returns_path = DATA_PROCESSED / "forward_returns.parquet"
    for path in (trades_path, labels_path, universe_path, returns_path):
        if not path.exists():
            log.error("%s not found — run earlier milestones first", path)
            return 1

    log.info("loading trades and labels")
    trades = pd.read_parquet(trades_path, columns=_TRADE_COLUMNS)
    purchases = trades[trades["transaction_code"].eq("P")]
    labels = pd.read_parquet(
        labels_path, columns=["accession", "trans_sk", "transaction_code", "label"]
    )
    labels = labels[labels["transaction_code"].eq("P")][["accession", "trans_sk", "label"]]
    purchases = purchases.merge(labels, on=["accession", "trans_sk"], how="left")
    log.info(
        "  %s open-market purchases, %s labelled opportunistic",
        f"{len(purchases):,}",
        f"{int(purchases['label'].astype(str).eq('opportunistic').sum()):,}",
    )

    universe = pd.read_parquet(universe_path, columns=_UNIVERSE_COLUMNS)
    returns = pd.read_parquet(returns_path)
    log.info(
        "  universe %s rows, %d rebalances; forward returns %s rows",
        f"{len(universe):,}",
        universe["rebalance_date"].nunique(),
        f"{len(returns):,}",
    )

    started = time.perf_counter()
    signal = build_signal(purchases, universe, config=config)
    runtime = time.perf_counter() - started

    signal_path = DATA_PROCESSED / "signal.parquet"
    signal.to_parquet(signal_path, index=False, compression="snappy")
    log.info("wrote %s (%.1f MB, %s rows) in %.1fs",
             signal_path.name, signal_path.stat().st_size / 1e6, f"{len(signal):,}", runtime)

    coverage = event_coverage(signal)
    log.info("-" * 78)
    log.info("opportunistic event coverage (nonzero S_raw) by year:")
    yearly = with_columns(coverage, year=pd.to_datetime(coverage["rebalance_date"]).dt.year)
    summary = yearly.groupby("year").agg(
        months=("rebalance_date", "size"),
        median_names=("n_event", "median"),
        mean_share=("event_share", "mean"),
    )
    for year, row in summary.iterrows():
        log.info(
            "  %d  months=%2d  median names with signal=%6.0f  mean share=%5.1f%%",
            year, int(row["months"]), row["median_names"], 100 * row["mean_share"],
        )
    log.info(
        "  full sample: median %d of %d names (%.1f%%)",
        int(coverage["n_event"].median()),
        int(coverage["n_names"].median()),
        100 * coverage["event_share"].median(),
    )

    log.info("-" * 78)
    log.info("information coefficients")
    artifact = build_ic_artifact(signal, returns, notes=None)
    artifact["notes"] = _notes(signal, config, runtime, artifact)
    write_artifact("ic", artifact)

    gate = artifact["go_no_go"]
    log.info("-" * 78)
    log.info("GO/NO-GO  passed=%s", gate["passed"])
    log.info("criterion: %s", gate["criterion"])
    log.info("verdict:   %s", gate["verdict"])
    log.info("-" * 78)
    log.info("headline ICs:")
    for row in artifact["headline"]:
        log.info(
            "  h=%3d  opp IC=%+.4f t=%6.2f  |  all IC=%+.4f t=%6.2f  |  delta=%+.4f t=%s",
            row["horizon_days"],
            row["opportunistic_mean_ic"],
            row["opportunistic_t_stat"],
            row["all_insiders_mean_ic"],
            row["all_insiders_t_stat"],
            row["delta_ic"],
            "n/a" if row["delta_t_stat"] is None else f"{row['delta_t_stat']:.2f}",
        )

    try:
        merge_pipeline_stage(4, status="complete", artifact="ic")
    except Exception as exc:  # noqa: BLE001
        log.warning("left meta.json untouched (%s)", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
