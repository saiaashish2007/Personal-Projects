"""Black-Scholes straddles and a daily delta-hedged short-straddle simulator.

Shapes broadcast throughout, so the same code runs one historical trade or 20,000
simulated paths. Volatilities here are decimals (0.20), not vol points.
"""

from __future__ import annotations

import numpy as np
from scipy.special import ndtr

ANN = 252
SQRT_2PI = np.sqrt(2 * np.pi)


def _pdf(x: np.ndarray) -> np.ndarray:
    return np.exp(-0.5 * x**2) / SQRT_2PI


def _d1(S, K, tau, sigma, r):
    t = np.maximum(tau, 1e-12)
    return (np.log(S / K) + (r + 0.5 * sigma**2) * t) / (sigma * np.sqrt(t))


def call(S, K, tau, sigma, r):
    d1 = _d1(S, K, tau, sigma, r)
    d2 = d1 - sigma * np.sqrt(np.maximum(tau, 0))
    live = S * ndtr(d1) - K * np.exp(-r * tau) * ndtr(d2)
    return np.where(tau > 0, live, np.maximum(S - K, 0.0))


def put(S, K, tau, sigma, r):
    return call(S, K, tau, sigma, r) - S + K * np.exp(-r * np.maximum(tau, 0))


def straddle(S, K, tau, sigma, r):
    return call(S, K, tau, sigma, r) + put(S, K, tau, sigma, r)


def straddle_delta(S, K, tau, sigma, r):
    live = 2 * ndtr(_d1(S, K, tau, sigma, r)) - 1
    return np.where(tau > 0, live, np.sign(S - K))


def straddle_gamma(S, K, tau, sigma, r):
    t = np.maximum(tau, 1e-12)
    return 2 * _pdf(_d1(S, K, tau, sigma, r)) / (S * sigma * np.sqrt(t))


def straddle_vega(S, K, tau, sigma, r):
    """Value change per 1.00 of vol; divide by 100 for one vol point."""
    t = np.maximum(tau, 0)
    return 2 * S * _pdf(_d1(S, K, tau, sigma, r)) * np.sqrt(t)


def hedged_short_straddle(
    S: np.ndarray,
    mark_vol: np.ndarray,
    hedge_vol: np.ndarray,
    r: np.ndarray,
    spread_vol_pts: float = 0.0,
    hedge_cost_bps: float = 0.0,
) -> np.ndarray:
    """Daily P&L of selling one ATM straddle at S[:, 0] and delta-hedging at each close.

    S and mark_vol have shape (n, H+1): spot and the implied vol used to mark the option
    on each day, with expiry on the last column. hedge_vol (n,) is the vol used for
    hedge ratios, held at the entry implied vol. Returns (n, H), as a fraction of the
    strike, so day k is the P&L from close k-1 to close k.

    Costs: half the bid/ask (in vol points of vega) is paid on entry, and every hedge
    trade, including the unwind at expiry, pays hedge_cost_bps of its notional.
    """
    S = np.atleast_2d(S)
    n, steps = S.shape
    H = steps - 1
    K = S[:, :1]
    rr = np.asarray(r, float).reshape(-1, 1)
    hv = np.asarray(hedge_vol, float).reshape(-1, 1)
    tau = (H - np.arange(steps)) / ANN

    V = straddle(S, K, tau, np.atleast_2d(mark_vol), rr)
    delta = straddle_delta(S[:, :-1], K, tau[:-1], hv, rr)

    dS = np.diff(S, axis=1)
    cash = V[:, :-1] - delta * S[:, :-1]
    pnl = -np.diff(V, axis=1) + delta * dS + cash * rr / ANN

    trades = np.diff(np.concatenate([np.zeros((n, 1)), delta, np.zeros((n, 1))], axis=1), axis=1)
    hedge_cost = np.abs(trades) * S * hedge_cost_bps / 1e4
    pnl -= hedge_cost[:, 1:]
    pnl[:, 0] -= hedge_cost[:, 0]
    entry_vega = straddle_vega(S[:, 0], K[:, 0], tau[0], np.atleast_2d(mark_vol)[:, 0], rr[:, 0])
    pnl[:, 0] -= spread_vol_pts / 100 * entry_vega

    return pnl / K


def gbm_paths(
    n: int,
    H: int,
    sigma: float,
    rng: np.random.Generator,
    jump_rate: float = 0.0,
    jump_mean: float = 0.0,
    jump_sd: float = 0.0,
    S0: float = 100.0,
) -> np.ndarray:
    """Merton jump-diffusion paths at daily steps, zero drift, shape (n, H+1)."""
    dt = 1 / ANN
    z = rng.standard_normal((n, H))
    logret = -0.5 * sigma**2 * dt + sigma * np.sqrt(dt) * z
    if jump_rate > 0:
        k = rng.poisson(jump_rate * dt, (n, H))
        logret += k * jump_mean + np.sqrt(k) * jump_sd * rng.standard_normal((n, H))
    path = np.concatenate([np.zeros((n, 1)), np.cumsum(logret, axis=1)], axis=1)
    return S0 * np.exp(path)
