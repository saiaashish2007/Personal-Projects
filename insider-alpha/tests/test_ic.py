"""Invariants for the pre-backtest IC gate (SPEC.md section 8)."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from insider_alpha.analysis.ic import (
    GO_NO_GO_HORIZONS,
    assign_quintiles,
    build_ic_artifact,
    go_no_go,
    ic_time_series,
    newey_west_mean,
    quintile_sort,
)
from insider_alpha.utils import with_columns


def test_newey_west_with_zero_lags_matches_iid_t_stat():
    y = np.array([0.02, -0.01, 0.03, 0.00, 0.01, -0.02, 0.04, 0.01], dtype=float)
    out = newey_west_mean(y, lags=0)
    se = y.std(ddof=0) / math.sqrt(len(y))
    assert out["mean"] == pytest.approx(y.mean())
    assert out["se"] == pytest.approx(se)
    assert out["t_stat"] == pytest.approx(y.mean() / se)


def test_spearman_ic_is_one_when_signal_ranks_returns_perfectly():
    dates = pd.to_datetime(["2015-01-02"] * 20 + ["2015-02-02"] * 20)
    s = np.tile(np.arange(20, dtype=float), 2)
    r = s * 0.01
    panel = pd.DataFrame({"rebalance_date": dates, "s": s, "fwd_ret_21": r})
    ts = ic_time_series(panel, "s", "fwd_ret_21")
    assert ts["ic"].to_numpy() == pytest.approx(np.ones(2), abs=1e-12)


def test_quintile_means_are_basis_points_and_monotonic_when_aligned():
    n_dates, n_names = 6, 20
    dates = np.repeat(pd.bdate_range("2015-01-02", periods=n_dates, freq="BMS"), n_names)
    s = np.tile(np.arange(n_names, dtype=float), n_dates)
    r = s * 0.001
    panel = pd.DataFrame({"rebalance_date": dates, "s": s, "fwd_ret_21": r})
    result = quintile_sort(panel, "s", "fwd_ret_21", horizon_days=21)
    means = [b["mean_forward_return_bps"] for b in result["buckets"]]
    assert result["monotonic"] is True
    assert means == sorted(means)
    assert result["spread_bps"] > 0
    assert result["spearman_rank_of_means"] == pytest.approx(1.0)
    # A 0.001 decimal return is 10 bps; Q5 is the top of the rank so well above that.
    assert result["buckets"][-1]["mean_forward_return_bps"] > 10.0


def test_assign_quintiles_produces_five_buckets_even_with_zero_ties():
    dates = pd.Series(pd.to_datetime(["2015-01-02"] * 100))
    values = pd.Series([0.0] * 90 + list(range(1, 11)))
    q = assign_quintiles(values, dates)
    assert set(q.unique()) == {1, 2, 3, 4, 5}
    assert int((q == 5).sum()) == 20


def test_go_no_go_fails_when_t_stats_are_below_two():
    headline = [
        {
            "horizon_days": 21,
            "opportunistic_mean_ic": 0.01,
            "opportunistic_t_stat": 1.4,
            "all_insiders_mean_ic": 0.0,
            "all_insiders_t_stat": 0.0,
            "delta_ic": 0.01,
            "delta_t_stat": None,
        },
        {
            "horizon_days": 63,
            "opportunistic_mean_ic": 0.012,
            "opportunistic_t_stat": 1.7,
            "all_insiders_mean_ic": 0.0,
            "all_insiders_t_stat": 0.0,
            "delta_ic": 0.012,
            "delta_t_stat": None,
        },
    ]
    gate = go_no_go(headline)
    assert gate["passed"] is False
    assert gate["horizons_evaluated"] == [21, 63]
    assert "decay" in gate["verdict"].lower()


def test_go_no_go_passes_only_when_both_horizons_clear():
    headline = [
        {
            "horizon_days": h,
            "opportunistic_mean_ic": 0.02,
            "opportunistic_t_stat": 2.4,
            "all_insiders_mean_ic": 0.005,
            "all_insiders_t_stat": 0.8,
            "delta_ic": 0.015,
            "delta_t_stat": 1.1,
        }
        for h in (1, 5, 21, 63, 126, 252)
    ]
    assert go_no_go(headline)["passed"] is True
    headline[2]["opportunistic_t_stat"] = 1.9
    assert go_no_go(headline)["passed"] is False


def test_artifact_contains_exactly_two_arms_and_real_status():
    n_dates, n_names = 8, 30
    dates = np.repeat(pd.bdate_range("2015-01-02", periods=n_dates, freq="BMS"), n_names)
    tickers = np.tile([f"T{i:02d}" for i in range(n_names)], n_dates)
    ciks = np.tile([f"{i:010d}" for i in range(n_names)], n_dates)
    s_opp = np.tile(np.linspace(-1, 1, n_names), n_dates)
    s_all = s_opp * 0.5
    signal = pd.DataFrame(
        {
            "rebalance_date": dates,
            "ticker": tickers,
            "cik": ciks,
            "sic_division": "Manufacturing",
            "s_opportunistic": s_opp,
            "s_all_insiders": s_all,
        }
    )
    noise = np.repeat(np.linspace(-0.02, 0.03, n_names), n_dates)
    ret_cols = {f"fwd_ret_{h}": s_opp * 0.01 + noise * 0.001 for h in (1, 5, 21, 63, 126, 252)}
    ret_cols.update({f"truncated_{h}": False for h in (1, 5, 21, 63, 126, 252)})
    returns = with_columns(signal[["rebalance_date", "ticker", "cik"]], **ret_cols)

    artifact = build_ic_artifact(signal, returns, notes="test", generated_at="2026-08-13T16:00:00Z")
    assert artifact["artifact"] == "ic"
    assert artifact["data_status"] == "real"
    assert {a["arm"] for a in artifact["arms"]} == {"opportunistic", "all_insiders"}
    assert [h["horizon_days"] for h in artifact["headline"]] == [1, 5, 21, 63, 126, 252]
    assert set(artifact["go_no_go"]) == {"criterion", "horizons_evaluated", "passed", "verdict"}
    assert artifact["go_no_go"]["horizons_evaluated"] == list(GO_NO_GO_HORIZONS)
    for arm in artifact["arms"]:
        assert len(arm["by_horizon"]) == 6
        assert len(arm["quantiles"]) == 6
        for q in arm["quantiles"]:
            assert len(q["buckets"]) == 5
            assert {b["quantile"] for b in q["buckets"]} == {1, 2, 3, 4, 5}
