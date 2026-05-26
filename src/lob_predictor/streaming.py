"""Streaming feature updates and low-latency inference helpers."""

from __future__ import annotations

import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import pandas as pd

from lob_predictor.data import load_order_book
from lob_predictor.features import engineer_features
from lob_predictor.ingestion import HistoricalMessageSimulator, MarketDataMessage

LABEL_NAMES = {0: "down", 1: "stationary", 2: "up"}


@dataclass(frozen=True)
class PredictionEvent:
    sequence: int
    prediction: str
    confidence: float | None
    inference_latency_ms: float
    mid_price: float
    spread: float
    imbalance_total: float
    microprice_distance: float
    features: dict[str, float] = field(default_factory=dict)


class HistoricalBookReplayer:
    """Yield L2 snapshots one at a time to simulate a live feed."""

    def __init__(self, data_path: str | Path):
        self.book = load_order_book(data_path)

    def __iter__(self) -> Iterator[pd.DataFrame]:
        for index in range(len(self.book)):
            yield self.book.iloc[[index]]


class StreamingFeatureEngine:
    """Maintain bounded recent book state and emit latest features per update."""

    def __init__(self, max_rows: int = 200):
        self.max_rows = max_rows
        self.history: list[pd.DataFrame] = []
        self.latest_features: pd.Series | None = None

    def update(self, snapshot: pd.DataFrame) -> pd.Series:
        self.history.append(snapshot)
        if len(self.history) > self.max_rows:
            self.history = self.history[-self.max_rows :]
        book = pd.concat(self.history, ignore_index=True)
        self.latest_features = engineer_features(book).iloc[-1]
        return self.latest_features

    def update_from_message(self, message: MarketDataMessage) -> pd.Series:
        """Update features from a market data message."""
        return self.update(message.snapshot)


class SklearnInferenceModel:
    """Thin adapter around a persisted sklearn pipeline."""

    def __init__(self, model_path: str | Path):
        self.model = joblib.load(model_path)

    def predict(self, features: pd.Series) -> tuple[int, float | None]:
        frame = features.to_frame().T
        prediction = int(self.model.predict(frame)[0])
        if hasattr(self.model, "predict_proba"):
            probability = float(self.model.predict_proba(frame).max())
        else:
            probability = None
        return prediction, probability


class StreamingInferenceEngine:
    """Connect message ingestion, streaming features, and model inference."""

    def __init__(self, model_path: str | Path, max_feature_rows: int = 200):
        self.feature_engine = StreamingFeatureEngine(max_rows=max_feature_rows)
        self.model = SklearnInferenceModel(model_path)

    def predict_message(self, message: MarketDataMessage) -> PredictionEvent:
        """Run feature update and prediction for one message."""
        start = time.perf_counter()
        features = self.feature_engine.update_from_message(message)
        prediction, confidence = self.model.predict(features)
        latency_ms = (time.perf_counter() - start) * 1000.0
        return prediction_event_from_features(
            sequence=message.sequence,
            features=features,
            prediction=prediction,
            confidence=confidence,
            latency_ms=latency_ms,
        )


def prediction_event_from_features(
    sequence: int,
    features: pd.Series,
    prediction: int,
    confidence: float | None,
    latency_ms: float,
) -> PredictionEvent:
    """Build a serializable prediction event from a feature vector."""
    return PredictionEvent(
        sequence=sequence,
        prediction=LABEL_NAMES.get(prediction, str(prediction)),
        confidence=confidence,
        inference_latency_ms=latency_ms,
        mid_price=float(features["mid_price"]),
        spread=float(features["spread"]),
        imbalance_total=float(features["imbalance_total"]),
        microprice_distance=float(features["microprice_distance"]),
        features={key: float(value) for key, value in features.items()},
    )


def replay_predictions(
    data_path: str | Path,
    model_path: str | Path,
    limit: int | None = None,
    interval_seconds: float = 0.0,
    realtime: bool = False,
) -> Iterator[PredictionEvent]:
    """Replay book updates and yield model predictions."""
    simulator = HistoricalMessageSimulator(
        data_path=data_path,
        interval_seconds=interval_seconds,
        realtime=realtime,
    )
    engine = StreamingInferenceEngine(model_path=model_path)

    for message in simulator.stream(limit=limit):
        yield engine.predict_message(message)
