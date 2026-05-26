from __future__ import annotations

from lob_predictor.service import payload_to_snapshot
from lob_predictor.schema import book_columns


def test_payload_to_snapshot_accepts_canonical_columns() -> None:
    payload = {column: 1.0 for column in book_columns()}

    snapshot = payload_to_snapshot(payload)

    assert snapshot.shape == (1, 40)


def test_payload_to_snapshot_accepts_nested_levels() -> None:
    payload = {
        "asks": [[100.1 + level * 0.01, 10 + level] for level in range(10)],
        "bids": [[100.0 - level * 0.01, 20 + level] for level in range(10)],
    }

    snapshot = payload_to_snapshot(payload)

    assert snapshot["ask_price_1"].iloc[0] == 100.1
    assert snapshot["bid_price_1"].iloc[0] == 100.0
    assert snapshot.shape == (1, 40)
