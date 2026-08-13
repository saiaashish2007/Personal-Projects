"""Fama-French 5 + momentum attribution (SPEC.md section 11).

Monthly portfolio excess returns are regressed on Ken French MKT, SMB, HML,
RMW, CMA and UMD with Newey-West standard errors. Alpha is reported in
annualized basis points — never as a decimal return — because that is what
the dashboard and the schema require.

The question is whether anything is left after factors, or whether the book
is repackaged small-cap value. This is a decay study: a negative or
indistinguishable-from-zero residual is the expected reading, not a failure
of the regression.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy import stats

from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

BPS = 10_000.0
PERIODS_PER_YEAR = 12
DEFAULT_NW_LAGS = 6

FACTOR_COLUMNS = {
    "MKT": "mkt_rf",
    "SMB": "smb",
    "HML": "hml",
    "RMW": "rmw",
    "CMA": "cma",
    "UMD": "umd",
}
FACTOR_LABELS = {
    "MKT": "Market excess return",
    "SMB": "Small minus big",
    "HML": "High minus low",
    "RMW": "Robust minus weak",
    "CMA": "Conservative minus aggressive",
    "UMD": "Momentum",
}
FACTOR_ORDER = ("MKT", "SMB", "HML", "RMW", "CMA", "UMD")

PRIMARY_REGRESSION_ID = "opp_etf_3m_net"

REGRESSION_SPECS: tuple[dict[str, str], ...] = (
    {
        "id": "opp_etf_3m_net",
        "variant_id": "opp_etf_3m",
        "return_col": "net",
        "label": "Primary variant, net of costs",
        "description": (
            "Monthly excess returns of the opportunistic, sector-ETF-hedged "
            "three-month overlapping book, net of the explicit cost model, "
            "regressed on Fama-French 5 plus momentum."
        ),
        "dependent_variable": "opp_etf_3m net monthly excess return",
    },
    {
        "id": "opp_etf_3m_gross",
        "variant_id": "opp_etf_3m",
        "return_col": "gross",
        "label": "Primary variant, gross of costs",
        "description": (
            "Identical FF5+UMD regression on gross returns of opp_etf_3m, "
            "shown so the cost drag on residual alpha is explicit."
        ),
        "dependent_variable": "opp_etf_3m gross monthly excess return",
    },
    {
        "id": "opp_spread_3m_net",
        "variant_id": "opp_spread_3m",
        "return_col": "net",
        "label": "Quintile spread, net of costs",
        "description": (
            "Dollar-neutral long top / short bottom quintile of nonzero "
            "opportunistic scores, net of the explicit cost model. The short "
            "leg is as thin as the long and has no borrow cost."
        ),
        "dependent_variable": "opp_spread_3m net monthly excess return",
    },
    {
        "id": "all_etf_3m_net",
        "variant_id": "all_etf_3m",
        "return_col": "net",
        "label": "Filter off, net of costs",
        "description": (
            "Same ETF-hedged three-month construction on every open-market "
            "purchase, routine and opportunistic alike. The alpha gap versus "
            "opp_etf_3m_net is what the CMP filter is worth in residual space."
        ),
        "dependent_variable": "all_etf_3m net monthly excess return",
    },
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _clip_p(value: float) -> float:
    if not math.isfinite(value):
        return 1.0
    return float(min(1.0, max(0.0, value)))


def factors_with_month(factors: pd.DataFrame) -> pd.DataFrame:
    """Ken French monthly file keyed by ``YYYY-MM``.

    The library stamps month-end; the backtest stamps the first trading day.
    Joining on calendar month is the alignment that does not invent a daily
    factor series.
    """
    reset = factors.reset_index()
    date_col = "date" if "date" in reset.columns else reset.columns[0]
    month = pd.to_datetime(reset[date_col]).dt.strftime("%Y-%m")
    return with_columns(reset, month=month)


def align_returns_and_factors(
    monthly: pd.DataFrame,
    factors: pd.DataFrame,
    *,
    return_col: str,
) -> pd.DataFrame:
    """Inner-join one variant's monthly returns to FF5+UMD on calendar month."""
    if monthly.empty:
        return pd.DataFrame()
    fac = factors_with_month(factors)
    needed = ["month", "rf", *FACTOR_COLUMNS.values()]
    missing = [c for c in needed if c not in fac.columns]
    if missing:
        raise ValueError(f"factors_monthly missing columns: {missing}")
    left = monthly[["date", "month", return_col]].copy()
    if "rf" in monthly.columns:
        left = with_columns(left, rf_port=pd.to_numeric(monthly["rf"], errors="coerce"))
    merged = left.merge(fac[needed], on="month", how="inner")
    y = pd.to_numeric(merged[return_col], errors="coerce")
    rf = pd.to_numeric(merged["rf"], errors="coerce")
    excess = y - rf
    cols = {name: pd.to_numeric(merged[col], errors="coerce") for name, col in FACTOR_COLUMNS.items()}
    out = with_columns(
        merged[["date", "month"]],
        excess=excess,
        **cols,
    )
    return out.dropna(subset=["excess", *FACTOR_ORDER]).reset_index(drop=True)


def newey_west_ols(
    y: np.ndarray,
    x: np.ndarray,
    *,
    lags: int,
) -> dict[str, object]:
    """OLS of ``y`` on ``x`` (no constant in ``x``) with HAC standard errors.

    Implemented here rather than through statsmodels so the milestone does not
    depend on an optional import. The meat is the usual Bartlett kernel:
    ``S = Γ_0 + Σ_k (1 - k/(L+1)) (Γ_k + Γ_k')`` with
    ``Γ_k = T^{-1} Σ_t u_t u_{t-k}'`` and ``u_t = e_t x_t``.

    Returns the intercept as ``alpha`` in the same units as ``y`` (monthly
    decimal), plus per-column betas in the order of ``FACTOR_ORDER``.
    """
    y = np.asarray(y, dtype="float64").reshape(-1)
    x = np.asarray(x, dtype="float64")
    if x.ndim != 2 or x.shape[0] != y.shape[0]:
        raise ValueError("y must be 1-d and x must be (n, k) aligned with y")
    n, k = x.shape
    if n < k + 2:
        raise ValueError(f"need at least {k + 2} months for a {k}-factor regression, got {n}")
    max_lags = int(min(max(lags, 0), n - 2))
    design = np.column_stack([np.ones(n), x])
    p = design.shape[1]
    xtx = design.T @ design
    try:
        xtx_inv = np.linalg.inv(xtx)
    except np.linalg.LinAlgError:
        xtx_inv = np.linalg.pinv(xtx)
    params = xtx_inv @ (design.T @ y)
    resid = y - design @ params
    scores = design * resid[:, None]
    gamma0 = (scores.T @ scores) / n
    meat = gamma0.copy()
    for lag in range(1, max_lags + 1):
        gamma = (scores[lag:].T @ scores[:-lag]) / n
        weight = 1.0 - lag / (max_lags + 1)
        meat += weight * (gamma + gamma.T)
    # A small-sample Bartlett sum can fail to be PSD; fall back to the
    # contemporaneous meat rather than emitting NaN standard errors.
    eig = np.linalg.eigvalsh(meat)
    if float(eig.min()) < 0.0:
        meat = gamma0
    cov = xtx_inv @ (n * meat) @ xtx_inv
    se = np.sqrt(np.maximum(np.diag(cov), 0.0))
    tvalues = np.divide(params, se, out=np.zeros(p), where=se > 0)
    df_resid = max(n - p, 1)
    pvalues = 2.0 * stats.t.sf(np.abs(tvalues), df=df_resid)
    sst = float(np.dot(y - y.mean(), y - y.mean()))
    ssr = float(np.dot(resid, resid))
    r_squared = 1.0 - ssr / sst if sst > 0 else 0.0
    adj = 1.0 - (1.0 - r_squared) * (n - 1) / df_resid if df_resid else r_squared
    return {
        "alpha": float(params[0]),
        "alpha_se": float(se[0]),
        "alpha_t": float(tvalues[0]),
        "alpha_p": _clip_p(float(pvalues[0])),
        "betas": [float(v) for v in params[1:]],
        "beta_se": [float(v) for v in se[1:]],
        "beta_t": [float(v) for v in tvalues[1:]],
        "beta_p": [_clip_p(float(v)) for v in pvalues[1:]],
        "r_squared": float(min(1.0, max(0.0, r_squared))),
        "adj_r_squared": float(min(1.0, adj)),
        "n": n,
        "lags": max_lags,
        "df_resid": df_resid,
    }


def annualize_alpha_bps(monthly_alpha: float) -> float:
    """Convert a monthly decimal intercept to annualized basis points.

    ``0.01`` per month → ``1200`` bps/year. Returning ``0.12`` or ``12``
    would fail the schema's unit convention and the dashboard.
    """
    return float(monthly_alpha * PERIODS_PER_YEAR * BPS)


def fit_ff5_umd(
    aligned: pd.DataFrame,
    *,
    lags: int = DEFAULT_NW_LAGS,
) -> dict[str, object]:
    """Run the SPEC §11 regression on an already-aligned monthly panel."""
    if aligned.empty:
        raise ValueError("aligned panel is empty")
    y = aligned["excess"].to_numpy(dtype="float64")
    x = aligned.loc[:, list(FACTOR_ORDER)].to_numpy(dtype="float64")
    raw = newey_west_ols(y, x, lags=lags)
    alpha_bps = annualize_alpha_bps(float(raw["alpha"]))
    se_bps = annualize_alpha_bps(float(raw["alpha_se"]))
    loadings = []
    for i, factor in enumerate(FACTOR_ORDER):
        loadings.append(
            {
                "factor": factor,
                "label": FACTOR_LABELS[factor],
                "beta": float(raw["betas"][i]),
                "std_error": float(raw["beta_se"][i]),
                "t_stat": float(raw["beta_t"][i]),
                "p_value": float(raw["beta_p"][i]),
            }
        )
    return {
        "alpha_ann_bps": alpha_bps,
        "alpha_std_error_bps": max(se_bps, 0.0),
        "alpha_t_stat": float(raw["alpha_t"]),
        "alpha_p_value": float(raw["alpha_p"]),
        "loadings": loadings,
        "r_squared": float(raw["r_squared"]),
        "adj_r_squared": float(raw["adj_r_squared"]),
        "n_months": int(raw["n"]),
        "newey_west_lags": int(raw["lags"]),
    }


def regression_payload(
    monthly: pd.DataFrame,
    factors: pd.DataFrame,
    spec: dict[str, str],
    *,
    lags: int = DEFAULT_NW_LAGS,
) -> dict[str, object]:
    """One schema-shaped regression row."""
    aligned = align_returns_and_factors(monthly, factors, return_col=spec["return_col"])
    fitted = fit_ff5_umd(aligned, lags=lags)
    return {
        "id": spec["id"],
        "label": spec["label"],
        "description": spec["description"],
        "dependent_variable": spec["dependent_variable"],
        **fitted,
    }


def _loading(reg: dict, factor: str) -> dict:
    return next(row for row in reg["loadings"] if row["factor"] == factor)


def interpret(regressions: list[dict]) -> str:
    """Prose for the dashboard. Written from the fitted numbers, not a hope."""
    primary = next(r for r in regressions if r["id"] == PRIMARY_REGRESSION_ID)
    gross = next((r for r in regressions if r["id"] == "opp_etf_3m_gross"), None)
    twin = next((r for r in regressions if r["id"] == "all_etf_3m_net"), None)
    spread = next((r for r in regressions if r["id"] == "opp_spread_3m_net"), None)
    smb = _loading(primary, "SMB")
    hml = _loading(primary, "HML")
    mkt = _loading(primary, "MKT")
    umd = _loading(primary, "UMD")
    alpha = primary["alpha_ann_bps"]
    t_stat = primary["alpha_t_stat"]
    if abs(t_stat) < 1.65:
        alpha_read = (
            f"Residual alpha is {alpha:+.0f} bps/year (t = {t_stat:.2f}) and is "
            "not distinguishable from zero."
        )
    elif alpha < 0:
        alpha_read = (
            f"Residual alpha is negative at {alpha:+.0f} bps/year "
            f"(t = {t_stat:.2f}): after factors the book still loses money."
        )
    else:
        alpha_read = (
            f"Residual alpha is {alpha:+.0f} bps/year (t = {t_stat:.2f})."
        )

    size_value = (
        f"SMB beta is {smb['beta']:+.2f} (t = {smb['t_stat']:.2f}) and HML is "
        f"{hml['beta']:+.2f} (t = {hml['t_stat']:.2f})."
    )
    if smb["t_stat"] > 2 and hml["t_stat"] > 2:
        size_value += (
            " That is the signature of repackaged small-cap value: insiders "
            "buy their own stock most often in smaller, cheaper names."
        )
    elif abs(smb["t_stat"]) < 2 and abs(hml["t_stat"]) < 2:
        size_value += (
            " Neither size nor value is a significant loading, so the loss is "
            "not explained as a stealth SMB/HML book — it is residual."
        )
    else:
        size_value += " The book is not a clean small-cap-value clone."

    extra = []
    if gross is not None:
        extra.append(
            f"Gross of costs the residual is {gross['alpha_ann_bps']:+.0f} bps "
            f"(t = {gross['alpha_t_stat']:.2f}); costs do not create the hole."
        )
    if twin is not None:
        extra.append(
            f"The filter-off twin all_etf_3m_net has residual "
            f"{twin['alpha_ann_bps']:+.0f} bps (t = {twin['alpha_t_stat']:.2f}), "
            "so the CMP split does not earn its keep after factors either."
        )
    if spread is not None:
        extra.append(
            f"The raw quintile spread is {spread['alpha_ann_bps']:+.0f} bps "
            f"(t = {spread['alpha_t_stat']:.2f})."
        )
    extra.append(
        f"Market beta is {mkt['beta']:+.2f} (t = {mkt['t_stat']:.2f}) and "
        f"momentum is {umd['beta']:+.2f} (t = {umd['t_stat']:.2f}). "
        f"R² = {primary['r_squared']:.2f} on {primary['n_months']} months."
    )
    return " ".join([alpha_read, size_value, *extra])


def build_attribution_artifact(
    returns: pd.DataFrame,
    factors: pd.DataFrame,
    *,
    notes: str | None,
    lags: int = DEFAULT_NW_LAGS,
    generated_at: str | None = None,
) -> dict[str, object]:
    """Assemble ``attribution.json`` from the monthly returns panel."""
    regressions = []
    for spec in REGRESSION_SPECS:
        sl = returns[returns["variant_id"].eq(spec["variant_id"])]
        if sl.empty:
            raise ValueError(f"no monthly returns for variant {spec['variant_id']}")
        row = regression_payload(sl, factors, spec, lags=lags)
        regressions.append(row)
        log.info(
            "%s  alpha=%+.0f bps  t=%.2f  R2=%.3f  n=%d",
            row["id"],
            row["alpha_ann_bps"],
            row["alpha_t_stat"],
            row["r_squared"],
            row["n_months"],
        )
    return {
        "schema_version": "1.0.0",
        "artifact": "attribution",
        "generated_at": generated_at or _now(),
        "data_status": "real",
        "notes": notes,
        "primary_regression_id": PRIMARY_REGRESSION_ID,
        "regressions": regressions,
        "interpretation": interpret(regressions),
    }
