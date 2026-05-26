from __future__ import annotations

import argparse
import json

from lob_predictor.baseline import save_metrics, save_model, train_baseline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a baseline LOB direction classifier.")
    parser.add_argument("--data", required=True, help="Path to raw L2 order book data.")
    parser.add_argument("--horizon", type=int, default=50, help="Future horizon in book updates.")
    parser.add_argument("--threshold-bps", type=float, default=0.5, help="Flat/up/down threshold in bps.")
    parser.add_argument("--train-fraction", type=float, default=0.8, help="Time-ordered train fraction.")
    parser.add_argument("--model-out", default="models/baseline.joblib", help="Output model path.")
    parser.add_argument("--report-out", default="reports/baseline_metrics.json", help="Output JSON path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    model, metrics = train_baseline(
        data_path=args.data,
        horizon=args.horizon,
        threshold_bps=args.threshold_bps,
        train_fraction=args.train_fraction,
    )
    save_model(model, args.model_out)
    save_metrics(metrics, args.report_out)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
