"""Features known at the close of day t, and the 21-day forward realized-vol target.

All volatilities are annualized and expressed in vol points (20.0 means 20%), the same
units as VIX, so a forecast can be compared with VIX directly.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

HORIZON = 21
ANN = 252
LN2 = np.log(2.0)
VOL_FLOOR = 0.5

FEATURES = [
    "log_rv_d",
    "log_rv_w",
    "log_rv_m",
    "log_park_w",
    "log_park_m",
    "log_gk_m",
    "log_semi_m",
    "log_vix",
    "log_vix9d",
    "log_vix3m",
    "log_vvix",
    "vix_term",
    "vix_front",
    "vrp_trailing",
    "dvix_5",
    "ret_5",
    "ret_21",
    "drawdown",
]
HAR = ["log_rv_d", "log_rv_w", "log_rv_m"]
HARX = HAR + ["log_vix"]


def _ann_vol(daily_var: pd.Series, window: int) -> pd.Series:
    return np.sqrt(ANN * daily_var.rolling(window).mean()) * 100.0


def _log_vol(v: pd.Series) -> pd.Series:
    return np.log(v.clip(lower=VOL_FLOOR))


def build(panel: pd.DataFrame) -> pd.DataFrame:
    o, h, lo, c = (panel[k] for k in ("open", "high", "low", "close"))
    r = np.log(c / c.shift(1))
    r2 = r**2
    park = np.log(h / lo) ** 2 / (4 * LN2)
    gk = 0.5 * np.log(h / lo) ** 2 - (2 * LN2 - 1) * np.log(c / o) ** 2

    out = pd.DataFrame(index=panel.index)
    out["close"] = c
    out["ret"] = r
    out["vix"] = panel["vix"]
    out["rate"] = panel["rate"]

    rv_m = _ann_vol(r2, HORIZON)
    out["rv_trailing"] = rv_m
    out["log_rv_d"] = _log_vol(np.sqrt(ANN * park) * 100.0)
    out["log_rv_w"] = _log_vol(_ann_vol(r2, 5))
    out["log_rv_m"] = _log_vol(rv_m)
    out["log_park_w"] = _log_vol(_ann_vol(park, 5))
    out["log_park_m"] = _log_vol(_ann_vol(park, HORIZON))
    out["log_gk_m"] = _log_vol(_ann_vol(gk.clip(lower=0), HORIZON))
    out["log_semi_m"] = _log_vol(_ann_vol(r2.where(r < 0, 0.0), HORIZON))

    for k in ("vix", "vix9d", "vix3m", "vvix"):
        out[f"log_{k}"] = np.log(panel[k])
    out["vix_term"] = panel["vix3m"] / panel["vix"]
    out["vix_front"] = panel["vix9d"] / panel["vix"]
    out["vrp_trailing"] = panel["vix"] - rv_m
    out["dvix_5"] = panel["vix"] - panel["vix"].shift(5)
    out["ret_5"] = r.rolling(5).sum()
    out["ret_21"] = r.rolling(HORIZON).sum()
    out["drawdown"] = c / c.rolling(ANN, min_periods=60).max() - 1.0

    # Realized vol over days t+1 .. t+H: only known H days after the forecast date.
    out["rv_fwd"] = np.sqrt(ANN / HORIZON * r2.rolling(HORIZON).sum().shift(-HORIZON)) * 100.0
    out["y"] = _log_vol(out["rv_fwd"]).where(out["rv_fwd"].notna())

    return out.dropna(subset=HARX + ["ret_21", "drawdown"])
