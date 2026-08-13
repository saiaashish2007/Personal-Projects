"""Long-book construction, caps, overlapping holdings (SPEC.md section 9).

The economic object is a fully invested long book of names in the top signal
quintile among those with a *nonzero* raw score, plus one of two hedges.

Two properties are load-bearing:

**No lookahead.** Target weights at rebalance ``t`` are a function of the
cross-section observed at ``t`` only — the score, the sector, the market cap.
Nothing about ``t+1`` (returns, future scores, future membership) may move a
weight at ``t``.

**Sparsity is not papered over.** The opportunistic arm has a median 46 names
with a nonzero score. The top quintile is then ~9 names, which cannot satisfy
a 3% per-name cap and a 25% per-sector cap *and* full investment at once.
Caps are applied when they are feasible; when they are not, they relax to the
minimum that still fills the book. That is a spec tension, not a free
parameter, and it is recorded rather than quietly dropped.

Overlapping portfolios follow Jegadeesh-Titman: the combined book at month
``t`` is the equal-weight average of the ``K`` vintages formed at
``t, t-1, …, t-K+1``. A vintage that does not contain a name contributes
zero, which is what makes holdings actually overlap.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from insider_alpha.analysis.ic import N_QUANTILES
from insider_alpha.utils import with_columns

NAME_CAP = 0.03
SECTOR_CAP = 0.25

# SIC division → the SPDR sector ETF you would actually short. Hedge *returns*
# in this pipeline are cap-weighted universe portfolios in the same SIC
# division (the price panel does not carry the XL* products); the map is the
# implementation recipe, not a second return source.
SIC_TO_SPDR: dict[str, str] = {
    "Agriculture, Forestry, Fishing": "XLB",
    "Mining": "XLE",
    "Construction": "XLI",
    "Manufacturing": "XLI",
    "Transportation & Utilities": "XLU",
    "Wholesale Trade": "XLY",
    "Retail Trade": "XLY",
    "Finance, Insurance, Real Estate": "XLF",
    "Services": "XLK",
    "Public Administration": "SPY",
    "Unknown": "SPY",
}

HEDGE_ETF = "beta_sector_matched_etf"
HEDGE_SPREAD = "quintile_spread"


def _active_quintiles(scores: pd.Series, dates: pd.Series) -> pd.Series:
    """Quintiles on an already-filtered active set.

    ``assign_quintiles`` in the IC module is built for a 1,500-name universe
    and uses ``floor((rank-1)·5/n)+1``, which never emits bucket 5 when
    ``n < 5``. The opportunistic arm has months with three active names; those
    months would otherwise have an empty long book. ``ceil(rank·5/n)`` always
    puts the highest-ranked name in Q5 as long as the active set is nonempty.
    """
    frame = pd.DataFrame({"v": scores.to_numpy(), "d": dates.to_numpy()}, index=scores.index)
    n = frame.groupby("d", sort=False)["v"].transform("size").to_numpy(dtype="float64")
    rank = frame.groupby("d", sort=False)["v"].rank(method="first").to_numpy()
    n = np.maximum(n, 1.0)
    q = np.ceil(rank * N_QUANTILES / n).astype(np.int64)
    return pd.Series(np.clip(q, 1, N_QUANTILES), index=scores.index)


def quintile_legs(
    frame: pd.DataFrame,
    score_col: str,
    raw_col: str,
) -> pd.DataFrame:
    """Top and bottom quintiles among names with a strictly positive raw score.

    Quintiles are *not* taken over the full universe. Most names have ``S_raw
    = 0``; ranking those would put almost every name in the middle buckets and
    leave the long book empty. Ties in the active subset are broken by row
    order so five buckets exist even when the active set is tiny.
    """
    if frame.empty:
        return with_columns(
            frame,
            quantile=pd.Series(dtype="int64", index=frame.index),
            active=pd.Series(dtype="bool", index=frame.index),
        )

    raw = pd.to_numeric(frame[raw_col], errors="coerce").fillna(0.0)
    active = raw.gt(0.0)
    q = np.zeros(len(frame), dtype=np.int64)
    active_arr = active.to_numpy()
    if active_arr.any():
        assigned = _active_quintiles(
            pd.Series(frame[score_col].to_numpy()[active_arr], index=frame.index[active_arr]),
            pd.Series(frame["rebalance_date"].to_numpy()[active_arr], index=frame.index[active_arr]),
        )
        q[active_arr] = assigned.to_numpy()
    return with_columns(
        frame,
        quantile=pd.Series(q, index=frame.index),
        active=active,
    )


def _feasible_caps(n_names: int, sector_counts: np.ndarray) -> tuple[float, float]:
    """Relax SPEC caps just enough that a fully invested book still exists.

    A 3% name cap needs 34 names; a 25% sector cap needs the long book to
    span at least four sectors. Neither is true of the opportunistic arm in
    a typical month. Full investment is the constraint that stays; the caps
    become ``max(spec, minimum feasible)``.
    """
    n = max(int(n_names), 1)
    name_cap = max(NAME_CAP, 1.0 / n)
    # Largest sector must absorb whatever the other names cannot take at the
    # name cap: min weight of sector s = max(0, 1 - name_cap * n_outside_s).
    min_sector = 0.0
    for count in sector_counts:
        min_sector = max(min_sector, 1.0 - name_cap * (n - int(count)))
    sector_cap = max(SECTOR_CAP, min_sector, 1.0 / max(len(sector_counts), 1))
    sector_cap = min(sector_cap, 1.0)
    return float(name_cap), float(sector_cap)


def _apply_caps(
    weights: np.ndarray,
    sectors: np.ndarray,
    *,
    name_cap: float,
    sector_cap: float,
    n_iter: int = 40,
) -> np.ndarray:
    """Iteratively clip per-name and per-sector, renormalizing to 1."""
    w = np.asarray(weights, dtype="float64").copy()
    n = w.size
    if n == 0:
        return w
    total = float(w.sum())
    if total <= 0.0 or not np.isfinite(total):
        w = np.full(n, 1.0 / n)
    else:
        w = w / total

    unique, inv = np.unique(sectors.astype(str), return_inverse=True)
    counts = np.bincount(inv, minlength=unique.size)
    name_cap_eff, sector_cap_eff = _feasible_caps(n, counts)
    name_cap_eff = max(name_cap, name_cap_eff)
    sector_cap_eff = max(sector_cap, sector_cap_eff)

    for _ in range(n_iter):
        w = np.minimum(w, name_cap_eff)
        s = float(w.sum())
        if s <= 0.0:
            w = np.full(n, 1.0 / n)
            break
        w = w / s
        sec_w = np.bincount(inv, weights=w, minlength=unique.size)
        scale = np.ones(unique.size, dtype="float64")
        over = sec_w > sector_cap_eff + 1e-12
        if over.any():
            scale[over] = sector_cap_eff / sec_w[over]
            w = w * scale[inv]
            s = float(w.sum())
            if s <= 0.0:
                w = np.full(n, 1.0 / n)
                break
            w = w / s
            sec_w = np.bincount(inv, weights=w, minlength=unique.size)
        if float(w.max()) <= name_cap_eff + 1e-9 and float(sec_w.max()) <= sector_cap_eff + 1e-9:
            break
    return w


def long_book_weights(
    frame: pd.DataFrame,
    score_col: str,
    raw_col: str,
    *,
    name_cap: float = NAME_CAP,
    sector_cap: float = SECTOR_CAP,
    quantile: int = N_QUANTILES,
) -> pd.Series:
    """Fully invested long weights for one rebalance date, indexed by ticker.

    Weight is proportional to ``max(S, 0)`` inside the target quintile of the
    active (nonzero-raw) set. Standardized ``S`` can be negative after sector
    neutralization; a negative weight does not belong in a long book, so those
    names get a zero contribution and the rest are renormalized. If every
    surviving score is non-positive the book is equal-weighted.
    """
    if frame.empty:
        return pd.Series(dtype="float64")

    legs = quintile_legs(frame, score_col, raw_col)
    long = legs[legs["quantile"].eq(quantile)]
    if long.empty:
        return pd.Series(dtype="float64")

    scores = pd.to_numeric(long[score_col], errors="coerce").fillna(0.0).to_numpy(dtype="float64")
    scores = np.clip(scores, 0.0, None)
    if float(scores.sum()) <= 0.0:
        scores = np.ones(len(long), dtype="float64")
    sectors = long["sic_division"].fillna("Unknown").astype(str).to_numpy()
    weights = _apply_caps(scores, sectors, name_cap=name_cap, sector_cap=sector_cap)
    return pd.Series(weights, index=long["ticker"].to_numpy(), name="weight")


def short_book_weights(
    frame: pd.DataFrame,
    score_col: str,
    raw_col: str,
    *,
    name_cap: float = NAME_CAP,
    sector_cap: float = SECTOR_CAP,
) -> pd.Series:
    """Bottom-quintile short weights, positive numbers that will be negated.

    Proportional to ``max(-S, 0)`` so the most negative scores get the largest
    short. Same caps as the long book. Reported with the sparsity caveat: the
    opportunistic bottom quintile is as thin as the top, and no borrow cost
    is modelled.
    """
    if frame.empty:
        return pd.Series(dtype="float64")

    legs = quintile_legs(frame, score_col, raw_col)
    short = legs[legs["quantile"].eq(1)]
    if short.empty:
        return pd.Series(dtype="float64")

    scores = pd.to_numeric(short[score_col], errors="coerce").fillna(0.0).to_numpy(dtype="float64")
    scores = np.clip(-scores, 0.0, None)
    if float(scores.sum()) <= 0.0:
        scores = np.ones(len(short), dtype="float64")
    sectors = short["sic_division"].fillna("Unknown").astype(str).to_numpy()
    weights = _apply_caps(scores, sectors, name_cap=name_cap, sector_cap=sector_cap)
    return pd.Series(weights, index=short["ticker"].to_numpy(), name="weight")


def vintage_positions(
    panel: pd.DataFrame,
    score_col: str,
    raw_col: str,
    *,
    hedge: str,
    name_cap: float = NAME_CAP,
    sector_cap: float = SECTOR_CAP,
) -> pd.DataFrame:
    """One vintage (formation-date) book per rebalance, stocks only.

    ETF-hedge shorts are *not* stored here: they are rebuilt from the combined
    long book each month so the hedge tracks the overlapping holdings rather
    than being frozen at formation. Quintile-spread shorts are stock positions
    and *are* stored, with negative weights.
    """
    rows: list[dict[str, object]] = []
    grouped = panel.groupby("rebalance_date", sort=True)
    for date, grp in grouped:
        long_w = long_book_weights(
            grp, score_col, raw_col, name_cap=name_cap, sector_cap=sector_cap
        )
        meta = grp.drop_duplicates("ticker").set_index("ticker")
        for ticker, weight in long_w.items():
            if ticker not in meta.index:
                continue
            row = meta.loc[ticker]
            rows.append(
                {
                    "formation_date": date,
                    "ticker": ticker,
                    "weight": float(weight),
                    "sic_division": str(row["sic_division"]) if pd.notna(row["sic_division"]) else "Unknown",
                    "market_cap": float(row["market_cap"]) if pd.notna(row["market_cap"]) else np.nan,
                    "median_dollar_volume": (
                        float(row["median_dollar_volume"])
                        if pd.notna(row["median_dollar_volume"])
                        else np.nan
                    ),
                    "side": "long",
                }
            )
        if hedge == HEDGE_SPREAD:
            short_w = short_book_weights(
                grp, score_col, raw_col, name_cap=name_cap, sector_cap=sector_cap
            )
            for ticker, weight in short_w.items():
                if ticker not in meta.index:
                    continue
                row = meta.loc[ticker]
                rows.append(
                    {
                        "formation_date": date,
                        "ticker": ticker,
                        "weight": -float(weight),
                        "sic_division": str(row["sic_division"]) if pd.notna(row["sic_division"]) else "Unknown",
                        "market_cap": float(row["market_cap"]) if pd.notna(row["market_cap"]) else np.nan,
                        "median_dollar_volume": (
                            float(row["median_dollar_volume"])
                            if pd.notna(row["median_dollar_volume"])
                            else np.nan
                        ),
                        "side": "short",
                    }
                )
    if not rows:
        return pd.DataFrame(
            columns=[
                "formation_date",
                "ticker",
                "weight",
                "sic_division",
                "market_cap",
                "median_dollar_volume",
                "side",
            ]
        )
    return pd.DataFrame(rows)


def combine_overlapping(
    vintages: pd.DataFrame,
    rebalance_dates: pd.DatetimeIndex,
    holding_period_months: int,
) -> pd.DataFrame:
    """Jegadeesh-Titman average of the last ``K`` formation vintages.

    Combined weight of name ``i`` at date ``t`` is ``(1/K) Σ_k w_{i, t-k}``
    over ``k = 0 … K-1``, with a missing vintage contributing zero. The first
    ``K-1`` months therefore have less than full vintage coverage; that is
    the overlapping construction, not a bug.

    Output grain is ``(rebalance_date, ticker)`` with the averaged weight and
    the most recent vintage's sector / cap / ADV attributes (used for costs
    and the ETF hedge).
    """
    dates = pd.DatetimeIndex(rebalance_dates).sort_values()
    k = max(int(holding_period_months), 1)
    if vintages.empty or dates.empty:
        return pd.DataFrame(
            columns=[
                "rebalance_date",
                "ticker",
                "weight",
                "sic_division",
                "market_cap",
                "median_dollar_volume",
                "side",
                "n_vintages",
            ]
        )

    by_formation = {
        pd.Timestamp(d): g for d, g in vintages.groupby("formation_date", sort=True)
    }
    pieces: list[pd.DataFrame] = []
    for i, date in enumerate(dates):
        start = max(0, i - k + 1)
        frames = []
        for j in range(start, i + 1):
            formed = pd.Timestamp(dates[j])
            if formed in by_formation:
                frames.append(by_formation[formed])
        n_active = i - start + 1
        # Always divide by K, not by n_active: an empty vintage is cash, and
        # that is what "K overlapping portfolios" means.
        if not frames:
            continue
        stacked = pd.concat(frames, ignore_index=True)
        grouped = stacked.groupby("ticker", sort=False)
        weight = grouped["weight"].sum() / k
        latest = stacked.sort_values("formation_date").groupby("ticker", sort=False).tail(1)
        latest = latest.set_index("ticker")
        out = pd.DataFrame(
            {
                "rebalance_date": date,
                "ticker": weight.index,
                "weight": weight.to_numpy(),
                "sic_division": latest.reindex(weight.index)["sic_division"].to_numpy(),
                "market_cap": latest.reindex(weight.index)["market_cap"].to_numpy(),
                "median_dollar_volume": latest.reindex(weight.index)[
                    "median_dollar_volume"
                ].to_numpy(),
                "side": latest.reindex(weight.index)["side"].to_numpy(),
                "n_vintages": n_active,
            }
        )
        out = out[out["weight"].abs().gt(1e-15)].reset_index(drop=True)
        pieces.append(out)
    if not pieces:
        return pd.DataFrame(
            columns=[
                "rebalance_date",
                "ticker",
                "weight",
                "sic_division",
                "market_cap",
                "median_dollar_volume",
                "side",
                "n_vintages",
            ]
        )
    return pd.concat(pieces, ignore_index=True)


def one_sided_turnover(previous: pd.Series, current: pd.Series) -> float:
    """One-sided traded notional over book: ``0.5 × Σ |Δw_i|``.

    Book value is 1 (NAV). For a fully invested long book that stays fully
    invested this equals the buy-side notional. Positions that can be short
    are included; a name that leaves the book is a close.
    """
    prev = previous.reindex(previous.index.union(current.index)).fillna(0.0)
    curr = current.reindex(prev.index).fillna(0.0)
    return float(0.5 * (curr - prev).abs().sum())


def weights_as_series(positions: pd.DataFrame, date) -> pd.Series:
    """Ticker → weight at one combined-book date."""
    if positions.empty:
        return pd.Series(dtype="float64")
    sl = positions[positions["rebalance_date"].eq(date)]
    if sl.empty:
        return pd.Series(dtype="float64")
    return pd.Series(sl["weight"].to_numpy(), index=sl["ticker"].to_numpy(), dtype="float64")
