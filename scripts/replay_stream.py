from __future__ import annotations

import argparse
from dataclasses import asdict

from lob_predictor.streaming import replay_predictions


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replay L2 rows as streaming inference updates.")
    parser.add_argument("--data", required=True, help="Path to raw L2 order book data.")
    parser.add_argument("--model", required=True, help="Path to a trained sklearn baseline model.")
    parser.add_argument("--limit", type=int, default=20, help="Maximum predictions to print.")
    parser.add_argument("--interval", type=float, default=0.0, help="Seconds between replayed updates.")
    parser.add_argument("--realtime", action="store_true", help="Sleep between updates to simulate live data.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    for event in replay_predictions(
        args.data,
        args.model,
        limit=args.limit,
        interval_seconds=args.interval,
        realtime=args.realtime,
    ):
        print(asdict(event))


if __name__ == "__main__":
    main()
