"""Column naming helpers for Level 2 order book data."""

from __future__ import annotations

BOOK_SIDES = ("ask", "bid")
BOOK_FIELDS = ("price", "size")


def book_columns(levels: int = 10) -> list[str]:
    """Return canonical L2 columns in DeepLOB/FI-2010-friendly order."""
    columns: list[str] = []
    for level in range(1, levels + 1):
        columns.extend(
            [
                f"ask_price_{level}",
                f"ask_size_{level}",
                f"bid_price_{level}",
                f"bid_size_{level}",
            ]
        )
    return columns


def require_book_columns(columns: list[str], levels: int = 10) -> None:
    """Raise a clear error if expected L2 columns are missing."""
    missing = [column for column in book_columns(levels) if column not in columns]
    if missing:
        preview = ", ".join(missing[:8])
        raise ValueError(f"Missing required order book columns: {preview}")
