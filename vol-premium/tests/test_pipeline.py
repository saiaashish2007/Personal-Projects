"""Lookahead and bookkeeping checks on a synthetic panel, so tests need no network."""

import numpy as np
import pandas as pd
import pytest

from vrp import backtest, features, forecast, montecarlo
from vrp.features import HORIZON


@pytest.fixture(scope="module")
def panel() -> pd.DataFrame:
    rng = np.random.default_rng(3)
    n = 900
    vol = 0.15 * np.exp(np.cumsum(rng.normal(0, 0.03, n)) * 0.3)
    r = rng.normal(0, vol / np.sqrt(252))
    close = 1000 * np.exp(np.cumsum(r))
    open_ = close * np.exp(rng.normal(0, 0.002, n))
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.004, n)))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.004, n)))
    vix = vol * 100 * 1.15
    idx = pd.bdate_range("2000-01-03", periods=n)
    return pd.DataFrame(
        {
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "vix": vix,
            "vix9d": vix * 0.95,
            "vix3m": vix * 1.05,
            "vvix": 90 + 0 * vix,
            "rate": 0.02,
        },
        index=idx,
    )


def test_target_is_forward_realized_vol(panel):
    feat = features.build(panel)
    t = 300
    r = np.log(feat["close"]).diff()
    expected = np.sqrt(252 / HORIZON * (r.iloc[t + 1 : t + 1 + HORIZON] ** 2).sum()) * 100
    assert feat["rv_fwd"].iloc[t] == pytest.approx(expected)
    assert feat["rv_fwd"].iloc[-HORIZON:].isna().all()


def test_features_do_not_see_the_future(panel):
    base = features.build(panel)
    shocked = panel.copy()
    cut = 500
    shocked.iloc[cut:, :4] *= 1.5
    shocked.iloc[cut:, 4:8] *= 2.0
    moved = features.build(shocked)
    common = base.index[base.index < panel.index[cut]]
    pd.testing.assert_frame_equal(
        base.loc[common, features.FEATURES], moved.loc[common, features.FEATURES]
    )


def test_training_rows_are_purged():
    start = 3000
    rows = forecast.train_rows(start)
    last_target_day = rows.stop - 1 + HORIZON
    assert last_target_day < start - forecast.EMBARGO


def test_ladder_bookkeeping():
    pnl = np.ones((10, HORIZON))
    w = np.zeros(10)
    w[0] = 1.0
    ret = backtest.ladder(pnl, w)
    assert ret.sum() == pytest.approx(min(HORIZON, 9) / HORIZON)
    assert np.all(ret[: min(HORIZON, 9)] == pytest.approx(1 / HORIZON))


def test_flat_signal_means_zero_returns(panel):
    feat = features.build(panel).dropna(subset=["rv_fwd"])
    pnl = backtest.trade_pnl(feat)
    assert np.all(backtest.ladder(pnl, np.zeros(len(pnl))) == 0)


def test_bootstrap_is_reproducible_and_centered():
    rng = np.random.default_rng(0)
    r = pd.DataFrame(
        {"always": rng.normal(0.0004, 0.004, 1500), "xgb": rng.normal(0.0004, 0.004, 1500)}
    )
    a = montecarlo.bootstrap(r, draws=200, seed=1)
    b = montecarlo.bootstrap(r, draws=200, seed=1)
    assert a == b
    s = a["strategies"]["always"]["sharpe"]
    sample = r["always"].mean() / r["always"].std() * np.sqrt(252)
    assert s["lo"] < sample < s["hi"]


def test_stationary_indices_wrap_and_stay_in_range():
    idx = montecarlo.stationary_indices(50, 20, np.random.default_rng(0))
    assert idx.min() >= 0 and idx.max() < 50
