from __future__ import annotations

import argparse
from pathlib import Path

from lob_predictor.sample_data import generate_sample_lob


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate synthetic L2 order book data.")
    parser.add_argument("--rows", type=int, default=20000)
    parser.add_argument("--out", default="data/raw/sample_lob.csv")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    frame = generate_sample_lob(rows=args.rows, seed=args.seed)
    frame.to_csv(output, index=False)
    print(f"Wrote {len(frame)} rows to {output}")


if __name__ == "__main__":
    main()
