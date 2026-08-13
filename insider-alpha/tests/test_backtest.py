"""Invariants for the Milestone 5 backtest (SPEC.md 9–10).

A leak here — a weight at t that depends on a return or a score after t —
would make every equity curve look better than a real-time observer could
have done. The other silent failures: costs that do not actually reduce net,
negative turnover, and an "overlapping" book that drops a name the month
after it is selected.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from insider_alpha.backtest.costs import (
    apply_flat_cost,
    interpolate_zero_crossing,
    monthly_explicit_cost,
)
from insider_alpha.backtest.engine import (
    holding_returns,
    performance_block,
    snapshot_prices,
)
from insider_alpha.backtest.portfolio import (
    combine_overlapping,
    long_book_weights,
    one_sided_turnover,
    quintile_legs,
    vintage_positions,
)


def _cross_section(
    date: str,
    rows: list[tuple[str, float, float, str, float]],
) -> pd.DataFrame:
    """(ticker, raw, score, sector, market_cap) at one rebalance."""
    tickers, raws, scores, sectors, caps = zip(*rows)
    n = len(tickers)
    return pd.DataFrame(
        {
            "rebalance_date": pd.Timestamp(date),
            "ticker": list(tickers),
            "raw_opportunistic": list(raws),
            "s_opportunistic": list(scores),
            "sic_division": list(sectors),
            "market_cap": list(caps),
            "median_dollar_volume": [1_000_000.0] * n,
        }
    )


def test_long_book_uses_only_nonzero_raw_and_top_quintile():
    """Zeros are inactive; the long book is the top fifth of the rest."""
    # 10 active names with increasing scores, 10 zeros. Top quintile of 10 is 2 names.
    active = [
        (f"A{i}", 1.0, float(i), "Manufacturing", 1e9) for i in range(10)
    ]
    zeros = [
        (f"Z{i}", 0.0, 99.0, "Manufacturing", 1e9) for i in range(10)
    ]
    frame = _cross_section("2015-01-02", active + zeros)
    weights = long_book_weights(frame, "s_opportunistic", "raw_opportunistic")
    assert set(weights.index) == {"A8", "A9"}
    assert weights.sum() == pytest.approx(1.0)
    assert (weights > 0).all()


def test_weights_at_t_do_not_depend_on_future_scores():
    """No lookahead: appending a later rebalance cannot move weights at t."""
    t0 = _cross_section(
        "2015-01-02",
        [(f"A{i}", 1.0, float(i), "Manufacturing", 1e9) for i in range(10)],
    )
    t1 = _cross_section(
        "2015-02-02",
        [(f"A{i}", 1.0, float(20 - i), "Manufacturing", 1e9) for i in range(10)],
    )
    early = long_book_weights(t0, "s_opportunistic", "raw_opportunistic")
    vintages = vintage_positions(
        pd.concat([t0, t1], ignore_index=True),
        "s_opportunistic",
        "raw_opportunistic",
        hedge="beta_sector_matched_etf",
    )
    at_t0 = vintages[vintages["formation_date"].eq(pd.Timestamp("2015-01-02"))]
    late = pd.Series(at_t0["weight"].to_numpy(), index=at_t0["ticker"].to_numpy())
    assert set(early.index) == set(late.index)
    assert early.sort_index().to_numpy() == pytest.approx(late.sort_index().to_numpy())


def test_overlapping_holdings_persist_for_k_months():
    """A name selected only at t0 is still in the combined book at t0, t1, t2."""
    dates = pd.to_datetime(["2015-01-02", "2015-02-02", "2015-03-02", "2015-04-02", "2015-05-01"])
    rows = []
    for i, date in enumerate(dates):
        # Only AAA is active at the first date; later dates have a different name.
        if i == 0:
            tickers = [("AAA", 1.0, 2.0, "Manufacturing", 1e9)] + [
                (f"B{j}", 1.0, 0.1, "Services", 1e9) for j in range(4)
            ]
        else:
            tickers = [("ZZZ", 1.0, 2.0, "Services", 1e9)] + [
                (f"C{j}", 1.0, 0.1, "Finance, Insurance, Real Estate", 1e9) for j in range(4)
            ]
        rows.append(_cross_section(date.strftime("%Y-%m-%d"), tickers))
    panel = pd.concat(rows, ignore_index=True)
    vintages = vintage_positions(
        panel, "s_opportunistic", "raw_opportunistic", hedge="beta_sector_matched_etf"
    )
    combined = combine_overlapping(vintages, pd.DatetimeIndex(dates), holding_period_months=3)

    def held(date: str, ticker: str) -> float:
        sl = combined[combined["rebalance_date"].eq(pd.Timestamp(date)) & combined["ticker"].eq(ticker)]
        return float(sl["weight"].sum()) if len(sl) else 0.0

    assert held("2015-01-02", "AAA") > 0.0
    assert held("2015-02-02", "AAA") > 0.0
    assert held("2015-03-02", "AAA") > 0.0
    assert held("2015-04-02", "AAA") == pytest.approx(0.0)
    # Combined weight at t1 is smaller than at formation-only equal-weight of one
    # vintage, because it is averaged with two other vintages that do not hold AAA.
    assert held("2015-02-02", "AAA") == pytest.approx(held("2015-01-02", "AAA"))
    assert held("2015-02-02", "AAA") < 1.0


def test_one_sided_turnover_is_nonnegative():
    prev = pd.Series({"AAA": 0.5, "BBB": 0.5})
    curr = pd.Series({"AAA": 0.2, "CCC": 0.8})
    to = one_sided_turnover(prev, curr)
    assert to >= 0.0
    # |Δ| = 0.3 + 0.5 + 0.8 = 1.6, one-sided = 0.8
    assert to == pytest.approx(0.8)


def test_flat_costs_reduce_net_versus_gross():
    gross = pd.Series([0.01, -0.005, 0.02, 0.0])
    turnover = pd.Series([0.4, 0.3, 0.5, 0.2])
    net = apply_flat_cost(gross, turnover, round_trip_bps=50)
    assert (net <= gross + 1e-15).all()
    assert net.sum() < gross.sum()


def test_explicit_costs_are_positive_when_the_book_turns():
    prev = pd.Series({"AAA": 1.0})
    curr = pd.Series({"BBB": 1.0})
    attr = pd.DataFrame(
        {
            "cap_tercile": ["small", "small"],
            "median_dollar_volume": [1_000_000.0, 1_000_000.0],
            "is_etf": [False, False],
        },
        index=["AAA", "BBB"],
    )
    cost, rt, detail = monthly_explicit_cost(prev, curr, attr)
    assert cost > 0.0
    assert rt > 0.0
    assert float(detail["one_sided"].sum()) == pytest.approx(1.0)


def test_break_even_is_null_when_alpha_never_positive():
    x = np.arange(0, 105, 5, dtype=float)
    y = -10.0 - 0.5 * x
    assert interpolate_zero_crossing(x, y) is None


def test_break_even_interpolates_the_crossing():
    x = np.array([0.0, 10.0, 20.0])
    y = np.array([10.0, 0.0, -10.0])
    assert interpolate_zero_crossing(x, y) == pytest.approx(10.0)
    y2 = np.array([10.0, 5.0, -5.0])
    assert interpolate_zero_crossing(x, y2) == pytest.approx(15.0)


def test_holding_returns_are_from_t_to_next_snapshot_only():
    """The return stored at t uses the next mark, not a later one."""
    dates = pd.to_datetime(["2015-01-02", "2015-02-02", "2015-03-02"])
    snap = pd.DataFrame({"AAA": [10.0, 11.0, 12.0]}, index=dates)
    ret = holding_returns(snap)
    assert list(ret.index) == list(dates[:2])
    assert ret.loc[dates[0], "AAA"] == pytest.approx(0.1)
    assert ret.loc[dates[1], "AAA"] == pytest.approx(12.0 / 11.0 - 1.0)


def test_snapshot_does_not_read_prices_after_the_target_date():
    prices = pd.DataFrame(
        {
            "date": pd.to_datetime(["2015-01-02", "2015-01-15", "2015-02-02"]),
            "ticker": ["AAA", "AAA", "AAA"],
            "adj_close": [10.0, 50.0, 11.0],
        }
    )
    snap = snapshot_prices(prices, pd.to_datetime(["2015-01-02"]), ["AAA"])
    assert snap.loc[pd.Timestamp("2015-01-02"), "AAA"] == pytest.approx(10.0)


def test_performance_block_drawdown_is_nonpositive():
    r = pd.Series([0.02, -0.10, 0.03, -0.01], index=pd.to_datetime(
        ["2015-01-02", "2015-02-02", "2015-03-02", "2015-04-02"]
    ))
    rf = pd.Series(0.001, index=r.index)
    block = performance_block(r, rf)
    assert block["max_drawdown"] <= 0.0
    assert block["ann_vol"] >= 0.0
    assert 0.0 <= block["hit_rate_monthly"] <= 1.0


def test_three_active_names_still_fill_the_long_book():
    """A month with n < 5 must not produce an empty Q5."""
    frame = _cross_section(
        "2014-01-02",
        [
            ("AAA", 1.0, 3.0, "Manufacturing", 1e9),
            ("BBB", 1.0, 2.0, "Manufacturing", 1e9),
            ("CCC", 1.0, 1.0, "Manufacturing", 1e9),
        ],
    )
    weights = long_book_weights(frame, "s_opportunistic", "raw_opportunistic")
    assert "AAA" in set(weights.index)
    assert weights.sum() == pytest.approx(1.0)


def test_quintile_legs_ignore_zero_raw_even_if_standardized_score_is_huge():
    frame = _cross_section(
        "2015-01-02",
        [
            ("ZERO", 0.0, 99.0, "Manufacturing", 1e9),
            *[(f"A{i}", 1.0, float(i), "Manufacturing", 1e9) for i in range(10)],
        ],
    )
    legs = quintile_legs(frame, "s_opportunistic", "raw_opportunistic")
    zero_q = int(legs.loc[legs["ticker"].eq("ZERO"), "quantile"].iloc[0])
    assert zero_q == 0
    assert not bool(legs.loc[legs["ticker"].eq("ZERO"), "active"].iloc[0])
