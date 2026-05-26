"""Feature engineering for Level 2 limit order book prediction."""

from __future__ import annotations

import numpy as np
import pandas as pd

from lob_predictor.schema import require_book_columns

EPSILON = 1e-12


def mid_price(book: pd.DataFrame) -> pd.Series:
    """Best bid/ask midpoint."""
    require_book_columns(list(book.columns), levels=1)
    return (book["ask_price_1"] + book["bid_price_1"]) / 2.0


def spread(book: pd.DataFrame) -> pd.Series:
    """Best ask minus best bid."""
    require_book_columns(list(book.columns), levels=1)
    return book["ask_price_1"] - book["bid_price_1"]


def microprice(book: pd.DataFrame) -> pd.Series:
    """Size-weighted best quote price.

    If bid size is large and ask size is small, this leans toward the ask because the
    visible book suggests upward pressure.
    """
    require_book_columns(list(book.columns), levels=1)
    bid_size = book["bid_size_1"]
    ask_size = book["ask_size_1"]
    denominator = bid_size + ask_size
    return ((book["ask_price_1"] * bid_size) + (book["bid_price_1"] * ask_size)) / (
        denominator + EPSILON
    )


def queue_imbalance(book: pd.DataFrame, levels: int = 10) -> pd.DataFrame:
    """Bid-vs-ask size imbalance at each level and across the visible book."""
    require_book_columns(list(book.columns), levels)
    output = pd.DataFrame(index=book.index)

    bid_total = pd.Series(0.0, index=book.index)
    ask_total = pd.Series(0.0, index=book.index)
    for level in range(1, levels + 1):
        bid_size = book[f"bid_size_{level}"]
        ask_size = book[f"ask_size_{level}"]
        output[f"imbalance_l{level}"] = (bid_size - ask_size) / (bid_size + ask_size + EPSILON)
        bid_total = bid_total + bid_size
        ask_total = ask_total + ask_size

    output["imbalance_total"] = (bid_total - ask_total) / (bid_total + ask_total + EPSILON)
    return output


def order_flow_toxicity_proxy(book: pd.DataFrame) -> pd.DataFrame:
    """Estimate one-sided aggressive pressure from changes at the best quotes.

    This is a proxy, not full VPIN/order-flow toxicity, because L2 snapshots do not
    contain every individual aggressor trade. It still captures useful pressure from
    quote moves and visible size changes.
    """
    require_book_columns(list(book.columns), levels=1)
    output = pd.DataFrame(index=book.index)

    bid_price_change = book["bid_price_1"].diff().fillna(0.0)
    ask_price_change = book["ask_price_1"].diff().fillna(0.0)
    bid_size_change = book["bid_size_1"].diff().fillna(0.0)
    ask_size_change = book["ask_size_1"].diff().fillna(0.0)

    signed_quote_move = np.sign(bid_price_change + ask_price_change)
    signed_depth_change = bid_size_change - ask_size_change
    raw_pressure = signed_quote_move + np.sign(signed_depth_change)

    output["signed_quote_move"] = signed_quote_move
    output["signed_depth_change"] = signed_depth_change
    output["toxicity_proxy"] = pd.Series(raw_pressure, index=book.index).rolling(20, min_periods=1).mean()
    return output


def spread_dynamics(book: pd.DataFrame) -> pd.DataFrame:
    """Spread, relative spread, and short-term spread change."""
    current_mid = mid_price(book)
    current_spread = spread(book)
    output = pd.DataFrame(index=book.index)
    output["mid_price"] = current_mid
    output["spread"] = current_spread
    output["relative_spread"] = current_spread / (current_mid + EPSILON)
    output["spread_change"] = current_spread.diff().fillna(0.0)
    output["spread_rolling_mean_20"] = current_spread.rolling(20, min_periods=1).mean()
    return output


def engineer_features(book: pd.DataFrame, levels: int = 10) -> pd.DataFrame:
    """Build the full feature set used by baseline models and streaming inference."""
    require_book_columns(list(book.columns), levels)
    features = pd.concat(
        [
            spread_dynamics(book),
            pd.DataFrame({"microprice": microprice(book)}, index=book.index),
            queue_imbalance(book, levels=levels),
            order_flow_toxicity_proxy(book),
        ],
        axis=1,
    )
    features = features.assign(microprice_distance=features["microprice"] - features["mid_price"])
    return features.replace([np.inf, -np.inf], np.nan).ffill().fillna(0.0)
