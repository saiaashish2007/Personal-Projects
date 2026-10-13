"""Historical backtest of a laddered short ATM straddle book, delta-hedged daily.

Each trading day the book may sell a new 21-day ATM S&P 500 straddle, priced with
Black-Scholes at VIX as the implied vol, sized at 1/21 of capital in underlying
notional. With every slot filled, the book is short one unit of capital in straddle
notional spread over 21 expiries. A timing rule decides, from information at that
day's close, whether the new slot is filled or left flat.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from vrp.features import HORIZON
from vrp.options import hedged_short_straddle

SPREAD_VOL_PTS = 0.5
HEDGE_COST_BPS = 1.0
# VIX is a variance-swap rate that includes the put skew, so a 30-day ATM straddle
# trades below it. Free daily ATM implied vol history does not exist; this ratio is
# the proxy, and the cost grid shows how the results move with it.
ATM_RATIO = 0.90

CRASHES = {
    "Dot-com unwind": ("2002-06-01", "2002-08-31"),
    "Global financial crisis": ("2008-09-01", "2008-12-31"),
    "Flash crash": ("2010-04-26", "2010-06-30"),
    "US downgrade": ("2011-07-25", "2011-10-04"),
    "China devaluation": ("2015-08-17", "2015-09-30"),
    "Volmageddon": ("2018-01-29", "2018-02-28"),
    "Q4 2018 selloff": ("2018-10-01", "2018-12-31"),
    "COVID crash": ("2020-02-19", "2020-04-30"),
    "2022 bear market": ("2022-01-03", "2022-10-31"),
    "Yen carry unwind": ("2024-07-24", "2024-08-30"),
    "Tariff shock": ("2025-04-01", "2025-04-30"),
}

STRATEGIES = {
    "always": "Always sell",
    "naive": "Implied above trailing realized",
    "harx": "Implied above HAR-X forecast",
    "xgb": "Implied above XGBoost forecast",
    "oracle": "Perfect foresight (reference)",
}


def trade_pnl(df: pd.DataFrame, atm_ratio: float = ATM_RATIO, **costs) -> np.ndarray:
    """P&L paths (entries, HORIZON) for a straddle sold on every day with a full path."""
    n = len(df) - HORIZON
    idx = np.arange(n)[:, None] + np.arange(HORIZON + 1)[None, :]
    S = df["close"].to_numpy()[idx]
    iv = atm_ratio * df["vix"].to_numpy()[idx] / 100
    return hedged_short_straddle(
        S,
        mark_vol=iv,
        hedge_vol=iv[:, 0],
        r=df["rate"].to_numpy()[:n],
        spread_vol_pts=costs.get("spread_vol_pts", SPREAD_VOL_PTS),
        hedge_cost_bps=costs.get("hedge_cost_bps", HEDGE_COST_BPS),
    )


def ladder(pnl: np.ndarray, weight: np.ndarray) -> np.ndarray:
    """Daily book returns: entry p contributes weight[p] * pnl[p, k-1] / H on day p+k."""
    n = len(pnl)
    ret = np.zeros(n + HORIZON)
    for k in range(1, HORIZON + 1):
        ret[k : n + k] += weight * pnl[:, k - 1] / HORIZON
    return ret[1:n]


def edges(df: pd.DataFrame, atm_ratio: float = ATM_RATIO) -> dict[str, pd.Series]:
    """Implied vol the straddle is sold at, minus each forecast of realized vol."""
    iv = atm_ratio * df["vix"]
    return {
        "naive": iv - df["rv_trailing"],
        "harx": iv - df["fc_harx"],
        "xgb": iv - df["fc_xgb"],
        "oracle": iv - df["rv_fwd"],
    }


def signals(df: pd.DataFrame, atm_ratio: float = ATM_RATIO) -> dict[str, np.ndarray]:
    sig = {"always": np.ones(len(df))}
    sig.update({k: (e.to_numpy() > 0).astype(float) for k, e in edges(df, atm_ratio).items()})
    return sig


def stats(ret: pd.Series, weight: np.ndarray | None = None) -> dict:
    r = ret.to_numpy()
    equity = np.cumsum(r)
    dd = equity - np.maximum.accumulate(np.maximum(equity, 0))
    downside = r[r < 0]
    monthly = ret.groupby(ret.index.to_period("M")).sum()
    q = np.quantile(r, 0.05)
    out = {
        "ann_return": float(r.mean() * 252),
        "ann_vol": float(r.std(ddof=1) * np.sqrt(252)),
        "sharpe": float(r.mean() / r.std(ddof=1) * np.sqrt(252)),
        "sortino": float(r.mean() / np.sqrt(np.mean(downside**2)) * np.sqrt(252)),
        "max_drawdown": float(dd.min()),
        "worst_month": float(monthly.min()),
        "worst_month_date": str(monthly.idxmin()),
        "skew": float(pd.Series(r).skew()),
        "cvar_5": float(r[r <= q].mean()),
    }
    if weight is not None:
        out["time_in_market"] = float(weight.mean())
    return out


def run(df: pd.DataFrame, atm_ratio: float = ATM_RATIO, **costs) -> dict:
    """df: features joined with out-of-sample forecasts, starting at the first OOS date."""
    pnl = trade_pnl(df, atm_ratio, **costs)
    n = len(pnl)
    dates = df.index[1:n]
    sig = {k: v[:n] for k, v in signals(df, atm_ratio).items()}
    trade_total = pnl.sum(axis=1)

    returns = pd.DataFrame({k: ladder(pnl, w) for k, w in sig.items()}, index=dates)
    edge = edges(df, atm_ratio)
    ic = {
        k: float(spearmanr(edge[k].to_numpy()[:n], trade_total).statistic)
        for k in ("naive", "harx", "xgb")
    }

    crashes = []
    for name, (a, b) in CRASHES.items():
        win = returns.loc[a:b]
        if len(win) < 5:
            continue
        crashes.append(
            {
                "name": name,
                "start": a,
                "end": b,
                "vix_peak": float(df.loc[a:b, "vix"].max()),
                **{k: float(win[k].sum()) for k in STRATEGIES},
            }
        )

    sensitivity = []
    for thr in (-4, -2, 0, 2, 4):
        w = (edge["xgb"].to_numpy()[:n] > thr).astype(float)
        s = stats(pd.Series(ladder(pnl, w), index=dates), w)
        sensitivity.append({"threshold": thr, **s})

    return {
        "returns": returns,
        "weights": pd.DataFrame(sig, index=df.index[:n]),
        "trade_total": pd.Series(trade_total, index=df.index[:n]),
        "stats": {k: stats(returns[k], sig[k]) for k in STRATEGIES},
        "yearly": returns.groupby(returns.index.year).sum(),
        "ic": ic,
        "crashes": crashes,
        "sensitivity": sensitivity,
        "hit_rate": float((trade_total > 0).mean()),
    }
