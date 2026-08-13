"""Information coefficients before any backtest (SPEC.md section 8).

This is the go/no-go gate. Nothing here looks at a portfolio, a cost, or a
Sharpe ratio. The only question is whether the firm-level score ``S`` ranks
forward returns in the cross-section, and whether the opportunistic filter is
what makes it do so.

Every statistic is computed twice, on the two arms ``build_signal`` produced.
The delta is the result.

IC is Spearman, not Pearson, because ``S`` is a sparse right-skewed event score
and a handful of very large purchases would otherwise dominate a linear
correlation. It is computed cross-sectionally at each rebalance date and then
summarized as a time series: mean, standard deviation, information ratio
(mean/std, not annualized), and a Newey-West t-statistic that respects the
overlap in longer-horizon returns.

Quintiles rather than deciles: event sparsity does not support ten meaningful
buckets. Mean forward returns in the artifact are basis points; the return
panel stores decimals.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy import stats

from insider_alpha.returns import HORIZONS
from insider_alpha.signal.construct import ARM_ALL_INSIDERS, ARM_OPPORTUNISTIC
from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

BPS = 10_000.0
N_QUANTILES = 5
MIN_CROSS_SECTION = 10
GO_NO_GO_HORIZONS = (21, 63)
GO_NO_GO_T_STAT = 2.0

ARM_LABELS = {
    ARM_OPPORTUNISTIC: "Opportunistic filter ON",
    ARM_ALL_INSIDERS: "Opportunistic filter OFF (all insiders)",
}


def newey_west_lags(horizon_days: int, n_periods: int) -> int:
    """Bartlett lags for a monthly series of overlapping ``h``-day returns.

    Consecutive 21-day ICs share almost no return window, so one lag is enough
    to be conservative. A 252-day IC observed monthly overlaps eleven prior
    observations. Caps at ``T - 2`` so the HAC variance is defined.
    """
    if n_periods < 3:
        return 0
    lags = max(horizon_days // 21, 1)
    return int(min(lags, n_periods - 2))


def newey_west_mean(values: np.ndarray | pd.Series, lags: int) -> dict[str, float]:
    """Mean of a series with a Newey-West (Bartlett) standard error and t-stat.

    Implemented here rather than through statsmodels so the gate does not depend
    on an optional import for a one-parameter HAC. The estimator is the usual
    one: ``Var(μ) = T^{-1} (Γ_0 + 2 Σ_k (1 - k/(L+1)) Γ_k)``.
    """
    y = np.asarray(values, dtype="float64")
    y = y[np.isfinite(y)]
    n = int(y.size)
    if n == 0:
        raise ValueError("newey_west_mean received no finite observations")
    mean = float(y.mean())
    if n == 1:
        return {
            "mean": mean,
            "std": 0.0,
            "se": 0.0,
            "t_stat": 0.0,
            "p_value": 1.0,
            "n": 1,
            "lags": 0,
        }

    resid = y - mean
    gamma0 = float(np.dot(resid, resid) / n)
    max_lag = int(min(max(lags, 0), n - 1))
    nw_var = gamma0
    for lag in range(1, max_lag + 1):
        gamma = float(np.dot(resid[lag:], resid[:-lag]) / n)
        weight = 1.0 - lag / (max_lag + 1)
        nw_var += 2.0 * weight * gamma
    # A small-sample Bartlett sum can theoretically go negative; fall back to
    # the iid variance of the mean rather than emitting a NaN t-stat.
    var_mean = max(nw_var, gamma0) / n
    se = math.sqrt(var_mean) if var_mean > 0 else 0.0
    t_stat = mean / se if se > 0 else 0.0
    p_value = float(2.0 * stats.t.sf(abs(t_stat), df=n - 1))
    p_value = min(1.0, max(0.0, p_value))
    return {
        "mean": mean,
        "std": float(y.std(ddof=1)),
        "se": se,
        "t_stat": float(t_stat),
        "p_value": p_value,
        "n": n,
        "lags": max_lag,
    }


def _spearman(signal: np.ndarray, returns: np.ndarray) -> tuple[float, int]:
    """Spearman rank IC for one date. Returns (nan, n) when undefined."""
    mask = np.isfinite(signal) & np.isfinite(returns)
    n = int(mask.sum())
    if n < MIN_CROSS_SECTION:
        return float("nan"), n
    x = signal[mask]
    y = returns[mask]
    if np.unique(x).size < 2 or np.unique(y).size < 2:
        return float("nan"), n
    corr = float(stats.spearmanr(x, y).correlation)
    if not math.isfinite(corr):
        return float("nan"), n
    return float(min(1.0, max(-1.0, corr))), n


def ic_time_series(
    panel: pd.DataFrame,
    signal_col: str,
    return_col: str,
) -> pd.DataFrame:
    """Cross-sectional Spearman IC of ``signal_col`` vs ``return_col`` at each date."""
    rows: list[dict[str, object]] = []
    grouped = panel.groupby("rebalance_date", sort=True)
    for date, grp in grouped:
        corr, n = _spearman(grp[signal_col].to_numpy(), grp[return_col].to_numpy())
        rows.append({"rebalance_date": date, "ic": corr, "n": n})
    return pd.DataFrame(rows)


def assign_quintiles(values: pd.Series, dates: pd.Series) -> pd.Series:
    """Equal-count quintiles within date, ties broken by row order.

    ``rank(method='first')`` is what makes five buckets exist even when most of
    the cross-section is tied at zero. A ``qcut`` on the raw score would collapse
    those ties into one bin and silently drop the rest.
    """
    frame = pd.DataFrame({"v": values.to_numpy(), "d": dates.to_numpy()}, index=values.index)
    n = frame.groupby("d", sort=False)["v"].transform("size")
    rank = frame.groupby("d", sort=False)["v"].rank(method="first")
    quantile = np.floor((rank - 1.0) * N_QUANTILES / n).astype(int) + 1
    return quantile.clip(lower=1, upper=N_QUANTILES)


def quintile_sort(
    panel: pd.DataFrame,
    signal_col: str,
    return_col: str,
    *,
    horizon_days: int,
) -> dict[str, object]:
    """Equal-weight quintile means of forward returns, in basis points."""
    work = panel[["rebalance_date", signal_col, return_col]].dropna(subset=[signal_col, return_col])
    if work.empty:
        buckets = [
            {"quantile": q, "mean_forward_return_bps": 0.0, "std_error_bps": 0.0, "n_obs": 0}
            for q in range(1, N_QUANTILES + 1)
        ]
        return {
            "horizon_days": horizon_days,
            "buckets": buckets,
            "spread_bps": 0.0,
            "spread_t_stat": 0.0,
            "monotonic": True,
            "spearman_rank_of_means": 0.0,
        }

    q = assign_quintiles(work[signal_col], work["rebalance_date"])
    work = with_columns(work, quantile=q)

    date_means = (
        work.groupby(["rebalance_date", "quantile"], sort=True)[return_col]
        .mean()
        .unstack("quantile")
        .reindex(columns=range(1, N_QUANTILES + 1))
    )
    lags = newey_west_lags(horizon_days, len(date_means))
    buckets = []
    means_bps: list[float] = []
    for q_id in range(1, N_QUANTILES + 1):
        series = date_means[q_id].dropna() if q_id in date_means.columns else pd.Series(dtype=float)
        n_obs = int((work["quantile"] == q_id).sum())
        if series.empty:
            buckets.append(
                {
                    "quantile": q_id,
                    "mean_forward_return_bps": 0.0,
                    "std_error_bps": 0.0,
                    "n_obs": n_obs,
                }
            )
            means_bps.append(0.0)
            continue
        summary = newey_west_mean(series.to_numpy() * BPS, lags)
        buckets.append(
            {
                "quantile": q_id,
                "mean_forward_return_bps": summary["mean"],
                "std_error_bps": summary["se"],
                "n_obs": n_obs,
            }
        )
        means_bps.append(summary["mean"])

    spread_series = (date_means[N_QUANTILES] - date_means[1]).dropna()
    if spread_series.empty:
        spread = {"mean": 0.0, "t_stat": 0.0}
    else:
        spread = newey_west_mean(spread_series.to_numpy() * BPS, lags)

    means_arr = np.asarray(means_bps, dtype="float64")
    monotonic = bool(np.all(np.diff(means_arr) >= -1e-9))
    if np.unique(means_arr).size < 2:
        rank_corr = 0.0
    else:
        rank_corr = float(stats.spearmanr(np.arange(1, N_QUANTILES + 1), means_arr).correlation)
        if not math.isfinite(rank_corr):
            rank_corr = 0.0
        rank_corr = min(1.0, max(-1.0, rank_corr))

    return {
        "horizon_days": horizon_days,
        "buckets": buckets,
        "spread_bps": spread["mean"],
        "spread_t_stat": spread["t_stat"],
        "monotonic": monotonic,
        "spearman_rank_of_means": rank_corr,
    }


def _horizon_stat(ts: pd.DataFrame, horizon_days: int) -> dict[str, object]:
    finite = ts[np.isfinite(ts["ic"].to_numpy())]
    if finite.empty:
        raise ValueError(f"no finite ICs at horizon {horizon_days}")
    lags = newey_west_lags(horizon_days, len(finite))
    summary = newey_west_mean(finite["ic"].to_numpy(), lags)
    std = summary["std"]
    ir = summary["mean"] / std if std > 0 else 0.0
    return {
        "horizon_days": horizon_days,
        "mean_ic": summary["mean"],
        "ic_std": std,
        "ic_ir": ir,
        "t_stat_newey_west": summary["t_stat"],
        "newey_west_lags": summary["lags"],
        "p_value": summary["p_value"],
        "n_periods": int(summary["n"]),
        "mean_cross_section_size": float(finite["n"].mean()),
    }


def _time_series_payload(ts: pd.DataFrame, horizon_days: int) -> dict[str, object]:
    finite = ts[np.isfinite(ts["ic"].to_numpy())]
    points = [
        {
            "date": pd.Timestamp(row.rebalance_date).strftime("%Y-%m-%d"),
            "ic": float(min(1.0, max(-1.0, row.ic))),
            "n": int(row.n),
        }
        for row in finite.itertuples(index=False)
    ]
    return {"horizon_days": horizon_days, "points": points}


def analyze_arm(
    panel: pd.DataFrame,
    signal_col: str,
    *,
    arm: str,
    horizons: tuple[int, ...] = HORIZONS,
) -> dict[str, object]:
    """IC summary, time series, and quintile sorts for one arm at every horizon."""
    by_horizon = []
    time_series = []
    quantiles = []
    ic_by_horizon: dict[int, pd.DataFrame] = {}

    for horizon in horizons:
        ret_col = f"fwd_ret_{horizon}"
        if ret_col not in panel.columns:
            continue
        ts = ic_time_series(panel, signal_col, ret_col)
        ic_by_horizon[horizon] = ts
        by_horizon.append(_horizon_stat(ts, horizon))
        time_series.append(_time_series_payload(ts, horizon))
        quantiles.append(quintile_sort(panel, signal_col, ret_col, horizon_days=horizon))
        stat = by_horizon[-1]
        log.info(
            "  %-16s h=%3d  mean IC=%+.4f  t=%.2f  IR=%.3f  n=%d",
            arm,
            horizon,
            stat["mean_ic"],
            stat["t_stat_newey_west"],
            stat["ic_ir"],
            stat["n_periods"],
        )

    return {
        "arm": arm,
        "label": ARM_LABELS[arm],
        "by_horizon": by_horizon,
        "time_series": time_series,
        "quantiles": quantiles,
        "_ic_by_horizon": ic_by_horizon,
    }


def _headline(arms: list[dict], horizons: tuple[int, ...]) -> list[dict[str, object]]:
    opp = next(a for a in arms if a["arm"] == ARM_OPPORTUNISTIC)
    all_ = next(a for a in arms if a["arm"] == ARM_ALL_INSIDERS)
    opp_stats = {row["horizon_days"]: row for row in opp["by_horizon"]}
    all_stats = {row["horizon_days"]: row for row in all_["by_horizon"]}
    opp_ts = opp["_ic_by_horizon"]
    all_ts = all_["_ic_by_horizon"]

    rows = []
    for horizon in horizons:
        if horizon not in opp_stats or horizon not in all_stats:
            continue
        o, a = opp_stats[horizon], all_stats[horizon]
        delta_t: float | None = None
        if horizon in opp_ts and horizon in all_ts:
            merged = opp_ts[horizon].merge(
                all_ts[horizon], on="rebalance_date", suffixes=("_opp", "_all")
            )
            both = merged[np.isfinite(merged["ic_opp"]) & np.isfinite(merged["ic_all"])]
            if len(both) >= 3:
                lags = newey_west_lags(horizon, len(both))
                delta_t = newey_west_mean(
                    (both["ic_opp"] - both["ic_all"]).to_numpy(), lags
                )["t_stat"]
        rows.append(
            {
                "horizon_days": horizon,
                "opportunistic_mean_ic": o["mean_ic"],
                "opportunistic_t_stat": o["t_stat_newey_west"],
                "all_insiders_mean_ic": a["mean_ic"],
                "all_insiders_t_stat": a["t_stat_newey_west"],
                "delta_ic": o["mean_ic"] - a["mean_ic"],
                "delta_t_stat": delta_t,
            }
        )
    return rows


def go_no_go(headline: list[dict], *, t_stat_min: float = GO_NO_GO_T_STAT) -> dict[str, object]:
    """SPEC §8: opportunistic mean IC at 21d and 63d must be positive with t ≳ 2."""
    by_h = {row["horizon_days"]: row for row in headline}
    evaluated = []
    passed_each = []
    details = []
    for horizon in GO_NO_GO_HORIZONS:
        row = by_h.get(horizon)
        if row is None:
            continue
        evaluated.append(horizon)
        mean_ic = row["opportunistic_mean_ic"]
        t_stat = row["opportunistic_t_stat"]
        ok = bool(mean_ic > 0 and t_stat >= t_stat_min)
        passed_each.append(ok)
        details.append((horizon, mean_ic, t_stat, ok))

    passed = bool(evaluated) and all(passed_each)
    criterion = (
        "Opportunistic-filtered mean Spearman IC at the 21- and 63-day horizons "
        f"is positive with Newey-West t-statistic ≥ {t_stat_min:.0f}."
    )
    if not details:
        verdict = (
            "Go/no-go could not be evaluated: the 21- and 63-day IC rows are missing."
        )
        return {
            "criterion": criterion,
            "horizons_evaluated": evaluated,
            "passed": False,
            "verdict": verdict,
        }

    bits = ", ".join(
        f"{h}d mean IC {mean_ic:+.4f} (t = {t_stat:.2f})"
        for h, mean_ic, t_stat, _ in details
    )
    if passed:
        verdict = (
            "Gate passed. Opportunistic insider purchases still rank forward returns "
            f"out of sample: {bits}. Milestone 5 proceeds as a strategy backtest."
        )
    else:
        failed = [h for h, _, _, ok in details if not ok]
        verdict = (
            "Gate failed. The opportunistic-filtered signal does not clear the "
            f"pre-registered hurdle at {', '.join(f'{h}d' for h in failed)} "
            f"({bits}). The honest reading is post-publication decay, not a "
            "tradable anomaly: Milestone 5 still runs so the decay is documented "
            "with an equity curve, but the narrative is a well-executed decay study."
        )
    return {
        "criterion": criterion,
        "horizons_evaluated": evaluated,
        "passed": passed,
        "verdict": verdict,
    }


def build_ic_artifact(
    signal: pd.DataFrame,
    returns: pd.DataFrame,
    *,
    notes: str | None,
    horizons: tuple[int, ...] = HORIZONS,
    generated_at: str | None = None,
) -> dict[str, object]:
    """Assemble the ``ic.json`` payload for both arms."""
    panel = signal.merge(returns, on=["rebalance_date", "ticker", "cik"], how="inner")
    log.info("IC panel: %s rows over %d dates", f"{len(panel):,}", panel["rebalance_date"].nunique())

    arms = []
    for arm, col in (
        (ARM_OPPORTUNISTIC, f"s_{ARM_OPPORTUNISTIC}"),
        (ARM_ALL_INSIDERS, f"s_{ARM_ALL_INSIDERS}"),
    ):
        log.info("IC arm: %s", arm)
        arms.append(analyze_arm(panel, col, arm=arm, horizons=horizons))

    headline = _headline(arms, horizons)
    gate = go_no_go(headline)
    log.info("go/no-go: passed=%s", gate["passed"])

    public_arms = [{k: v for k, v in arm.items() if not k.startswith("_")} for arm in arms]
    stamp = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "schema_version": "1.0.0",
        "artifact": "ic",
        "generated_at": stamp,
        "data_status": "real",
        "notes": notes,
        "arms": public_arms,
        "headline": headline,
        "go_no_go": gate,
    }
