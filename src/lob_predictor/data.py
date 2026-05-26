"""Data loading utilities for public Level 2 order book datasets."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from lob_predictor.schema import book_columns, require_book_columns


def load_order_book(path: str | Path, levels: int = 10) -> pd.DataFrame:
    """Load an L2 order book dataset into canonical columns.

    Supported inputs:
    - CSV files with named canonical columns.
    - CSV/TXT numeric matrices where the first 40 values are L2 book features.
    - FI-2010-style matrices stored as features x samples, which are transposed.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Order book data not found: {path}")

    if path.suffix.lower() in {".csv"}:
        frame = pd.read_csv(path)
        canonical = book_columns(levels)
        if set(canonical).issubset(frame.columns):
            return frame[canonical].astype(float)
        matrix = frame.to_numpy(dtype=float)
    else:
        matrix = np.loadtxt(path, delimiter="," if path.suffix.lower() == ".csv" else None)

    return matrix_to_order_book(matrix, levels=levels)


def matrix_to_order_book(matrix: np.ndarray, levels: int = 10) -> pd.DataFrame:
    """Convert a numeric matrix into canonical L2 order book columns."""
    matrix = np.asarray(matrix, dtype=float)
    if matrix.ndim != 2:
        raise ValueError("Expected a 2D matrix of order book values.")

    feature_count = 4 * levels
    if matrix.shape[1] < feature_count and matrix.shape[0] >= feature_count:
        matrix = matrix.T

    if matrix.shape[1] < feature_count:
        raise ValueError(
            f"Need at least {feature_count} columns for {levels} levels, got {matrix.shape[1]}."
        )

    frame = pd.DataFrame(matrix[:, :feature_count], columns=book_columns(levels))
    require_book_columns(list(frame.columns), levels)
    return frame


def save_processed_features(features: pd.DataFrame, path: str | Path) -> None:
    """Persist engineered features for later model training."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    features.to_parquet(path, index=False)
