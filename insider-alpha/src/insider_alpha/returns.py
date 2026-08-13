"""Forward returns at the horizons the IC analysis in SPEC.md 8 needs.

Two properties matter more than anything else here, because a violation of either is
silent and would make every downstream number wrong in the flattering direction.

**No lookahead.** The return for (``t``, ``h``) is measured from the adjusted close at
``t`` to the adjusted close ``h`` trading sessions later. Nothing about ``t + h`` may
influence whether the observation exists — in particular, requiring a price to exist at
``t + h`` would quietly delete every name that stopped trading during the window, which
is the delisting-return problem in disguise.

**Honest treatment of names that stop trading.** When a security has no price at
``t + h`` because it was acquired, delisted, or halted through the end of the window,
the return is measured to its last observed close and flagged ``is_truncated``. That is
the conservative reading: the position is marked at the last price the market printed
rather than dropped from the sample. Where the last print is itself stale — the security
went to zero and simply stopped quoting — this understates the loss, and
``delisting_return`` allows the Shumway-style haircut to be applied as a sensitivity.

Horizons are in trading days on a shared market calendar rather than each security's own
observed sessions, so a thinly traded name that missed ten prints is not credited with a
longer holding period than a liquid one.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

HORIZONS: tuple[int, ...] = (1, 5, 21, 63, 126, 252)

# Beyond this many sessions without a print, a security is treated as gone rather than
# halted, and the terminal mark stops being carried forward.
MAX_CARRY_SESSIONS = 10


def _align_to_calendar(prices: pd.DataFrame, calendar: pd.DatetimeIndex) -> pd.DataFrame:
    """Reindex every ticker onto the shared calendar, forward filling short gaps.

    Yields a rectangular (session, ticker) panel of adjusted closes where a gap of a few
    sessions — a halt, or a day the vendor missed — is bridged, but a security that has
    genuinely stopped trading decays to NaN after ``MAX_CARRY_SESSIONS``.
    """
    wide = prices.pivot_table(
        index="date", columns="ticker", values="adj_close", aggfunc="last"
    ).reindex(calendar)
    return wide.ffill(limit=MAX_CARRY_SESSIONS)


def forward_returns(
    prices: pd.DataFrame,
    rebalance_dates: pd.DatetimeIndex,
    *,
    horizons: tuple[int, ...] = HORIZONS,
    calendar: pd.DatetimeIndex | None = None,
    tickers: list[str] | None = None,
    delisting_return: float | None = None,
) -> pd.DataFrame:
    """Forward returns for every (rebalance date, ticker) at each horizon.

    Returns one row per (``rebalance_date``, ``ticker``) with a ``fwd_ret_{h}`` and a
    ``truncated_{h}`` column per horizon. ``truncated_{h}`` marks an observation whose
    endpoint is the security's last print rather than a price at ``t + h``.

    ``delisting_return`` replaces the truncated return with a fixed value — Shumway
    (1997) puts the realized return on a performance-related NYSE delisting near -30% —
    so the backtest can be run against a pessimistic assumption without rebuilding the
    panel.
    """
    if tickers is not None:
        prices = prices[prices["ticker"].isin(tickers)]
    if prices.empty:
        return pd.DataFrame()

    calendar = calendar if calendar is not None else pd.DatetimeIndex(
        sorted(prices["date"].unique())
    )
    wide = _align_to_calendar(prices, calendar)

    positions = pd.Series(np.arange(len(calendar)), index=calendar)
    valid_dates = [d for d in rebalance_dates if d in positions.index]
    if not valid_dates:
        return pd.DataFrame()

    base_idx = positions.loc[valid_dates].to_numpy()
    values = wide.to_numpy(dtype="float64")
    base = values[base_idx]

    # The last session on which each ticker printed, used to distinguish "no price at
    # t+h because it stopped trading" from "no price at t+h because t+h is off the end
    # of the sample", which is not a delisting and must stay NaN.
    observed = ~np.isnan(values)
    last_seen = np.where(
        observed.any(axis=0), len(calendar) - 1 - observed[::-1].argmax(axis=0), -1
    )
    columns = np.arange(values.shape[1])
    last_price = np.where(last_seen >= 0, values[np.clip(last_seen, 0, None), columns], np.nan)

    frames: list[pd.DataFrame] = []
    for horizon in horizons:
        target_idx = np.minimum(base_idx + horizon, len(calendar) - 1)
        reaches_end = base_idx + horizon > len(calendar) - 1

        future = values[target_idx]
        truncated = np.isnan(future) & ~np.isnan(base)

        # Fall back to the last observed price for names that stopped printing inside
        # the window. Names that never printed again *and* whose window runs past the
        # end of the sample are left NaN rather than marked as delisted.
        stops_inside = last_seen[None, :] < target_idx[:, None]
        future = np.where(truncated & stops_inside, last_price[None, :], future)
        truncated = truncated & stops_inside
        future = np.where(reaches_end[:, None] & ~truncated, np.nan, future)

        ret = future / base - 1.0
        if delisting_return is not None:
            ret = np.where(truncated, delisting_return, ret)

        frames.append(
            pd.DataFrame(ret, index=pd.DatetimeIndex(valid_dates), columns=wide.columns)
            .stack(future_stack=True)
            .rename(f"fwd_ret_{horizon}")
        )
        frames.append(
            pd.DataFrame(truncated, index=pd.DatetimeIndex(valid_dates), columns=wide.columns)
            .stack(future_stack=True)
            .rename(f"truncated_{horizon}")
        )

    out = pd.concat(frames, axis=1).rename_axis(index=["rebalance_date", "ticker"]).reset_index()
    keep = out[[c for c in out.columns if c.startswith("fwd_ret_")]].notna().any(axis=1)
    out = out[keep].reset_index(drop=True)
    log.info("forward returns: %d observations at horizons %s", len(out), list(horizons))
    return out


def align_to_universe(universe: pd.DataFrame, returns: pd.DataFrame) -> pd.DataFrame:
    """Restrict forward returns to names that were in the universe at that rebalance.

    An inner join, deliberately: a return for a name outside the universe at ``t`` has
    no place in the cross-sectional IC, and a universe member with no return needs to
    stay visible as a missing observation rather than be silently dropped, which is why
    the join runs this way round and the coverage is logged.
    """
    merged = universe[["rebalance_date", "ticker", "cik"]].merge(
        returns, on=["rebalance_date", "ticker"], how="left"
    )
    horizon_columns = [c for c in returns.columns if c.startswith("fwd_ret_")]
    if horizon_columns:
        coverage = merged[horizon_columns[0]].notna().mean()
        log.info("forward returns cover %.1f%% of universe rows at the 1-day horizon", 100 * coverage)
    return merged


def summarize_returns(returns: pd.DataFrame) -> pd.DataFrame:
    """Per-horizon coverage, dispersion, and how much of it is truncated marks."""
    rows = []
    for column in [c for c in returns.columns if c.startswith("fwd_ret_")]:
        horizon = int(column.rsplit("_", 1)[1])
        series = returns[column]
        truncated = returns.get(f"truncated_{horizon}")
        rows.append(
            {
                "horizon": horizon,
                "n": int(series.notna().sum()),
                "mean": series.mean(),
                "median": series.median(),
                "std": series.std(),
                "pct_truncated": float(truncated.mean()) if truncated is not None else np.nan,
            }
        )
    return pd.DataFrame(rows).sort_values("horizon").reset_index(drop=True)
