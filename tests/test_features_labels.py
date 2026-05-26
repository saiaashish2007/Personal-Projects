from __future__ import annotations

import pandas as pd

from lob_predictor.features import engineer_features, microprice
from lob_predictor.labels import LabelConfig, make_direction_labels
from lob_predictor.schema import book_columns


def sample_book(rows: int = 120, levels: int = 10) -> pd.DataFrame:
    data = {}
    for level in range(1, levels + 1):
        data[f"ask_price_{level}"] = [100.01 + i * 0.001 + level * 0.01 for i in range(rows)]
        data[f"ask_size_{level}"] = [100 + level for _ in range(rows)]
        data[f"bid_price_{level}"] = [99.99 + i * 0.001 - level * 0.01 for i in range(rows)]
        data[f"bid_size_{level}"] = [200 + level for _ in range(rows)]
    return pd.DataFrame(data, columns=book_columns(levels))


def test_engineer_features_contains_core_signals() -> None:
    features = engineer_features(sample_book())

    assert "imbalance_total" in features.columns
    assert "microprice_distance" in features.columns
    assert "toxicity_proxy" in features.columns
    assert "spread_change" in features.columns
    assert len(features) == 120


def test_microprice_leans_toward_ask_when_bid_size_is_larger() -> None:
    book = sample_book(rows=1)
    value = microprice(book).iloc[0]
    midpoint = (book["ask_price_1"].iloc[0] + book["bid_price_1"].iloc[0]) / 2

    assert value > midpoint


def test_labels_drop_final_horizon() -> None:
    labels = make_direction_labels(sample_book(), LabelConfig(horizon=10, threshold_bps=0.0))

    assert (labels.iloc[:-10] >= 0).all()
    assert (labels.iloc[-10:] == -1).all()
