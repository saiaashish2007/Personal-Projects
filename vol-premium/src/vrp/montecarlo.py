"""Monte Carlo: how much of the backtest is luck, and what a crash does to the trade.

1. Stationary block bootstrap (Politis & Romano, 1994) of daily book returns. Blocks
   keep volatility clustering intact, and every strategy is resampled on the same
   days, so their Sharpe ratios can be compared draw by draw.
2. Merton jump-diffusion stress test of a single delta-hedged short straddle, the same
   Black-Scholes P&L engine the backtest uses, under increasingly frequent crashes.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from vrp.features import HORIZON
from vrp.options import ANN, gbm_paths, hedged_short_straddle, straddle

MEAN_BLOCK = 21


def stationary_indices(n: int, size: int, rng: np.random.Generator) -> np.ndarray:
    idx = np.empty((size, n), dtype=np.int64)
    idx[:, 0] = rng.integers(0, n, size)
    jump = rng.random((size, n)) < 1 / MEAN_BLOCK
    fresh = rng.integers(0, n, (size, n))
    for t in range(1, n):
        idx[:, t] = np.where(jump[:, t], fresh[:, t], (idx[:, t - 1] + 1) % n)
    return idx


def _sharpe(r: np.ndarray) -> np.ndarray:
    return r.mean(axis=1) / r.std(axis=1, ddof=1) * np.sqrt(ANN)


def _max_dd(r: np.ndarray) -> np.ndarray:
    eq = np.cumsum(r, axis=1)
    peak = np.maximum.accumulate(np.maximum(eq, 0), axis=1)
    return (eq - peak).min(axis=1)


def bootstrap(returns: pd.DataFrame, draws: int = 2000, seed: int = 7, chunk: int = 200) -> dict:
    rng = np.random.default_rng(seed)
    R = returns.to_numpy()
    names = list(returns.columns)
    sharpe = {k: [] for k in names}
    mdd = {k: [] for k in names}
    ann = {k: [] for k in names}
    for start in range(0, draws, chunk):
        idx = stationary_indices(len(R), min(chunk, draws - start), rng)
        for j, k in enumerate(names):
            sample = R[idx, j]
            sharpe[k].append(_sharpe(sample))
            mdd[k].append(_max_dd(sample))
            ann[k].append(sample.mean(axis=1) * ANN)
    sharpe = {k: np.concatenate(v) for k, v in sharpe.items()}
    mdd = {k: np.concatenate(v) for k, v in mdd.items()}
    ann = {k: np.concatenate(v) for k, v in ann.items()}

    lo, hi = min(map(np.min, sharpe.values())), max(map(np.max, sharpe.values()))
    edges = np.linspace(lo, hi, 41)

    def pct(x: np.ndarray) -> dict:
        p = np.percentile(x, [2.5, 50, 97.5])
        return {"lo": float(p[0]), "mid": float(p[1]), "hi": float(p[2])}

    out = {
        "draws": draws,
        "mean_block": MEAN_BLOCK,
        "bins": edges.tolist(),
        "strategies": {
            k: {
                "sharpe": pct(sharpe[k]),
                "max_drawdown": pct(mdd[k]),
                "ann_return": pct(ann[k]),
                "prob_negative_sharpe": float((sharpe[k] < 0).mean()),
                "hist": np.histogram(sharpe[k], edges)[0].tolist(),
            }
            for k in names
        },
        "paired": {},
    }
    for k in names:
        if k == "always":
            continue
        diff = sharpe[k] - sharpe["always"]
        out["paired"][k] = {
            "prob_beats_always": float((diff > 0).mean()),
            "sharpe_diff": pct(diff),
        }
    return out


def jump_stress(
    implied: float = 0.18,
    diffusion: float = 0.14,
    rates: tuple[float, ...] = (0.0, 1.0, 2.0, 4.0, 8.0),
    jump_mean: float = -0.05,
    jump_sd: float = 0.03,
    paths: int = 20000,
    seed: int = 11,
) -> dict:
    """One 21-day short straddle sold at `implied`, hedged at `implied`, with the
    underlying following diffusion vol plus Poisson crash jumps."""
    rng = np.random.default_rng(seed)
    tau = HORIZON / ANN
    premium = float(straddle(100.0, 100.0, tau, implied, 0.0) / 100)
    rows = []
    for lam in rates:
        S = gbm_paths(paths, HORIZON, diffusion, rng, lam, jump_mean, jump_sd)
        iv = np.full_like(S, implied)
        pnl = hedged_short_straddle(S, iv, np.full(paths, implied), np.zeros(paths)).sum(axis=1)
        logret = np.diff(np.log(S), axis=1)
        realized = np.sqrt(ANN * (logret**2).mean(axis=1))
        p = np.percentile(pnl, [1, 5, 50])
        rows.append(
            {
                "jumps_per_year": lam,
                "realized_vol": float(np.sqrt((realized**2).mean())),
                "mean": float(pnl.mean()),
                "median": float(p[2]),
                "p5": float(p[1]),
                "p1": float(p[0]),
                "prob_loss": float((pnl < 0).mean()),
            }
        )

    curve = []
    for real in np.arange(0.08, 0.34, 0.02):
        S = gbm_paths(paths // 4, HORIZON, float(real), rng)
        iv = np.full_like(S, implied)
        sim = hedged_short_straddle(S, iv, np.full(len(S), implied), np.zeros(len(S))).sum(axis=1)
        # Hedging at the true vol would lock in exactly V(implied) - V(realized); hedging
        # at implied earns the same in expectation, with path-dependent noise around it.
        gap = (
            straddle(100.0, 100.0, tau, implied, 0.0) - straddle(100.0, 100.0, tau, real, 0.0)
        ) / 100
        curve.append(
            {"realized": float(real), "simulated": float(sim.mean()), "bs_gap": float(gap)}
        )

    return {
        "implied": implied,
        "diffusion": diffusion,
        "jump_mean": jump_mean,
        "jump_sd": jump_sd,
        "paths": paths,
        "premium": premium,
        "rows": rows,
        "curve": curve,
    }
