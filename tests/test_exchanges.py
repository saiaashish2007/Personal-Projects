from __future__ import annotations

import csv
from pathlib import Path

from lob_predictor.data import load_order_book
from lob_predictor.exchanges import OrderBookSnapshot, collect_snapshots


class FakeClient:
    exchange = "fake"
    symbol = "FAKE-USD"

    def __init__(self) -> None:
        self.count = 0

    def fetch_snapshot(self, levels: int = 10) -> OrderBookSnapshot:
        self.count += 1
        bids = [(100.0 - level * 0.01, 10.0 + level) for level in range(levels)]
        asks = [(100.1 + level * 0.01, 20.0 + level) for level in range(levels)]
        return OrderBookSnapshot(
            exchange=self.exchange,
            symbol=self.symbol,
            timestamp=f"2026-01-01T00:00:0{self.count}+00:00",
            bids=bids,
            asks=asks,
        )


def test_snapshot_to_row_uses_canonical_columns() -> None:
    snapshot = FakeClient().fetch_snapshot()
    row = snapshot.to_row(levels=10)

    assert row["ask_price_1"] == 100.1
    assert row["bid_price_1"] == 100.0
    assert row["ask_size_10"] == 29.0
    assert row["bid_size_10"] == 19.0


def test_collect_snapshots_writes_loadable_csv(tmp_path: Path) -> None:
    output = tmp_path / "snapshots.csv"

    collect_snapshots(FakeClient(), output, samples=3, interval_seconds=0)
    rows = list(csv.DictReader(output.open()))
    loaded = load_order_book(output)

    assert len(rows) == 3
    assert loaded.shape == (3, 40)
