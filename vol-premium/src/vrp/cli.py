"""`vrp run` rebuilds every artifact the dashboard reads, from raw data to JSON."""

from __future__ import annotations

import argparse
import json
import math
import time
from datetime import UTC, datetime

import numpy as np
import pandas as pd

from vrp import backtest, data, features, forecast, montecarlo

OUT = data.ROOT / "web" / "data"


def _clean(obj):
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, list | tuple):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, float | np.floating):
        v = float(obj)
        return None if math.isnan(v) or math.isinf(v) else round(v, 6)
    return obj


def _write(name: str, payload: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(_clean(payload), separators=(",", ":")))
    print(f"  wrote {path.relative_to(data.ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def _weekly(frame: pd.DataFrame) -> list[dict]:
    w = frame.resample("W-FRI").last().dropna(how="all")
    return [
        {"d": d.strftime("%Y-%m-%d"), **row}
        for d, row in zip(w.index, w.to_dict("records"), strict=False)
    ]


def run(refresh: bool, draws: int) -> None:
    t0 = time.time()
    print("loading data")
    panel = data.load_panel(refresh=refresh)
    feat = features.build(panel)
    print(f"  {len(feat)} trading days, {feat.index[0].date()} to {feat.index[-1].date()}")

    print("walk-forward forecasts")
    fc, info = forecast.walk_forward(feat)
    print(
        f"  xgb trees per refit: median {info['rounds']['median']:.0f}, max {info['rounds']['max']}"
    )
    df = feat.join(fc, how="inner")
    metrics = forecast.evaluate(fc, df["rv_fwd"], df["vix"])
    for m in metrics:
        print(f"  {m['model']:>5}  rmse {m['rmse']:.2f}  qlike {m['qlike']:.4f}")

    print("backtest")
    bt = backtest.run(df)
    for k, s in bt["stats"].items():
        print(f"  {k:>7}  sharpe {s['sharpe']:.2f}  max drawdown {s['max_drawdown']:.2%}")
    cost_grid = []
    for ratio in (1.0, 0.9, 0.85):
        for spread in (0.0, 0.5, 1.0):
            r = backtest.run(df, atm_ratio=ratio, spread_vol_pts=spread)
            cost_grid.append(
                {
                    "atm_ratio": ratio,
                    "spread_vol_pts": spread,
                    **{f"sharpe_{k}": r["stats"][k]["sharpe"] for k in ("always", "xgb")},
                    **{f"return_{k}": r["stats"][k]["ann_return"] for k in ("always", "xgb")},
                }
            )
        print(
            f"  atm ratio {ratio}: "
            + ", ".join(
                f"{k} {r['stats'][k]['sharpe']:.2f}" for k in ("always", "naive", "harx", "xgb")
            )
        )

    print(f"monte carlo ({draws} bootstrap draws)")
    boot = montecarlo.bootstrap(bt["returns"].drop(columns="oracle"), draws=draws)
    stress = montecarlo.jump_stress()

    last = df.iloc[-1]
    iv_atm = backtest.ATM_RATIO * float(last["vix"])
    edge = iv_atm - float(last["fc_xgb"])
    xgb_row = next(m for m in metrics if m["model"] == "xgb")
    harx_row = next(m for m in metrics if m["model"] == "harx")
    stamp = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_through": df.index[-1].strftime("%Y-%m-%d"),
    }

    _write(
        "summary",
        {
            **stamp,
            "oos_start": df.index[0].strftime("%Y-%m-%d"),
            "oos_end": bt["returns"].index[-1].strftime("%Y-%m-%d"),
            "train_start": feat.index[0].strftime("%Y-%m-%d"),
            "oos_days": len(bt["returns"]),
            "current": {
                "date": df.index[-1].strftime("%Y-%m-%d"),
                "vix": float(last["vix"]),
                "iv_atm": iv_atm,
                "fc_xgb": float(last["fc_xgb"]),
                "fc_harx": float(last["fc_harx"]),
                "rv_trailing": float(last["rv_trailing"]),
                "edge": edge,
                "sell": edge > 0,
            },
            "headline": {
                "sharpe_xgb": bt["stats"]["xgb"]["sharpe"],
                "sharpe_always": bt["stats"]["always"]["sharpe"],
                "mdd_xgb": bt["stats"]["xgb"]["max_drawdown"],
                "mdd_always": bt["stats"]["always"]["max_drawdown"],
                "prob_beats_always": boot["paired"]["xgb"]["prob_beats_always"],
                "qlike_gain_vs_harx": 1 - xgb_row["qlike"] / harx_row["qlike"],
                "time_in_market": bt["stats"]["xgb"]["time_in_market"],
            },
            "costs": {
                "atm_ratio": backtest.ATM_RATIO,
                "spread_vol_pts": backtest.SPREAD_VOL_PTS,
                "hedge_cost_bps": backtest.HEDGE_COST_BPS,
            },
        },
    )

    series = df[["vix", "rv_fwd", "fc_har", "fc_harx", "fc_xgb"]].rename(
        columns={"rv_fwd": "realized", "fc_har": "har", "fc_harx": "harx", "fc_xgb": "xgb"}
    )
    _write(
        "forecast",
        {
            **stamp,
            "metrics": metrics,
            "importance": [{"feature": k, "value": v} for k, v in info["importance"].items()],
            "rounds": info["rounds"],
            "series": _weekly(series),
            "params": {
                "horizon": features.HORIZON,
                "refit_every": forecast.REFIT_EVERY,
                "embargo": forecast.EMBARGO,
                "min_train": forecast.MIN_TRAIN,
                "holdout": forecast.HOLDOUT,
                "xgb": {
                    "max_rounds": forecast.XGB_MAX_ROUNDS,
                    "patience": forecast.XGB_PATIENCE,
                    **{
                        k: v
                        for k, v in forecast.XGB_PARAMS.items()
                        if k not in ("nthread", "disable_default_eval_metric")
                    },
                },
            },
        },
    )

    equity = bt["returns"].cumsum()
    dd = equity - np.maximum.accumulate(equity.clip(lower=0))
    exposure = bt["weights"]["xgb"].resample("ME").mean()
    _write(
        "strategy",
        {
            **stamp,
            "labels": backtest.STRATEGIES,
            "stats": bt["stats"],
            "equity": _weekly(equity),
            "drawdown": _weekly(dd[["always", "xgb"]]),
            "exposure": [{"d": d.strftime("%Y-%m"), "xgb": float(v)} for d, v in exposure.items()],
            "yearly": [
                {"year": int(y), **row}
                for y, row in zip(bt["yearly"].index, bt["yearly"].to_dict("records"), strict=False)
            ],
            "crashes": bt["crashes"],
            "sensitivity": bt["sensitivity"],
            "costs": cost_grid,
            "ic": bt["ic"],
            "hit_rate": bt["hit_rate"],
        },
    )
    _write("risk", {**stamp, "bootstrap": boot, "stress": stress})
    print(f"done in {time.time() - t0:.0f}s")


def main() -> None:
    parser = argparse.ArgumentParser(prog="vrp")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("run", help="download data, fit, backtest, and write web/data/*.json")
    p.add_argument("--refresh", action="store_true", help="re-download raw data")
    p.add_argument("--draws", type=int, default=2000, help="bootstrap draws")
    args = parser.parse_args()
    if args.cmd == "run":
        run(args.refresh, args.draws)


if __name__ == "__main__":
    main()
