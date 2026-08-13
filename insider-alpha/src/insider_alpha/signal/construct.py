"""Firm-level insider-purchase signal at each rebalance date (SPEC.md section 7).

The economic object is a score ``S_i,t`` that is large when opportunistic insiders
have been buying firm ``i`` in the window ending at ``t``, and zero when they have
not. Two properties are load-bearing:

**No lookahead.** A purchase enters ``S_i,t`` only if its **filing date** falls in
``(t − W, t]``. The transaction date is never consulted. A Form 4 filed the day
after the rebalance cannot affect that rebalance's score, even if the insider
traded weeks earlier.

**Absence is zero, not missing.** Firms with no qualifying purchases in the window
receive ``S = 0``. Dropping them would turn the cross-section into an event study
and make every downstream IC look more like a jump at announcement than a
tradable signal.

Trade-level score (SPEC 7.1):

    size_j        = ln(1 + value_j / ADV20_i,t)
    conviction_j  = shares_j / sharesOwnedAfter_j     clipped to [0, 1]
    role_j        = 1.00 CEO/CFO/Chair/President
                    0.60 other officer
                    0.40 director
                    0.25 10% owner / other

    contribution  = role_j · size_j · (1 + conviction_j)

Firm-level (SPEC 7.2), summing over qualifying purchases in the window, with
cluster amplification on the number of distinct insiders ``n``:

    S_raw = (Σ contribution) · (1 + λ ln n)          λ = 0.5

ADV20 is the universe's 20-day median dollar volume at ``t``. SPEC writes
"average"; the universe screen is a median, and the signal reuses that so the
score and the tradability screen are the same quantity. Using liquidity at ``t``
(not at the trade date) keeps every input observable at the rebalance.

Cross-section (SPEC 7.3), independently at each ``t``: winsorize 1/99, z-score,
subtract the SIC-division mean, z-score again. Sector neutralization is what
stops the signal from becoming an energy-and-financials timing bet after
drawdowns.

Two arms are produced from one pipeline. ``opportunistic`` keeps only trades the
classifier labelled opportunistic; ``all_insiders`` is identical with that filter
removed. The comparison is the result — computing one arm would leave nothing to
say about whether the CMP split still earns its keep.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import numpy as np
import pandas as pd

from insider_alpha.config import CODE_OPEN_MARKET_BUY
from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

_C_SUITE_CEO = re.compile(r"\bCEO\b|CHIEF EXECUTIVE")
_C_SUITE_CFO = re.compile(r"\bCFO\b|CHIEF FINANCIAL")
_C_SUITE_CHAIR = re.compile(r"\bCHAIR(?:MAN|WOMAN|PERSON)?\b")
_C_SUITE_PRESIDENT = re.compile(r"\bPRESIDENT\b")
_VICE_CHAIR = re.compile(r"VICE\s+CHAIR")
_VICE_PRESIDENT = re.compile(r"VICE\s+PRESIDENT")


@dataclass(frozen=True)
class SignalConfig:
    """Parameters of the firm-level score. Defaults are SPEC.md section 7."""

    window_days: int = 90
    cluster_lambda: float = 0.5
    winsor_lower: float = 0.01
    winsor_upper: float = 0.99
    role_csuite: float = 1.00
    role_officer: float = 0.60
    role_director: float = 0.40
    role_ten_pct: float = 0.25
    role_other: float = 0.25

    def __post_init__(self) -> None:
        if self.window_days < 1:
            raise ValueError("window_days must be at least 1")
        if self.cluster_lambda < 0:
            raise ValueError("cluster_lambda must be non-negative")
        if not 0.0 <= self.winsor_lower < self.winsor_upper <= 1.0:
            raise ValueError("winsor bounds must satisfy 0 <= lower < upper <= 1")

    def describe(self) -> dict[str, object]:
        return {
            "window_days": self.window_days,
            "cluster_lambda": self.cluster_lambda,
            "winsor_lower": self.winsor_lower,
            "winsor_upper": self.winsor_upper,
            "role_weights": {
                "csuite": self.role_csuite,
                "officer": self.role_officer,
                "director": self.role_director,
                "ten_pct": self.role_ten_pct,
                "other": self.role_other,
            },
        }


DEFAULT_CONFIG = SignalConfig()

ARM_OPPORTUNISTIC = "opportunistic"
ARM_ALL_INSIDERS = "all_insiders"


def is_csuite_title(title: str) -> bool:
    """CEO / CFO / Chairman / President, excluding vice- prefixes.

    Vice President and Vice Chair are other named officers (weight 0.60), not
    the 1.00 bucket. A title that is both ("Vice President and CEO") still
    matches on CEO.
    """
    text = title.upper()
    if _C_SUITE_CEO.search(text) or _C_SUITE_CFO.search(text):
        return True
    if _C_SUITE_CHAIR.search(text) and not _VICE_CHAIR.search(text):
        return True
    if _C_SUITE_PRESIDENT.search(text) and not _VICE_PRESIDENT.search(text):
        return True
    return False


def role_weights(frame: pd.DataFrame, config: SignalConfig = DEFAULT_CONFIG) -> pd.Series:
    """Highest applicable role weight for each row (SPEC 7.1).

    Priority is C-suite title, then officer flag, then director, then 10% owner.
    An officer-director with no C-suite title is an officer (0.60), not a
    director (0.40): the officer role is the more informed one.
    """
    titles = frame["owner_title"].fillna("").astype(str).str.upper()
    csuite = (
        titles.str.contains(_C_SUITE_CEO.pattern, regex=True)
        | titles.str.contains(_C_SUITE_CFO.pattern, regex=True)
        | (
            titles.str.contains(_C_SUITE_CHAIR.pattern, regex=True)
            & ~titles.str.contains(_VICE_CHAIR.pattern, regex=True)
        )
        | (
            titles.str.contains(_C_SUITE_PRESIDENT.pattern, regex=True)
            & ~titles.str.contains(_VICE_PRESIDENT.pattern, regex=True)
        )
    )
    officer = frame["is_officer"].fillna(False).astype(bool)
    director = frame["is_director"].fillna(False).astype(bool)
    ten_pct = frame["is_ten_pct_owner"].fillna(False).astype(bool)

    weights = np.full(len(frame), config.role_other, dtype="float64")
    weights = np.where(ten_pct, config.role_ten_pct, weights)
    weights = np.where(director, config.role_director, weights)
    weights = np.where(officer, config.role_officer, weights)
    weights = np.where(csuite.to_numpy(), config.role_csuite, weights)
    return pd.Series(weights, index=frame.index, name="role_weight")


def conviction(shares: pd.Series, shares_owned_after: pd.Series) -> pd.Series:
    """Fraction of the post-trade position that is new, clipped to [0, 1].

    Missing or non-positive ``sharesOwnedAfter`` is treated as no conviction
    boost rather than infinity: those rows are data errors, not 100% new
    positions, and leaving them as inf would dominate the firm score.
    """
    owned = pd.to_numeric(shares_owned_after, errors="coerce")
    bought = pd.to_numeric(shares, errors="coerce")
    ratio = bought / owned
    return ratio.where(owned.gt(0) & bought.gt(0), 0.0).clip(lower=0.0, upper=1.0).fillna(0.0)


def qualifying_purchases(trades: pd.DataFrame) -> pd.DataFrame:
    """Open-market purchases with a usable price and share count.

    Code ``P`` is the entire signal. Purchases filed without a price are dropped
    rather than imputed (SPEC 5.2). A zero price is treated as missing.
    """
    price = pd.to_numeric(trades["price_per_share"], errors="coerce")
    shares = pd.to_numeric(trades["shares"], errors="coerce")
    keep = trades["transaction_code"].eq(CODE_OPEN_MARKET_BUY) & price.gt(0) & shares.gt(0)
    return trades.loc[keep].copy()


def map_filings_to_rebalances(
    filing_dates: pd.Series,
    rebalance_dates: pd.DatetimeIndex,
    window_days: int,
) -> pd.DataFrame:
    """Pairs of (trade iloc, rebalance date) with filing date in ``(t − W, t]``.

    Equivalent to ``t ∈ [filing_date, filing_date + W)``. The left edge of the
    window is open, so a filing exactly ``W`` calendar days before ``t`` does
    not enter ``S_t``.
    """
    grid = pd.DatetimeIndex(rebalance_dates).sort_values()
    if grid.empty or filing_dates.empty:
        return pd.DataFrame(columns=["trade_iloc", "rebalance_date"])

    filing = pd.to_datetime(filing_dates).to_numpy(dtype="datetime64[ns]")
    dates = grid.to_numpy(dtype="datetime64[ns]")
    lo = np.searchsorted(dates, filing, side="left")
    hi = np.searchsorted(dates, filing + np.timedelta64(int(window_days), "D"), side="left")
    lengths = (hi - lo).astype(np.int64)

    if lengths.size == 0 or int(lengths.sum()) == 0:
        return pd.DataFrame(columns=["trade_iloc", "rebalance_date"])

    idx = np.flatnonzero(lengths > 0)
    lengths = lengths[idx]
    lo = lo[idx]
    total = int(lengths.sum())
    trade_iloc = np.repeat(idx, lengths)
    starts = np.repeat(lo, lengths)
    offsets = np.arange(total, dtype=np.int64) - np.repeat(
        np.concatenate(([0], np.cumsum(lengths[:-1]))), lengths
    )
    return pd.DataFrame(
        {
            "trade_iloc": trade_iloc,
            "rebalance_date": grid.to_numpy()[starts + offsets],
        }
    )


def winsorize_by_date(
    values: pd.Series,
    dates: pd.Series,
    *,
    lower: float = 0.01,
    upper: float = 0.99,
) -> pd.Series:
    """Clip each date's cross-section at the given quantiles."""
    frame = pd.DataFrame({"v": values.to_numpy(), "d": dates.to_numpy()}, index=values.index)
    return frame.groupby("d", sort=False)["v"].transform(
        lambda s: s.clip(s.quantile(lower), s.quantile(upper))
    )


def zscore_by_date(values: pd.Series, dates: pd.Series) -> pd.Series:
    """Demean and scale within date. A degenerate cross-section becomes all zeros."""
    frame = pd.DataFrame({"v": values.to_numpy(), "d": dates.to_numpy()}, index=values.index)
    grouped = frame.groupby("d", sort=False)["v"]
    mu = grouped.transform("mean")
    sd = grouped.transform("std")
    out = (frame["v"] - mu) / sd.replace(0.0, np.nan)
    return out.fillna(0.0)


def neutralize_by_sector(
    values: pd.Series,
    dates: pd.Series,
    sectors: pd.Series,
) -> pd.Series:
    """Subtract the SIC-division mean within date.

    Missing sectors are grouped together as ``Unknown`` rather than left
    unadjusted, so they cannot become a stealth residual sector bet.
    """
    sector = sectors.fillna("Unknown").astype(str)
    frame = pd.DataFrame(
        {"v": values.to_numpy(), "d": dates.to_numpy(), "s": sector.to_numpy()},
        index=values.index,
    )
    mu = frame.groupby(["d", "s"], sort=False)["v"].transform("mean")
    return frame["v"] - mu


def standardize_cross_section(
    values: pd.Series,
    dates: pd.Series,
    sectors: pd.Series,
    *,
    lower: float = 0.01,
    upper: float = 0.99,
) -> pd.Series:
    """Winsorize, z-score, sector-neutralize, re-standardize (SPEC 7.3)."""
    winsorized = winsorize_by_date(values, dates, lower=lower, upper=upper)
    zscored = zscore_by_date(winsorized, dates)
    neutralized = neutralize_by_sector(zscored, dates, sectors)
    return zscore_by_date(neutralized, dates)


def _firm_adv(universe: pd.DataFrame) -> pd.DataFrame:
    """One liquidity and sector row per (rebalance, issuer).

    A CIK can map to several tickers on one date (dual-class shares, or an ETF
    family sharing an issuer CIK). The signal is firm-level, so those names
    share one ADV — the most liquid listing — and one SIC division.
    """
    return (
        universe.sort_values("median_dollar_volume", ascending=False)
        .groupby(["rebalance_date", "cik"], sort=False, as_index=False)
        .agg(
            median_dollar_volume=("median_dollar_volume", "first"),
            sic_division=("sic_division", "first"),
        )
    )


def _aggregate_arm(
    scored: pd.DataFrame,
    *,
    cluster_lambda: float,
) -> pd.DataFrame:
    """Sum trade contributions to a firm-date and apply cluster amplification."""
    if scored.empty:
        return pd.DataFrame(
            columns=["rebalance_date", "cik", "raw", "n_trades", "n_insiders"]
        )
    grouped = scored.groupby(["rebalance_date", "cik"], sort=False)
    raw = grouped["contribution"].sum()
    n_trades = grouped.size()
    n_insiders = grouped["owner_cik"].nunique()
    n = n_insiders.clip(lower=1)
    amplified = raw * (1.0 + cluster_lambda * np.log(n))
    out = pd.DataFrame(
        {
            "rebalance_date": raw.index.get_level_values(0),
            "cik": raw.index.get_level_values(1),
            "raw": amplified.to_numpy(),
            "n_trades": n_trades.to_numpy(),
            "n_insiders": n_insiders.to_numpy(),
        }
    )
    return out.reset_index(drop=True)


def _attach_arm(
    universe: pd.DataFrame,
    aggregated: pd.DataFrame,
    *,
    prefix: str,
) -> pd.DataFrame:
    """Left-join a firm-level score onto the universe, filling non-events with 0."""
    merged = universe.merge(aggregated, on=["rebalance_date", "cik"], how="left")
    # merge may reset the index; re-align to `universe` so with_columns cannot
    # silently insert NaNs through an index mismatch.
    raw = pd.Series(
        pd.to_numeric(merged["raw"], errors="coerce").fillna(0.0).to_numpy(),
        index=universe.index,
    )
    n_trades = pd.Series(
        pd.to_numeric(merged["n_trades"], errors="coerce").fillna(0).to_numpy(dtype=np.int64),
        index=universe.index,
    )
    n_insiders = pd.Series(
        pd.to_numeric(merged["n_insiders"], errors="coerce").fillna(0).to_numpy(dtype=np.int64),
        index=universe.index,
    )
    return with_columns(
        universe,
        **{
            f"raw_{prefix}": raw,
            f"n_trades_{prefix}": n_trades,
            f"n_insiders_{prefix}": n_insiders,
        },
    )


def build_signal(
    trades: pd.DataFrame,
    universe: pd.DataFrame,
    *,
    config: SignalConfig = DEFAULT_CONFIG,
) -> pd.DataFrame:
    """Firm-level opportunistic and all-insider scores at every universe row.

    ``trades`` must carry a ``label`` column when the opportunistic arm is to
    be filtered; rows without ``opportunistic`` are kept only in ``all_insiders``.
    """
    if universe.empty:
        return universe.copy()

    universe = universe.reset_index(drop=True)
    purchases = qualifying_purchases(trades).reset_index(drop=True)
    rebalance_dates = pd.DatetimeIndex(universe["rebalance_date"].unique()).sort_values()
    log.info(
        "signal: %s qualifying purchases, %d rebalance dates, W=%d",
        f"{len(purchases):,}",
        len(rebalance_dates),
        config.window_days,
    )

    empty_agg = pd.DataFrame(columns=["rebalance_date", "cik", "raw", "n_trades", "n_insiders"])
    if purchases.empty:
        out = _attach_arm(universe, empty_agg, prefix=ARM_OPPORTUNISTIC)
        out = _attach_arm(out, empty_agg, prefix=ARM_ALL_INSIDERS)
        return _standardize_arms(out, config)

    weights = role_weights(purchases, config)
    conv = conviction(purchases["shares"], purchases["shares_owned_after"])
    value = pd.to_numeric(purchases["dollar_value"], errors="coerce")
    value = value.where(value.gt(0), purchases["shares"] * purchases["price_per_share"])
    purchases = with_columns(
        purchases,
        role_weight=weights,
        conviction=conv,
        trade_value=value.fillna(0.0),
    )

    pairs = map_filings_to_rebalances(
        purchases["filing_date"], rebalance_dates, config.window_days
    )
    if pairs.empty:
        out = _attach_arm(universe, empty_agg, prefix=ARM_OPPORTUNISTIC)
        out = _attach_arm(out, empty_agg, prefix=ARM_ALL_INSIDERS)
        return _standardize_arms(out, config)

    scored = purchases.iloc[pairs["trade_iloc"].to_numpy()].reset_index(drop=True)
    scored = with_columns(scored, rebalance_date=pairs["rebalance_date"].reset_index(drop=True))

    adv = _firm_adv(universe)
    scored = scored.merge(
        adv,
        left_on=["rebalance_date", "issuer_cik"],
        right_on=["rebalance_date", "cik"],
        how="inner",
        suffixes=("", "_universe"),
    )
    # After the merge the issuer is ``cik`` (universe) and ``issuer_cik`` (trade);
    # keep ``cik`` as the firm key. A trade for an issuer not in the universe at
    # ``t`` is dropped — it cannot be held, so it cannot contribute to S_t.
    if "cik_universe" in scored.columns:
        scored = scored.drop(columns=["cik_universe"])

    adv20 = scored["median_dollar_volume"].replace(0.0, np.nan)
    size = np.log1p(scored["trade_value"] / adv20)
    size = size.fillna(0.0)
    contribution = scored["role_weight"] * size * (1.0 + scored["conviction"])
    scored = with_columns(scored, size=size, contribution=contribution)
    scored = scored[scored["contribution"].notna() & np.isfinite(scored["contribution"])]

    if "label" in scored.columns:
        opportunistic = scored[scored["label"].astype(str).eq(ARM_OPPORTUNISTIC)]
    else:
        log.warning("no label column; opportunistic arm will equal all_insiders")
        opportunistic = scored

    opp_agg = _aggregate_arm(opportunistic, cluster_lambda=config.cluster_lambda)
    all_agg = _aggregate_arm(scored, cluster_lambda=config.cluster_lambda)
    log.info(
        "signal: opportunistic firm-dates %s, all-insider firm-dates %s",
        f"{len(opp_agg):,}",
        f"{len(all_agg):,}",
    )

    out = _attach_arm(universe, opp_agg, prefix=ARM_OPPORTUNISTIC)
    out = _attach_arm(out, all_agg, prefix=ARM_ALL_INSIDERS)
    return _standardize_arms(out, config)


def _standardize_arms(frame: pd.DataFrame, config: SignalConfig) -> pd.DataFrame:
    dates = frame["rebalance_date"]
    sectors = frame["sic_division"]
    s_opp = standardize_cross_section(
        frame[f"raw_{ARM_OPPORTUNISTIC}"],
        dates,
        sectors,
        lower=config.winsor_lower,
        upper=config.winsor_upper,
    )
    s_all = standardize_cross_section(
        frame[f"raw_{ARM_ALL_INSIDERS}"],
        dates,
        sectors,
        lower=config.winsor_lower,
        upper=config.winsor_upper,
    )
    out = with_columns(
        frame,
        **{
            f"s_{ARM_OPPORTUNISTIC}": s_opp,
            f"s_{ARM_ALL_INSIDERS}": s_all,
        },
    )
    keep = [
        "rebalance_date",
        "ticker",
        "cik",
        "sic_division",
        f"raw_{ARM_OPPORTUNISTIC}",
        f"n_trades_{ARM_OPPORTUNISTIC}",
        f"n_insiders_{ARM_OPPORTUNISTIC}",
        f"s_{ARM_OPPORTUNISTIC}",
        f"raw_{ARM_ALL_INSIDERS}",
        f"n_trades_{ARM_ALL_INSIDERS}",
        f"n_insiders_{ARM_ALL_INSIDERS}",
        f"s_{ARM_ALL_INSIDERS}",
    ]
    available = [c for c in keep if c in out.columns]
    log.info(
        "signal: %s rows, median opportunistic coverage %.1f%%",
        f"{len(out):,}",
        100 * out[f"raw_{ARM_OPPORTUNISTIC}"].gt(0).groupby(out["rebalance_date"]).mean().median(),
    )
    return out[available].reset_index(drop=True)


def event_coverage(signal: pd.DataFrame, column: str = f"raw_{ARM_OPPORTUNISTIC}") -> pd.DataFrame:
    """Per-rebalance count and share of universe names with a nonzero raw score."""
    grouped = signal.groupby("rebalance_date", sort=True)
    n_names = grouped.size()
    n_event = grouped[column].apply(lambda s: int(s.gt(0).sum()))
    return pd.DataFrame(
        {
            "rebalance_date": n_names.index,
            "n_names": n_names.to_numpy(),
            "n_event": n_event.to_numpy(),
            "event_share": (n_event / n_names).to_numpy(),
        }
    ).reset_index(drop=True)
