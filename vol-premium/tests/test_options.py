import numpy as np
import pytest

from vrp import options as bs


def test_put_call_parity():
    S, K, tau, sig, r = 100.0, 95.0, 0.25, 0.2, 0.04
    lhs = bs.call(S, K, tau, sig, r) - bs.put(S, K, tau, sig, r)
    assert lhs == pytest.approx(S - K * np.exp(-r * tau))


def test_known_call_price():
    # Hull, Options, Futures and Other Derivatives, Example 15.6: S=42, K=40, r=10%, vol=20%, T=0.5.
    assert bs.call(42.0, 40.0, 0.5, 0.2, 0.1) == pytest.approx(4.76, abs=0.01)


def test_greeks_match_finite_differences():
    S, K, tau, sig, r, h = 100.0, 100.0, 21 / 252, 0.18, 0.03, 1e-3
    up, dn = bs.straddle(S + h, K, tau, sig, r), bs.straddle(S - h, K, tau, sig, r)
    mid = bs.straddle(S, K, tau, sig, r)
    assert bs.straddle_delta(S, K, tau, sig, r) == pytest.approx((up - dn) / (2 * h), rel=1e-4)
    assert bs.straddle_gamma(S, K, tau, sig, r) == pytest.approx(
        (up - 2 * mid + dn) / h**2, rel=1e-3
    )
    vu, vd = bs.straddle(S, K, tau, sig + h, r), bs.straddle(S, K, tau, sig - h, r)
    assert bs.straddle_vega(S, K, tau, sig, r) == pytest.approx((vu - vd) / (2 * h), rel=1e-4)


def test_expiry_value_is_intrinsic():
    S = np.array([90.0, 100.0, 112.0])
    assert np.allclose(bs.straddle(S, 100.0, 0.0, 0.2, 0.0), np.abs(S - 100.0))


def _hedged_mean(real: float, implied: float, paths: int = 20000) -> tuple[float, float]:
    rng = np.random.default_rng(0)
    S = bs.gbm_paths(paths, 21, real, rng)
    iv = np.full_like(S, implied)
    pnl = bs.hedged_short_straddle(S, iv, np.full(paths, implied), np.zeros(paths)).sum(axis=1)
    return float(pnl.mean()), float(pnl.std())


def test_hedged_pnl_is_zero_when_realized_equals_implied():
    mean, std = _hedged_mean(0.2, 0.2)
    assert abs(mean) < 4 * std / np.sqrt(20000)


def test_hedged_pnl_matches_black_scholes_value_gap():
    tau, implied, real = 21 / 252, 0.2, 0.15
    gap = bs.straddle(100.0, 100.0, tau, implied, 0.0) - bs.straddle(100.0, 100.0, tau, real, 0.0)
    mean, _ = _hedged_mean(real, implied)
    assert mean == pytest.approx(gap / 100, rel=0.05)
    assert _hedged_mean(0.25, implied)[0] < 0


def test_costs_only_reduce_pnl():
    rng = np.random.default_rng(1)
    S = bs.gbm_paths(500, 21, 0.18, rng)
    iv = np.full_like(S, 0.18)
    args = (S, iv, np.full(500, 0.18), np.zeros(500))
    free = bs.hedged_short_straddle(*args).sum(axis=1)
    paid = bs.hedged_short_straddle(*args, spread_vol_pts=0.5, hedge_cost_bps=1.0).sum(axis=1)
    assert np.all(paid < free)
