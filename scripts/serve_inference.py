from __future__ import annotations

import argparse

from lob_predictor.service import run_service


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run low-latency LOB inference service.")
    parser.add_argument("--model", required=True, help="Path to a trained sklearn baseline model.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run_service(model_path=args.model, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
