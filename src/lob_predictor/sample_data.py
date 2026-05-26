"""Synthetic order book data for demos and smoke tests."""

from __future__ import annotations

import numpy as np
import pandas as pd

from lob_predictor.schema import book_columns


def generate_sample_lob(rows: int, levels: int = 10, seed: int = 42) -> pd.DataFrame:
    """Generate realistic-looking L2 snapshots for demos without external data."""
    rng = np.random.default_rng(seed)
    mid = 100 + np.cumsum(rng.normal(0, 0.01, size=rows))
    base_spread = rng.choice([0.01, 0.02, 0.03], size=rows, p=[0.75, 0.2, 0.05])

    data: dict[str, np.ndarray] = {}
    for level in range(1, levels + 1):
        offset = base_spread / 2 + (level - 1) * 0.01
        data[f"ask_price_{level}"] = mid + offset
        data[f"ask_size_{level}"] = rng.integers(50, 2000, size=rows)
        data[f"bid_price_{level}"] = mid - offset
        data[f"bid_size_{level}"] = rng.integers(50, 2000, size=rows)

    return pd.DataFrame(data, columns=book_columns(levels))
