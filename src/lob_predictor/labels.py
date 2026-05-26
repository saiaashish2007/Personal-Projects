"""Short-horizon labels for order book forecasting."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from lob_predictor.features import mid_price


@dataclass(frozen=True)
class LabelConfig:
    """Configuration for up/stationary/down labels."""

    horizon: int = 50
    threshold_bps: float = 0.5
    use_future_mean: bool = True


LABEL_DOWN = 0
LABEL_STATIONARY = 1
LABEL_UP = 2


def make_direction_labels(book: pd.DataFrame, config: LabelConfig | None = None) -> pd.Series:
    """Create short-horizon labels from future mid-price returns.

    Labels:
    - 0: future mid-price moves down beyond the threshold.
    - 1: future mid-price stays inside the threshold.
    - 2: future mid-price moves up beyond the threshold.
    """
    config = config or LabelConfig()
    if config.horizon <= 0:
        raise ValueError("horizon must be positive.")
    if config.threshold_bps < 0:
        raise ValueError("threshold_bps must be non-negative.")

    current_mid = mid_price(book)
    if config.use_future_mean:
        future_mid = current_mid.shift(-1).rolling(config.horizon, min_periods=config.horizon).mean()
        future_mid = future_mid.shift(-(config.horizon - 1))
    else:
        future_mid = current_mid.shift(-config.horizon)

    future_return_bps = ((future_mid - current_mid) / current_mid) * 10_000.0
    labels = pd.Series(LABEL_STATIONARY, index=book.index, dtype="int64")
    labels[future_return_bps > config.threshold_bps] = LABEL_UP
    labels[future_return_bps < -config.threshold_bps] = LABEL_DOWN
    labels[future_return_bps.isna()] = -1
    return labels


def align_features_and_labels(
    features: pd.DataFrame, labels: pd.Series
) -> tuple[pd.DataFrame, pd.Series]:
    """Drop rows without valid future labels and align indices."""
    valid = labels >= 0
    aligned_features = features.loc[valid].reset_index(drop=True)
    aligned_labels = labels.loc[valid].reset_index(drop=True)
    return aligned_features, aligned_labels


def class_distribution(labels: pd.Series) -> dict[str, int]:
    """Return readable class counts."""
    counts = labels.value_counts().to_dict()
    return {
        "down": int(counts.get(LABEL_DOWN, 0)),
        "stationary": int(counts.get(LABEL_STATIONARY, 0)),
        "up": int(counts.get(LABEL_UP, 0)),
    }
