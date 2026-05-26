from __future__ import annotations

import argparse

from lob_predictor.exchanges import collect_snapshots, make_client


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect free Binance/Coinbase L2 snapshots into canonical training CSVs."
    )
    parser.add_argument("--exchange", choices=["binance", "coinbase"], required=True)
    parser.add_argument(
        "--symbol",
        default=None,
        help="Exchange symbol, e.g. BTCUSDT for Binance or BTC-USD for Coinbase.",
    )
    parser.add_argument("--out", required=True, help="Output CSV path.")
    parser.add_argument("--samples", type=int, default=100, help="Number of snapshots to collect.")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between snapshots.")
    parser.add_argument("--levels", type=int, default=10, help="Visible book levels to save.")
    parser.add_argument("--timeout", type=float, default=10.0, help="HTTP timeout in seconds.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    client = make_client(args.exchange, symbol=args.symbol, timeout=args.timeout)
    collect_snapshots(
        client=client,
        output_path=args.out,
        levels=args.levels,
        samples=args.samples,
        interval_seconds=args.interval,
    )
    print(f"Wrote {args.samples} {args.exchange} snapshots to {args.out}")


if __name__ == "__main__":
    main()
