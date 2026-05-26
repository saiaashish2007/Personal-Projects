"""Baseline models for short-horizon LOB direction prediction."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from lob_predictor.data import load_order_book
from lob_predictor.features import engineer_features
from lob_predictor.labels import LabelConfig, align_features_and_labels, class_distribution, make_direction_labels


def time_ordered_split(
    features: pd.DataFrame, labels: pd.Series, train_fraction: float = 0.8
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """Split without shuffling to avoid training on future data."""
    if not 0.0 < train_fraction < 1.0:
        raise ValueError("train_fraction must be between 0 and 1.")
    split_index = int(len(features) * train_fraction)
    if split_index <= 0 or split_index >= len(features):
        raise ValueError("Not enough samples to create a train/test split.")
    return (
        features.iloc[:split_index],
        features.iloc[split_index:],
        labels.iloc[:split_index],
        labels.iloc[split_index:],
    )


def build_baseline_model() -> Pipeline:
    """Create a fast nonlinear baseline for engineered LOB features."""
    return Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "classifier",
                HistGradientBoostingClassifier(
                    max_iter=200,
                    learning_rate=0.05,
                    max_leaf_nodes=31,
                    random_state=42,
                ),
            ),
        ]
    )


def train_baseline(
    data_path: str | Path,
    horizon: int = 50,
    threshold_bps: float = 0.5,
    train_fraction: float = 0.8,
) -> tuple[Pipeline, dict[str, Any]]:
    """Train and evaluate a baseline classifier from an order book file."""
    book = load_order_book(data_path)
    features = engineer_features(book)
    labels = make_direction_labels(book, LabelConfig(horizon=horizon, threshold_bps=threshold_bps))
    features, labels = align_features_and_labels(features, labels)
    x_train, x_test, y_train, y_test = time_ordered_split(features, labels, train_fraction)

    model = build_baseline_model()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    metrics: dict[str, Any] = {
        "rows": int(len(features)),
        "feature_count": int(features.shape[1]),
        "horizon": int(horizon),
        "threshold_bps": float(threshold_bps),
        "class_distribution": class_distribution(labels),
        "accuracy": float(accuracy_score(y_test, predictions)),
        "macro_f1": float(f1_score(y_test, predictions, average="macro")),
        "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
        "classification_report": classification_report(
            y_test,
            predictions,
            labels=[0, 1, 2],
            target_names=["down", "stationary", "up"],
            zero_division=0,
            output_dict=True,
        ),
    }
    return model, metrics


def save_model(model: Pipeline, path: str | Path) -> None:
    """Save a trained sklearn pipeline."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)


def save_metrics(metrics: dict[str, Any], path: str | Path) -> None:
    """Save model metrics as JSON."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
