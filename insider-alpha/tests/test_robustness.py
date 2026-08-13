"""Invariants for the SPEC §12 robustness battery."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from insider_alpha.analysis.robustness import (
    VALID_FAMILIES,
    build_robustness_artifact,
    grid_row,
    randomize_ic,
)


def test_grid_families_are_closed_enum_members():
    summary = {
        "n_months": 12,
        "ann_return": -0.05,
        "sharpe": -0.4,
        "sharpe_ci_low": -1.0,
        "sharpe_ci_high": 0.2,
        "alpha_ann_bps": -200.0,
        "alpha_t_stat": -1.1,
    }
    for family in sorted(VALID_FAMILIES):
        row = grid_row(
            row_id=f"row_{family}",
            family=family,
            label=family,
            description="unit test",
            summary=summary,
            baseline_alpha=0.0,
        )
        assert row["family"] in VALID_FAMILIES
    with pytest.raises(ValueError, match="invalid robustness family"):
        grid_row(
            row_id="bad",
            family="holding_period",
            label="nope",
            description="not in the schema enum",
            summary=summary,
            baseline_alpha=None,
        )


def test_randomization_histogram_counts_match_n_draws():
    n_dates, n_names, n_draws = 8, 40, 50
    dates = np.repeat(pd.bdate_range("2015-01-02", periods=n_dates, freq="BMS"), n_names)
    tickers = np.tile([f"T{i:02d}" for i in range(n_names)], n_dates)
    ciks = np.tile([f"{i:010d}" for i in range(n_names)], n_dates)
    scores = np.tile(np.arange(n_names, dtype=float), n_dates)
    rets = scores * 0.001 + 0.01
    signal = pd.DataFrame(
        {
            "rebalance_date": dates,
            "ticker": tickers,
            "cik": ciks,
            "s_opportunistic": scores,
        }
    )
    returns = pd.DataFrame(
        {
            "rebalance_date": dates,
            "ticker": tickers,
            "cik": ciks,
            "fwd_ret_21": rets,
        }
    )
    out = randomize_ic(signal, returns, n_draws=n_draws, seed=1)
    assert out["n_draws"] == n_draws
    assert sum(bin_["count"] for bin_ in out["histogram"]) == n_draws
    assert 0.0 <= out["percentile"] <= 1.0
    assert 0.0 <= out["p_value"] <= 1.0


def test_build_artifact_rejects_a_mismatched_histogram():
    grid = [
        grid_row(
            row_id="baseline",
            family="headline",
            label="baseline",
            description="d",
            summary={
                "n_months": 10,
                "ann_return": 0.0,
                "sharpe": 0.0,
                "sharpe_ci_low": None,
                "sharpe_ci_high": None,
                "alpha_ann_bps": 0.0,
                "alpha_t_stat": 0.0,
            },
            baseline_alpha=None,
        )
    ]
    sweep = {
        "metric": "21-day mean Spearman IC",
        "x_param": "W",
        "x_label": "W",
        "x_values": [90],
        "y_param": "lambda",
        "y_label": "λ",
        "y_values": [0.5],
        "cells": [{"x": 90, "y": 0.5, "value": 0.01, "t_stat": 1.0}],
        "assessment": "flat",
    }
    randomization = {
        "n_draws": 10,
        "statistic": "21-day mean Spearman IC",
        "observed": 0.01,
        "null_mean": 0.0,
        "null_std": 0.01,
        "percentile": 0.5,
        "p_value": 1.0,
        "histogram": [{"bin_center": 0.0, "count": 3}],
    }
    with pytest.raises(ValueError, match="histogram counts"):
        build_robustness_artifact(
            grid=grid,
            sweep=sweep,
            randomization=randomization,
            bootstrap=[],
            multiple_testing={
                "n_specifications_tested": 1,
                "deflated_sharpe": -0.5,
                "haircut_note": "none",
            },
            notes=None,
        )
