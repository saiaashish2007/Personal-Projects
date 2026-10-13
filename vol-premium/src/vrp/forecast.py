"""Walk-forward forecasts of 21-day realized volatility.

Models are refit every quarter on an expanding window. A training row dated s has a
target built from returns s+1 .. s+21, so it is only usable once that window has closed:
rows are purged unless s + 21 + embargo falls before the first day being forecast.

Every forecast is sqrt(E[realized variance]), the quantity VIX itself represents, so
forecasts, VIX and the straddle's implied vol are all directly comparable.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pandas as pd
import xgboost as xgb

from vrp.features import FEATURES, HAR, HARX, HORIZON

REFIT_EVERY = 63
EMBARGO = 5
MIN_TRAIN = 252 * 8
HOLDOUT = 0.15

XGB_MAX_ROUNDS = 1000
XGB_PATIENCE = 100
XGB_PARAMS = dict(
    max_depth=2,
    eta=0.03,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=1.0,
    reg_lambda=5.0,
    tree_method="hist",
    disable_default_eval_metric=1,
    nthread=4,
)

Forecaster = Callable[[pd.DataFrame], np.ndarray]


def split_holdout(train: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Early part for fitting, last HOLDOUT share for validation, purged in between."""
    cut = int(len(train) * (1 - HOLDOUT))
    return train.iloc[: cut - HORIZON - EMBARGO], train.iloc[cut:]


def _ols(cols: list[str], train: pd.DataFrame) -> Callable[[pd.DataFrame], np.ndarray]:
    X = np.column_stack([np.ones(len(train)), train[cols].to_numpy()])
    beta, *_ = np.linalg.lstsq(X, train["y"].to_numpy(), rcond=None)
    return lambda df: np.column_stack([np.ones(len(df)), df[cols].to_numpy()]) @ beta


def log_var_margin(cols: list[str], train: pd.DataFrame) -> Callable[[pd.DataFrame], np.ndarray]:
    """log E[RV^2] from an OLS model of log RV.

    If log RV ~ N(mu, s^2) then E[RV^2] = exp(2 mu + 2 s^2). The in-sample residual
    variance understates s^2 out of sample, so s^2 is measured on the purged holdout.
    """
    early, hold = split_holdout(train)
    s2 = float(np.var(hold["y"].to_numpy() - _ols(cols, early)(hold)))
    mu = _ols(cols, train)
    return lambda df: 2 * mu(df) + 2 * s2


def fit_ols(cols: list[str]) -> Callable[[pd.DataFrame], Forecaster]:
    def fit(train: pd.DataFrame) -> Forecaster:
        margin = log_var_margin(cols, train)
        return lambda df: np.exp(0.5 * margin(df))

    return fit


def _qlike_objective(pred: np.ndarray, d: xgb.DMatrix) -> tuple[np.ndarray, np.ndarray]:
    ratio = d.get_label() * np.exp(-pred)
    return 1 - ratio, np.maximum(ratio, 1e-2)


def _qlike_metric(pred: np.ndarray, d: xgb.DMatrix) -> tuple[str, float]:
    ratio = d.get_label() * np.exp(-pred)
    return "qlike", float(np.mean(ratio - np.log(ratio) - 1))


def _dmatrix(df: pd.DataFrame, margin: np.ndarray, label: bool = True) -> xgb.DMatrix:
    y = df["rv_fwd"].to_numpy() ** 2 if label else None
    return xgb.DMatrix(df[FEATURES], label=y, base_margin=margin)


def fit_xgb(train: pd.DataFrame, seed: int = 0) -> Forecaster:
    """Gradient-boosted corrections to HAR-X, trained on the QLIKE loss itself.

    Trees start from HAR-X's log-variance forecast as a base margin and can only move
    it, so forecasts stay anchored in regimes the trees never saw. The number of trees
    is chosen by early stopping on the purged holdout, then refit on the full window;
    if the holdout finds nothing to learn, the model collapses back to HAR-X.
    """
    early, hold = split_holdout(train)
    m_early = log_var_margin(HARX, early)
    probe = xgb.train(
        {**XGB_PARAMS, "seed": seed},
        _dmatrix(early, m_early(early)),
        XGB_MAX_ROUNDS,
        evals=[(_dmatrix(hold, m_early(hold)), "holdout")],
        obj=_qlike_objective,
        custom_metric=_qlike_metric,
        early_stopping_rounds=XGB_PATIENCE,
        verbose_eval=False,
    )
    rounds = probe.best_iteration + 1

    margin = log_var_margin(HARX, train)
    booster = xgb.train(
        {**XGB_PARAMS, "seed": seed},
        _dmatrix(train, margin(train)),
        rounds,
        obj=_qlike_objective,
    )

    def predict(df: pd.DataFrame) -> np.ndarray:
        out = booster.predict(_dmatrix(df, margin(df), label=False), output_margin=True)
        return np.exp(0.5 * out)

    predict.booster = booster  # type: ignore[attr-defined]
    predict.rounds = rounds  # type: ignore[attr-defined]
    predict.margin = margin  # type: ignore[attr-defined]
    return predict


MODELS: dict[str, Callable[[pd.DataFrame], Forecaster]] = {
    "har": fit_ols(HAR),
    "harx": fit_ols(HARX),
    "xgb": fit_xgb,
}


def refit_points(n: int) -> list[int]:
    return list(range(MIN_TRAIN, n, REFIT_EVERY))


def train_rows(start: int) -> slice:
    """Rows whose targets are fully observed, with an embargo, before row `start`."""
    return slice(0, max(start - HORIZON - EMBARGO, 0))


def walk_forward(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Out-of-sample vol forecasts (vol points) for every row after MIN_TRAIN."""
    n = len(df)
    preds = {m: np.full(n, np.nan) for m in MODELS}
    rounds = []
    last = None
    for start in refit_points(n):
        end = min(start + REFIT_EVERY, n)
        train = df.iloc[train_rows(start)].dropna(subset=["y"])
        test = df.iloc[start:end]
        for name, fit in MODELS.items():
            f = fit(train)
            preds[name][start:end] = f(test)
            if name == "xgb":
                rounds.append(f.rounds)  # type: ignore[attr-defined]
                last = f

    first = refit_points(n)[0]
    out = pd.DataFrame({f"fc_{m}": p for m, p in preds.items()}, index=df.index).iloc[first:]
    info = {
        "importance": importance(last, df.iloc[first:]),
        "rounds": {
            "median": float(np.median(rounds)),
            "max": int(np.max(rounds)),
            "zero_share": float(np.mean(np.array(rounds) <= 1)),
            "history": [
                {"d": df.index[s].strftime("%Y-%m-%d"), "rounds": int(r)}
                for s, r in zip(refit_points(n), rounds, strict=False)
            ],
        },
    }
    return out, info


def importance(predict: Forecaster, df: pd.DataFrame) -> dict[str, float]:
    """Mean |SHAP contribution| per feature to the trees' correction of HAR-X."""
    booster = predict.booster  # type: ignore[attr-defined]
    d = _dmatrix(df, predict.margin(df), label=False)  # type: ignore[attr-defined]
    contribs = booster.predict(d, pred_contribs=True)[:, :-1]
    scores = np.abs(contribs).mean(axis=0)
    return {
        f: float(s) for f, s in sorted(zip(FEATURES, scores, strict=False), key=lambda t: -t[1])
    }


def qlike(realized_vol: np.ndarray, forecast_vol: np.ndarray) -> np.ndarray:
    ratio = (realized_vol / forecast_vol) ** 2
    return ratio - np.log(ratio) - 1.0


def newey_west_t(d: np.ndarray, lags: int) -> float:
    """t-statistic of mean(d) with a Bartlett-kernel HAC variance."""
    n = len(d)
    e = d - d.mean()
    var = e @ e / n
    for k in range(1, lags + 1):
        var += 2 * (1 - k / (lags + 1)) * (e[k:] @ e[:-k]) / n
    return float(d.mean() / np.sqrt(var / n))


def evaluate(fc: pd.DataFrame, realized: pd.Series, vix: pd.Series) -> list[dict]:
    """Accuracy of each model, and Diebold-Mariano tests against both baselines.

    VIX is included as a forecast in its own right; it is biased upward by the very
    premium this project trades. A negative DM statistic means lower QLIKE loss than
    the baseline. Forecast windows overlap by 20 days, so the HAC lag is HORIZON - 1.
    """
    mask = realized.notna()
    y = realized[mask].to_numpy()
    cols = {m: fc.loc[mask, f"fc_{m}"].to_numpy() for m in MODELS}
    cols["vix"] = vix[mask].to_numpy()
    losses = {m: qlike(y, f) for m, f in cols.items()}
    rows = []
    for m, f in cols.items():
        ly, lf = np.log(y), np.log(f)
        row = {
            "model": m,
            "rmse": float(np.sqrt(np.mean((y - f) ** 2))),
            "mae": float(np.mean(np.abs(y - f))),
            "bias": float(np.mean(f - y)),
            "r2_log": float(1 - np.sum((ly - lf) ** 2) / np.sum((ly - ly.mean()) ** 2)),
            "qlike": float(losses[m].mean()),
        }
        for base in ("har", "harx"):
            if base != m:
                row[f"dm_vs_{base}"] = newey_west_t(losses[m] - losses[base], HORIZON - 1)
        rows.append(row)
    return rows
