"""Free exchange data collectors for real Level 2 order book snapshots."""

from __future__ import annotations

import csv
import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from lob_predictor.schema import book_columns


@dataclass(frozen=True)
class OrderBookSnapshot:
    """Canonical top-of-book snapshot with optional source metadata."""

    exchange: str
    symbol: str
    timestamp: str
    bids: list[tuple[float, float]]
    asks: list[tuple[float, float]]

    def to_row(self, levels: int = 10) -> dict[str, float | str]:
        """Convert exchange-specific depth into the project's canonical L2 row."""
        row: dict[str, float | str] = {
            "timestamp": self.timestamp,
            "exchange": self.exchange,
            "symbol": self.symbol,
        }

        asks = sorted(self.asks, key=lambda item: item[0])[:levels]
        bids = sorted(self.bids, key=lambda item: item[0], reverse=True)[:levels]
        if len(asks) < levels or len(bids) < levels:
            raise ValueError(
                f"Snapshot has {len(asks)} ask levels and {len(bids)} bid levels; "
                f"{levels} levels are required."
            )

        for level in range(1, levels + 1):
            ask_price, ask_size = asks[level - 1]
            bid_price, bid_size = bids[level - 1]
            row[f"ask_price_{level}"] = ask_price
            row[f"ask_size_{level}"] = ask_size
            row[f"bid_price_{level}"] = bid_price
            row[f"bid_size_{level}"] = bid_size
        return row


class OrderBookClient(Protocol):
    """Exchange client interface used by the snapshot collector."""

    exchange: str
    symbol: str

    def fetch_snapshot(self, levels: int = 10) -> OrderBookSnapshot:
        """Fetch a current L2 order book snapshot."""


class BinanceClient:
    """Public Binance Spot order book client."""

    exchange = "binance"
    base_url = "https://api.binance.com"

    def __init__(self, symbol: str = "BTCUSDT", timeout: float = 10.0):
        self.symbol = symbol.upper()
        self.timeout = timeout

    def fetch_snapshot(self, levels: int = 10) -> OrderBookSnapshot:
        payload = _get_json(
            f"{self.base_url}/api/v3/depth",
            params={"symbol": self.symbol, "limit": max(100, levels)},
            timeout=self.timeout,
        )
        return OrderBookSnapshot(
            exchange=self.exchange,
            symbol=self.symbol,
            timestamp=_utc_timestamp(),
            bids=_parse_price_size_pairs(payload["bids"]),
            asks=_parse_price_size_pairs(payload["asks"]),
        )


class CoinbaseClient:
    """Public Coinbase Exchange order book client."""

    exchange = "coinbase"
    base_url = "https://api.exchange.coinbase.com"

    def __init__(self, symbol: str = "BTC-USD", timeout: float = 10.0):
        self.symbol = symbol.upper()
        self.timeout = timeout

    def fetch_snapshot(self, levels: int = 10) -> OrderBookSnapshot:
        payload = _get_json(
            f"{self.base_url}/products/{self.symbol}/book",
            params={"level": 2},
            timeout=self.timeout,
            headers={"User-Agent": "lob-prediction-engine/0.1"},
        )
        return OrderBookSnapshot(
            exchange=self.exchange,
            symbol=self.symbol,
            timestamp=_utc_timestamp(),
            bids=_parse_price_size_pairs(payload["bids"]),
            asks=_parse_price_size_pairs(payload["asks"]),
        )


def make_client(exchange: str, symbol: str | None = None, timeout: float = 10.0) -> OrderBookClient:
    """Build an exchange client from CLI-friendly names."""
    normalized = exchange.lower()
    if normalized == "binance":
        return BinanceClient(symbol=symbol or "BTCUSDT", timeout=timeout)
    if normalized == "coinbase":
        return CoinbaseClient(symbol=symbol or "BTC-USD", timeout=timeout)
    raise ValueError("exchange must be either 'binance' or 'coinbase'.")


def collect_snapshots(
    client: OrderBookClient,
    output_path: str | Path,
    levels: int = 10,
    samples: int = 100,
    interval_seconds: float = 1.0,
) -> None:
    """Poll public L2 snapshots and append canonical rows to CSV."""
    if samples <= 0:
        raise ValueError("samples must be positive.")
    if interval_seconds < 0:
        raise ValueError("interval_seconds must be non-negative.")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["timestamp", "exchange", "symbol", *book_columns(levels)]
    write_header = not output_path.exists() or output_path.stat().st_size == 0

    with output_path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()

        for sample_index in range(samples):
            snapshot = client.fetch_snapshot(levels=levels)
            writer.writerow(snapshot.to_row(levels=levels))
            handle.flush()
            if sample_index < samples - 1 and interval_seconds > 0:
                time.sleep(interval_seconds)


def _parse_price_size_pairs(rows: list[list[str]]) -> list[tuple[float, float]]:
    return [(float(price), float(size)) for price, size, *_ in rows]


def _get_json(
    url: str,
    params: dict[str, str | int] | None = None,
    timeout: float = 10.0,
    headers: dict[str, str] | None = None,
) -> dict:
    query = f"?{urlencode(params)}" if params else ""
    request = Request(f"{url}{query}", headers=headers or {})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Exchange request failed with HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"Exchange request failed: {exc.reason}") from exc


def _utc_timestamp() -> str:
    return datetime.now(UTC).isoformat()
