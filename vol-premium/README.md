# Timing the Volatility Risk Premium

S&P 500 options are usually priced for more volatility than actually shows up. This project
sells that gap with delta-hedged at-the-money straddles priced by Black-Scholes, uses an
XGBoost forecast of 21-day realized volatility to decide when to step aside, and uses Monte
Carlo to separate skill from luck.

**Live dashboard:** [vol-premium.vercel.app](https://vol-premium.vercel.app) (source in `web/`).

## Results (out of sample, 1998 – 2026, after costs)

| | Always sell | XGBoost-timed |
|---|---|---|
| Sharpe | 0.84 | 0.94 |
| Max drawdown | −19.9% | −13.1% |
| Worst month | −8.9% (Sep 2008) | −3.4% |
| Loss in Sep – Dec 2008 | −9.8% | −3.2% |

- Timing beats always-selling in 91% of 2,000 paired block-bootstrap draws, but the 95%
  interval on the Sharpe gain (−0.03 to +0.26) includes zero. The robust finding is the cut
  in tail losses, not higher average return.
- On forecast accuracy, HAR-X (HAR plus VIX) is very hard to beat. XGBoost trained on QLIKE
  on top of HAR-X is not significantly different (Diebold-Mariano t = 1.49).
- Shocks that arrive out of calm markets (Feb 2018, Apr 2025) give no warning, and timing
  does not help there.

## How it works

| Step | Module | What it does |
|---|---|---|
| Data | `src/vrp/data.py` | S&P 500 OHLC (Yahoo Finance), VIX / VIX9D / VIX3M / VVIX (Cboe), 3-month T-bill (FRED). Free, no API keys. |
| Features | `src/vrp/features.py` | 18 features known at each close: HAR realized vols, Parkinson and Garman-Klass range vols, downside semivariance, VIX term structure, VVIX, returns, drawdown. Target: realized vol over the next 21 days. |
| Forecast | `src/vrp/forecast.py` | Walk-forward, refit quarterly on an expanding window, training rows purged 21 days plus a 5-day embargo. HAR, HAR-X, and XGBoost with a custom QLIKE objective using HAR-X as the base margin and early stopping on a purged holdout. |
| Pricing | `src/vrp/options.py` | Vectorized Black-Scholes straddle price and Greeks, and a daily delta-hedged short-straddle P&L engine with option spread and hedging costs. |
| Backtest | `src/vrp/backtest.py` | 21 overlapping straddles, 1/21 of capital each. A new one is sold only when implied vol exceeds the forecast. Crash windows, threshold and cost sensitivity. |
| Monte Carlo | `src/vrp/montecarlo.py` | Stationary block bootstrap for Sharpe and drawdown intervals, plus a Merton jump-diffusion stress test of a single hedged straddle. |

## Running it

```bash
cd vol-premium
uv sync
uv run vrp run --refresh   # downloads data, fits, backtests, writes web/data/*.json
uv run pytest
```

```bash
cd web
npm install
npm run dev                # http://localhost:3000
```

## Assumptions to know about

- Straddles are priced at 0.90 × VIX as an ATM implied-vol proxy, because VIX includes the
  put skew and free ATM vol history does not exist. The dashboard shows results at 1.0, 0.9
  and 0.85.
- Option half-spread is 0.5 vol points on entry; each hedge trade pays 1 bp.
- Hedging is close-to-close, so intraday gaps and margin calls are not modeled.
- Some design choices were made after seeing early out-of-sample results.
