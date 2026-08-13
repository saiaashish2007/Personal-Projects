"""Invariants for the price cross-check and the XBRL sanity filters.

These guard the failure that motivated them: a price series that is internally
consistent and quietly wrong. Nothing in the panel itself reveals that Booking Holdings
is priced at a twenty-fifth of its market, and a market cap built on it puts the wrong
company in the index and the wrong return in the backtest.
"""

from __future__ import annotations

import pandas as pd

from insider_alpha.ingest.shares import (
    drop_scale_outliers,
    foreign_private_issuers,
)
from insider_alpha.validate import (
    price_agreement,
    unexplained_jumps,
    unreliable_tickers,
    verified_tickers,
)

FAR_FUTURE = pd.Timestamp("2262-01-01")


def _panel(ticker: str, closes: list[float], *, raw: list[float] | None = None) -> pd.DataFrame:
    dates = pd.bdate_range("2020-01-01", periods=len(closes))
    return pd.DataFrame(
        {
            "date": dates,
            "ticker": ticker,
            "close": closes,
            "close_raw": raw if raw is not None else closes,
        }
    )


def _trades(ticker: str, cik: str, dates: pd.DatetimeIndex, prices: list[float]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "ticker": ticker,
            "issuer_cik": cik,
            "transaction_date": dates,
            "price_per_share": prices,
        }
    )


def _map(pairs: list[tuple[str, str]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "cik": [c for c, _ in pairs],
            "ticker": [t for _, t in pairs],
            "valid_from": pd.Timestamp("1900-01-01"),
            "valid_to": FAR_FUTURE,
        }
    )


def test_a_uniformly_mispriced_series_is_caught_by_insider_prints():
    # The panel is a clean, plausible series. Only the insiders reveal it is 25x low.
    panel = _panel("BKNG", [80.0 + i for i in range(10)])
    trades = _trades(
        "BKNG", "0000000001", panel["date"], [(80.0 + i) * 25 for i in range(10)]
    )

    agreement = price_agreement(panel, trades, _map([("0000000001", "BKNG")]))

    assert agreement.loc[0, "n_matches"] == 10
    assert not agreement.loc[0, "agrees"]
    assert "BKNG" in unreliable_tickers(agreement)


def test_prices_matching_insider_prints_are_left_alone():
    panel = _panel("AAPL", [100.0 + i for i in range(10)])
    # Insiders transact intraday, so the match is close rather than exact.
    trades = _trades("AAPL", "0000000001", panel["date"], [100.5 + i for i in range(10)])

    agreement = price_agreement(panel, trades, _map([("0000000001", "AAPL")]))

    assert agreement.loc[0, "agrees"]
    assert unreliable_tickers(agreement) == set()


def test_a_recycled_ticker_does_not_count_as_a_price_error():
    # The trades belong to the company that used to hold the symbol. Comparing them
    # against the current holder's prices would condemn a perfectly good series.
    panel = _panel("XYZ", [10.0] * 5)
    trades = _trades("XYZ", "0000000009", panel["date"], [500.0] * 5)

    agreement = price_agreement(panel, trades, _map([("0000000001", "XYZ")]))

    assert agreement.empty or agreement.loc[0, "n_matches"] == 0


def test_a_single_stray_print_cannot_condemn_a_ticker():
    panel = _panel("ABC", [10.0] * 5)
    trades = _trades("ABC", "0000000001", panel["date"][:2], [10.0, 900.0])

    agreement = price_agreement(panel, trades, _map([("0000000001", "ABC")]))

    assert agreement.loc[0, "agrees"]


def test_a_recorded_split_is_not_reported_as_an_unexplained_jump():
    # Apple's 4-for-1: the adjusted close is continuous while the raw price steps down
    # by four, exactly as an unadjusted price should.
    closes = [100.0, 101.0, 102.0, 103.0]
    raw = [400.0, 404.0, 102.0, 103.0]

    assert unexplained_jumps(_panel("AAPL", closes, raw=raw)) == set()


def test_a_split_missing_from_the_vendors_history_is_reported():
    # No split on file, so the adjustment never happened and the jump survives.
    assert unexplained_jumps(_panel("CENN", [3.0, 3.1, 310.0, 305.0])) == {"CENN"}


def test_a_jump_across_a_long_trading_gap_is_not_treated_as_a_split():
    frame = pd.DataFrame(
        {
            "date": [pd.Timestamp("2020-01-02"), pd.Timestamp("2021-01-04")],
            "ticker": "HALT",
            "close": [50.0, 2.0],
            "close_raw": [50.0, 2.0],
        }
    )

    assert unexplained_jumps(frame) == set()


def test_insider_confirmation_outranks_the_jump_heuristic():
    # A real five-fold day. The insiders were trading at those prices throughout, which
    # is direct evidence against the heuristic's guess.
    panel = _panel("BIO", [2.0, 2.1, 12.0, 12.5, 12.4, 12.6])
    trades = _trades("BIO", "0000000001", panel["date"], [2.0, 2.1, 12.0, 12.5, 12.4, 12.6])
    agreement = price_agreement(panel, trades, _map([("0000000001", "BIO")]))

    assert "BIO" in unexplained_jumps(panel)
    assert "BIO" in verified_tickers(agreement)
    assert not (unexplained_jumps(panel) - verified_tickers(agreement))


def _facts(cik: str, counts: list[float], form: str = "10-K") -> pd.DataFrame:
    return pd.DataFrame(
        {
            "cik": cik,
            "filed": pd.bdate_range("2020-01-01", periods=len(counts)),
            "as_of": pd.bdate_range("2020-01-01", periods=len(counts)),
            "shares_outstanding": counts,
            "form": form,
        }
    )


def test_a_share_count_off_by_three_orders_of_magnitude_is_dropped():
    facts = _facts("0000000001", [2.4e8, 2.4e8, 2.41e11, 2.4e8, 2.4e8])

    kept = drop_scale_outliers(facts)

    assert len(kept) == 4
    assert kept["shares_outstanding"].max() < 1e9


def test_a_genuine_twenty_for_one_split_survives_the_outlier_filter():
    facts = _facts("0000000001", [6.6e8, 6.6e8, 6.6e8, 1.32e10, 1.32e10, 1.32e10])

    assert len(drop_scale_outliers(facts)) == 6


def test_foreign_private_issuers_are_identified_by_their_annual_report():
    facts = pd.concat(
        [_facts("0000000001", [1e9] * 4, form="20-F"), _facts("0000000002", [1e9] * 4)]
    )

    assert foreign_private_issuers(facts) == {"0000000001"}
