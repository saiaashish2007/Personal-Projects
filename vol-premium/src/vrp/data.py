"""Download and cache the daily market panel.

Every source is free and needs no API key:
  - S&P 500 OHLC from Yahoo Finance (^GSPC)
  - VIX, VIX9D, VIX3M and VVIX closes from Cboe's published history files
  - The 3-month T-bill rate (DTB3) from FRED
"""

from __future__ import annotations

import io
from collections.abc import Callable
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"

CBOE_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/{}_History.csv"
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3"
VOL_INDICES = ("VIX", "VIX9D", "VIX3M", "VVIX")
START = "1990-01-01"


def _get(url: str) -> str:
    # FRED stalls requests that do not look like a browser or curl.
    resp = requests.get(url, timeout=60, headers={"User-Agent": "curl/8.7.1", "Accept": "*/*"})
    resp.raise_for_status()
    return resp.text


def fetch_spx() -> pd.DataFrame:
    import yfinance as yf

    df = yf.download("^GSPC", start=START, auto_adjust=False, progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.rename(columns=str.lower)[["open", "high", "low", "close"]]
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    df.index.name = "date"
    return df


def fetch_cboe(symbol: str) -> pd.Series:
    df = pd.read_csv(io.StringIO(_get(CBOE_URL.format(symbol))))
    df.columns = [c.strip().upper() for c in df.columns]
    dates = pd.to_datetime(df["DATE"], format="%m/%d/%Y")
    close = df["CLOSE"] if "CLOSE" in df.columns else df[df.columns[-1]]
    return pd.Series(close.to_numpy(float), index=dates, name=symbol.lower())


def fetch_rate() -> pd.Series:
    df = pd.read_csv(io.StringIO(_get(FRED_URL)))
    dates = pd.to_datetime(df.iloc[:, 0])
    rate = pd.to_numeric(df.iloc[:, 1], errors="coerce") / 100.0
    return pd.Series(rate.to_numpy(), index=dates, name="rate")


def _cached(
    name: str, fetch: Callable[[], pd.DataFrame | pd.Series], refresh: bool
) -> pd.DataFrame:
    path = RAW / f"{name}.csv"
    if refresh or not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        obj = fetch()
        frame = obj.to_frame() if isinstance(obj, pd.Series) else obj
        frame.index.name = "date"
        frame.to_csv(path)
    return pd.read_csv(path, index_col="date", parse_dates=["date"])


def load_panel(refresh: bool = False) -> pd.DataFrame:
    """One row per S&P 500 trading day.

    Volatility indices are aligned to S&P trading days and forward-filled by at most one
    day, which only bridges the occasional holiday mismatch between Cboe and NYSE files.
    VIX9D, VIX3M and VVIX start later than 1990 and stay NaN before their first print.
    """
    panel = _cached("spx", fetch_spx, refresh)
    for sym in VOL_INDICES:
        s = _cached(sym.lower(), lambda sym=sym: fetch_cboe(sym), refresh).iloc[:, 0]
        panel[sym.lower()] = s.reindex(panel.index).ffill(limit=1)
    rate = _cached("dtb3", fetch_rate, refresh).iloc[:, 0]
    panel["rate"] = rate.reindex(panel.index.union(rate.index)).ffill().reindex(panel.index)

    panel = panel.dropna(subset=["open", "high", "low", "close", "vix", "rate"])
    panel = panel[panel.index >= START]
    bad = (panel["high"] < panel[["open", "close"]].max(axis=1) - 1e-6) | (
        panel["low"] > panel[["open", "close"]].min(axis=1) + 1e-6
    )
    if bad.any():
        raise ValueError(
            f"{int(bad.sum())} S&P rows have inconsistent OHLC, e.g. {panel.index[bad][0]}"
        )
    return panel
