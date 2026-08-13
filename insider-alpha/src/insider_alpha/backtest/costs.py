"""Transaction-cost model and the flat round-trip sensitivity sweep (SPEC.md 10).

Two layers, because a single assumption is easy to game.

**Explicit model.** Round-trip cost per name = half-spread + square-root
impact. Half-spread is a cap-tercile proxy (5 / 10 / 20 bps for large / mid /
small, terciles of universe market cap at ``t``). Impact is
``k · √(participation)`` with participation capped at 10% of 20-day median
dollar volume. ``k`` is in *percent* return units: 0.32 means 32 bps of impact
at 100% participation, ~10 bps at the cap. SPEC does not pick ``k``; 0.32 is
the conventional square-root coefficient used by the dashboard fixture, not a
calibrated fit.

**Sweep.** Net Sharpe and net annualized excess return versus RF, at a flat
round-trip cost from 0 to 100 bps in 5 bp steps. Break-even is the interpolated
cost where alpha crosses zero, and where Sharpe crosses zero. A strategy that
is already negative at 0 bps has a null break-even — that is a finding.

Turnover is one-sided notional / NAV per year. Monthly cost drag on the sweep
is ``(bps / 10_000) × monthly_turnover``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from insider_alpha.utils import with_columns

BPS = 10_000.0
HALF_SPREAD_BPS = {"large": 5.0, "mid": 10.0, "small": 20.0}
# Percent units: impact_decimal = (k / 100) * sqrt(participation).
IMPACT_K = 0.32
PARTICIPATION_CAP = 0.10
# Notional of the long book. Sparse names sit near the $1M ADV floor; $10mm
# is small enough that the 10% cap binds on those names and does not bind on
# mega-caps, which is the point of an impact term.
DEFAULT_AUM = 10_000_000.0
SWEEP_BPS: tuple[int, ...] = tuple(range(0, 101, 5))
ETF_HALF_SPREAD_BPS = 5.0
ETF_ADV = 1_000_000_000.0


@dataclass(frozen=True)
class CostModel:
    half_spreads: dict[str, float] = field(default_factory=lambda: dict(HALF_SPREAD_BPS))
    impact_k: float = IMPACT_K
    participation_cap: float = PARTICIPATION_CAP
    aum: float = DEFAULT_AUM

    def __post_init__(self) -> None:
        if self.impact_k < 0:
            raise ValueError("impact_k must be non-negative")
        if not 0.0 < self.participation_cap <= 1.0:
            raise ValueError("participation_cap must be in (0, 1]")
        if self.aum <= 0:
            raise ValueError("aum must be positive")


DEFAULT_COST_MODEL = CostModel()


def cap_terciles(market_cap: pd.Series, dates: pd.Series) -> pd.Series:
    """Point-in-time universe terciles. Large = top third by cap at ``t``."""
    cap = pd.to_numeric(market_cap, errors="coerce").to_numpy(dtype="float64")
    dvals = pd.to_datetime(dates).to_numpy()
    out = np.full(cap.size, "mid", dtype=object)
    for d in pd.unique(dvals):
        idx = np.flatnonzero(dvals == d)
        c = cap[idx]
        valid = np.isfinite(c) & (c > 0)
        if int(valid.sum()) < 3:
            continue
        ranks = pd.Series(c[valid]).rank(method="first").to_numpy()
        n = int(valid.sum())
        tercile = np.ceil(ranks * 3.0 / n).clip(1, 3).astype(int)
        mapped = np.array(["small", "mid", "large"], dtype=object)[tercile - 1]
        out[idx[valid]] = mapped
    return pd.Series(out, index=market_cap.index)


def participation_rate(
    traded_weight: pd.Series,
    adv: pd.Series,
    *,
    aum: float = DEFAULT_AUM,
    cap: float = PARTICIPATION_CAP,
) -> pd.Series:
    """``min(cap, |Δw| · AUM / ADV)``. Missing/zero ADV is treated as the cap."""
    traded = pd.to_numeric(traded_weight, errors="coerce").abs().fillna(0.0)
    liquidity = pd.to_numeric(adv, errors="coerce")
    raw = (traded * aum) / liquidity.replace(0.0, np.nan)
    return raw.fillna(cap).clip(lower=0.0, upper=cap)


def round_trip_bps(
    tercile: pd.Series,
    participation: pd.Series,
    *,
    model: CostModel = DEFAULT_COST_MODEL,
) -> pd.Series:
    """Half-spread (by tercile) plus ``k · √q`` impact, in basis points."""
    spread = tercile.map(model.half_spreads).fillna(model.half_spreads["mid"]).astype("float64")
    impact = (model.impact_k * 100.0) * np.sqrt(pd.to_numeric(participation, errors="coerce").fillna(0.0))
    return spread + impact


def name_trade_costs(
    traded_weight: pd.Series,
    tercile: pd.Series,
    adv: pd.Series,
    *,
    model: CostModel = DEFAULT_COST_MODEL,
    is_etf: pd.Series | None = None,
) -> pd.DataFrame:
    """Per-name one-sided notional and round-trip bps for one rebalance."""
    traded = pd.to_numeric(traded_weight, errors="coerce").abs().fillna(0.0)
    one_sided = traded * 0.5
    part = participation_rate(traded, adv, aum=model.aum, cap=model.participation_cap)
    rt = round_trip_bps(tercile, part, model=model)
    if is_etf is not None:
        etf_flag = is_etf.reindex(traded.index)
        etf = pd.Series(etf_flag.to_numpy() == True, index=traded.index)
        etf_part = participation_rate(
            traded, pd.Series(ETF_ADV, index=traded.index), aum=model.aum, cap=model.participation_cap
        )
        etf_rt = ETF_HALF_SPREAD_BPS + (model.impact_k * 100.0) * np.sqrt(etf_part)
        rt = rt.where(~etf, etf_rt)
        part = part.where(~etf, etf_part)
    cost_frac = one_sided * (rt / BPS)
    return pd.DataFrame(
        {
            "traded_weight": traded.to_numpy(),
            "one_sided": one_sided.to_numpy(),
            "participation": part.to_numpy(),
            "round_trip_bps": rt.to_numpy(),
            "cost": cost_frac.to_numpy(),
        },
        index=traded.index,
    )


def monthly_explicit_cost(
    previous: pd.Series,
    current: pd.Series,
    attributes: pd.DataFrame,
    *,
    model: CostModel = DEFAULT_COST_MODEL,
) -> tuple[float, float, pd.DataFrame]:
    """Cost of trading from ``previous`` to ``current`` as a fraction of NAV.

    ``attributes`` is indexed by ticker and must carry ``cap_tercile``,
    ``median_dollar_volume``, and optionally ``is_etf``. Returns
    ``(cost_fraction, trade_weighted_rt_bps, per_name_detail)``.
    """
    tickers = previous.index.union(current.index)
    prev = previous.reindex(tickers).fillna(0.0)
    curr = current.reindex(tickers).fillna(0.0)
    delta = (curr - prev).abs()
    if float(delta.sum()) <= 0.0:
        empty = pd.DataFrame(
            columns=["traded_weight", "one_sided", "participation", "round_trip_bps", "cost"]
        )
        return 0.0, 0.0, empty

    attr = attributes.reindex(tickers)
    tercile = attr["cap_tercile"].fillna("mid") if "cap_tercile" in attr.columns else pd.Series("mid", index=tickers)
    adv = (
        attr["median_dollar_volume"]
        if "median_dollar_volume" in attr.columns
        else pd.Series(np.nan, index=tickers)
    )
    is_etf = attr["is_etf"] if "is_etf" in attr.columns else None
    detail = name_trade_costs(delta, tercile, adv, model=model, is_etf=is_etf)
    cost = float(detail["cost"].sum())
    one_sided = detail["one_sided"]
    if float(one_sided.sum()) > 0.0:
        rt = float(np.average(detail["round_trip_bps"].to_numpy(), weights=one_sided.to_numpy()))
    else:
        rt = 0.0
    return cost, rt, detail


def apply_flat_cost(gross: pd.Series, turnover: pd.Series, round_trip_bps: float) -> pd.Series:
    """``net = gross − (bps/10_000) × one-sided turnover``."""
    drag = (float(round_trip_bps) / BPS) * pd.to_numeric(turnover, errors="coerce").fillna(0.0)
    return pd.to_numeric(gross, errors="coerce").fillna(0.0) - drag


def interpolate_zero_crossing(x: np.ndarray, y: np.ndarray) -> float | None:
    """Smallest ``x`` at which ``y`` crosses or hits zero from above.

    ``None`` if ``y`` is never positive (alpha that starts negative has no
    break-even cost — it is already dead). If it stays positive through the
    last grid point the crossing is extrapolated one step, then clipped; a
    value past the grid is still returned so the dashboard can say "beyond
    100 bps" via the interpretation string rather than a null.
    """
    x = np.asarray(x, dtype="float64")
    y = np.asarray(y, dtype="float64")
    if x.size == 0 or y.size == 0:
        return None
    if not np.any(y > 0.0):
        return None
    for i in range(len(y) - 1):
        y0, y1 = y[i], y[i + 1]
        if y0 == 0.0:
            return float(x[i])
        if y0 > 0.0 >= y1:
            if y1 == y0:
                return float(x[i])
            t = y0 / (y0 - y1)
            return float(x[i] + t * (x[i + 1] - x[i]))
    if y[-1] > 0.0:
        if len(y) >= 2 and y[-1] != y[-2]:
            step = x[-1] - x[-2]
            t = y[-1] / (y[-2] - y[-1]) if y[-2] != y[-1] else 0.0
            return float(x[-1] + max(t, 0.0) * step)
        return None
    return None


def attach_terciles(universe: pd.DataFrame) -> pd.DataFrame:
    """Add ``cap_tercile`` to a universe panel without touching other columns."""
    labels = cap_terciles(universe["market_cap"], universe["rebalance_date"])
    return with_columns(universe, cap_tercile=labels)
