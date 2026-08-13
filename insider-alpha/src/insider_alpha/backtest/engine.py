"""Monthly overlapping-portfolio engine and artifact builders (SPEC.md 9–10).

This is a decay study. Milestone 4 failed the pre-registered IC gate; the
equity curve exists to show how a faint ranking behaves as a portfolio after
costs, not to hunt for a Sharpe. Defaults are SPEC defaults. Ugly numbers
are the result.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

import insider_alpha.config  # noqa: F401  — copy-on-write
from insider_alpha.analysis.ic import newey_west_mean
from insider_alpha.backtest.costs import (
    BPS,
    DEFAULT_COST_MODEL,
    ETF_ADV,
    SWEEP_BPS,
    CostModel,
    apply_flat_cost,
    attach_terciles,
    interpolate_zero_crossing,
    monthly_explicit_cost,
)
from insider_alpha.backtest.portfolio import (
    HEDGE_ETF,
    HEDGE_SPREAD,
    SIC_TO_SPDR,
    combine_overlapping,
    one_sided_turnover,
    vintage_positions,
    weights_as_series,
)
from insider_alpha.signal.construct import ARM_ALL_INSIDERS, ARM_OPPORTUNISTIC
from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

PRIMARY_VARIANT_ID = "opp_etf_3m"
SPY = "SPY"
BETA_WINDOW = 60
BETA_MIN_OBS = 40
PERIODS_PER_YEAR = 12

VARIANT_SPECS: tuple[dict[str, object], ...] = (
    {
        "id": "opp_etf_3m",
        "label": "Opportunistic, sector-ETF hedge, 3-month hold",
        "description": (
            "Long the top quintile of names with a nonzero opportunistic score, "
            "weighted proportional to S with a 3% per-name cap (relaxed when the "
            "book is too thin to fill), hedged with a beta-scaled short of "
            "cap-weighted SIC-division portfolios standing in for SPDR sector ETFs. "
            "Three overlapping monthly vintages, Jegadeesh-Titman."
        ),
        "hedge": HEDGE_ETF,
        "holding_period_months": 3,
        "arm": ARM_OPPORTUNISTIC,
    },
    {
        "id": "opp_spread_3m",
        "label": "Opportunistic, quintile spread, 3-month hold",
        "description": (
            "Dollar-neutral long top quintile / short bottom quintile of names "
            "with a nonzero opportunistic score. The short leg is as thin as the "
            "long (median ~9 names) and no borrow cost is modelled — reported "
            "with those caveats, not as a tradable book."
        ),
        "hedge": HEDGE_SPREAD,
        "holding_period_months": 3,
        "arm": ARM_OPPORTUNISTIC,
    },
    {
        "id": "opp_etf_1m",
        "label": "Opportunistic, sector-ETF hedge, 1-month hold",
        "description": (
            "Same construction as the primary variant with a single-month holding "
            "period. Higher turnover, and the cost drag is correspondingly larger."
        ),
        "hedge": HEDGE_ETF,
        "holding_period_months": 1,
        "arm": ARM_OPPORTUNISTIC,
    },
    {
        "id": "all_etf_3m",
        "label": "All insiders, sector-ETF hedge, 3-month hold",
        "description": (
            "Identical ETF-hedged 3-month construction on the filter-off twin: "
            "every open-market purchase, routine and opportunistic alike. The "
            "delta versus opp_etf_3m is the CMP filter's contribution in "
            "portfolio space."
        ),
        "hedge": HEDGE_ETF,
        "holding_period_months": 3,
        "arm": ARM_ALL_INSIDERS,
    },
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _score_cols(arm: str) -> tuple[str, str]:
    return f"s_{arm}", f"raw_{arm}"


def snapshot_prices(
    prices: pd.DataFrame,
    dates: pd.DatetimeIndex,
    tickers: pd.Index | list[str] | set[str],
    *,
    value: str = "adj_close",
    ffill_limit: int = 7,
) -> pd.DataFrame:
    """``adj_close`` at each target date, last print carried at most a week."""
    wanted = set(tickers)
    frame = prices[prices["ticker"].isin(wanted)][["date", "ticker", value]]
    if frame.empty:
        return pd.DataFrame(index=pd.DatetimeIndex(dates), columns=pd.Index([]))
    wide = frame.pivot_table(index="date", columns="ticker", values=value, aggfunc="last")
    wide = wide.sort_index()
    target = pd.DatetimeIndex(dates)
    union = wide.index.union(target).sort_values()
    aligned = wide.reindex(union).ffill(limit=ffill_limit)
    return aligned.reindex(target)


def holding_returns(snap: pd.DataFrame) -> pd.DataFrame:
    """Return from date ``t`` to the next snapshot date, indexed by ``t``.

    The last snapshot row is the terminal mark and has no return. Names that
    stop printing are marked at the last carried close, so a delisting inside
    the month is a 0% subsequent return rather than a dropped observation.
    """
    if snap.empty or len(snap.index) < 2:
        return pd.DataFrame(index=snap.index[:0], columns=snap.columns)
    future = snap.shift(-1)
    base = snap.replace(0.0, np.nan)
    ret = future / base - 1.0
    return ret.iloc[:-1]


def trailing_betas(
    daily: pd.DataFrame,
    spy: pd.Series,
    dates: pd.DatetimeIndex,
    *,
    window: int = BETA_WINDOW,
    min_obs: int = BETA_MIN_OBS,
) -> pd.DataFrame:
    """Trailing OLS beta vs SPY at each date, using returns strictly before ``t``."""
    spy_col = spy.squeeze()
    if isinstance(spy_col, pd.DataFrame):
        spy_col = spy_col.iloc[:, 0]
    spy_r = spy_col.pct_change(fill_method=None)
    stock_r = daily.pct_change(fill_method=None)
    index = stock_r.index
    columns = stock_r.columns
    rows: list[np.ndarray] = []
    x_all = np.asarray(spy_r.to_numpy(), dtype="float64").reshape(-1)
    y_all = np.asarray(stock_r.to_numpy(), dtype="float64")
    if y_all.ndim == 1:
        y_all = y_all.reshape(-1, 1)
    n_names = y_all.shape[1]
    for date in dates:
        pos = int(index.searchsorted(pd.Timestamp(date), side="left"))
        lo = max(0, pos - window)
        hi = pos
        if hi - lo < min_obs:
            rows.append(np.ones(n_names, dtype="float64"))
            continue
        x = x_all[lo:hi]
        y = y_all[lo:hi]
        x_ok = np.isfinite(x)
        y_ok = np.isfinite(y) & x_ok[:, None]
        n_obs = y_ok.sum(axis=0)
        x_masked = np.where(y_ok, x[:, None], 0.0)
        y_masked = np.where(y_ok, y, 0.0)
        count = np.maximum(n_obs, 1)
        x_mean = x_masked.sum(axis=0) / count
        y_mean = y_masked.sum(axis=0) / count
        xd = np.where(y_ok, x_masked - x_mean, 0.0)
        yd = np.where(y_ok, y_masked - y_mean, 0.0)
        var = np.sum(xd * xd, axis=0)
        cov = np.sum(xd * yd, axis=0)
        betas = np.ones(n_names, dtype="float64")
        good = (n_obs >= min_obs) & (var > 0.0)
        betas[good] = cov[good] / var[good]
        rows.append(np.clip(betas, -3.0, 5.0))
    return pd.DataFrame(np.vstack(rows), index=pd.DatetimeIndex(dates), columns=columns)


def sector_holding_returns(
    universe: pd.DataFrame,
    stock_returns: pd.DataFrame,
) -> pd.DataFrame:
    """Cap-weighted SIC-division return from ``t`` to the next rebalance."""
    rows: list[dict[str, object]] = []
    dates = [d for d in stock_returns.index if d in set(universe["rebalance_date"])]
    uni_dates = {pd.Timestamp(d): g for d, g in universe.groupby("rebalance_date", sort=True)}
    for date in dates:
        key = pd.Timestamp(date)
        if key not in uni_dates:
            continue
        grp = uni_dates[key]
        if date not in stock_returns.index:
            continue
        r = stock_returns.loc[date]
        tickers = grp["ticker"].to_numpy()
        caps = pd.to_numeric(grp["market_cap"], errors="coerce").to_numpy(dtype="float64")
        sectors = grp["sic_division"].fillna("Unknown").astype(str).to_numpy()
        rets = pd.to_numeric(r.reindex(tickers), errors="coerce").to_numpy(dtype="float64")
        for sector in np.unique(sectors):
            mask = (sectors == sector) & np.isfinite(rets) & np.isfinite(caps) & (caps > 0)
            if not np.any(mask):
                continue
            rows.append(
                {
                    "rebalance_date": key,
                    "sic_division": sector,
                    "ret": float(np.average(rets[mask], weights=caps[mask])),
                }
            )
    if not rows:
        return pd.DataFrame(columns=["rebalance_date", "sic_division", "ret"])
    return pd.DataFrame(rows)


def _etf_hedge_weights(
    long_positions: pd.DataFrame,
    betas: pd.Series,
) -> pd.Series:
    """Beta-scaled sector-matched short, indexed by SIC division.

    Dollar sector match first (``h_s = Σ_{i in s} w_i``), then scale the whole
    hedge by the long book's weighted SPY-beta so the predicted market beta of
    the hedged book is near zero. Sector ETFs are assumed to have beta 1,
    which is the honest approximation given synthetic sector portfolios rather
    than live XL* prices. Scale is clipped to ``[0.25, 3]``.
    """
    if long_positions.empty:
        return pd.Series(dtype="float64")
    long = long_positions[long_positions["weight"].gt(0)]
    if long.empty:
        return pd.Series(dtype="float64")
    sector_w = long.groupby("sic_division", sort=False)["weight"].sum()
    aligned = betas.reindex(long["ticker"].to_numpy()).fillna(1.0).to_numpy(dtype="float64")
    w = long["weight"].to_numpy(dtype="float64")
    beta_long = float(np.dot(w, aligned) / max(float(w.sum()), 1e-12))
    scale = float(np.clip(beta_long, 0.25, 3.0))
    return -scale * sector_w


def _position_attributes(positions: pd.DataFrame, etf_names: set[str]) -> pd.DataFrame:
    """Ticker-level cap tercile / ADV / is_etf for the cost model."""
    if positions.empty:
        return pd.DataFrame(columns=["cap_tercile", "median_dollar_volume", "is_etf"])
    tickers = positions["ticker"].to_numpy()
    is_etf = pd.Series([t in etf_names for t in tickers], index=tickers)
    adv = pd.to_numeric(positions["median_dollar_volume"], errors="coerce")
    adv = pd.Series(
        np.where(is_etf.to_numpy(), ETF_ADV, adv.to_numpy()),
        index=tickers,
    )
    tercile = positions["cap_tercile"] if "cap_tercile" in positions.columns else pd.Series("mid", index=tickers)
    tercile = pd.Series(np.where(is_etf.to_numpy(), "large", tercile.to_numpy()), index=tickers)
    return pd.DataFrame(
        {
            "cap_tercile": tercile.to_numpy(),
            "median_dollar_volume": adv.to_numpy(),
            "is_etf": is_etf.to_numpy(),
        },
        index=tickers,
    )


def _append_hedge_rows(
    stock_positions: pd.DataFrame,
    hedge_w: pd.Series,
    date,
) -> pd.DataFrame:
    if hedge_w.empty:
        return stock_positions
    extra = pd.DataFrame(
        {
            "rebalance_date": date,
            "ticker": hedge_w.index.astype(str).map(lambda s: f"ETF:{SIC_TO_SPDR.get(s, SPY)}:{s}"),
            "weight": hedge_w.to_numpy(),
            "sic_division": hedge_w.index.to_numpy(),
            "market_cap": np.nan,
            "median_dollar_volume": ETF_ADV,
            "side": "hedge",
            "n_vintages": np.nan,
            "cap_tercile": "large",
        }
    )
    if stock_positions.empty:
        return extra
    return pd.concat([stock_positions, extra], ignore_index=True)


@dataclass
class VariantResult:
    spec: dict[str, object]
    monthly: pd.DataFrame
    positions: pd.DataFrame
    estimated_round_trip_bps: float
    avg_n_positions: float


def run_variant(
    panel: pd.DataFrame,
    stock_returns: pd.DataFrame,
    sector_returns: pd.DataFrame,
    spy_returns: pd.Series,
    betas: pd.DataFrame,
    rf: pd.Series,
    spec: dict[str, object],
    *,
    model: CostModel = DEFAULT_COST_MODEL,
) -> VariantResult:
    """Run one (arm, hedge, holding period) from formation through costs."""
    arm = str(spec["arm"])
    hedge = str(spec["hedge"])
    hold = int(spec["holding_period_months"])
    score_col, raw_col = _score_cols(arm)
    dates = pd.DatetimeIndex(sorted(panel["rebalance_date"].unique()))
    # Returns are indexed by the start of the holding month; drop a formation
    # date that has no subsequent mark.
    ret_dates = dates[dates.isin(stock_returns.index)]

    vintages = vintage_positions(panel, score_col, raw_col, hedge=hedge)
    combined = combine_overlapping(vintages, ret_dates, hold)
    if "cap_tercile" in panel.columns:
        tercile_map = panel.drop_duplicates(["rebalance_date", "ticker"]).set_index(
            ["rebalance_date", "ticker"]
        )["cap_tercile"]
        if getattr(tercile_map.index, "has_duplicates", False):
            tercile_map = tercile_map[~tercile_map.index.duplicated(keep="first")]
        keys = pd.MultiIndex.from_frame(combined[["rebalance_date", "ticker"]])
        mapped = tercile_map.reindex(keys)
        if isinstance(mapped, pd.DataFrame):
            mapped = mapped.iloc[:, 0]
        values = np.asarray(mapped.to_numpy()).reshape(-1)
        combined = with_columns(
            combined, cap_tercile=pd.Series(values, index=combined.index)
        )
    else:
        combined = with_columns(combined, cap_tercile=pd.Series("mid", index=combined.index))

    sector_lookup: dict[tuple, float] = {}
    if not sector_returns.empty:
        for row in sector_returns.itertuples(index=False):
            sector_lookup[(pd.Timestamp(row.rebalance_date), str(row.sic_division))] = float(row.ret)

    etf_names: set[str] = set()
    monthly_rows: list[dict[str, object]] = []
    prev_w = pd.Series(dtype="float64")
    rt_num = 0.0
    rt_den = 0.0
    n_pos: list[float] = []
    held_frames: list[pd.DataFrame] = []

    for date in ret_dates:
        sl = combined[combined["rebalance_date"].eq(date)].copy()
        if hedge == HEDGE_ETF:
            long_sl = sl[sl["weight"].gt(0)]
            beta_row = betas.loc[date] if date in betas.index else pd.Series(dtype="float64")
            hedge_w = _etf_hedge_weights(long_sl, beta_row)
            sl = _append_hedge_rows(sl, hedge_w, date)
            etf_names.update(sl.loc[sl["side"].eq("hedge"), "ticker"].astype(str))

        w = pd.Series(sl["weight"].to_numpy(), index=sl["ticker"].to_numpy(), dtype="float64")
        if date not in stock_returns.index:
            continue
        r_stocks = stock_returns.loc[date]
        spy_r = float(spy_returns.loc[date]) if date in spy_returns.index else 0.0
        gross = 0.0
        for rec in sl.itertuples(index=False):
            ticker = rec.ticker
            weight = float(rec.weight)
            if rec.side == "hedge":
                sector = str(rec.sic_division)
                r = sector_lookup.get((pd.Timestamp(date), sector))
                if r is None or not math.isfinite(r):
                    r = spy_r
                gross += weight * r
            elif ticker in r_stocks.index and pd.notna(r_stocks[ticker]):
                gross += weight * float(r_stocks[ticker])

        # Benchmark is the unscaled sector basket (ETF variants) or SPY (spread).
        if hedge == HEDGE_ETF:
            long_sl = sl[sl["side"].ne("hedge") & sl["weight"].gt(0)]
            bench = 0.0
            if not long_sl.empty:
                sector_w = long_sl.groupby("sic_division", sort=False)["weight"].sum()
                mass = float(sector_w.sum())
                if mass > 0:
                    sector_w = sector_w / mass
                for sector, sw in sector_w.items():
                    r = sector_lookup.get((pd.Timestamp(date), str(sector)))
                    bench += float(sw) * (float(r) if r is not None and math.isfinite(r) else spy_r)
            else:
                bench = spy_r
        else:
            bench = spy_r

        turnover = one_sided_turnover(prev_w, w)
        attr = _position_attributes(sl, etf_names)
        # Attributes for names that left the book sit on prev_w only; pull
        # ADV/tercile from the previous slice when missing.
        cost, rt_bps, detail = monthly_explicit_cost(prev_w, w, attr, model=model)
        if float(detail["one_sided"].sum()) if len(detail) else 0.0:
            rt_num += rt_bps * float(detail["one_sided"].sum())
            rt_den += float(detail["one_sided"].sum())

        rf_m = float(rf.loc[date]) if date in rf.index else 0.0
        n_long = float((sl["weight"].gt(0) & sl["side"].ne("hedge")).sum())
        n_pos.append(n_long)
        monthly_rows.append(
            {
                "date": pd.Timestamp(date),
                "month": pd.Timestamp(date).strftime("%Y-%m"),
                "gross": float(gross),
                "cost": float(cost),
                "net": float(gross) - float(cost),
                "benchmark": float(bench),
                "rf": rf_m,
                "turnover": float(turnover),
                "n_positions": n_long,
            }
        )
        held_frames.append(sl)
        prev_w = w

    monthly = pd.DataFrame(monthly_rows)
    positions = pd.concat(held_frames, ignore_index=True) if held_frames else combined
    estimated_rt = float(rt_num / rt_den) if rt_den > 0 else 0.0
    avg_n = float(np.mean(n_pos)) if n_pos else 0.0
    log.info(
        "%s: %d months, avg longs %.1f, turnover %.2fx, explicit RT %.1f bps, "
        "gross mean %.2f bps/mo",
        spec["id"],
        len(monthly),
        avg_n,
        12.0 * float(monthly["turnover"].mean()) if len(monthly) else 0.0,
        estimated_rt,
        10_000.0 * float(monthly["gross"].mean()) if len(monthly) else 0.0,
    )
    return VariantResult(
        spec=spec,
        monthly=monthly,
        positions=positions,
        estimated_round_trip_bps=estimated_rt,
        avg_n_positions=avg_n,
    )


@dataclass
class MarketData:
    """Shared price, sector, beta, and RF panels for one or more variants."""

    panel: pd.DataFrame
    stock_returns: pd.DataFrame
    sector_returns: pd.DataFrame
    spy_returns: pd.Series
    betas: pd.DataFrame
    rf: pd.Series


def prepare_market_data(
    signal: pd.DataFrame,
    universe: pd.DataFrame,
    prices: pd.DataFrame,
    factors_monthly: pd.DataFrame,
    *,
    specs: tuple[dict[str, object], ...] = VARIANT_SPECS,
) -> MarketData:
    """Snapshot prices, sector returns, and trailing betas once.

    Robustness cuts reuse this so a tercile or sector filter does not rebuild
    the daily panel.
    """
    uni = attach_terciles(universe)
    keep_uni = [
        "rebalance_date",
        "ticker",
        "market_cap",
        "median_dollar_volume",
        "cap_tercile",
    ]
    if "sic_division" in uni.columns and "sic_division" not in signal.columns:
        keep_uni.append("sic_division")
    panel = signal.merge(uni[keep_uni], on=["rebalance_date", "ticker"], how="left")
    dates = pd.DatetimeIndex(sorted(panel["rebalance_date"].unique()))
    tickers = pd.Index(sorted(set(uni["ticker"].unique()) | {SPY}))
    prices = prices[prices["ticker"].isin(set(tickers))]
    last_price_date = pd.Timestamp(prices["date"].max())
    snap_dates = dates.append(pd.DatetimeIndex([last_price_date])).unique().sort_values()
    log.info("snapshotting %d tickers at %d dates", len(tickers), len(snap_dates))
    snap = snapshot_prices(prices, snap_dates, tickers)
    stock_ret = holding_returns(snap)
    spy_ret = (
        stock_ret[SPY] if SPY in stock_ret.columns else pd.Series(0.0, index=stock_ret.index)
    )
    log.info("computing cap-weighted sector returns")
    sector_ret = sector_holding_returns(uni, stock_ret)

    log.info("forming vintages for beta universe")
    needed: set[str] = {SPY}
    for spec in specs:
        score_col, raw_col = _score_cols(str(spec["arm"]))
        vintages = vintage_positions(panel, score_col, raw_col, hedge=str(spec["hedge"]))
        needed.update(vintages["ticker"].astype(str).unique())
    log.info("trailing betas vs SPY for %d names", len(needed))
    daily = snapshot_prices(
        prices,
        pd.DatetimeIndex(sorted(prices.loc[prices["ticker"].isin(needed), "date"].unique())),
        needed,
        ffill_limit=5,
    )
    spy_daily = daily[SPY] if SPY in daily.columns else pd.Series(index=daily.index, dtype="float64")
    betas = trailing_betas(daily, spy_daily, dates)
    rf = _rf_on_rebalance(factors_monthly, stock_ret.index)
    return MarketData(
        panel=panel,
        stock_returns=stock_ret,
        sector_returns=sector_ret,
        spy_returns=spy_ret,
        betas=betas,
        rf=rf,
    )


def run_variants(
    signal: pd.DataFrame,
    universe: pd.DataFrame,
    prices: pd.DataFrame,
    factors_monthly: pd.DataFrame,
    *,
    model: CostModel = DEFAULT_COST_MODEL,
    specs: tuple[dict[str, object], ...] = VARIANT_SPECS,
) -> dict[str, VariantResult]:
    """Prepare shared panels once, then run every advertised variant."""
    market = prepare_market_data(signal, universe, prices, factors_monthly, specs=specs)
    results: dict[str, VariantResult] = {}
    for spec in specs:
        log.info("running variant %s", spec["id"])
        results[str(spec["id"])] = run_variant(
            market.panel,
            market.stock_returns,
            market.sector_returns,
            market.spy_returns,
            market.betas,
            market.rf,
            spec,
            model=model,
        )
    return results


def _rf_on_rebalance(factors_monthly: pd.DataFrame, dates: pd.DatetimeIndex) -> pd.Series:
    """Map each holding-start date to that month's French RF."""
    if factors_monthly.empty or "rf" not in factors_monthly.columns:
        return pd.Series(0.0, index=dates)
    reset = factors_monthly.reset_index()
    date_col = "date" if "date" in reset.columns else reset.columns[0]
    reset = with_columns(reset, month=pd.to_datetime(reset[date_col]).dt.to_period("M"))
    by_month = reset.drop_duplicates("month").set_index("month")["rf"]
    periods = pd.DatetimeIndex(dates).to_period("M")
    values = [float(by_month.loc[p]) if p in by_month.index else 0.0 for p in periods]
    return pd.Series(values, index=dates, dtype="float64")


def _max_drawdown(equity: np.ndarray) -> tuple[np.ndarray, float]:
    peaks = np.maximum.accumulate(np.maximum(equity, 1e-18))
    dd = equity / peaks - 1.0
    dd = np.minimum(dd, 0.0)
    return dd, float(dd.min()) if dd.size else 0.0


def _sharpe_se(sharpe: float, n: int) -> float:
    """Lo (2002) iid standard error of an annualized Sharpe, monthly data."""
    if n < 3:
        return 0.0
    return float(math.sqrt((1.0 + 0.5 * sharpe * sharpe) / n))


def performance_block(returns: pd.Series, rf: pd.Series) -> dict[str, float | None]:
    """Schema ``performance_block`` from a monthly return series."""
    r_s = pd.to_numeric(returns, errors="coerce")
    rf_s = pd.to_numeric(rf.reindex(returns.index), errors="coerce").fillna(0.0)
    mask = r_s.notna()
    r = r_s[mask].to_numpy(dtype="float64")
    rf_a = rf_s[mask].to_numpy(dtype="float64")
    n = int(r.size)
    if n == 0:
        return {
            "ann_return": 0.0,
            "ann_vol": 0.0,
            "sharpe": 0.0,
            "sharpe_std_error": 0.0,
            "sortino": 0.0,
            "max_drawdown": 0.0,
            "calmar": 0.0,
            "hit_rate_monthly": 0.0,
            "best_month": 0.0,
            "worst_month": 0.0,
        }
    equity = np.cumprod(1.0 + r)
    cagr = float(equity[-1] ** (PERIODS_PER_YEAR / n) - 1.0) if equity[-1] > 0 else -1.0
    vol = float(r.std(ddof=1) * math.sqrt(PERIODS_PER_YEAR)) if n > 1 else 0.0
    rf_ann = float(rf_a.mean() * PERIODS_PER_YEAR)
    excess_mean = float(r.mean() * PERIODS_PER_YEAR) - rf_ann
    sharpe = excess_mean / vol if vol > 1e-16 else 0.0
    downside = np.minimum(r, 0.0)
    down_vol = float(math.sqrt(np.mean(downside * downside)) * math.sqrt(PERIODS_PER_YEAR))
    if down_vol > 1e-16:
        sortino = excess_mean / down_vol
    else:
        sortino = 0.0 if excess_mean <= 0.0 else 99.0
    _, mdd = _max_drawdown(np.concatenate([[1.0], equity]))
    calmar = cagr / abs(mdd) if mdd < 0.0 else 0.0
    return {
        "ann_return": cagr,
        "ann_vol": vol,
        "sharpe": float(sharpe),
        "sharpe_std_error": _sharpe_se(float(sharpe), n),
        "sortino": float(sortino),
        "max_drawdown": mdd,
        "calmar": float(calmar),
        "hit_rate_monthly": float(np.mean(r > 0.0)),
        "best_month": float(r.max()),
        "worst_month": float(r.min()),
    }


def _equity_and_dd(
    monthly: pd.DataFrame,
) -> tuple[list[dict], list[dict]]:
    """Growth-of-1 series starting at 1.0 on the first rebalance date."""
    if monthly.empty:
        return [], []
    dates = [pd.Timestamp(d) for d in monthly["date"]]
    gross_r = monthly["gross"].to_numpy(dtype="float64")
    net_r = monthly["net"].to_numpy(dtype="float64")
    bench_r = monthly["benchmark"].to_numpy(dtype="float64")
    g = np.concatenate([[1.0], np.cumprod(1.0 + gross_r)])
    n = np.concatenate([[1.0], np.cumprod(1.0 + net_r)])
    b = np.concatenate([[1.0], np.cumprod(1.0 + bench_r)])
    g = np.maximum(g, 0.0)
    n = np.maximum(n, 0.0)
    b = np.maximum(b, 0.0)
    end_dates = dates + [dates[-1] + pd.offsets.MonthEnd(0)]
    # Point 0 is the formation date of the first holding; subsequent points
    # are the *end* of each holding (the next rebalance, or month-end for the
    # last). Using the start date of the next row is the natural mark.
    mark_dates = [dates[0]] + [
        pd.Timestamp(monthly["date"].iloc[i + 1]) if i + 1 < len(dates) else end_dates[-1]
        for i in range(len(dates))
    ]
    equity = [
        {
            "date": pd.Timestamp(mark_dates[i]).strftime("%Y-%m-%d"),
            "gross": float(g[i]),
            "net": float(n[i]),
            "benchmark": float(b[i]),
        }
        for i in range(len(g))
    ]
    dd_g, _ = _max_drawdown(g)
    dd_n, _ = _max_drawdown(n)
    drawdown = [
        {
            "date": pd.Timestamp(mark_dates[i]).strftime("%Y-%m-%d"),
            "gross": float(min(dd_g[i], 0.0)),
            "net": float(min(dd_n[i], 0.0)),
        }
        for i in range(len(g))
    ]
    return equity, drawdown


def variant_payload(result: VariantResult) -> dict:
    monthly = result.monthly
    spec = result.spec
    equity, drawdown = _equity_and_dd(monthly)
    rf = monthly.set_index("date")["rf"] if not monthly.empty else pd.Series(dtype="float64")
    gross = monthly.set_index("date")["gross"] if not monthly.empty else pd.Series(dtype="float64")
    net = monthly.set_index("date")["net"] if not monthly.empty else pd.Series(dtype="float64")
    bench = monthly.set_index("date")["benchmark"] if not monthly.empty else pd.Series(dtype="float64")
    ann_to = float(PERIODS_PER_YEAR * monthly["turnover"].mean()) if len(monthly) else 0.0
    return {
        "id": spec["id"],
        "label": spec["label"],
        "description": spec["description"],
        "hedge": spec["hedge"],
        "holding_period_months": spec["holding_period_months"],
        "arm": spec["arm"],
        "cost_assumption_bps": float(result.estimated_round_trip_bps),
        "n_months": int(len(monthly)),
        "avg_n_positions": float(result.avg_n_positions),
        "equity_curve": equity,
        "drawdown": drawdown,
        "monthly_returns": [
            {
                "month": row["month"],
                "gross": float(row["gross"]),
                "net": float(row["net"]),
                "benchmark": float(row["benchmark"]),
            }
            for row in monthly.to_dict(orient="records")
        ],
        "turnover": {
            "annualized": max(0.0, ann_to),
            "monthly": [
                {"month": row["month"], "turnover": max(0.0, float(row["turnover"]))}
                for row in monthly.to_dict(orient="records")
            ],
        },
        "stats": {
            "gross": performance_block(gross, rf),
            "net": performance_block(net, rf),
            "benchmark": performance_block(bench, rf) if len(bench) else None,
        },
    }


def build_backtest_artifact(
    results: dict[str, VariantResult],
    *,
    notes: str | None,
    primary_id: str = PRIMARY_VARIANT_ID,
) -> dict:
    variants = [variant_payload(results[str(spec["id"])]) for spec in VARIANT_SPECS if str(spec["id"]) in results]
    return {
        "schema_version": "1.0.0",
        "artifact": "backtest",
        "generated_at": _now(),
        "data_status": "real",
        "notes": notes,
        "primary_variant_id": primary_id,
        "benchmark_label": (
            "Cap-weighted SIC-division portfolios standing in for SPDR sector ETFs "
            "(beta-scaled short on the primary variant)"
        ),
        "variants": variants,
    }


def _alpha_series(net: pd.Series, rf: pd.Series) -> tuple[float, float]:
    """Annualized excess vs RF in bps, plus Newey-West t-stat of the monthly excess."""
    excess = pd.to_numeric(net, errors="coerce") - pd.to_numeric(rf, errors="coerce").fillna(0.0)
    excess = excess.to_numpy(dtype="float64")
    excess = excess[np.isfinite(excess)]
    if excess.size < 3:
        return 0.0, 0.0
    summary = newey_west_mean(excess, lags=min(3, int(excess.size) - 2))
    return float(summary["mean"] * PERIODS_PER_YEAR * BPS), float(summary["t_stat"])


def build_costs_artifact(
    result: VariantResult,
    *,
    notes: str | None,
    model: CostModel = DEFAULT_COST_MODEL,
) -> dict:
    monthly = result.monthly
    gross = monthly.set_index("date")["gross"]
    turnover = monthly.set_index("date")["turnover"]
    rf = monthly.set_index("date")["rf"]
    sweep = []
    sharpes: list[float] = []
    alphas: list[float] = []
    grid = np.asarray(SWEEP_BPS, dtype="float64")
    for bps in grid:
        net = apply_flat_cost(gross, turnover, float(bps))
        stats = performance_block(net, rf)
        alpha_bps, t_stat = _alpha_series(net, rf)
        sweep.append(
            {
                "round_trip_bps": float(bps),
                "net_sharpe": float(stats["sharpe"]),
                "net_ann_return": float(stats["ann_return"]),
                "net_alpha_ann_bps": float(alpha_bps),
                "alpha_t_stat": float(t_stat),
            }
        )
        sharpes.append(float(stats["sharpe"]))
        alphas.append(float(alpha_bps))

    alpha_zero = interpolate_zero_crossing(grid, np.asarray(alphas))
    sharpe_zero = interpolate_zero_crossing(grid, np.asarray(sharpes))
    modelled = float(result.estimated_round_trip_bps)
    ann_to = float(PERIODS_PER_YEAR * monthly["turnover"].mean()) if len(monthly) else 0.0
    avg_m = float(monthly["turnover"].mean()) if len(monthly) else 0.0

    if alpha_zero is None:
        interpretation = (
            "Annualized excess return versus RF is never positive on the 0–100 bp "
            "sweep, so there is no break-even cost: the book does not earn its "
            f"cost of capital even in a frictionless market. The explicit model "
            f"estimates {modelled:.1f} bps round-trip against {ann_to:.2f}x annual "
            "turnover. Net alpha dying at realistic costs is the expected reading "
            "of a NO-GO IC gate, not a surprise."
        )
    else:
        margin = alpha_zero / modelled if modelled > 0 else None
        interpretation = (
            f"Annualized excess versus RF reaches zero at roughly {alpha_zero:.0f} bps "
            f"of round-trip cost against an explicit-model estimate of {modelled:.1f} bps"
            + (f" ({margin:.1f}x modelled)" if margin is not None else "")
            + f". Annualized turnover is {ann_to:.2f}x, so each extra basis point of "
            f"round-trip costs about {ann_to:.1f} bps a year. This is a decay study: "
            "clearing a low break-even would not overturn the IC gate."
        )

    return {
        "schema_version": "1.0.0",
        "artifact": "costs",
        "generated_at": _now(),
        "data_status": "real",
        "notes": notes,
        "variant_id": str(result.spec["id"]),
        "explicit_model": {
            "description": (
                "Round-trip cost per name is half-spread plus square-root impact. "
                "Half-spread is proxied by capitalization tercile of the universe at "
                "t (5 / 10 / 20 bps large / mid / small). Impact is k times the "
                "square root of participation, with participation capped at 10% of "
                "20-day median dollar volume and a $10mm book. k is in percent "
                "return units (0.32 → 10 bps of impact at the cap). Sector-ETF "
                "hedge trades are charged as large-cap. Alpha on the sweep is "
                "annualized excess versus Ken French RF, Newey-West t-stat with "
                "3 monthly lags — not a full FF5 alpha (Milestone 6)."
            ),
            "half_spreads": [
                {"cap_tercile": "large", "half_spread_bps": model.half_spreads["large"]},
                {"cap_tercile": "mid", "half_spread_bps": model.half_spreads["mid"]},
                {"cap_tercile": "small", "half_spread_bps": model.half_spreads["small"]},
            ],
            "impact_coefficient_k": float(model.impact_k),
            "participation_cap": float(model.participation_cap),
            "estimated_round_trip_bps": modelled,
        },
        "sweep": sweep,
        "break_even": {
            "alpha_zero_bps": alpha_zero,
            "sharpe_zero_bps": sharpe_zero,
            "interpretation": interpretation,
        },
        "turnover": {
            "annualized": max(0.0, ann_to),
            "avg_monthly": max(0.0, avg_m),
            "note": (
                "Turnover is one-sided traded notional divided by NAV "
                "(0.5 × Σ|Δw_i|), annualized as 12 × mean monthly. Overlapping "
                "three-month vintages cut it relative to the one-month construction. "
                "The first month includes the initial build from cash."
            ),
        },
    }


def monthly_returns_panel(results: dict[str, VariantResult]) -> pd.DataFrame:
    """Tidy monthly returns for Milestone 6 attribution."""
    frames = []
    for vid, result in results.items():
        frame = result.monthly.copy()
        frame = with_columns(frame, variant_id=pd.Series(vid, index=frame.index))
        frames.append(
            frame[
                [
                    "date",
                    "month",
                    "variant_id",
                    "gross",
                    "net",
                    "benchmark",
                    "rf",
                    "turnover",
                    "n_positions",
                ]
            ]
        )
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)
