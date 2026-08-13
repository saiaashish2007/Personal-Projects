"""Invariants for forward returns.

The IC analysis in SPEC.md 8 is only as trustworthy as these: a forward return that
peeks past its horizon, or one that quietly disappears when a stock stops trading, both
produce a clean-looking result that is wrong in the optimistic direction.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from insider_alpha.returns import align_to_universe, forward_returns


def _series(ticker: str, dates: pd.DatetimeIndex, prices) -> pd.DataFrame:
    return pd.DataFrame({"date": dates, "ticker": ticker, "adj_close": prices})


def _linear_panel(n: int = 300) -> tuple[pd.DataFrame, pd.DatetimeIndex]:
    dates = pd.bdate_range("2015-01-01", periods=n)
    return _series("AAA", dates, np.arange(1, n + 1, dtype=float)), dates


def test_horizon_return_uses_exactly_h_sessions_ahead():
    panel, dates = _linear_panel()
    out = forward_returns(panel, pd.DatetimeIndex([dates[0]]), horizons=(1, 5, 21))
    row = out.iloc[0]
    assert row["fwd_ret_1"] == pytest.approx(2 / 1 - 1)
    assert row["fwd_ret_5"] == pytest.approx(6 / 1 - 1)
    assert row["fwd_ret_21"] == pytest.approx(22 / 1 - 1)


def test_return_does_not_change_when_later_prices_are_appended():
    """No lookahead: extending the panel past t+h must not move the return at t."""
    panel, dates = _linear_panel(n=100)
    early = forward_returns(panel, pd.DatetimeIndex([dates[0]]), horizons=(21,))

    extra_dates = pd.bdate_range(dates[-1] + pd.Timedelta(days=1), periods=100)
    extended = pd.concat(
        [panel, _series("AAA", extra_dates, np.full(100, 10_000.0))], ignore_index=True
    )
    late = forward_returns(extended, pd.DatetimeIndex([dates[0]]), horizons=(21,))

    assert early.iloc[0]["fwd_ret_21"] == pytest.approx(late.iloc[0]["fwd_ret_21"])


def test_horizon_running_past_the_sample_end_is_missing_not_truncated():
    """The end of the data is not a delisting and must not be marked as a realized loss."""
    panel, dates = _linear_panel(n=50)
    out = forward_returns(panel, pd.DatetimeIndex([dates[-5]]), horizons=(1, 252))
    row = out.iloc[0]
    assert not np.isnan(row["fwd_ret_1"])
    assert np.isnan(row["fwd_ret_252"])
    assert not row["truncated_252"]


def test_delisting_inside_the_window_marks_to_the_last_print():
    """A name that stops trading must keep its loss, not vanish from the sample."""
    dates = pd.bdate_range("2015-01-01", periods=200)
    dying = _series("DEAD", dates[:30], np.concatenate([np.full(29, 100.0), [40.0]]))
    alive = _series("LIVE", dates, np.full(200, 100.0))
    panel = pd.concat([dying, alive], ignore_index=True)

    out = forward_returns(
        panel, pd.DatetimeIndex([dates[0]]), horizons=(63,), calendar=dates
    ).set_index("ticker")

    assert out.loc["DEAD", "truncated_63"]
    assert out.loc["DEAD", "fwd_ret_63"] == pytest.approx(40 / 100 - 1)
    assert not out.loc["LIVE", "truncated_63"]


def test_delisting_return_override_replaces_the_truncated_mark():
    dates = pd.bdate_range("2015-01-01", periods=200)
    panel = pd.concat(
        [
            _series("DEAD", dates[:30], np.full(30, 100.0)),
            _series("LIVE", dates, np.full(200, 100.0)),
        ],
        ignore_index=True,
    )
    out = forward_returns(
        panel, pd.DatetimeIndex([dates[0]]), horizons=(63,),
        calendar=dates, delisting_return=-0.30,
    ).set_index("ticker")
    assert out.loc["DEAD", "fwd_ret_63"] == pytest.approx(-0.30)
    assert out.loc["LIVE", "fwd_ret_63"] == pytest.approx(0.0)


def test_short_halt_is_bridged_rather_than_treated_as_a_delisting():
    dates = pd.bdate_range("2015-01-01", periods=60)
    halted = dates.delete(range(10, 15))
    prices = np.full(len(halted), 100.0)
    prices[-1] = 110.0
    panel = _series("AAA", halted, prices)

    out = forward_returns(panel, pd.DatetimeIndex([dates[0]]), horizons=(21,), calendar=dates)
    assert not out.iloc[0]["truncated_21"]
    assert out.iloc[0]["fwd_ret_21"] == pytest.approx(0.0)


def test_missing_price_at_the_rebalance_date_yields_no_observation():
    dates = pd.bdate_range("2015-01-01", periods=60)
    late_lister = _series("IPO", dates[30:], np.full(30, 50.0))
    out = forward_returns(late_lister, pd.DatetimeIndex([dates[0]]), horizons=(5,), calendar=dates)
    assert out.empty


def test_returns_are_computed_on_a_shared_calendar_not_per_ticker_sessions():
    """A thin name must not be credited with a longer holding period than a liquid one."""
    dates = pd.bdate_range("2015-01-01", periods=60)
    liquid = _series("LIQ", dates, np.arange(1, 61, dtype=float))
    thin_dates = dates[::5]
    thin = _series("THIN", thin_dates, np.arange(1, len(thin_dates) + 1, dtype=float))

    out = forward_returns(
        pd.concat([liquid, thin], ignore_index=True),
        pd.DatetimeIndex([dates[0]]),
        horizons=(10,),
        calendar=dates,
    ).set_index("ticker")

    # THIN prints on sessions 0, 5, 10; ten sessions out is its third print, not its tenth.
    assert out.loc["THIN", "fwd_ret_10"] == pytest.approx(3 / 1 - 1)
    assert out.loc["LIQ", "fwd_ret_10"] == pytest.approx(11 / 1 - 1)


def test_align_to_universe_keeps_universe_rows_with_no_return():
    universe = pd.DataFrame(
        {
            "rebalance_date": [pd.Timestamp("2015-01-01")] * 2,
            "ticker": ["AAA", "BBB"],
            "cik": ["0000000001", "0000000002"],
        }
    )
    returns = pd.DataFrame(
        {
            "rebalance_date": [pd.Timestamp("2015-01-01")],
            "ticker": ["AAA"],
            "fwd_ret_21": [0.05],
            "truncated_21": [False],
        }
    )
    out = align_to_universe(universe, returns)
    assert len(out) == 2
    assert out.set_index("ticker").loc["BBB", "fwd_ret_21"] != out.set_index("ticker").loc["BBB", "fwd_ret_21"]
