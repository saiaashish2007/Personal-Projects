"""Invariants for firm-level signal construction (SPEC.md section 7).

A leak here — a purchase filed after rebalance date t contributing to S_t —
would make every IC and every backtest number look better than a real-time
observer could have done. The tests below target that failure, plus the two
other silent ones: treating a non-event as missing rather than zero, and a
sector neutralization that does not actually zero the sector mean.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from insider_alpha.signal.construct import (
    ARM_ALL_INSIDERS,
    ARM_OPPORTUNISTIC,
    SignalConfig,
    build_signal,
    conviction,
    is_csuite_title,
    map_filings_to_rebalances,
    neutralize_by_sector,
    qualifying_purchases,
    role_weights,
    standardize_cross_section,
    zscore_by_date,
)

REBALANCE = pd.Timestamp("2015-06-01")
ADV = 1_000_000.0


def _trade(
    issuer: str,
    owner: str,
    filing_date: str,
    *,
    shares: float = 1000.0,
    price: float = 10.0,
    owned_after: float = 10_000.0,
    title: str = "CEO",
    is_officer: bool = True,
    is_director: bool = False,
    is_ten_pct: bool = False,
    label: str = "opportunistic",
    code: str = "P",
    transaction_date: str | None = None,
) -> dict:
    filed = pd.Timestamp(filing_date)
    traded = pd.Timestamp(transaction_date) if transaction_date else filed - pd.Timedelta(days=2)
    return {
        "accession": f"{issuer}-{owner}-{filed.date()}",
        "trans_sk": "1",
        "issuer_cik": issuer,
        "owner_cik": owner,
        "owner_title": title,
        "is_director": is_director,
        "is_officer": is_officer,
        "is_ten_pct_owner": is_ten_pct,
        "filing_date": filed,
        "transaction_date": traded,
        "transaction_code": code,
        "shares": shares,
        "price_per_share": price,
        "dollar_value": shares * price,
        "shares_owned_after": owned_after,
        "label": label,
    }


def _universe(tickers: list[tuple[str, str, str]], date: str = "2015-06-01") -> pd.DataFrame:
    rows = []
    for ticker, cik, sector in tickers:
        rows.append(
            {
                "rebalance_date": pd.Timestamp(date),
                "ticker": ticker,
                "cik": cik,
                "median_dollar_volume": ADV,
                "sic_division": sector,
            }
        )
    return pd.DataFrame(rows)


def _signal(trades: list[dict], universe: pd.DataFrame, **config) -> pd.DataFrame:
    return build_signal(pd.DataFrame(trades), universe, config=SignalConfig(**config)).set_index(
        "ticker"
    )


# --- window and lookahead ----------------------------------------------------


def test_purchase_filed_after_rebalance_cannot_enter_s():
    """The core no-lookahead guarantee, on filing_date, not transaction_date.

    The insider traded two weeks before the rebalance; the Form 4 arrived the
    next day. A real-time observer at t does not see it, so S_t must ignore it.
    """
    universe = _universe([("AAA", "cikA", "Manufacturing"), ("BBB", "cikB", "Services")])
    trades = [
        _trade(
            "cikA",
            "own1",
            "2015-06-02",
            transaction_date="2015-05-15",
        )
    ]
    out = _signal(trades, universe)
    assert out.loc["AAA", f"raw_{ARM_OPPORTUNISTIC}"] == 0.0
    assert out.loc["BBB", f"raw_{ARM_OPPORTUNISTIC}"] == 0.0


def test_purchase_filed_on_rebalance_date_does_enter():
    universe = _universe([("AAA", "cikA", "Manufacturing"), ("BBB", "cikB", "Services")])
    trades = [_trade("cikA", "own1", "2015-06-01")]
    out = _signal(trades, universe)
    assert out.loc["AAA", f"raw_{ARM_OPPORTUNISTIC}"] > 0.0
    assert out.loc["BBB", f"raw_{ARM_OPPORTUNISTIC}"] == 0.0


def test_window_is_open_on_the_left_and_closed_on_the_right():
    """Filing on t − W is excluded; filing on t − W + 1 day is included.

    2015-06-01 minus 90 calendar days is 2015-03-03.
    """
    universe = _universe([("AAA", "cikA", "Manufacturing"), ("BBB", "cikB", "Services")])
    excluded = _signal([_trade("cikA", "own1", "2015-03-03")], universe)
    included = _signal([_trade("cikA", "own1", "2015-03-04")], universe)
    assert excluded.loc["AAA", f"raw_{ARM_OPPORTUNISTIC}"] == 0.0
    assert included.loc["AAA", f"raw_{ARM_OPPORTUNISTIC}"] > 0.0


def test_map_filings_respects_the_half_open_window():
    dates = pd.DatetimeIndex([REBALANCE])
    filings = pd.Series(pd.to_datetime(["2015-03-03", "2015-03-04", "2015-06-01", "2015-06-02"]))
    pairs = map_filings_to_rebalances(filings, dates, 90)
    assert set(pairs["trade_iloc"].tolist()) == {1, 2}


# --- S = 0, not NaN ----------------------------------------------------------


def test_non_event_names_get_zero_not_nan():
    universe = _universe(
        [
            ("AAA", "cikA", "Manufacturing"),
            ("BBB", "cikB", "Services"),
            ("CCC", "cikC", "Retail Trade"),
        ]
    )
    trades = [_trade("cikA", "own1", "2015-05-15")]
    out = _signal(trades, universe)
    for ticker in ("BBB", "CCC"):
        assert out.loc[ticker, f"raw_{ARM_OPPORTUNISTIC}"] == 0.0
        assert out.loc[ticker, f"raw_{ARM_ALL_INSIDERS}"] == 0.0
        assert np.isfinite(out.loc[ticker, f"s_{ARM_OPPORTUNISTIC}"])
        assert np.isfinite(out.loc[ticker, f"s_{ARM_ALL_INSIDERS}"])
        assert out.loc[ticker, f"n_trades_{ARM_OPPORTUNISTIC}"] == 0
        assert out.loc[ticker, f"n_insiders_{ARM_OPPORTUNISTIC}"] == 0


def test_grants_and_missing_prices_never_enter():
    universe = _universe([("AAA", "cikA", "Manufacturing"), ("BBB", "cikB", "Services")])
    trades = [
        _trade("cikA", "own1", "2015-05-15", code="A"),
        _trade("cikA", "own2", "2015-05-16", price=0.0),
        _trade("cikB", "own3", "2015-05-17", code="S"),
    ]
    purchases = qualifying_purchases(pd.DataFrame(trades))
    assert purchases.empty
    out = _signal(trades, universe)
    assert (out[f"raw_{ARM_ALL_INSIDERS}"] == 0).all()


# --- opportunistic filter ----------------------------------------------------


def test_opportunistic_arm_drops_routine_trades_all_insiders_keeps_them():
    universe = _universe([("AAA", "cikA", "Manufacturing"), ("BBB", "cikB", "Services")])
    trades = [_trade("cikA", "own1", "2015-05-15", label="routine")]
    out = _signal(trades, universe)
    assert out.loc["AAA", f"raw_{ARM_OPPORTUNISTIC}"] == 0.0
    assert out.loc["AAA", f"raw_{ARM_ALL_INSIDERS}"] > 0.0


def test_unclassified_trades_are_not_opportunistic():
    universe = _universe([("AAA", "cikA", "Manufacturing"), ("BBB", "cikB", "Services")])
    trades = [_trade("cikA", "own1", "2015-05-15", label="unclassified")]
    out = _signal(trades, universe)
    assert out.loc["AAA", f"raw_{ARM_OPPORTUNISTIC}"] == 0.0
    assert out.loc["AAA", f"raw_{ARM_ALL_INSIDERS}"] > 0.0


# --- role weights and conviction --------------------------------------------


def test_csuite_titles_outrank_officer_and_vice_prefixes_do_not():
    assert is_csuite_title("Chief Executive Officer")
    assert is_csuite_title("CFO")
    assert is_csuite_title("Chairman of the Board")
    assert is_csuite_title("President")
    assert not is_csuite_title("Vice President")
    assert not is_csuite_title("Vice Chairman")
    assert is_csuite_title("Vice President and CEO")


def test_role_weight_priority():
    frame = pd.DataFrame(
        [
            {
                "owner_title": "CEO",
                "is_officer": True,
                "is_director": True,
                "is_ten_pct_owner": True,
            },
            {
                "owner_title": "VP Sales",
                "is_officer": True,
                "is_director": True,
                "is_ten_pct_owner": False,
            },
            {
                "owner_title": "",
                "is_officer": False,
                "is_director": True,
                "is_ten_pct_owner": False,
            },
            {
                "owner_title": "",
                "is_officer": False,
                "is_director": False,
                "is_ten_pct_owner": True,
            },
        ]
    )
    weights = role_weights(frame)
    assert list(weights) == pytest.approx([1.0, 0.60, 0.40, 0.25])


def test_conviction_clips_and_treats_bad_owned_after_as_zero():
    shares = pd.Series([100.0, 100.0, 100.0, 100.0])
    owned = pd.Series([200.0, 50.0, 0.0, np.nan])
    conv = conviction(shares, owned)
    assert conv.iloc[0] == pytest.approx(0.5)
    assert conv.iloc[1] == pytest.approx(1.0)
    assert conv.iloc[2] == 0.0
    assert conv.iloc[3] == 0.0


# --- cluster amplification ---------------------------------------------------


def test_two_insiders_amplify_relative_to_one():
    universe = _universe([("AAA", "cikA", "Manufacturing"), ("BBB", "cikB", "Services")])
    one = [_trade("cikA", "own1", "2015-05-15")]
    two = [
        _trade("cikA", "own1", "2015-05-15"),
        _trade("cikA", "own2", "2015-05-16"),
    ]
    s_one = _signal(one, universe).loc["AAA", f"raw_{ARM_OPPORTUNISTIC}"]
    s_two = _signal(two, universe).loc["AAA", f"raw_{ARM_OPPORTUNISTIC}"]
    # Two identical contributions C: 2C * (1 + 0.5 ln 2) vs C * 1.
    expected_ratio = 2.0 * (1.0 + 0.5 * np.log(2.0))
    assert s_two / s_one == pytest.approx(expected_ratio, rel=1e-6)


# --- sector neutralization ---------------------------------------------------


def test_sector_neutralization_zeros_the_sector_mean():
    """The step that is supposed to kill the sector bet must actually do so.

    Checked on the neutralized residual, before the final re-standardization,
    because re-scoring across the whole date is allowed to move sector means
    a hair and is not the property under test.
    """
    dates = pd.Series(pd.to_datetime(["2015-06-01"] * 6))
    sectors = pd.Series(["Manufacturing"] * 3 + ["Finance, Insurance, Real Estate"] * 3)
    values = pd.Series([0.0, 1.0, 2.0, -1.0, 0.0, 4.0], dtype=float)
    zscored = zscore_by_date(values, dates)
    neutralized = neutralize_by_sector(zscored, dates, sectors)
    means = neutralized.groupby([dates, sectors]).mean()
    assert means.abs().max() < 1e-12


def test_full_cross_section_has_zero_date_mean_and_unit_std():
    dates = pd.Series(pd.to_datetime(["2015-06-01"] * 8 + ["2015-07-01"] * 8))
    sectors = pd.Series((["Mfg"] * 4 + ["Fin"] * 4) * 2)
    rng = np.random.default_rng(0)
    values = pd.Series(rng.normal(size=16).clip(-1, 3) ** 2)
    final = standardize_cross_section(values, dates, sectors)
    grouped = final.groupby(dates)
    assert grouped.mean().abs().max() < 1e-10
    assert grouped.std().max() == pytest.approx(1.0, rel=1e-6)
    assert grouped.std().min() == pytest.approx(1.0, rel=1e-6)
