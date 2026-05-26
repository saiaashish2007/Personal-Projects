"""Low-latency HTTP inference service for streaming LOB predictions."""

from __future__ import annotations

import json
import time
from dataclasses import asdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pandas as pd

from lob_predictor.ingestion import MarketDataMessage
from lob_predictor.schema import book_columns
from lob_predictor.streaming import StreamingInferenceEngine


class InferenceService:
    """Stateful inference service that updates features on each request."""

    def __init__(self, model_path: str | Path):
        self.engine = StreamingInferenceEngine(model_path=model_path)
        self.sequence = 0

    def predict(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Predict from one canonical book snapshot JSON payload."""
        snapshot = payload_to_snapshot(payload)
        now = time.time()
        message = MarketDataMessage(
            sequence=self.sequence,
            event_time=float(payload.get("event_time", now)),
            receive_time=now,
            snapshot=snapshot,
        )
        self.sequence += 1
        return asdict(self.engine.predict_message(message))


def payload_to_snapshot(payload: dict[str, Any]) -> pd.DataFrame:
    """Convert service JSON payload into a one-row canonical L2 DataFrame.

    Accepts either canonical columns or nested `asks`/`bids` arrays:
    {"asks": [[price, size], ...], "bids": [[price, size], ...]}.
    """
    columns = book_columns()
    if all(column in payload for column in columns):
        return pd.DataFrame([{column: float(payload[column]) for column in columns}])

    if "asks" in payload and "bids" in payload:
        asks = sorted(_parse_levels(payload["asks"]), key=lambda item: item[0])[:10]
        bids = sorted(_parse_levels(payload["bids"]), key=lambda item: item[0], reverse=True)[:10]
        if len(asks) < 10 or len(bids) < 10:
            raise ValueError("Payload must include at least 10 ask and 10 bid levels.")

        row: dict[str, float] = {}
        for level in range(1, 11):
            ask_price, ask_size = asks[level - 1]
            bid_price, bid_size = bids[level - 1]
            row[f"ask_price_{level}"] = ask_price
            row[f"ask_size_{level}"] = ask_size
            row[f"bid_price_{level}"] = bid_price
            row[f"bid_size_{level}"] = bid_size
        return pd.DataFrame([row], columns=columns)

    raise ValueError("Payload must contain canonical L2 columns or nested asks/bids arrays.")


def make_handler(service: InferenceService) -> type[BaseHTTPRequestHandler]:
    """Create a request handler bound to a service instance."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/health":
                self._write_json({"status": "ok"})
                return
            self._write_json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            if self.path != "/predict":
                self._write_json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)
                return

            try:
                payload = self._read_json()
                response = service.predict(payload)
            except Exception as exc:  # noqa: BLE001 - convert all request failures to JSON.
                self._write_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                return

            self._write_json(response)

        def log_message(self, format: str, *args: Any) -> None:
            return

        def _read_json(self) -> dict[str, Any]:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            return json.loads(raw_body.decode("utf-8"))

        def _write_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
            encoded = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    return Handler


def run_service(model_path: str | Path, host: str = "127.0.0.1", port: int = 8000) -> None:
    """Run the inference service until interrupted."""
    service = InferenceService(model_path=model_path)
    server = ThreadingHTTPServer((host, port), make_handler(service))
    print(f"Serving LOB inference on http://{host}:{port}")
    server.serve_forever()


def _parse_levels(levels: list[list[Any]]) -> list[tuple[float, float]]:
    return [(float(price), float(size)) for price, size, *_ in levels]
