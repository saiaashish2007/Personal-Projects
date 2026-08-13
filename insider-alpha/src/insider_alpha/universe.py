"""Point-in-time universe construction per SPEC.md Section 3.

At each monthly rebalance date ``t`` a security is in the universe when it is US-listed
common stock, ranks in the top 1500 by market capitalization, closed at or above $5.00,
and traded at least $1,000,000 of 20-day median dollar volume. The exit criterion for
this milestone is that the whole thing is reproducible at any date, which means every
input must be observable at ``t``.

Three places where that is easy to get wrong, and how each is handled:

1. **Shares outstanding.** Taken from XBRL facts filtered on their ``filed`` date, so
   the count used at ``t`` is the one the market could actually read at ``t``. See
   ``ingest/shares.py``.
2. **Prices.** The trailing dollar-volume window and the price screen read the price
   panel strictly at or before ``t``, and market cap uses the split-*unadjusted* close,
   because a point-in-time share count multiplied by a back-adjusted price is off by
   every split that has happened since.
3. **Ticker identity.** A symbol is resolved to the CIK that owned it at ``t``, not to
   whoever owns it today, so a recycled symbol cannot attach one company's prices to
   another company's fundamentals.

Screening is deliberately mechanical rather than index-membership based. Point-in-time
S&P 1500 constituent lists are not freely available, and reconstructing them from
current snapshots would inject precisely the lookahead this design avoids.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from insider_alpha.ingest.reference import (
    SIC_BLANK_CHECK,
    SIC_CLOSED_END_FUND,
    SIC_REIT,
    cik_for_ticker_at,
)
from insider_alpha.ingest.shares import (
    drop_scale_outliers,
    foreign_private_issuers,
    shares_asof,
)
from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

TOP_N_BY_MARKET_CAP = 1500
MIN_PRICE = 5.00
MIN_MEDIAN_DOLLAR_VOLUME = 1_000_000.0
ADV_WINDOW = 20

# A name that has not printed in a month is halted, delisted, or otherwise untradable,
# and carrying its last close forward into a rebalance would put a position on
# something that cannot be bought.
MAX_PRICE_STALENESS_DAYS = 7

# Non-operating vehicles. Closed-end funds and blank-check shells are excluded outright
# by SPEC.md 3; REITs stay in the universe but are flagged so the robustness battery
# can drop them.
_EXCLUDED_SIC = frozenset({SIC_CLOSED_END_FUND, SIC_BLANK_CHECK})

_US_EXCHANGES = ("NYSE", "NASDAQ", "NYSEAMER", "NYSEARCA", "CBOE", "AMEX", "BATS")


def month_start_rebalance_dates(
    trading_days: pd.DatetimeIndex, start: str, end: str
) -> pd.DatetimeIndex:
    """First trading day of each month in the window (SPEC.md 9)."""
    days = pd.DatetimeIndex(sorted(set(trading_days)))
    days = days[(days >= pd.Timestamp(start)) & (days <= pd.Timestamp(end))]
    if days.empty:
        return days
    frame = pd.DataFrame({"date": days})
    first = frame.groupby(frame["date"].dt.to_period("M"))["date"].min()
    return pd.DatetimeIndex(first.to_numpy())


def trading_calendar(prices: pd.DataFrame, *, min_names: int = 100) -> pd.DatetimeIndex:
    """Session dates, taken as the days on which a broad set of names printed.

    Requiring a minimum breadth filters out the stray dates a single OTC symbol
    contributes — a bad date in the panel would otherwise define a phantom session and
    shift every trailing window by one.
    """
    counts = prices.groupby("date")["close"].count()
    return pd.DatetimeIndex(sorted(counts[counts >= min_names].index))


def rolling_liquidity(prices: pd.DataFrame, *, window: int = ADV_WINDOW) -> pd.DataFrame:
    """Trailing median dollar volume per ticker, inclusive of the current day.

    The window is over the ticker's own observed sessions rather than calendar days,
    which is what "20-day median dollar volume" means for a name that was halted for
    part of the window. ``min_periods`` is set to most of the window so a symbol with
    three prints does not qualify on a single busy day.
    """
    frame = prices.sort_values(["ticker", "date"])
    grouped = frame.groupby("ticker", sort=False)["dollar_volume"]
    median = grouped.transform(
        lambda s: s.rolling(window, min_periods=max(2, window // 2)).median()
    )
    return with_columns(frame[["date", "ticker"]], median_dollar_volume=median)


def _snapshots(prices: pd.DataFrame, rebalance_dates: pd.DatetimeIndex) -> pd.DataFrame:
    """The bar each ticker is marked at on every rebalance date, in one pass.

    Each bar is assigned to the next rebalance date on or after it and kept only if it
    falls inside the staleness window, so a monthly grid needs a single vectorized
    sweep of the panel instead of one full scan per date. Because rebalances are a
    month apart and the staleness window is a week, no bar can serve two dates.
    """
    slots = pd.DatetimeIndex(rebalance_dates)
    position = slots.searchsorted(prices["date"].to_numpy(), side="left")
    in_range = position < len(slots)

    assigned = pd.Series(pd.NaT, index=prices.index, dtype="datetime64[ns]")
    assigned.iloc[in_range.nonzero()[0]] = slots[position[in_range]]

    age = (assigned - prices["date"]).dt.days
    frame = with_columns(prices, rebalance_date=assigned)
    frame = frame[age.between(0, MAX_PRICE_STALENESS_DAYS)]
    return frame.sort_values("date").groupby(["rebalance_date", "ticker"], sort=False).tail(1)


def _security_type_flags(reference: pd.DataFrame) -> pd.DataFrame:
    sic = pd.to_numeric(reference["sic"], errors="coerce")
    exchanges = reference["exchanges"].fillna("").str.upper()
    entity = reference["entity_type"].fillna("").str.lower()
    return pd.DataFrame(
        {
            "cik": reference["cik"],
            "sic": sic,
            "sic_division": reference["sic_division"],
            "is_reit": sic.eq(SIC_REIT),
            "is_excluded_type": sic.isin(_EXCLUDED_SIC) | entity.str.contains("investment"),
            "is_us_listed": exchanges.str.contains("|".join(_US_EXCHANGES), regex=True),
        }
    )


# Insiders and other affiliates hold the shares that public float leaves out. A
# founder-controlled company can easily be several times its float; nothing legitimate
# is fifty times it, and a market cap that far above the company's own reported float
# means the price or the share count is wrong.
MAX_CAP_TO_FLOAT = 50.0


def _plausible_against_float(
    snapshot: pd.DataFrame, public_float: pd.DataFrame | None
) -> pd.Series:
    """Reject market caps that dwarf the issuer's own reported public float.

    This is the backstop for names the Form 4 price check cannot reach. Cenntro
    Electric has been through enough reverse splits that the vendor's split history no
    longer reconstructs its traded price, which values it at $253 billion against a
    reported float under $100 million, and no insider bought enough stock to contradict
    it. Issuers with no float on file are left alone rather than assumed guilty.
    """
    if public_float is None or public_float.empty:
        return pd.Series(True, index=snapshot.index)

    # Float is read as of the rebalance date like every other input: the check exists to
    # protect a point-in-time universe and must not smuggle a later filing into it.
    as_facts = public_float.rename(columns={"public_float": "shares_outstanding"})
    resolved = shares_asof(
        with_columns(as_facts, priority=0),
        pd.DataFrame(
            {"cik": snapshot["cik"], "date": snapshot["rebalance_date"]}, index=snapshot.index
        ),
    )
    bound = resolved["shares_outstanding"] * MAX_CAP_TO_FLOAT
    return snapshot["market_cap"].le(bound) | bound.isna()


def build_universe(
    prices: pd.DataFrame,
    pit_map: pd.DataFrame,
    share_facts: pd.DataFrame,
    reference: pd.DataFrame,
    *,
    start: str,
    end: str,
    top_n: int = TOP_N_BY_MARKET_CAP,
    min_price: float = MIN_PRICE,
    min_dollar_volume: float = MIN_MEDIAN_DOLLAR_VOLUME,
    require_us_listing: bool = True,
    calendar: pd.DatetimeIndex | None = None,
    unreliable: set[str] | None = None,
    public_float: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Universe membership at every monthly rebalance date in the window.

    One row per (rebalance_date, ticker) that passes all screens, carrying the values
    the screens were evaluated on so any date can be audited after the fact.
    """
    calendar = calendar if calendar is not None else trading_calendar(prices)
    if len(calendar) == 0:
        return pd.DataFrame()
    rebalance_dates = month_start_rebalance_dates(calendar, start, end)
    log.info(
        "universe: %d rebalance dates, %s to %s",
        len(rebalance_dates), rebalance_dates.min().date(), rebalance_dates.max().date(),
    )

    share_facts = drop_scale_outliers(share_facts)
    unreliable = unreliable or set()
    if unreliable:
        log.info("universe: excluding %d tickers failing the Form 4 price check", len(unreliable))
    adrs = foreign_private_issuers(share_facts)
    log.info("universe: excluding %d foreign private issuers (ADRs)", len(adrs))

    liquidity = rolling_liquidity(prices)
    panel = prices.merge(liquidity, on=["date", "ticker"], how="left")
    flags = _security_type_flags(reference).drop_duplicates("cik")

    snapshot = _snapshots(panel, rebalance_dates).reset_index(drop=True)
    if snapshot.empty:
        return pd.DataFrame()

    cik = cik_for_ticker_at(
        pit_map,
        pd.DataFrame({"ticker": snapshot["ticker"], "date": snapshot["rebalance_date"]}),
    )
    snapshot = with_columns(snapshot, cik=cik).dropna(subset=["cik"])

    # A symbol resolving to two CIKs on one date means the collision logic left an
    # overlap; drop rather than guess, and let the count surface in the logs.
    ambiguous = snapshot.duplicated(["rebalance_date", "ticker"], keep=False)
    if ambiguous.any():
        log.info("dropping %d ambiguous symbol-dates", int(ambiguous.sum()))
        snapshot = snapshot[~ambiguous]

    snapshot = snapshot.merge(flags, on="cik", how="left").reset_index(drop=True)
    shares = shares_asof(
        share_facts, pd.DataFrame({"cik": snapshot["cik"], "date": snapshot["rebalance_date"]})
    )
    snapshot = pd.concat([snapshot, shares.reset_index(drop=True)], axis=1)
    snapshot = with_columns(
        snapshot, market_cap=snapshot["close_raw"] * snapshot["shares_outstanding"]
    )

    eligible = snapshot[
        snapshot["close_raw"].ge(min_price)
        & snapshot["median_dollar_volume"].ge(min_dollar_volume)
        & snapshot["market_cap"].gt(0)
        & ~snapshot["is_excluded_type"].fillna(False)
        & ~snapshot["cik"].isin(adrs)
        & ~snapshot["ticker"].isin(unreliable)
        & _plausible_against_float(snapshot, public_float)
    ]
    if require_us_listing:
        eligible = eligible[eligible["is_us_listed"].fillna(False)]
    if eligible.empty:
        return pd.DataFrame()

    ordered = eligible.sort_values(["rebalance_date", "market_cap"], ascending=[True, False])
    rank = ordered.groupby("rebalance_date", sort=False).cumcount() + 1
    universe = with_columns(ordered, market_cap_rank=rank)
    universe = universe[universe["market_cap_rank"] <= top_n].reset_index(drop=True)
    keep = [
        "rebalance_date", "ticker", "cik", "date", "close_raw", "close", "adj_close",
        "median_dollar_volume", "shares_outstanding", "shares_filed", "shares_as_of",
        "shares_age_days", "market_cap", "market_cap_rank", "sic", "sic_division", "is_reit",
    ]
    universe = universe[keep].rename(columns={"date": "price_date"})
    log.info(
        "universe: %d rows, median %d names per rebalance",
        len(universe),
        int(universe.groupby("rebalance_date").size().median()),
    )
    return universe.sort_values(["rebalance_date", "market_cap_rank"]).reset_index(drop=True)


def universe_summary(universe: pd.DataFrame) -> pd.DataFrame:
    """Per-rebalance diagnostics: breadth, size distribution, and data staleness."""
    grouped = universe.groupby("rebalance_date")
    return pd.DataFrame(
        {
            "n_names": grouped.size(),
            "median_market_cap": grouped["market_cap"].median(),
            "min_market_cap": grouped["market_cap"].min(),
            "median_dollar_volume": grouped["median_dollar_volume"].median(),
            "median_shares_age_days": grouped["shares_age_days"].median(),
            "pct_reit": grouped["is_reit"].mean(),
        }
    ).reset_index()
