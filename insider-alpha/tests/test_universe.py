"""Invariants for point-in-time universe construction.

Every test here targets a failure that would be invisible in the output and fatal to the
result: a screen that reads a price from the future, a market cap built on a share count
that had not been filed yet, a symbol whose prices belong to a different company, or a
halted name treated as tradable.
"""

from __future__ import annotations

import pandas as pd
import pytest

from insider_alpha.ingest.prices import is_probable_common_stock
from insider_alpha.ingest.reference import build_pit_ticker_map, cik_for_ticker_at
from insider_alpha.ingest.shares import shares_asof
from insider_alpha.universe import (
    MAX_PRICE_STALENESS_DAYS,
    build_universe,
    month_start_rebalance_dates,
    rolling_liquidity,
    trading_calendar,
)

FAR_FUTURE = pd.Timestamp("2262-01-01")


def _prices(ticker: str, dates: pd.DatetimeIndex, close: float, volume: float) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": dates,
            "ticker": ticker,
            "open": close,
            "high": close,
            "low": close,
            "close": close,
            "close_raw": close,
            "adj_close": close,
            "volume": volume,
            "dollar_volume": close * volume,
        }
    )


def _panel(specs: list[tuple[str, float, float]], n_days: int = 60) -> pd.DataFrame:
    dates = pd.bdate_range("2015-01-01", periods=n_days)
    return pd.concat(
        [_prices(t, dates, close, volume) for t, close, volume in specs], ignore_index=True
    )


def _pit_map(tickers: list[str]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "cik": [f"{i:010d}" for i in range(1, len(tickers) + 1)],
            "ticker": tickers,
            "valid_from": pd.Timestamp("1900-01-01"),
            "valid_to": FAR_FUTURE,
            "n_filings": 10,
            "source": "form4",
        }
    )


def _share_facts(ciks: list[str], shares: float, filed: str = "2014-01-15") -> pd.DataFrame:
    return pd.DataFrame(
        {
            "cik": ciks,
            "as_of": pd.Timestamp(filed),
            "filed": pd.Timestamp(filed),
            "shares_outstanding": shares,
            "concept": "EntityCommonStockSharesOutstanding",
            "priority": 3,
            "form": "10-K",
            "accn": "x",
        }
    )


def _reference(ciks: list[str], sic: int = 3571) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "cik": ciks,
            "company_name": "Test Co",
            "sic": sic,
            "sic_description": "d",
            "entity_type": "operating",
            "exchanges": "Nasdaq",
            "tickers": "",
            "state_of_incorporation": "DE",
            "sic_division": "Manufacturing",
        }
    )


def _build(panel, pit_map, facts, reference, **kwargs):
    kwargs.setdefault("calendar", pd.DatetimeIndex(sorted(panel["date"].unique())))
    return build_universe(
        panel, pit_map, facts, reference,
        start="2015-02-01", end="2015-04-01", **kwargs,
    )


# --- screens -----------------------------------------------------------------


def test_price_screen_excludes_sub_five_dollar_stocks():
    panel = _panel([("AAA", 50.0, 1e6), ("BBB", 4.99, 1e6)])
    pit = _pit_map(["AAA", "BBB"])
    ciks = pit["cik"].tolist()
    out = _build(panel, pit, _share_facts(ciks, 1e8), _reference(ciks))
    assert set(out["ticker"]) == {"AAA"}


def test_liquidity_screen_excludes_thin_names():
    panel = _panel([("AAA", 50.0, 1e6), ("BBB", 50.0, 10.0)])
    pit = _pit_map(["AAA", "BBB"])
    ciks = pit["cik"].tolist()
    out = _build(panel, pit, _share_facts(ciks, 1e8), _reference(ciks))
    assert set(out["ticker"]) == {"AAA"}


def test_top_n_cut_is_by_market_cap():
    panel = _panel([("AAA", 50.0, 1e6), ("BBB", 50.0, 1e6), ("CCC", 50.0, 1e6)])
    pit = _pit_map(["AAA", "BBB", "CCC"])
    ciks = pit["cik"].tolist()
    facts = pd.concat(
        [
            _share_facts([ciks[0]], 3e8),
            _share_facts([ciks[1]], 2e8),
            _share_facts([ciks[2]], 1e8),
        ],
        ignore_index=True,
    )
    out = _build(panel, pit, facts, _reference(ciks), top_n=2)
    first = out[out["rebalance_date"] == out["rebalance_date"].min()]
    assert list(first["ticker"]) == ["AAA", "BBB"]
    assert list(first["market_cap_rank"]) == [1, 2]


def test_closed_end_funds_are_excluded():
    panel = _panel([("AAA", 50.0, 1e6), ("FUND", 50.0, 1e6)])
    pit = _pit_map(["AAA", "FUND"])
    ciks = pit["cik"].tolist()
    reference = pd.concat(
        [_reference([ciks[0]], sic=3571), _reference([ciks[1]], sic=6726)], ignore_index=True
    )
    out = _build(panel, pit, _share_facts(ciks, 1e8), reference)
    assert set(out["ticker"]) == {"AAA"}


def test_non_us_listing_excluded_when_required():
    panel = _panel([("AAA", 50.0, 1e6)])
    pit = _pit_map(["AAA"])
    ciks = pit["cik"].tolist()
    reference = _reference(ciks)
    reference.loc[:, "exchanges"] = ""
    assert _build(panel, pit, _share_facts(ciks, 1e8), reference).empty
    assert not _build(
        panel, pit, _share_facts(ciks, 1e8), reference, require_us_listing=False
    ).empty


# --- lookahead ---------------------------------------------------------------


def test_market_cap_ignores_share_counts_filed_after_the_rebalance():
    """A share count disclosed after t cannot be used at t, however true it was at t."""
    panel = _panel([("AAA", 50.0, 1e6)])
    pit = _pit_map(["AAA"])
    ciks = pit["cik"].tolist()
    facts = _share_facts(ciks, 1e8, filed="2015-12-31")
    assert _build(panel, pit, facts, _reference(ciks)).empty


def test_universe_at_a_date_is_unchanged_by_appending_future_prices():
    """The whole exit criterion in one assertion: rerunning later must not rewrite history."""
    panel = _panel([("AAA", 50.0, 1e6), ("BBB", 50.0, 5e5)])
    pit = _pit_map(["AAA", "BBB"])
    ciks = pit["cik"].tolist()
    facts = _share_facts(ciks, 1e8)
    reference = _reference(ciks)

    early = _build(panel, pit, facts, reference)

    # BBB becomes hugely liquid and expensive after the sample; AAA collapses.
    later_dates = pd.bdate_range("2015-04-02", periods=120)
    extension = pd.concat(
        [
            _prices("AAA", later_dates, 1.0, 10.0),
            _prices("BBB", later_dates, 500.0, 1e8),
        ],
        ignore_index=True,
    )
    late = _build(pd.concat([panel, extension], ignore_index=True), pit, facts, reference)

    columns = ["rebalance_date", "ticker", "market_cap_rank"]
    pd.testing.assert_frame_equal(
        early[columns].reset_index(drop=True), late[columns].reset_index(drop=True)
    )


def test_rolling_liquidity_uses_no_future_volume():
    dates = pd.bdate_range("2015-01-01", periods=40)
    volumes = [1.0] * 20 + [1e9] * 20
    panel = pd.DataFrame(
        {
            "date": dates,
            "ticker": "AAA",
            "close": 10.0,
            "dollar_volume": [10.0 * v for v in volumes],
        }
    )
    out = rolling_liquidity(panel).set_index("date")["median_dollar_volume"]
    assert out.loc[dates[19]] == pytest.approx(10.0)
    assert out.loc[dates[-1]] == pytest.approx(1e10)


def test_stale_prices_do_not_carry_a_halted_name_into_the_universe():
    """A name that stopped printing must drop out, not sit in the book at a dead mark."""
    dates = pd.bdate_range("2015-01-01", periods=40)
    panel = _prices("AAA", dates, 50.0, 1e6)
    pit = _pit_map(["AAA"])
    ciks = pit["cik"].tolist()
    out = build_universe(
        panel, pit, _share_facts(ciks, 1e8), _reference(ciks),
        start="2015-02-01", end="2015-06-01",
        calendar=pd.DatetimeIndex(pd.bdate_range("2015-01-01", "2015-06-30")),
    )
    last_print = dates[-1]
    assert out["rebalance_date"].max() <= last_print + pd.Timedelta(
        days=MAX_PRICE_STALENESS_DAYS
    )
    assert not out["rebalance_date"].ge("2015-04-01").any()


# --- identity ----------------------------------------------------------------


def test_recycled_ticker_resolves_to_the_owner_at_that_date():
    trades = pd.DataFrame(
        {
            "issuer_cik": ["0000000001"] * 3 + ["0000000002"] * 3,
            "ticker": ["ZZZ"] * 3 + ["ZZZ"] * 3,
            "filing_date": pd.to_datetime(
                ["2012-01-01", "2013-01-01", "2014-01-01",
                 "2019-01-01", "2020-01-01", "2021-01-01"]
            ),
        }
    )
    current = pd.DataFrame(
        {"cik": ["0000000002"], "ticker": ["ZZZ"], "company_name": ["Successor"]}
    )
    pit = build_pit_ticker_map(trades, current)

    probe = pd.DataFrame(
        {"ticker": ["ZZZ", "ZZZ"], "date": pd.to_datetime(["2013-06-01", "2020-06-01"])}
    )
    assert list(cik_for_ticker_at(pit, probe)) == ["0000000001", "0000000002"]


def test_ticker_change_is_dated_to_the_first_filing_using_the_new_symbol():
    trades = pd.DataFrame(
        {
            "issuer_cik": ["0000000001"] * 4,
            "ticker": ["OLD", "OLD", "NEW", "NEW"],
            "filing_date": pd.to_datetime(
                ["2015-01-01", "2016-01-01", "2017-06-15", "2018-01-01"]
            ),
        }
    )
    current = pd.DataFrame({"cik": ["0000000001"], "ticker": ["NEW"], "company_name": ["Co"]})
    pit = build_pit_ticker_map(trades, current)

    old = pit[pit["ticker"] == "OLD"].iloc[0]
    new = pit[pit["ticker"] == "NEW"].iloc[0]
    assert old["valid_to"] == pd.Timestamp("2017-06-15")
    assert new["valid_from"] == pd.Timestamp("2017-06-15")
    assert new["valid_to"] == FAR_FUTURE


def test_delisted_issuer_ticker_claim_does_not_run_forever():
    """Leaving a dead company's claim open is how a recycled symbol steals its prices."""
    trades = pd.DataFrame(
        {
            "issuer_cik": ["0000000001"] * 3,
            "ticker": ["GONE"] * 3,
            "filing_date": pd.to_datetime(["2014-01-01", "2015-01-01", "2016-03-01"]),
        }
    )
    current = pd.DataFrame(columns=["cik", "ticker", "company_name"])
    pit = build_pit_ticker_map(trades, current)
    assert pit.iloc[0]["valid_to"] < pd.Timestamp("2017-01-01")


def test_quoted_and_bracketed_ticker_variants_collapse_to_one_claim():
    trades = pd.DataFrame(
        {
            "issuer_cik": ["0000000001"] * 4,
            "ticker": ['"ABC"', "ABC", "[ABC]", "abc"],
            "filing_date": pd.to_datetime(
                ["2015-01-01", "2016-01-01", "2017-01-01", "2018-01-01"]
            ),
        }
    )
    current = pd.DataFrame({"cik": ["0000000001"], "ticker": ["ABC"], "company_name": ["Co"]})
    pit = build_pit_ticker_map(trades, current)
    assert len(pit) == 1
    assert pit.iloc[0]["valid_to"] == FAR_FUTURE


# --- shares outstanding ------------------------------------------------------


def test_shares_asof_uses_the_latest_filing_not_the_latest_period():
    facts = pd.DataFrame(
        {
            "cik": ["0000000001", "0000000001"],
            "as_of": pd.to_datetime(["2015-06-30", "2015-03-31"]),
            "filed": pd.to_datetime(["2015-08-05", "2015-05-05"]),
            "shares_outstanding": [200.0, 100.0],
            "priority": [3, 3],
        }
    )
    queries = pd.DataFrame(
        {"cik": ["0000000001"] * 2, "date": pd.to_datetime(["2015-07-01", "2015-09-01"])}
    )
    out = shares_asof(facts, queries)
    assert list(out["shares_outstanding"]) == [100.0, 200.0]


def test_shares_asof_drops_counts_older_than_the_staleness_limit():
    facts = pd.DataFrame(
        {
            "cik": ["0000000001"],
            "as_of": [pd.Timestamp("2010-01-01")],
            "filed": [pd.Timestamp("2010-01-01")],
            "shares_outstanding": [100.0],
            "priority": [3],
        }
    )
    queries = pd.DataFrame({"cik": ["0000000001"], "date": [pd.Timestamp("2015-01-01")]})
    assert shares_asof(facts, queries)["shares_outstanding"].isna().all()


# --- calendar and symbol syntax ----------------------------------------------


def test_rebalance_dates_are_first_trading_day_of_each_month():
    calendar = pd.DatetimeIndex(pd.bdate_range("2015-01-01", "2015-04-30"))
    dates = month_start_rebalance_dates(calendar, "2015-01-01", "2015-04-30")
    assert list(dates.strftime("%Y-%m-%d")) == ["2015-01-01", "2015-02-02", "2015-03-02", "2015-04-01"]


def test_trading_calendar_ignores_dates_with_almost_no_breadth():
    dates = pd.bdate_range("2015-01-01", periods=5)
    broad = pd.concat([_prices(f"T{i}", dates, 10.0, 1e5) for i in range(150)], ignore_index=True)
    stray = _prices("ODD", pd.DatetimeIndex([pd.Timestamp("2015-01-03")]), 10.0, 1.0)
    calendar = trading_calendar(pd.concat([broad, stray], ignore_index=True))
    assert pd.Timestamp("2015-01-03") not in calendar
    assert len(calendar) == 5


@pytest.mark.parametrize(
    "ticker,expected",
    [
        ("AAPL", True), ("BRK.B", True), ("BRK-B", True), ("GOOGL", True),
        ("ABCDW", False), ("ABCDU", False), ("ABCDR", False),
        ("BAMXF", False), ("AVVSY", False), ("BEP-PA", False), ("", False),
    ],
)
def test_common_stock_symbol_syntax(ticker, expected):
    assert is_probable_common_stock(ticker) is expected
