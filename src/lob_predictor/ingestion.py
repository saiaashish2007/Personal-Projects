"""Real-time message ingestion simulation for L2 order book data."""

from __future__ import annotations

import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from lob_predictor.data import load_order_book


@dataclass(frozen=True)
class MarketDataMessage:
    """A single simulated market data update."""

    sequence: int
    event_time: float
    receive_time: float
    snapshot: pd.DataFrame


class HistoricalMessageSimulator:
    """Replay historical L2 snapshots as if they were arriving live."""

    def __init__(
        self,
        data_path: str | Path,
        interval_seconds: float = 0.0,
        realtime: bool = False,
    ):
        if interval_seconds < 0:
            raise ValueError("interval_seconds must be non-negative.")
        self.book = load_order_book(data_path)
        self.interval_seconds = interval_seconds
        self.realtime = realtime

    def stream(self, limit: int | None = None) -> Iterator[MarketDataMessage]:
        """Yield market data messages with optional wall-clock pacing."""
        start = time.perf_counter()
        total = len(self.book) if limit is None else min(limit, len(self.book))
        for sequence in range(total):
            if self.realtime and self.interval_seconds > 0:
                target_elapsed = sequence * self.interval_seconds
                sleep_for = target_elapsed - (time.perf_counter() - start)
                if sleep_for > 0:
                    time.sleep(sleep_for)

            now = time.time()
            yield MarketDataMessage(
                sequence=sequence,
                event_time=now,
                receive_time=now,
                snapshot=self.book.iloc[[sequence]],
            )

    def __iter__(self) -> Iterator[MarketDataMessage]:
        return self.stream()
