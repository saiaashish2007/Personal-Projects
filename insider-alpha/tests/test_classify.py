"""Invariants for the routine/opportunistic classifier.

The classifier decides which insider trades enter the headline signal, so a leak of
future information here would silently invalidate every downstream result. The
point-in-time tests below are therefore the highest-value tests in the project: they
assert not only that known patterns are labelled correctly, but that truncating the
trade table at date `t` cannot change any label at or before `t`.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from insider_alpha.signal.classify import (
    DISCRETIONARY_CODES,
    ClassifierConfig,
    classify,
    evaluation_dates_for,
    label_trades,
)

FILING_LAG = pd.Timedelta(days=2)


def _trade(owner: str, transaction_date: str, *, filing_date: str | None = None, code: str = "P") -> dict:
    traded = pd.Timestamp(transaction_date)
    return {
        "owner_cik": owner,
        "transaction_date": traded,
        "filing_date": pd.Timestamp(filing_date) if filing_date else traded + FILING_LAG,
        "transaction_code": code,
    }


def _frame(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["owner_cik", "transaction_date", "filing_date", "transaction_code"])


def _label(trades: pd.DataFrame, owner: str, date: str, **config_kwargs) -> str:
    config = ClassifierConfig(**config_kwargs)
    result = classify(trades, eval_dates=pd.DatetimeIndex([pd.Timestamp(date)]), config=config)
    position = result.owners.get_indexer([owner])[0]
    if position < 0:
        return "unclassified"
    return {0: "unclassified", 1: "routine", 2: "opportunistic"}[int(result.codes[position, 0])]


# --- the rule itself ---------------------------------------------------------


def test_same_month_three_years_running_is_routine():
    trades = _frame([_trade("A", f"{year}-03-10") for year in (2011, 2012, 2013)])
    assert _label(trades, "A", "2014-01-01") == "routine"


def test_two_years_of_the_pattern_is_not_enough():
    trades = _frame([_trade("A", f"{year}-03-10") for year in (2012, 2013)])
    assert _label(trades, "A", "2014-01-01") == "unclassified"


def test_trading_every_year_in_scattered_months_is_opportunistic():
    trades = _frame([
        _trade("A", "2011-02-10"),
        _trade("A", "2012-07-10"),
        _trade("A", "2013-11-10"),
    ])
    assert _label(trades, "A", "2014-01-01") == "opportunistic"


def test_gap_year_leaves_the_insider_unclassified():
    """CMP require a trade in each of the three preceding years to classify at all.

    Without this, the sporadic filer lands in the opportunistic bucket and dominates it.
    """
    trades = _frame([_trade("A", "2011-03-10"), _trade("A", "2013-03-10")])
    assert _label(trades, "A", "2014-01-01") == "unclassified"


def test_span_history_rule_classifies_the_gap_year_insider():
    """The weaker span rule only asks that the first filing be three years old."""
    trades = _frame([_trade("A", "2010-03-10"), _trade("A", "2013-03-10")])
    assert _label(trades, "A", "2014-01-01", require_trade_every_year=False) == "opportunistic"
    assert _label(trades, "A", "2014-01-01") == "unclassified"

    too_recent = _frame([_trade("A", "2011-03-10"), _trade("A", "2013-03-10")])
    assert _label(too_recent, "A", "2014-01-01", require_trade_every_year=False) == "unclassified"


def test_pattern_only_needs_one_qualifying_month():
    """Extra trades in other months do not break an otherwise routine pattern."""
    rows = [_trade("A", f"{year}-03-10") for year in (2011, 2012, 2013)]
    rows += [_trade("A", "2011-08-04"), _trade("A", "2013-01-20")]
    assert _label(_frame(rows), "A", "2014-01-01") == "routine"


def test_insider_with_no_history_is_unclassified():
    trades = _frame([_trade("B", "2011-03-10")])
    assert _label(trades, "A", "2014-01-01") == "unclassified"


def test_lookback_window_is_configurable():
    trades = _frame([_trade("A", f"{year}-03-10") for year in (2010, 2011, 2012, 2013)])
    assert _label(trades, "A", "2014-01-01", lookback_years=4) == "routine"
    assert _label(trades, "A", "2015-01-01", lookback_years=4) == "unclassified"


def test_pattern_codes_filter_excludes_compensation_mechanics():
    """Monthly tax withholding must not make a discretionary buyer routine."""
    rows = [
        _trade("A", f"{year}-{month:02d}-10", code="F")
        for year in (2011, 2012, 2013) for month in range(1, 13)
    ]
    rows += [_trade("A", f"{year}-05-10") for year in (2011, 2012, 2013)]
    rows += [_trade("A", "2012-09-01"), _trade("A", "2013-02-01")]
    trades = _frame(rows)

    assert _label(trades, "A", "2014-01-01", codes=DISCRETIONARY_CODES) == "routine"
    assert _label(trades, "A", "2014-01-01", codes=frozenset({"P"})) == "routine"
    assert _label(trades, "A", "2014-01-01", codes=None) == "routine"

    scattered = _frame([_trade("A", f"{y}-{m:02d}-10", code="F")
                        for y in (2011, 2012, 2013) for m in range(1, 13)]
                       + [_trade("A", "2011-02-10"), _trade("A", "2012-07-10"),
                          _trade("A", "2013-11-10")])
    assert _label(scattered, "A", "2014-01-01", codes=DISCRETIONARY_CODES) == "opportunistic"
    assert _label(scattered, "A", "2014-01-01", codes=None) == "routine"


# --- point-in-time correctness ----------------------------------------------


def test_a_trade_filed_after_t_cannot_change_the_label_at_t():
    """The core no-lookahead guarantee, stated as directly as it can be."""
    history = [_trade("A", f"{year}-03-10") for year in (2011, 2012, 2013)]
    future = _trade("A", "2014-06-10")

    before = _label(_frame(history), "A", "2014-01-01")
    after = _label(_frame(history + [future]), "A", "2014-01-01")
    assert before == after == "routine"

    scattered = [_trade("A", "2011-02-10"), _trade("A", "2012-07-10"), _trade("A", "2013-11-10")]
    completes_a_pattern = [_trade("A", f"{year}-04-10") for year in (2014, 2015, 2016)]
    assert _label(_frame(scattered), "A", "2014-01-01") == "opportunistic"
    assert _label(_frame(scattered + completes_a_pattern), "A", "2014-01-01") == "opportunistic"


def test_late_filing_is_invisible_until_it_is_filed():
    """The pattern month comes from the trade date; visibility comes from the filing."""
    rows = [_trade("A", f"{year}-03-10") for year in (2011, 2012)]
    rows.append(_trade("A", "2013-03-10", filing_date="2014-02-20"))
    trades = _frame(rows)

    assert _label(trades, "A", "2014-01-01") == "unclassified"
    assert _label(trades, "A", "2014-03-01") == "routine"


def test_december_trade_filed_in_january_is_not_visible_on_january_first():
    rows = [_trade("A", f"{year}-12-20") for year in (2011, 2012)]
    rows.append(_trade("A", "2013-12-30", filing_date="2014-01-03"))
    trades = _frame(rows)

    assert _label(trades, "A", "2014-01-01") == "unclassified"
    assert _label(trades, "A", "2014-02-01", anchor="rolling") == "routine"


def test_truncating_the_table_never_changes_any_earlier_label():
    """Randomized panel: labels computed on full history must equal labels computed
    on history truncated at each evaluation date. This is the general statement of
    point-in-time correctness — any leak anywhere in the vectorized path breaks it.
    """
    rng = np.random.default_rng(20120621)
    rows = []
    for insider in range(120):
        for _ in range(rng.integers(1, 25)):
            year = int(rng.integers(2011, 2019))
            month = int(rng.integers(1, 13))
            day = int(rng.integers(1, 28))
            lag = int(rng.integers(0, 90))
            traded = pd.Timestamp(year=year, month=month, day=day)
            rows.append({
                "owner_cik": f"{insider:010d}",
                "transaction_date": traded,
                "filing_date": traded + pd.Timedelta(days=lag),
                "transaction_code": rng.choice(["P", "S"]),
            })
    trades = _frame(rows)

    for anchor in ("calendar", "rolling"):
        config = ClassifierConfig(anchor=anchor)
        eval_dates = pd.date_range("2014-01-01", "2019-01-01", freq="YS" if anchor == "calendar" else "QS")
        full = classify(trades, eval_dates=eval_dates, config=config)

        for j, date in enumerate(eval_dates):
            truncated_input = trades[trades["filing_date"] < date]
            truncated = classify(truncated_input, eval_dates=pd.DatetimeIndex([date]), config=config)
            mapped = truncated.owners.get_indexer(full.owners)
            expected = np.where(mapped >= 0, truncated.codes[mapped.clip(0), 0], 0)
            assert np.array_equal(full.codes[:, j], expected), f"{anchor} leak at {date.date()}"


def test_a_trade_never_contributes_to_its_own_label():
    """A lone insider whose only trades are the ones being labelled stays unclassified."""
    trades = _frame([_trade("A", f"{year}-03-10") for year in (2011, 2012, 2013, 2014)])
    labeled = label_trades(trades)
    assert list(labeled["label"]) == ["unclassified"] * 3 + ["routine"]


def test_evaluation_date_never_follows_the_filing_date():
    filings = pd.Series(pd.to_datetime(["2014-01-01", "2014-12-31", "2020-07-15"]))
    for anchor in ("calendar", "rolling"):
        evaluated = evaluation_dates_for(filings, ClassifierConfig(anchor=anchor))
        assert (evaluated <= filings).all()


# --- migration between buckets ----------------------------------------------


def test_insider_migrates_from_routine_to_opportunistic_when_the_pattern_lapses():
    rows = [_trade("A", f"{year}-03-10") for year in (2011, 2012, 2013, 2014)]
    rows += [_trade("A", "2015-08-10"), _trade("A", "2016-09-10"), _trade("A", "2017-10-10")]
    trades = _frame(rows)

    assert _label(trades, "A", "2014-01-01") == "routine"
    assert _label(trades, "A", "2015-01-01") == "routine"
    assert _label(trades, "A", "2016-01-01") == "opportunistic"
    assert _label(trades, "A", "2018-01-01") == "opportunistic"


def test_rolling_anchor_reacts_within_the_year():
    rows = [_trade("A", f"{year}-03-10") for year in (2011, 2012)]
    rows.append(_trade("A", "2013-03-10", filing_date="2013-08-01"))
    trades = _frame(rows)

    assert _label(trades, "A", "2014-01-01", anchor="rolling") == "routine"
    assert _label(trades, "A", "2013-08-01", anchor="rolling") == "unclassified"
    assert _label(trades, "A", "2013-09-01", anchor="rolling") == "routine"


# --- plumbing ---------------------------------------------------------------


def test_month_basis_filing_uses_filing_months_for_the_pattern():
    rows = [_trade("A", f"{year}-02-25", filing_date=f"{year}-03-05") for year in (2011, 2012, 2013)]
    trades = _frame(rows)

    assert _label(trades, "A", "2014-01-01", month_basis="transaction") == "routine"
    assert _label(trades, "A", "2014-01-01", month_basis="filing") == "routine"

    shifted = _frame([
        _trade("A", "2011-02-25", filing_date="2011-03-05"),
        _trade("A", "2012-02-25", filing_date="2012-02-27"),
        _trade("A", "2013-02-25", filing_date="2013-03-05"),
    ])
    assert _label(shifted, "A", "2014-01-01", month_basis="transaction") == "routine"
    assert _label(shifted, "A", "2014-01-01", month_basis="filing") == "opportunistic"


def test_classify_handles_an_empty_table():
    empty = _frame([])
    result = classify(empty, eval_dates=pd.DatetimeIndex([pd.Timestamp("2014-01-01")]))
    assert result.codes.shape == (0, 1)
    assert result.to_frame().empty


def test_label_trades_preserves_row_order_and_index():
    trades = _frame([_trade("A", f"{year}-03-10") for year in (2011, 2012, 2013, 2014)])
    labeled = label_trades(trades.iloc[::-1])
    assert list(labeled.index) == [3, 2, 1, 0]
    assert labeled.loc[3, "label"] == "routine"


def test_panel_rounds_trip_through_the_long_frame():
    trades = _frame([_trade("A", f"{year}-03-10") for year in (2011, 2012, 2013)]
                    + [_trade("B", "2013-05-10")])
    result = classify(trades, eval_dates=pd.date_range("2012-01-01", "2015-01-01", freq="YS"))
    panel = result.to_frame()
    assert set(panel.columns) == {"owner_cik", "eval_date", "label"}
    routine = panel[(panel["owner_cik"] == "A") & (panel["eval_date"] == pd.Timestamp("2014-01-01"))]
    assert routine["label"].iloc[0] == "routine"
    assert not ((panel["owner_cik"] == "B") & (panel["eval_date"] == pd.Timestamp("2013-01-01"))).any()


def test_invalid_config_is_rejected():
    with pytest.raises(ValueError):
        ClassifierConfig(anchor="quarterly")
    with pytest.raises(ValueError):
        ClassifierConfig(lookback_years=0)


@pytest.mark.skipif(
    not (__import__("pathlib").Path(__file__).parents[1]
         / "data" / "processed" / "insider_classification.parquet").exists(),
    reason="requires the classified table; run scripts/03_classify.py first",
)
def test_realized_labels_are_point_in_time():
    """Every labelled trade's evaluation date must precede or equal its filing date."""
    from insider_alpha.config import DATA_PROCESSED

    labels = pd.read_parquet(
        DATA_PROCESSED / "insider_classification.parquet",
        columns=["filing_date", "eval_date", "label"],
    )
    assert (labels["eval_date"] <= labels["filing_date"]).all()
    assert set(labels["label"].unique()) <= {"routine", "opportunistic", "unclassified"}
