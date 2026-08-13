"""Invariants for FF5+UMD attribution (SPEC.md section 11)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from insider_alpha.analysis.attribution import (
    FACTOR_ORDER,
    annualize_alpha_bps,
    fit_ff5_umd,
    newey_west_ols,
)
from insider_alpha.utils import with_columns


def test_annualize_alpha_is_bps_not_a_decimal():
    """1% per month is 1,200 bps/year, not 0.12 and not 12."""
    assert annualize_alpha_bps(0.01) == pytest.approx(1_200.0)
    assert annualize_alpha_bps(0.01) > 100
    assert annualize_alpha_bps(-0.005) == pytest.approx(-600.0)


def test_known_monthly_alpha_reports_annualized_bps():
    """A constant 50 bp monthly excess against zero factors is 600 bps/year."""
    n = 36
    dates = pd.bdate_range("2015-01-01", periods=n, freq="BMS")
    aligned = pd.DataFrame({"date": dates, "month": dates.strftime("%Y-%m")})
    aligned = with_columns(
        aligned,
        excess=pd.Series(np.full(n, 0.005), index=aligned.index),
        **{f: pd.Series(np.zeros(n), index=aligned.index) for f in FACTOR_ORDER},
    )
    fitted = fit_ff5_umd(aligned, lags=3)
    assert fitted["alpha_ann_bps"] == pytest.approx(600.0, abs=1e-6)
    assert abs(fitted["alpha_ann_bps"]) > 1.0
    assert fitted["n_months"] == n


def test_newey_west_ols_recovers_a_known_market_beta():
    rng = np.random.default_rng(7)
    n = 80
    mkt = rng.normal(0.0, 0.04, size=n)
    y = 0.001 + 1.2 * mkt + rng.normal(0.0, 0.005, size=n)
    x = np.column_stack([mkt, np.zeros((n, 5))])
    out = newey_west_ols(y, x, lags=3)
    assert out["betas"][0] == pytest.approx(1.2, abs=0.05)
    assert annualize_alpha_bps(out["alpha"]) == pytest.approx(out["alpha"] * 12 * 10_000)
