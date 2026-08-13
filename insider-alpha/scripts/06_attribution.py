#!/usr/bin/env python3
"""Milestone 6 — factor attribution, robustness, and the decay writeup.

    PYTHONPATH=src python scripts/06_attribution.py

Reads existing monthly returns, factors, signal, universe, trades, and prices.
Writes attribution.json, robustness.json, limitations.json, data_profile.json,
and merges pipeline_stages in meta.json. Does not overwrite classifier.json,
ic.json, backtest.json, or costs.json.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from insider_alpha.analysis.attribution import (  # noqa: E402
    PRIMARY_REGRESSION_ID,
    build_attribution_artifact,
)
from insider_alpha.analysis.data_profile import build_data_profile_artifact  # noqa: E402
from insider_alpha.analysis.limitations import build_limitations_artifact  # noqa: E402
from insider_alpha.analysis.robustness import (  # noqa: E402
    N_RANDOM_DRAWS,
    attach_universe_terciles,
    bootstrap_blocks,
    build_robustness_artifact,
    cap_and_sector_rows,
    grid_from_existing,
    multiple_testing_block,
    parameter_sweep,
    randomize_ic,
)
from insider_alpha.artifacts import merge_pipeline_stage, write_artifact  # noqa: E402
from insider_alpha.backtest.engine import (  # noqa: E402
    PRIMARY_VARIANT_ID,
    _sharpe_se,
    prepare_market_data,
)
from insider_alpha.config import ARTIFACTS, DATA_PROCESSED  # noqa: E402


PROTECTED = ("classifier", "ic", "backtest", "costs")


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_json(name: str) -> dict:
    return json.loads((ARTIFACTS / f"{name}.json").read_text())


def _update_meta(*, duration: float) -> None:
    path = ARTIFACTS / "meta.json"
    payload = json.loads(path.read_text()) if path.exists() else {}
    payload["schema_version"] = payload.get("schema_version") or "1.0.0"
    payload["artifact"] = "meta"
    payload["generated_at"] = _stamp()
    payload["data_status"] = "real"
    payload["notes"] = (
        "Pipeline through Milestone 6. Milestones 1–6 complete. This is a decay "
        "study: the IC gate failed and the primary book loses money after factors. "
        "classifier.json, ic.json, backtest.json and costs.json were not rewritten."
    )
    run = payload.get("run") if isinstance(payload.get("run"), dict) else {}
    run["timestamp"] = payload["generated_at"]
    run.setdefault("git_sha", None)
    run.setdefault("git_dirty", None)
    run["duration_seconds"] = float(duration)
    payload["run"] = run
    if not isinstance(payload.get("sample"), dict):
        payload["sample"] = {
            "start": "2014-01-01",
            "end": "2025-12-31",
            "burn_in_start": "2011-01-01",
            "rebalance_frequency": "monthly, first trading day",
            "n_rebalance_dates": 144,
        }
    if not isinstance(payload.get("universe"), dict):
        payload["universe"] = {
            "name": "Top 1500 US common stocks by market capitalization",
            "description": (
                "Mechanically reconstructed at each monthly rebalance date from "
                "observable fields only."
            ),
            "target_size": 1500,
            "screens": [],
        }
    try:
        import importlib.metadata
        import sys as _sys

        names = ["pandas", "numpy", "pyarrow", "statsmodels", "scipy"]
        packages = []
        for name in names:
            try:
                packages.append({"name": name, "version": importlib.metadata.version(name)})
            except importlib.metadata.PackageNotFoundError:
                continue
        payload["software"] = {
            "python_version": _sys.version.split()[0],
            "packages": packages,
        }
    except Exception:  # noqa: BLE001
        payload.setdefault("software", {"python_version": "3", "packages": []})

    stages = [
        (1, "DERA ingestion + Form 4 parser", "complete", "data_profile"),
        (2, "Universe, prices, forward returns", "complete", None),
        (3, "Routine/opportunistic classifier", "complete", "classifier"),
        (4, "Signal + IC analysis (go/no-go)", "complete", "ic"),
        (5, "Backtest + cost model", "complete", "backtest"),
        (6, "Attribution + robustness", "complete", "attribution"),
        (7, "Dashboard + Vercel deploy", "partial", None),
    ]
    existing = {s.get("milestone"): s for s in payload.get("pipeline_stages") or [] if isinstance(s, dict)}
    merged = []
    for milestone, name, status, artifact in stages:
        row = dict(existing.get(milestone) or {})
        row["milestone"] = milestone
        row["name"] = row.get("name") or name
        row["status"] = status
        row["artifact"] = artifact if artifact is not None else row.get("artifact")
        if milestone == 7 and row.get("artifact") not in (
            "meta",
            "data_profile",
            "classifier",
            "ic",
            "backtest",
            "costs",
            "attribution",
            "robustness",
            "limitations",
            None,
        ):
            row["artifact"] = None
        merged.append(row)
    payload["pipeline_stages"] = merged
    write_artifact("meta", payload)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    log = logging.getLogger("attribution")
    started = time.perf_counter()

    for name in PROTECTED:
        if not (ARTIFACTS / f"{name}.json").exists():
            log.error("missing protected artifact %s.json", name)
            return 1

    returns_path = DATA_PROCESSED / "backtest_returns.parquet"
    factors_path = DATA_PROCESSED / "factors_monthly.parquet"
    signal_path = DATA_PROCESSED / "signal.parquet"
    universe_path = DATA_PROCESSED / "universe.parquet"
    trades_path = DATA_PROCESSED / "insider_trades.parquet"
    labels_path = DATA_PROCESSED / "insider_classification.parquet"
    fwd_path = DATA_PROCESSED / "forward_returns.parquet"
    prices_path = DATA_PROCESSED / "prices.parquet"
    for path in (returns_path, factors_path, signal_path, universe_path, trades_path, fwd_path):
        if not path.exists():
            log.error("%s not found", path)
            return 1

    log.info("loading monthly returns and factors")
    returns = pd.read_parquet(returns_path)
    factors = pd.read_parquet(factors_path)
    ic = _load_json("ic")
    backtest = _load_json("backtest")
    costs = _load_json("costs")
    classifier = _load_json("classifier")

    log.info("FF5+UMD attribution")
    attribution = build_attribution_artifact(
        returns,
        factors,
        notes=(
            "FF5+UMD regressions on the stored monthly books. Alpha is annualized "
            "basis points with Newey-West HAC standard errors (6 lags for the "
            "three-month overlap). Primary is opp_etf_3m net. Existing "
            "classifier/ic/backtest/costs artifacts were not rewritten."
        ),
    )
    write_artifact("attribution", attribution)
    primary = next(r for r in attribution["regressions"] if r["id"] == PRIMARY_REGRESSION_ID)
    log.info(
        "primary net alpha %+0.f bps  t=%.2f  SMB=%.2f  HML=%.2f",
        primary["alpha_ann_bps"],
        primary["alpha_t_stat"],
        next(l["beta"] for l in primary["loadings"] if l["factor"] == "SMB"),
        next(l["beta"] for l in primary["loadings"] if l["factor"] == "HML"),
    )

    log.info("data profile from insider_trades")
    trades = pd.read_parquet(trades_path)
    data_profile = build_data_profile_artifact(
        trades,
        notes=(
            "Descriptive statistics on the committed Form 4 table (2011–2025). "
            "superseded_rows_removed is the SPEC §5.2 count; the parquet is post-dedup."
        ),
    )
    write_artifact("data_profile", data_profile)
    del trades

    log.info("robustness grid from stored monthly returns")
    grid = grid_from_existing(returns, factors)
    baseline_alpha = next(r["alpha_ann_bps"] for r in grid if r["id"] == "baseline")

    if prices_path.exists():
        log.info("cap-tercile and sector-exclusion re-runs")
        signal = pd.read_parquet(signal_path)
        universe = pd.read_parquet(
            universe_path,
            columns=[
                "rebalance_date",
                "ticker",
                "cik",
                "market_cap",
                "median_dollar_volume",
                "sic_division",
            ],
        )
        universe = attach_universe_terciles(universe)
        prices = pd.read_parquet(prices_path, columns=["date", "ticker", "adj_close"])
        market = prepare_market_data(signal, universe, prices, factors)
        grid.extend(cap_and_sector_rows(market, factors, baseline_alpha))
        del prices
    else:
        log.warning("prices.parquet missing — skipping cap/sector re-runs")
        signal = pd.read_parquet(signal_path)
        universe = pd.read_parquet(
            universe_path,
            columns=["rebalance_date", "ticker", "cik", "median_dollar_volume", "sic_division"],
        )

    log.info("W×λ parameter sweep (21-day mean IC)")
    trade_cols = [
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
    purchases = pd.read_parquet(trades_path, columns=trade_cols)
    purchases = purchases[purchases["transaction_code"].eq("P")]
    labels = pd.read_parquet(
        labels_path, columns=["accession", "trans_sk", "transaction_code", "label"]
    )
    labels = labels[labels["transaction_code"].eq("P")][["accession", "trans_sk", "label"]]
    purchases = purchases.merge(labels, on=["accession", "trans_sk"], how="left")
    del labels
    fwd = pd.read_parquet(fwd_path)
    uni_signal = universe[
        [c for c in ("rebalance_date", "ticker", "cik", "median_dollar_volume", "sic_division") if c in universe.columns]
    ]
    sweep = parameter_sweep(purchases, uni_signal, fwd)
    del purchases

    log.info("signal randomization (%d draws)", N_RANDOM_DRAWS)
    randomization = randomize_ic(signal, fwd, n_draws=N_RANDOM_DRAWS)
    log.info(
        "randomization observed=%.4f  percentile=%.3f  p=%.3f",
        randomization["observed"],
        randomization["percentile"],
        randomization["p_value"],
    )

    primary_monthly = returns[returns["variant_id"].eq(PRIMARY_VARIANT_ID)].reset_index(drop=True)
    ic21 = None
    opp = next((a for a in ic.get("arms", []) if a.get("arm") == "opportunistic"), None)
    if opp:
        ts = next((t for t in opp.get("time_series", []) if t.get("horizon_days") == 21), None)
        if ts:
            ic21 = pd.Series([p["ic"] for p in ts.get("points", [])])
    log.info("bootstrap CIs")
    bootstrap = bootstrap_blocks(primary_monthly, factors, ic21)

    n_ic = sum(len(arm.get("by_horizon", [])) for arm in ic.get("arms", []))
    n_variants = len(backtest.get("variants", []))
    headline_sharpe = next(r["sharpe"] for r in grid if r["id"] == "baseline")
    multiple = multiple_testing_block(
        grid,
        sweep,
        n_prior_ic=n_ic,
        n_prior_variants=n_variants,
        headline_sharpe=float(headline_sharpe),
        sharpe_se=float(_sharpe_se(float(headline_sharpe), int(primary_monthly.shape[0]))),
    )

    robustness = build_robustness_artifact(
        grid=grid,
        sweep=sweep,
        randomization=randomization,
        bootstrap=bootstrap,
        multiple_testing=multiple,
        notes=(
            "SPEC §12 battery on the decay study. Grid families are the closed enum. "
            "The W×λ metric is 21-day mean IC. Randomization shuffles S within date. "
            "Buys-only is the core; a net (buys−sales) variant was not built."
        ),
    )
    write_artifact("robustness", robustness)

    log.info("limitations / what didn't work")
    limitations = build_limitations_artifact(
        attribution=attribution,
        robustness=robustness,
        ic=ic,
        backtest=backtest,
        costs=costs,
        classifier=classifier,
        data_profile=data_profile,
    )
    write_artifact("limitations", limitations)

    processed = DATA_PROCESSED / "attribution_monthly.parquet"
    sl = primary_monthly[["date", "month", "gross", "net", "rf", "turnover"]].copy()
    sl.to_parquet(processed, index=False, compression="snappy")
    log.info("wrote %s", processed.name)

    runtime = time.perf_counter() - started
    try:
        _update_meta(duration=runtime)
    except Exception as exc:  # noqa: BLE001
        log.warning("meta.json update failed (%s); merging stage 6 only", exc)
        merge_pipeline_stage(6, status="complete", artifact="attribution")

    log.info("-" * 78)
    log.info("primary FF5+UMD alpha %+0.f bps  t=%.2f", primary["alpha_ann_bps"], primary["alpha_t_stat"])
    for row in grid:
        log.info(
            "  %-16s  sharpe=%+.2f  alpha=%+.0f  t=%.2f",
            row["id"],
            row["sharpe"],
            row["alpha_ann_bps"],
            row["alpha_t_stat"],
        )
    log.info(
        "randomization percentile=%.3f  deflated Sharpe=%.2f  n_specs=%d",
        randomization["percentile"],
        multiple["deflated_sharpe"],
        multiple["n_specifications_tested"],
    )
    log.info("finished in %.1fs", runtime)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
