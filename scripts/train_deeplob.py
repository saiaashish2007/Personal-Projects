from __future__ import annotations

import argparse
import json

from lob_predictor.deeplob import DeepLOBConfig, save_deeplob_model, train_deeplob


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a DeepLOB-style temporal CNN.")
    parser.add_argument("--data", required=True, help="Path to raw L2 order book data.")
    parser.add_argument("--window", type=int, default=100, help="Number of book updates per sample.")
    parser.add_argument("--horizon", type=int, default=50, help="Future horizon in book updates.")
    parser.add_argument("--threshold-bps", type=float, default=0.5, help="Flat/up/down threshold in bps.")
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--model-out", default="models/deeplob.pt")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = DeepLOBConfig(
        window=args.window,
        horizon=args.horizon,
        threshold_bps=args.threshold_bps,
        batch_size=args.batch_size,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
    )
    model, metrics = train_deeplob(args.data, config)
    save_deeplob_model(model, args.model_out, metrics)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
