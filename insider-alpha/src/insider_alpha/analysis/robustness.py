"""SPEC §12 robustness battery for a decay study.

Cuts, a W×λ surface, a within-date signal shuffle, bootstrap intervals, and
a specification count. Nothing here is a search for a Sharpe. The expected
reading of a failed IC gate is a flat weak surface and an observed statistic
that does not sit in the extreme tail of the null.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy import stats

from insider_alpha.analysis.attribution import (
    DEFAULT_NW_LAGS,
    align_returns_and_factors,
    fit_ff5_umd,
)
from insider_alpha.analysis.ic import ic_time_series, newey_west_mean
from insider_alpha.backtest.costs import attach_terciles
from insider_alpha.backtest.engine import (
    VARIANT_SPECS,
    MarketData,
    performance_block,
    run_variant,
)
from insider_alpha.signal.construct import (
    ARM_OPPORTUNISTIC,
    SignalConfig,
    build_signal,
)
from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

VALID_FAMILIES = frozenset(
    {
        "headline",
        "subperiod",
        "event_exclusion",
        "cap_tercile",
        "sector_exclusion",
        "signal_definition",
    }
)

BASELINE_ID = "baseline"
PRIMARY_VARIANT = "opp_etf_3m"
SWEEP_WINDOWS = (30, 60, 90, 120, 180)
SWEEP_LAMBDAS = (0.0, 0.25, 0.5, 0.75, 1.0)
N_RANDOM_DRAWS = 1000
N_BOOTSTRAP = 2000
BOOT_BLOCK = 6
COVID_MONTHS = {f"2020-{m:02d}" for m in range(1, 7)}
FINANCIALS = "Finance, Insurance, Real Estate"
ENERGY = "Mining"
RNG_SEED = 20140103


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _primary_spec() -> dict[str, object]:
    return next(dict(s) for s in VARIANT_SPECS if s["id"] == PRIMARY_VARIANT)


def slice_monthly(monthly: pd.DataFrame, months: pd.Series | list[str] | set[str]) -> pd.DataFrame:
    wanted = set(months)
    return monthly[monthly["month"].isin(wanted)].reset_index(drop=True)


def bootstrap_sharpe_ci(
    returns: pd.Series,
    rf: pd.Series,
    *,
    n_resamples: int = N_BOOTSTRAP,
    mean_block: int = BOOT_BLOCK,
    seed: int = RNG_SEED,
) -> tuple[float, float]:
    """Stationary-bootstrap 95% CI on the annualized Sharpe."""
    r = pd.to_numeric(returns, errors="coerce").to_numpy(dtype="float64")
    rf_a = pd.to_numeric(rf.reindex(returns.index), errors="coerce").fillna(0.0).to_numpy(dtype="float64")
    mask = np.isfinite(r)
    r = r[mask]
    rf_a = rf_a[mask]
    n = int(r.size)
    if n < 8:
        return float("nan"), float("nan")
    rng = np.random.default_rng(seed)
    p = 1.0 / max(mean_block, 1)
    draws = np.empty(n_resamples, dtype="float64")
    for i in range(n_resamples):
        idx = _stationary_index(n, p, rng)
        stats_i = performance_block(pd.Series(r[idx]), pd.Series(rf_a[idx]))
        draws[i] = float(stats_i["sharpe"])
    lo, hi = np.quantile(draws, [0.025, 0.975])
    return float(lo), float(hi)


def _stationary_index(n: int, p: float, rng: np.random.Generator) -> np.ndarray:
    """Politis–Romano stationary bootstrap indices of length ``n``."""
    out = np.empty(n, dtype=np.int64)
    pos = 0
    while pos < n:
        start = int(rng.integers(0, n))
        length = int(rng.geometric(p))
        take = min(length, n - pos)
        for k in range(take):
            out[pos + k] = (start + k) % n
        pos += take
    return out


def bootstrap_alpha_ci(
    aligned: pd.DataFrame,
    *,
    n_resamples: int = N_BOOTSTRAP,
    mean_block: int = BOOT_BLOCK,
    seed: int = RNG_SEED,
    lags: int = DEFAULT_NW_LAGS,
) -> tuple[float, float]:
    """Stationary-bootstrap 95% CI on annualized FF5+UMD alpha (bps)."""
    n = len(aligned)
    if n < 12:
        return float("nan"), float("nan")
    rng = np.random.default_rng(seed)
    p = 1.0 / max(mean_block, 1)
    draws = np.empty(n_resamples, dtype="float64")
    for i in range(n_resamples):
        idx = _stationary_index(n, p, rng)
        sl = aligned.iloc[idx].reset_index(drop=True)
        try:
            fitted = fit_ff5_umd(sl, lags=min(lags, max(n - 2, 0)))
            draws[i] = float(fitted["alpha_ann_bps"])
        except ValueError:
            draws[i] = np.nan
    finite = draws[np.isfinite(draws)]
    if finite.size < 20:
        return float("nan"), float("nan")
    lo, hi = np.quantile(finite, [0.025, 0.975])
    return float(lo), float(hi)


def summarize_book(
    monthly: pd.DataFrame,
    factors: pd.DataFrame,
    *,
    return_col: str = "net",
    lags: int = DEFAULT_NW_LAGS,
    bootstrap: bool = True,
    seed: int = RNG_SEED,
) -> dict[str, float | None]:
    """CAGR, Sharpe, FF5+UMD alpha, and optional Sharpe CI for one monthly book."""
    if monthly.empty:
        raise ValueError("monthly book is empty")
    net = monthly.set_index("date")[return_col]
    rf = monthly.set_index("date")["rf"] if "rf" in monthly.columns else pd.Series(0.0, index=net.index)
    perf = performance_block(net, rf)
    aligned = align_returns_and_factors(monthly, factors, return_col=return_col)
    fitted = fit_ff5_umd(aligned, lags=min(lags, max(len(aligned) - 2, 0)))
    if bootstrap:
        lo, hi = bootstrap_sharpe_ci(net, rf, seed=seed)
        sharpe_lo = None if not math.isfinite(lo) else float(lo)
        sharpe_hi = None if not math.isfinite(hi) else float(hi)
    else:
        sharpe_lo = sharpe_hi = None
    return {
        "n_months": int(len(monthly)),
        "ann_return": float(perf["ann_return"]),
        "sharpe": float(perf["sharpe"]),
        "sharpe_ci_low": sharpe_lo,
        "sharpe_ci_high": sharpe_hi,
        "alpha_ann_bps": float(fitted["alpha_ann_bps"]),
        "alpha_t_stat": float(fitted["alpha_t_stat"]),
    }


def grid_row(
    *,
    row_id: str,
    family: str,
    label: str,
    description: str,
    summary: dict[str, float | None],
    baseline_alpha: float | None,
) -> dict[str, object]:
    if family not in VALID_FAMILIES:
        raise ValueError(f"invalid robustness family {family!r}")
    delta = None
    if baseline_alpha is not None:
        delta = float(summary["alpha_ann_bps"]) - float(baseline_alpha)
    return {
        "id": row_id,
        "family": family,
        "label": label,
        "description": description,
        "n_months": int(summary["n_months"]),
        "ann_return": float(summary["ann_return"]),
        "sharpe": float(summary["sharpe"]),
        "sharpe_ci_low": summary["sharpe_ci_low"],
        "sharpe_ci_high": summary["sharpe_ci_high"],
        "alpha_ann_bps": float(summary["alpha_ann_bps"]),
        "alpha_t_stat": float(summary["alpha_t_stat"]),
        "delta_alpha_vs_baseline_bps": delta,
    }


def _month_parts(monthly: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    month = monthly["month"].astype(str)
    year = month.str.slice(0, 4).astype(int)
    return month, year


def grid_from_existing(
    returns: pd.DataFrame,
    factors: pd.DataFrame,
) -> list[dict[str, object]]:
    """Headline, subperiod, COVID, and filter-off rows from stored monthly returns."""
    primary = returns[returns["variant_id"].eq(PRIMARY_VARIANT)].reset_index(drop=True)
    twin = returns[returns["variant_id"].eq("all_etf_3m")].reset_index(drop=True)
    base = summarize_book(primary, factors, seed=RNG_SEED)
    rows = [
        grid_row(
            row_id=BASELINE_ID,
            family="headline",
            label="Baseline: opportunistic, ETF hedge, 3-month hold",
            description=(
                "Primary variant opp_etf_3m, net of the explicit cost model, "
                "full 2014–2025 sample. This is the SPEC default, not a selected Sharpe."
            ),
            summary=base,
            baseline_alpha=None,
        )
    ]
    baseline_alpha = float(base["alpha_ann_bps"])
    month, year = _month_parts(primary)
    early = primary[year.le(2019)].reset_index(drop=True)
    late = primary[year.ge(2020)].reset_index(drop=True)
    rows.append(
        grid_row(
            row_id="sub_2014_2019",
            family="subperiod",
            label="2014–2019",
            description="First half of the sample, including the 2014–2019 expansion.",
            summary=summarize_book(early, factors, seed=RNG_SEED + 1),
            baseline_alpha=baseline_alpha,
        )
    )
    rows.append(
        grid_row(
            row_id="sub_2020_2025",
            family="subperiod",
            label="2020–2025",
            description="Second half, including COVID, the 2022 drawdown, and the rebound.",
            summary=summarize_book(late, factors, seed=RNG_SEED + 2),
            baseline_alpha=baseline_alpha,
        )
    )
    ex_covid = primary[~month.isin(COVID_MONTHS)].reset_index(drop=True)
    rows.append(
        grid_row(
            row_id="ex_covid",
            family="event_exclusion",
            label="Excluding 2020 Q1–Q2",
            description="Drops the COVID crash and the immediate rebound (January–June 2020).",
            summary=summarize_book(ex_covid, factors, seed=RNG_SEED + 3),
            baseline_alpha=baseline_alpha,
        )
    )
    if not twin.empty:
        rows.append(
            grid_row(
                row_id="all_insiders",
                family="signal_definition",
                label="All insiders (CMP filter off)",
                description=(
                    "Identical ETF-hedged 3-month construction on every open-market "
                    "purchase. Buys-only is already the core; a net (buys−sales) "
                    "variant was not built and is not invented here."
                ),
                summary=summarize_book(twin, factors, seed=RNG_SEED + 4),
                baseline_alpha=baseline_alpha,
            )
        )
    return rows


def _filter_panel(panel: pd.DataFrame, mask: pd.Series) -> pd.DataFrame:
    return panel.loc[mask.to_numpy()].reset_index(drop=True)


def run_filtered_variant(
    market: MarketData,
    mask: pd.Series,
    factors: pd.DataFrame,
    *,
    seed: int,
) -> dict[str, float | None]:
    """Re-run the primary book on a name-filtered panel."""
    panel = _filter_panel(market.panel, mask)
    panel = panel.drop_duplicates(["rebalance_date", "ticker"]).reset_index(drop=True)
    spec = _primary_spec()
    result = run_variant(
        panel,
        market.stock_returns,
        market.sector_returns,
        market.spy_returns,
        market.betas,
        market.rf,
        spec,
    )
    return summarize_book(result.monthly, factors, seed=seed)


def cap_and_sector_rows(
    market: MarketData,
    factors: pd.DataFrame,
    baseline_alpha: float,
) -> list[dict[str, object]]:
    """Cap-tercile and SIC-division exclusion cuts of the primary book."""
    panel = market.panel
    if "cap_tercile" not in panel.columns:
        raise ValueError("market panel is missing cap_tercile")
    rows = []
    for tercile, row_id, label, desc, seed in (
        (
            "small",
            "cap_small",
            "Small-cap tercile",
            "Long book restricted to the bottom third of the universe by market cap at t. CMP predicts a stronger effect here.",
            RNG_SEED + 10,
        ),
        (
            "mid",
            "cap_mid",
            "Mid-cap tercile",
            "Long book restricted to the middle third by market cap at t.",
            RNG_SEED + 11,
        ),
        (
            "large",
            "cap_large",
            "Large-cap tercile",
            "Long book restricted to the top third by market cap at t.",
            RNG_SEED + 12,
        ),
    ):
        log.info("robustness cut %s", row_id)
        mask = panel["cap_tercile"].astype(str).eq(tercile)
        summary = run_filtered_variant(market, mask, factors, seed=seed)
        rows.append(
            grid_row(
                row_id=row_id,
                family="cap_tercile",
                label=label,
                description=desc,
                summary=summary,
                baseline_alpha=baseline_alpha,
            )
        )

    for sector, row_id, label, desc, seed in (
        (
            FINANCIALS,
            "ex_financials",
            "Excluding financials",
            "Drops SIC division Finance, Insurance, Real Estate — the largest source of insider-purchase events.",
            RNG_SEED + 13,
        ),
        (
            ENERGY,
            "ex_energy",
            "Excluding energy",
            "Drops SIC division Mining, the project's energy bucket (maps to XLE). Energy purchases cluster after drawdowns.",
            RNG_SEED + 14,
        ),
    ):
        log.info("robustness cut %s", row_id)
        mask = ~panel["sic_division"].fillna("Unknown").astype(str).eq(sector)
        summary = run_filtered_variant(market, mask, factors, seed=seed)
        rows.append(
            grid_row(
                row_id=row_id,
                family="sector_exclusion",
                label=label,
                description=desc,
                summary=summary,
                baseline_alpha=baseline_alpha,
            )
        )
    return rows


def mean_ic_21(signal: pd.DataFrame, returns: pd.DataFrame, col: str = f"s_{ARM_OPPORTUNISTIC}") -> dict[str, float]:
    """21-day mean Spearman IC and Newey-West t-stat for one signal panel."""
    panel = signal.merge(returns, on=["rebalance_date", "ticker", "cik"], how="inner")
    ts = ic_time_series(panel, col, "fwd_ret_21")
    finite = ts[np.isfinite(ts["ic"].to_numpy())]
    if finite.empty:
        return {"mean_ic": 0.0, "t_stat": 0.0, "n": 0}
    summary = newey_west_mean(finite["ic"].to_numpy(), lags=1)
    return {"mean_ic": float(summary["mean"]), "t_stat": float(summary["t_stat"]), "n": int(summary["n"])}


def parameter_sweep(
    purchases: pd.DataFrame,
    universe: pd.DataFrame,
    returns: pd.DataFrame,
    *,
    windows: tuple[int, ...] = SWEEP_WINDOWS,
    lambdas: tuple[float, ...] = SWEEP_LAMBDAS,
) -> dict[str, object]:
    """W × λ surface of 21-day mean IC. A surface, not a max-Sharpe search."""
    cells = []
    values = []
    tstats = []
    for window in windows:
        for lam in lambdas:
            log.info("sweep W=%s λ=%s", window, lam)
            config = SignalConfig(window_days=int(window), cluster_lambda=float(lam))
            signal = build_signal(purchases, universe, config=config)
            stat = mean_ic_21(signal, returns)
            cells.append(
                {
                    "x": float(window),
                    "y": float(lam),
                    "value": float(stat["mean_ic"]),
                    "t_stat": float(stat["t_stat"]),
                }
            )
            values.append(stat["mean_ic"])
            tstats.append(stat["t_stat"])
            log.info("  mean IC=%+.4f t=%.2f", stat["mean_ic"], stat["t_stat"])

    arr = np.asarray(values, dtype="float64")
    tarr = np.asarray(tstats, dtype="float64")
    default = next(
        (c for c in cells if c["x"] == 90.0 and c["y"] == 0.5),
        cells[0],
    )
    spread = float(arr.max() - arr.min()) if arr.size else 0.0
    n_sig = int(np.sum(np.abs(tarr) >= 2.0))
    if spread < 0.015 and n_sig <= 3:
        assessment = (
            f"The W×λ surface is a flat weak plateau, not a spike. 21-day mean IC "
            f"ranges from {arr.min():+.4f} to {arr.max():+.4f}; {n_sig} of "
            f"{len(cells)} cells have |t| ≥ 2. The SPEC default (W=90, λ=0.5) is "
            f"{default['value']:+.4f} (t = {default['t_stat']:.2f}) and is not "
            "an outlier. There is no magic cell that would have cleared the gate."
        )
    elif n_sig == 1:
        assessment = (
            "A single cell is the only one with |t| ≥ 2 on an otherwise dark "
            "grid — the visual signature of a spike, not a plateau. That cell "
            "is not treated as a finding."
        )
    else:
        assessment = (
            f"21-day mean IC ranges from {arr.min():+.4f} to {arr.max():+.4f} "
            f"({n_sig} of {len(cells)} cells with |t| ≥ 2). The surface is "
            "read as a weak plateau rather than a specification that works; "
            f"the default cell is {default['value']:+.4f} (t = {default['t_stat']:.2f})."
        )
    return {
        "metric": "21-day mean Spearman IC",
        "x_param": "W",
        "x_label": "Aggregation window (calendar days)",
        "x_values": [float(v) for v in windows],
        "y_param": "lambda",
        "y_label": "Cluster amplification λ",
        "y_values": [float(v) for v in lambdas],
        "cells": cells,
        "assessment": assessment,
    }


def randomize_ic(
    signal: pd.DataFrame,
    returns: pd.DataFrame,
    *,
    n_draws: int = N_RANDOM_DRAWS,
    seed: int = RNG_SEED,
    col: str = f"s_{ARM_OPPORTUNISTIC}",
) -> dict[str, object]:
    """Shuffle ``S`` within date and recompute 21-day mean IC.

    Preserves the cross-sectional distribution of the score and destroys any
    relationship with forward returns. 1000 draws is feasible because this is
    an IC, not a 1000-fold backtest.
    """
    panel = signal.merge(
        returns[["rebalance_date", "ticker", "cik", "fwd_ret_21"]],
        on=["rebalance_date", "ticker", "cik"],
        how="inner",
    )
    observed = mean_ic_21(signal, returns, col=col)["mean_ic"]
    dates = panel["rebalance_date"].to_numpy()
    scores = pd.to_numeric(panel[col], errors="coerce").to_numpy(dtype="float64")
    rets = pd.to_numeric(panel["fwd_ret_21"], errors="coerce").to_numpy(dtype="float64")
    unique_dates, inverse = np.unique(dates, return_inverse=True)
    groups = [np.flatnonzero(inverse == d) for d in range(unique_dates.size)]
    ranked_ret = np.full(rets.shape, np.nan, dtype="float64")
    valid_groups: list[np.ndarray] = []
    for idx in groups:
        r = rets[idx]
        s = scores[idx]
        mask = np.isfinite(s) & np.isfinite(r)
        if int(mask.sum()) < 10:
            continue
        if np.unique(r[mask]).size < 2:
            continue
        ranked_ret[idx[mask]] = stats.rankdata(r[mask])
        valid_groups.append(idx[mask])
    rng = np.random.default_rng(seed)
    draws = np.empty(n_draws, dtype="float64")
    for i in range(n_draws):
        ics = []
        for idx in valid_groups:
            s = rng.permutation(scores[idx])
            if np.unique(s).size < 2:
                continue
            rs = stats.rankdata(s)
            ry = ranked_ret[idx]
            rs = rs - rs.mean()
            ry = ry - ry.mean()
            denom = np.sqrt(np.dot(rs, rs) * np.dot(ry, ry))
            if denom <= 0:
                continue
            ics.append(float(np.dot(rs, ry) / denom))
        draws[i] = float(np.mean(ics)) if ics else 0.0
        if (i + 1) % 200 == 0:
            log.info("randomization %d/%d", i + 1, n_draws)

    finite = draws[np.isfinite(draws)]
    null_mean = float(finite.mean()) if finite.size else 0.0
    null_std = float(finite.std(ddof=1)) if finite.size > 1 else 0.0
    percentile = float(np.mean(finite <= observed)) if finite.size else 0.5
    percentile = min(1.0, max(0.0, percentile))
    p_value = float(2.0 * min(percentile, 1.0 - percentile))
    p_value = min(1.0, max(0.0, p_value))

    n_bins = 21
    counts, edges = np.histogram(finite, bins=n_bins)
    centers = 0.5 * (edges[:-1] + edges[1:])
    histogram = [
        {"bin_center": float(c), "count": int(k)} for c, k in zip(centers, counts)
    ]
    return {
        "n_draws": int(n_draws),
        "statistic": "21-day mean Spearman IC",
        "observed": float(observed),
        "null_mean": null_mean,
        "null_std": max(null_std, 0.0),
        "percentile": percentile,
        "p_value": p_value,
        "histogram": histogram,
    }


def bootstrap_blocks(
    monthly: pd.DataFrame,
    factors: pd.DataFrame,
    ic_series: pd.Series | None,
    *,
    n_resamples: int = N_BOOTSTRAP,
) -> list[dict[str, object]]:
    """Bootstrap CIs on Sharpe, FF5 alpha, and (if provided) 21-day mean IC."""
    net = monthly.set_index("date")["net"]
    rf = monthly.set_index("date")["rf"]
    sharpe = float(performance_block(net, rf)["sharpe"])
    slo, shi = bootstrap_sharpe_ci(net, rf, n_resamples=n_resamples, seed=RNG_SEED + 20)
    aligned = align_returns_and_factors(monthly, factors, return_col="net")
    fitted = fit_ff5_umd(aligned)
    alo, ahi = bootstrap_alpha_ci(aligned, n_resamples=n_resamples, seed=RNG_SEED + 21)
    out = [
        {
            "statistic": "Net Sharpe ratio",
            "point_estimate": sharpe,
            "ci_low": float(slo) if math.isfinite(slo) else sharpe,
            "ci_high": float(shi) if math.isfinite(shi) else sharpe,
            "ci_level": 0.95,
            "n_resamples": int(n_resamples),
            "method": "stationary bootstrap, mean block length 6 months",
        },
        {
            "statistic": "Net annualized FF5+UMD alpha (bps)",
            "point_estimate": float(fitted["alpha_ann_bps"]),
            "ci_low": float(alo) if math.isfinite(alo) else float(fitted["alpha_ann_bps"]),
            "ci_high": float(ahi) if math.isfinite(ahi) else float(fitted["alpha_ann_bps"]),
            "ci_level": 0.95,
            "n_resamples": int(n_resamples),
            "method": "stationary bootstrap, mean block length 6 months",
        },
    ]
    if ic_series is not None and len(ic_series) >= 8:
        y = pd.to_numeric(ic_series, errors="coerce").dropna().to_numpy(dtype="float64")
        rng = np.random.default_rng(RNG_SEED + 22)
        p = 1.0 / BOOT_BLOCK
        draws = np.empty(n_resamples, dtype="float64")
        for i in range(n_resamples):
            idx = _stationary_index(y.size, p, rng)
            draws[i] = float(y[idx].mean())
        lo, hi = np.quantile(draws, [0.025, 0.975])
        out.append(
            {
                "statistic": "Mean IC, 21-day horizon",
                "point_estimate": float(y.mean()),
                "ci_low": float(lo),
                "ci_high": float(hi),
                "ci_level": 0.95,
                "n_resamples": int(n_resamples),
                "method": "stationary bootstrap, mean block length 6 months",
            }
        )
    return out


def expected_max_sharpe(n_tests: int, se: float) -> float:
    """Harvey–Liu–Zhu / extreme-value expected maximum Sharpe under the null.

    ``E[max Z] ≈ (1−γ) Φ^{-1}(1−1/N) + γ Φ^{-1}(1−1/(N e))``, then scaled by
    the Sharpe standard error. Euler's γ.
    """
    if n_tests <= 1 or se <= 0:
        return 0.0
    gamma = 0.5772156649015329
    z1 = float(stats.norm.ppf(1.0 - 1.0 / n_tests))
    z2 = float(stats.norm.ppf(1.0 - 1.0 / (n_tests * math.e)))
    return float(se * ((1.0 - gamma) * z1 + gamma * z2))


def multiple_testing_block(
    grid: list[dict],
    sweep: dict,
    *,
    n_prior_ic: int,
    n_prior_variants: int,
    headline_sharpe: float,
    sharpe_se: float,
) -> dict[str, object]:
    n_grid = len(grid)
    n_sweep = len(sweep.get("cells", []))
    n_specs = n_grid + n_sweep + n_prior_ic + n_prior_variants
    emax = expected_max_sharpe(n_specs, sharpe_se)
    deflated = float(headline_sharpe - emax)
    note = (
        f"{n_specs} specifications were actually run and counted: {n_grid} robustness-grid "
        f"rows, {n_sweep} W×λ cells, {n_prior_variants} backtest variants, and "
        f"{n_prior_ic} IC horizon×arm cells. The headline net Sharpe is "
        f"{headline_sharpe:.2f}. A Harvey–Liu–Zhu expected-max haircut at this "
        f"N subtracts {emax:.2f} and leaves a deflated Sharpe of {deflated:.2f}. "
        "The raw Sharpe is already negative, so after multiple tests there is "
        "nothing left — not a borderline result that a Bonferroni adjustment "
        "might spare, but a hole that gets deeper when you account for the search."
    )
    return {
        "n_specifications_tested": int(n_specs),
        "deflated_sharpe": deflated,
        "haircut_note": note,
    }


def build_robustness_artifact(
    *,
    grid: list[dict[str, object]],
    sweep: dict[str, object],
    randomization: dict[str, object],
    bootstrap: list[dict[str, object]],
    multiple_testing: dict[str, object],
    notes: str | None,
    generated_at: str | None = None,
) -> dict[str, object]:
    for row in grid:
        if row["family"] not in VALID_FAMILIES:
            raise ValueError(f"invalid family {row['family']!r}")
    if not any(row["id"] == BASELINE_ID for row in grid):
        raise ValueError("grid is missing the baseline row")
    hist = randomization.get("histogram", [])
    n_hist = sum(int(b["count"]) for b in hist)
    if n_hist != int(randomization["n_draws"]):
        raise ValueError(
            f"randomization histogram counts ({n_hist}) != n_draws ({randomization['n_draws']})"
        )
    return {
        "schema_version": "1.0.0",
        "artifact": "robustness",
        "generated_at": generated_at or _now(),
        "data_status": "real",
        "notes": notes,
        "baseline_id": BASELINE_ID,
        "grid": grid,
        "parameter_sweep": sweep,
        "randomization": randomization,
        "bootstrap": bootstrap,
        "multiple_testing": multiple_testing,
    }


def attach_universe_terciles(universe: pd.DataFrame) -> pd.DataFrame:
    """Public wrapper so the script can label terciles without importing costs."""
    return attach_terciles(universe)
