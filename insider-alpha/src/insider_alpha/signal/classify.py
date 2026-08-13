"""Routine vs. opportunistic insider classification (SPEC.md section 6).

Following Cohen, Malloy & Pomorski (2012). For insider `k` evaluated at date `t`,
using only trades whose **filing date** is strictly before `t`:

    routine(k, t)       = True   if there is a calendar month m in which k transacted
                                 in each of the 3 consecutive years prior to t
    opportunistic(k, t) = True   if k is classifiable but shows no such month
    unclassified(k, t)          otherwise (insufficient trading history)

Everything here is point-in-time by construction. The unit of observability is the
filing month: a trade enters an insider's history at evaluation date `t` only if it
was filed in a month strictly earlier than the month containing `t`. A trade can
therefore never influence the classification that is applied to itself, and no
future filing can leak backwards.

Judgment calls, each configurable via :class:`ClassifierConfig` so that the
Milestone 6 robustness battery can vary them:

`anchor` — CMP "designate all insiders as either routine or opportunistic traders at
    the beginning of each calendar year", so the default `"calendar"` evaluates every
    insider on 1 January using the three prior calendar years, and a trade inherits
    the label in force on 1 January of its filing year. `"rolling"` instead
    re-evaluates at the start of every month over the trailing 36 months, which uses
    up to eleven months more information but departs from the paper. Either way the
    window is the 12*lookback months immediately preceding the evaluation month, so
    the two differ only in where the evaluation dates sit.

`month_basis` — the *pattern* is a statement about when the insider trades, so the
    calendar month is taken from the transaction date by default. Observability is
    always governed by the filing date, never by this field. Setting `"filing"`
    defines the pattern on filing months instead, which is what a real-time observer
    would see if filing lag were itself considered part of the routine.

`require_trade_every_year` — CMP "require an insider to make at least one trade in
    each of the three preceding years in order to define her as either an
    opportunistic or a routine trader", so a gap year makes an insider unclassified
    rather than opportunistic. This is the single most consequential choice here: it
    is what keeps the sporadic once-every-few-years filer out of the opportunistic
    bucket, where they would otherwise dominate it. Setting this False falls back to
    a weaker "span" rule (first observable filing at least `lookback_years` before
    `t`), which is what a literal reading of "< 3 years of filing history" implies.

`codes` — which transaction codes the *pattern* is measured over. This turned out to
    be the most consequential parameter in the module, so it was settled empirically
    rather than by assertion. The default is both open-market codes, `{"P", "S"}` —
    an insider's full discretionary history, buys and sells, not purchases alone.
    Setting `codes=None` measures the pattern over every code including grants (`A`),
    option exercises (`M`) and tax withholding (`F`).

    Measured on the realized table, over all codes, 83% of classified trades come out
    routine against CMP's 54.8%, because RSU vesting and the tax withholding it
    triggers recur on a fixed monthly or quarterly calendar and mechanically make
    almost every compensated employee "routine". Restricting the pattern to `{P, S}`
    gives 48.7% routine, 59.2% of classified buys routine and 25.4% of all trades
    classified, against CMP's 54.8% / 64.4% / roughly one third — much closer on
    every dimension, and consistent with CMP's source being the Thomson Reuters
    insiders database of open-market transactions. The 10b5-1 validation below points
    the same way (odds ratio 1.88 vs 1.78). It is also the economically defensible
    reading: the classifier is meant to detect predictable timing *chosen by the
    insider*, and a payroll calendar is not a choice. Under the all-codes rule an
    executive with monthly vesting is permanently routine, so every discretionary
    open-market purchase they ever make is discarded — precisely the failure mode
    that would silently kill the headline result.

Known bias, documented rather than corrected: the routine test is existential over
months, so an insider who trades in many months per year is mechanically more likely
to be labelled routine. CMP's definition has the same property. An insider who trades
in all twelve months of three consecutive years is routine by construction, which is
the intended behaviour — that is the Moonburst example in the paper.

Not implemented: CMP's Appendix Table A3 trade-level variant, which labels only the
trades falling in the insider's qualifying month as routine. The insider-level
classification in the body of the paper is the one the headline result uses.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from insider_alpha.parse.form345 import with_columns

log = logging.getLogger(__name__)

UNCLASSIFIED = 0
ROUTINE = 1
OPPORTUNISTIC = 2

LABEL_NAMES = {UNCLASSIFIED: "unclassified", ROUTINE: "routine", OPPORTUNISTIC: "opportunistic"}
LABEL_DTYPE = pd.CategoricalDtype(["routine", "opportunistic", "unclassified"])

_MONTHS_PER_YEAR = 12
_SENTINEL = np.iinfo(np.int16).max

Anchor = Literal["calendar", "rolling"]
MonthBasis = Literal["transaction", "filing"]

# The codes over which an insider exercises genuine timing discretion. Everything
# else on Form 4 is compensation mechanics running on someone else's calendar.
DISCRETIONARY_CODES = frozenset({"P", "S"})


@dataclass(frozen=True)
class ClassifierConfig:
    """Parameters of the routine/opportunistic rule. See the module docstring."""

    lookback_years: int = 3
    anchor: Anchor = "calendar"
    month_basis: MonthBasis = "transaction"
    require_trade_every_year: bool = True
    codes: frozenset[str] | None = DISCRETIONARY_CODES

    def __post_init__(self) -> None:
        if self.lookback_years < 1:
            raise ValueError("lookback_years must be at least 1")
        if self.anchor not in ("calendar", "rolling"):
            raise ValueError(f"unknown anchor: {self.anchor!r}")
        if self.month_basis not in ("transaction", "filing"):
            raise ValueError(f"unknown month_basis: {self.month_basis!r}")

    @property
    def window_months(self) -> int:
        return self.lookback_years * _MONTHS_PER_YEAR

    def describe(self) -> dict[str, object]:
        return {
            "lookback_years": self.lookback_years,
            "anchor": self.anchor,
            "month_basis": self.month_basis,
            "require_trade_every_year": self.require_trade_every_year,
            "codes": sorted(self.codes) if self.codes else "all",
        }


DEFAULT_CONFIG = ClassifierConfig()


@dataclass(frozen=True)
class Classification:
    """A point-in-time (insider x evaluation date) label matrix.

    `codes` holds UNCLASSIFIED / ROUTINE / OPPORTUNISTIC for every insider at every
    evaluation date. Insiders with no observable filing history at a given date are
    UNCLASSIFIED but are also flagged as inactive, so summaries can distinguish
    "not yet in the sample" from "in the sample and not classifiable".
    """

    config: ClassifierConfig
    owners: pd.Index
    eval_dates: pd.DatetimeIndex
    codes: np.ndarray
    active: np.ndarray

    def label_matrix(self) -> pd.DataFrame:
        return pd.DataFrame(self.codes, index=self.owners, columns=self.eval_dates)

    def to_frame(self, *, active_only: bool = True) -> pd.DataFrame:
        """Long (owner_cik, eval_date, label) panel."""
        rows, cols = np.nonzero(self.active) if active_only else np.nonzero(np.ones_like(self.codes))
        return pd.DataFrame(
            {
                "owner_cik": self.owners.to_numpy()[rows],
                "eval_date": self.eval_dates.to_numpy()[cols],
                "label": pd.Categorical.from_codes(
                    _to_categorical_codes(self.codes[rows, cols]), dtype=LABEL_DTYPE
                ),
            }
        )

    def counts(self, *, active_only: bool = True) -> pd.DataFrame:
        """Insider counts per bucket at each evaluation date."""
        mask = self.active if active_only else np.ones_like(self.active)
        out = {}
        for code, name in LABEL_NAMES.items():
            out[name] = ((self.codes == code) & mask).sum(axis=0)
        return pd.DataFrame(out, index=self.eval_dates)


def _to_categorical_codes(codes: np.ndarray) -> np.ndarray:
    """Map internal integer codes onto the LABEL_DTYPE category order."""
    lookup = np.array(
        [LABEL_DTYPE.categories.get_loc(LABEL_NAMES[c]) for c in (UNCLASSIFIED, ROUTINE, OPPORTUNISTIC)],
        dtype=np.int8,
    )
    return lookup[codes]


def _month_index(dates: pd.Series) -> np.ndarray:
    """Months since year 0, so that consecutive calendar months are consecutive ints."""
    return (dates.dt.year.to_numpy(np.int32) * _MONTHS_PER_YEAR
            + dates.dt.month.to_numpy(np.int32) - 1)


def evaluation_dates_for(filing_dates: pd.Series, config: ClassifierConfig = DEFAULT_CONFIG) -> pd.Series:
    """The evaluation date whose label governs a trade filed on each date.

    Under the calendar anchor this is 1 January of the filing year, matching CMP's
    annual designation. Under the rolling anchor it is the first of the filing month.
    In both cases the evaluation date is at or before the filing date, and the
    classification at that date only sees strictly earlier filing months — so a trade
    can never contribute to its own label.
    """
    if config.anchor == "calendar":
        years = filing_dates.dt.year
        return pd.to_datetime(pd.DataFrame({"year": years, "month": 1, "day": 1}))
    return filing_dates.dt.to_period("M").dt.to_timestamp()


def default_eval_dates(trades: pd.DataFrame, config: ClassifierConfig = DEFAULT_CONFIG) -> pd.DatetimeIndex:
    """Every evaluation date implied by the span of the trade table."""
    filing = trades["filing_date"].dropna()
    freq = "YS" if config.anchor == "calendar" else "MS"
    return pd.date_range(
        filing.min().to_period("Y" if config.anchor == "calendar" else "M").to_timestamp(),
        filing.max(),
        freq=freq,
    )


def _observable_history(
    trades: pd.DataFrame, config: ClassifierConfig
) -> tuple[pd.Index, np.ndarray, np.ndarray, np.ndarray]:
    """Collapse the trade table to (insider, calendar month) -> earliest filing month.

    One row per insider-month is all the rule needs: whether the insider transacted
    in that month, and the earliest date at which that fact became public.
    """
    basis = "transaction_date" if config.month_basis == "transaction" else "filing_date"
    frame = trades[list(dict.fromkeys(["owner_cik", "filing_date", basis, "transaction_code"]))]
    if config.codes is not None:
        frame = frame[frame["transaction_code"].isin(config.codes)]
    frame = frame.dropna(subset=["owner_cik", "filing_date", basis])

    if frame.empty:
        return pd.Index([], dtype=object), np.empty(0, np.int64), np.empty(0, np.int32), np.empty(0, np.int32)

    owner_codes, owners = pd.factorize(frame["owner_cik"], sort=True)
    pattern_month = _month_index(frame[basis])
    filing_month = _month_index(frame["filing_date"])
    return owners, owner_codes.astype(np.int64), pattern_month, filing_month


def classify(
    trades: pd.DataFrame,
    *,
    eval_dates: pd.DatetimeIndex | pd.Series | None = None,
    config: ClassifierConfig = DEFAULT_CONFIG,
) -> Classification:
    """Label every insider at every evaluation date.

    The implementation is a dense (insider x calendar month) matrix holding, for each
    month the insider transacted in, the earliest month in which that trade was
    filed. Classification at date `t` is then a slice of the trailing window plus two
    boolean reductions, which keeps the whole 4.5M-row table in a handful of seconds
    instead of the hours a per-insider loop would take.
    """
    if eval_dates is None:
        eval_dates = default_eval_dates(trades, config)
    eval_dates = pd.DatetimeIndex(pd.to_datetime(pd.Index(eval_dates))).unique().sort_values()
    normalized = eval_dates.to_period("M").to_timestamp()
    if not normalized.equals(eval_dates):
        log.warning("evaluation dates normalized to month starts; the rule steps monthly")
        eval_dates = normalized

    owners, owner_codes, pattern_month, filing_month = _observable_history(trades, config)
    eval_month = _month_index(pd.Series(eval_dates))
    span = config.window_months

    if len(owners) == 0:
        empty = np.zeros((0, len(eval_dates)), dtype=np.int8)
        return Classification(config, owners, eval_dates, empty, empty.astype(bool))

    n_owners = len(owners)
    base = int(min(filing_month.min(), eval_month.min() - span))

    # Raw Form 4 filings carry a handful of transaction dates decades outside the
    # filing window (1987, 2047). They can never fall inside a lookback window, and
    # left in they would inflate the activity matrix several-fold.
    in_window = (pattern_month >= eval_month.min() - span) & (pattern_month <= eval_month.max())
    n_months = int(max(pattern_month[in_window].max(initial=base), eval_month.max()) - base + 1)

    # first_filed[i, m] = earliest month in which insider i's activity in calendar
    # month m became public; _SENTINEL where the insider never traded in that month.
    flat_key = owner_codes[in_window] * n_months + (pattern_month[in_window] - base)
    earliest = pd.Series(filing_month[in_window] - base).groupby(flat_key, sort=True).min()
    first_filed = np.full(n_owners * n_months, _SENTINEL, dtype=np.int16)
    first_filed[earliest.index.to_numpy()] = earliest.to_numpy().clip(0, _SENTINEL).astype(np.int16)
    first_filed = first_filed.reshape(n_owners, n_months)

    first_seen = pd.Series(filing_month - base).groupby(owner_codes, sort=True).min()
    first_seen_arr = np.full(n_owners, _SENTINEL, dtype=np.int32)
    first_seen_arr[first_seen.index.to_numpy()] = first_seen.to_numpy()

    codes = np.zeros((n_owners, len(eval_dates)), dtype=np.int8)
    active = np.zeros((n_owners, len(eval_dates)), dtype=bool)

    for j, month in enumerate(eval_month - base):
        window = first_filed[:, month - span : month]
        known = window < month
        by_year = known.reshape(n_owners, config.lookback_years, _MONTHS_PER_YEAR)

        routine = by_year.all(axis=1).any(axis=1)
        if config.require_trade_every_year:
            classified = by_year.any(axis=2).all(axis=1)
        else:
            classified = first_seen_arr <= month - span

        codes[:, j] = np.where(~classified, UNCLASSIFIED, np.where(routine, ROUTINE, OPPORTUNISTIC))
        active[:, j] = first_seen_arr < month

    return Classification(config, owners, eval_dates, codes, active)


def label_trades(
    trades: pd.DataFrame,
    *,
    config: ClassifierConfig = DEFAULT_CONFIG,
    classification: Classification | None = None,
) -> pd.DataFrame:
    """Attach `eval_date` and `label` to every row of the trade table.

    Each trade is labelled with the classification in force at its own evaluation
    date, which only ever consumes filings from strictly earlier months.
    """
    eval_date = evaluation_dates_for(trades["filing_date"], config)
    if classification is None:
        classification = classify(trades, eval_dates=pd.DatetimeIndex(eval_date.dropna().unique()), config=config)

    owner_pos = classification.owners.get_indexer(trades["owner_cik"])
    eval_pos = classification.eval_dates.get_indexer(pd.DatetimeIndex(eval_date))

    codes = np.full(len(trades), UNCLASSIFIED, dtype=np.int8)
    resolvable = (owner_pos >= 0) & (eval_pos >= 0)
    codes[resolvable] = classification.codes[owner_pos[resolvable], eval_pos[resolvable]]

    return with_columns(
        trades,
        eval_date=eval_date,
        label=pd.Series(
            pd.Categorical.from_codes(_to_categorical_codes(codes), dtype=LABEL_DTYPE),
            index=trades.index,
        ),
    )


# --- reporting ---------------------------------------------------------------


def trade_share_by_period(labeled: pd.DataFrame, *, freq: str = "Y") -> pd.DataFrame:
    """Share of trades in each bucket, by filing period."""
    period = labeled["filing_date"].dt.to_period(freq)
    counts = labeled.groupby([period, "label"], observed=False).size().unstack(fill_value=0)
    shares = counts.div(counts.sum(axis=1), axis=0)
    return with_columns(shares, n=counts.sum(axis=1))


def cmp_comparison(labeled: pd.DataFrame, *, sample_start: str | None = None) -> pd.DataFrame:
    """Realized proportions next to the figures CMP report in their Table I.

    CMP classify within the "opportunistic universe" — insiders with at least one
    trade in each of the three preceding years — so the routine/opportunistic split
    is quoted as a share of classified trades, not of all trades. Their classified
    universe is roughly one third of all insider transactions.
    """
    frame = labeled
    if sample_start is not None:
        frame = frame[frame["filing_date"] >= pd.Timestamp(sample_start)]

    classified = frame[frame["label"] != "unclassified"]

    def routine_share(subset: pd.DataFrame) -> float:
        if subset.empty:
            return float("nan")
        return float((subset["label"] == "routine").mean())

    buys = classified[classified["transaction_code"].eq("P")]
    sells = classified[classified["transaction_code"].eq("S")]

    return pd.DataFrame(
        [
            ("classified share of all trades", len(classified) / len(frame), 1 / 3),
            ("routine share of classified trades", routine_share(classified), 0.5481),
            ("routine share of classified buys", routine_share(buys), 0.6444),
            ("routine share of classified sells", routine_share(sells), 0.5202),
        ],
        columns=["metric", "realized", "cmp_reported"],
    )


def validate_against_10b5_1(
    labeled: pd.DataFrame,
    *,
    start: str = "2023-01-01",
    codes: frozenset[str] | None = None,
) -> dict[str, object]:
    """Test the classifier against the Rule 10b5-1 checkbox.

    The checkbox only exists from 2023Q1 (the 2022 amendments' effective date) and is
    fully populated from 2024, so this is a genuine held-out label the classifier
    never sees. A pre-scheduled 10b5-1 plan is close to the literal definition of
    routine trading, so routine-labelled trades should carry the flag at a materially
    higher rate than opportunistic ones.

    The flag is an imperfect ground truth in both directions: plans can be adopted for
    a single trade, and a genuinely calendar-locked trader can trade without a plan.
    Agreement should be read as directional evidence, not as an accuracy score.
    """
    frame = labeled[labeled["filing_date"] >= pd.Timestamp(start)]
    frame = frame[frame["aff_10b5_1"].notna()]
    if codes is not None:
        frame = frame[frame["transaction_code"].isin(codes)]

    unclassified = frame[frame["label"] == "unclassified"]["aff_10b5_1"]
    classified = frame[frame["label"] != "unclassified"]

    result = _agreement(
        (classified["label"] == "routine").to_numpy(),
        classified["aff_10b5_1"].astype(bool).to_numpy(),
    )
    result |= {
        "start": start,
        "codes": sorted(codes) if codes else "all",
        "flag_rate_unclassified": float(unclassified.astype(bool).mean()) if len(unclassified) else float("nan"),
        "n_unclassified": int(len(unclassified)),
    }

    # Trades cluster heavily within insiders — a single routine seller can contribute
    # hundreds of rows — so the trade-level chi-square badly overstates the degrees of
    # freedom. Collapsing to one observation per insider-year is the conservative read.
    per_trade = with_columns(
        classified[["owner_cik", "eval_date"]],
        routine=classified["label"].eq("routine"),
        flagged=classified["aff_10b5_1"].astype(bool),
    )
    by_insider = per_trade.groupby(["owner_cik", "eval_date"], observed=True).agg(
        routine=("routine", "first"), flagged=("flagged", "any")
    )
    result["insider_level"] = _agreement(
        by_insider["routine"].to_numpy(), by_insider["flagged"].to_numpy()
    )
    return result


def _agreement(is_routine: np.ndarray, flag: np.ndarray) -> dict[str, object]:
    """2x2 agreement between the routine label and a binary external flag."""
    from scipy import stats

    a = int((is_routine & flag).sum())
    b = int((is_routine & ~flag).sum())
    c = int((~is_routine & flag).sum())
    d = int((~is_routine & ~flag).sum())

    result: dict[str, object] = {
        "n": a + b + c + d,
        "routine_flagged": a,
        "routine_unflagged": b,
        "opportunistic_flagged": c,
        "opportunistic_unflagged": d,
        "flag_rate_routine": a / (a + b) if a + b else float("nan"),
        "flag_rate_opportunistic": c / (c + d) if c + d else float("nan"),
    }

    if min(a, b, c, d) == 0:
        return result | {"odds_ratio": float("nan"), "chi2": float("nan"), "p_value": float("nan")}

    odds_ratio = (a * d) / (b * c)
    log_se = float(np.sqrt(1 / a + 1 / b + 1 / c + 1 / d))
    chi2, p_value, _, _ = stats.chi2_contingency(np.array([[a, b], [c, d]]), correction=False)

    return result | {
        "odds_ratio": float(odds_ratio),
        "odds_ratio_ci95": (
            float(np.exp(np.log(odds_ratio) - 1.96 * log_se)),
            float(np.exp(np.log(odds_ratio) + 1.96 * log_se)),
        ),
        "chi2": float(chi2),
        "p_value": float(p_value),
        "lift": result["flag_rate_routine"] / result["flag_rate_opportunistic"],
    }
