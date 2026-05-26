from __future__ import annotations

import sys
import time
from io import StringIO
from typing import Any
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go  # type: ignore[import-not-found]
from plotly.subplots import make_subplots  # type: ignore[import-not-found]
import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from lob_predictor.baseline import build_baseline_model, time_ordered_split
from lob_predictor.data import load_order_book, matrix_to_order_book
from lob_predictor.exchanges import CoinbaseClient
from lob_predictor.features import engineer_features
from lob_predictor.labels import LabelConfig, align_features_and_labels, make_direction_labels
from lob_predictor.sample_data import generate_sample_lob

LABEL_NAMES = {0: "Down", 1: "Stationary", 2: "Up"}
CRYPTO_TICKERS = {
    "Bitcoin": "BTC-USD",
    "Ethereum": "ETH-USD",
    "Solana": "SOL-USD",
    "Dogecoin": "DOGE-USD",
}
THEME = {
    "bg": "#05070b",
    "panel": "#0b0f14",
    "panel_2": "#101720",
    "border": "#1b2633",
    "grid": "#1d2a36",
    "text": "#e5edf5",
    "muted": "#7f8b99",
    "green": "#00d1a7",
    "red": "#ff4d5a",
    "blue": "#2f6bff",
    "cyan": "#2dd4bf",
    "amber": "#f6c85f",
}

YAHOO_COOLDOWN_SECONDS = 300


st.set_page_config(
    page_title="LOB Prediction Engine",
    page_icon=":chart_with_upwards_trend:",
    layout="wide",
)


@st.cache_data(show_spinner=False)
def synthetic_book(rows: int, seed: int) -> pd.DataFrame:
    return generate_sample_lob(rows=rows, seed=seed)


@st.cache_data(show_spinner=False)
def load_local_book(path: str) -> pd.DataFrame:
    return load_order_book(path)


@st.cache_data(show_spinner=False)
def parse_uploaded_book(file_bytes: bytes) -> pd.DataFrame:
    from io import BytesIO

    frame = pd.read_csv(BytesIO(file_bytes))
    try:
        return matrix_to_order_book(frame.to_numpy(dtype=float))
    except ValueError:
        return load_order_book_from_frame(frame)


@st.cache_resource(show_spinner=False)
def train_demo_model(
    book_csv: str,
    horizon: int,
    threshold_bps: float,
    train_fraction: float,
) -> tuple[object, pd.DataFrame, pd.Series, dict[str, float]]:
    book = pd.read_csv(StringIO(book_csv))
    features = engineer_features(book)
    labels = make_direction_labels(book, LabelConfig(horizon=horizon, threshold_bps=threshold_bps))
    features, labels = align_features_and_labels(features, labels)
    x_train, x_test, y_train, y_test = time_ordered_split(features, labels, train_fraction)
    model = build_baseline_model()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    metrics = {
        "test_accuracy": float((predictions == y_test).mean()),
        "train_rows": float(len(x_train)),
        "test_rows": float(len(x_test)),
    }
    return model, features, labels, metrics


def load_order_book_from_frame(frame: pd.DataFrame) -> pd.DataFrame:
    from lob_predictor.schema import book_columns

    columns = book_columns()
    if set(columns).issubset(frame.columns):
        return frame[columns].astype(float)
    return matrix_to_order_book(frame.to_numpy(dtype=float))


@st.cache_data(ttl=3600, show_spinner=False)
def load_yahoo_history(ticker: str, period: str, interval: str) -> pd.DataFrame:
    yf = import_yfinance()
    history = yf.Ticker(ticker).history(period=period, interval=interval)
    if history.empty:
        return pd.DataFrame()
    return history.reset_index()


def synthetic_candles_from_l2(book: pd.DataFrame, features: pd.DataFrame, row_index: int) -> pd.DataFrame:
    """Fallback OHLCV generator when Yahoo Finance is rate-limited/unavailable.

    We derive an OHLCV-like series from the L2 mid-price and nearby depth for volume.
    This keeps the UI usable even if external data fails.
    """
    # Use a small lookback window to create a visually reasonable chart.
    window = min(len(book), 240)
    start = max(0, row_index - window)
    end = min(len(features), row_index + 1)
    mid = features.iloc[start:end]["mid_price"].reset_index(drop=True)
    if len(mid) < 10:
        mid = features.iloc[: min(60, len(features))]["mid_price"].reset_index(drop=True)

    # Aggregate mid-price into ~60 candles.
    n_candles = 60
    n = len(mid)
    step = max(1, n // n_candles)

    mids = mid.iloc[::step].reset_index(drop=True)
    # Ensure we have enough points; if not, adjust by padding from the tail.
    if len(mids) < 10:
        mids = mid.reset_index(drop=True)

    # Build OHLC from the full window by chunking.
    chunks = [mid.iloc[i : i + step] for i in range(0, len(mid), step)]
    opens = [c.iloc[0] for c in chunks if len(c) > 0]
    closes = [c.iloc[-1] for c in chunks if len(c) > 0]
    highs = [float(c.max()) for c in chunks if len(c) > 0]
    lows = [float(c.min()) for c in chunks if len(c) > 0]

    # Synthetic volume: sum of level-1 sizes around each chunk.
    volume_series = features.iloc[start:end].reset_index(drop=True)
    if "imbalance_total" in volume_series.columns:
        # Approximate depth proxy using total depth from the raw book for the same range.
        depth_proxy = []
        for idx in range(start, end):
            # total top-10 depth = sum of bid+ask sizes across levels
            # (use level 1 as cheap proxy)
            depth_proxy.append(
                float(book.iloc[idx]["bid_size_1"] + book.iloc[idx]["ask_size_1"])
            )
        vol = pd.Series(depth_proxy)
    else:
        vol = pd.Series([1.0] * len(mid))
    vols = [float(c.sum()) for c in [vol.iloc[i : i + step] for i in range(0, len(vol), step)]]

    # Create a Datetime axis with uniform spacing.
    # Streamlit/Plotly only needs an x column; real timestamps are not required for UI.
    now = pd.Timestamp.utcnow().tz_localize(None)
    freq = "1min"  # visual only
    times = pd.date_range(end=now, periods=len(opens), freq=freq)

    return pd.DataFrame(
        {
            "Datetime": times,
            "Open": opens,
            "High": highs,
            "Low": lows,
            "Close": closes[: len(opens)],
            "Volume": vols[: len(opens)],
        }
    )


@st.cache_data(ttl=900, show_spinner=False)
def load_yahoo_info(ticker: str) -> dict[str, Any]:
    yf = import_yfinance()
    info = yf.Ticker(ticker).fast_info
    return dict(info) if info else {}


@st.cache_data(ttl=900, show_spinner=False)
def load_yahoo_news(ticker: str) -> list[dict[str, Any]]:
    yf = import_yfinance()
    news = yf.Ticker(ticker).news
    return list(news or [])


def import_yfinance() -> Any:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise RuntimeError("Install yfinance with `pip install -r requirements.txt`.") from exc
    return yf


def inject_trading_terminal_css() -> None:
    st.markdown(
        f"""
        <style>
        .stApp {{
            background:
                radial-gradient(circle at top left, rgba(45, 212, 191, 0.08), transparent 28rem),
                linear-gradient(135deg, {THEME["bg"]} 0%, #080b10 48%, #030507 100%);
            color: {THEME["text"]};
        }}
        [data-testid="stSidebar"] {{
            background: #06090d;
            border-right: 1px solid {THEME["border"]};
        }}
        [data-testid="stSidebar"] * {{
            color: {THEME["text"]};
        }}
        .block-container {{
            padding-top: 1.1rem;
            padding-bottom: 2rem;
            max-width: 1500px;
        }}
        h1, h2, h3 {{
            letter-spacing: -0.03em;
        }}
        div[data-testid="stMetric"] {{
            background: linear-gradient(180deg, {THEME["panel_2"]}, {THEME["panel"]});
            border: 1px solid {THEME["border"]};
            border-radius: 14px;
            padding: 0.75rem 0.85rem;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }}
        div[data-testid="stMetricLabel"] p {{
            color: {THEME["muted"]};
            font-size: 0.76rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }}
        div[data-testid="stMetricValue"] {{
            color: {THEME["text"]};
        }}
        .terminal-card {{
            background: linear-gradient(180deg, {THEME["panel_2"]}, {THEME["panel"]});
            border: 1px solid {THEME["border"]};
            border-radius: 16px;
            padding: 1rem;
            min-height: 100%;
            box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
        }}
        .terminal-header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
        }}
        .terminal-title {{
            font-size: 0.86rem;
            color: {THEME["text"]};
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }}
        .terminal-subtitle {{
            color: {THEME["muted"]};
            font-size: 0.78rem;
        }}
        .pill {{
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.28rem 0.6rem;
            border-radius: 999px;
            background: rgba(45, 212, 191, 0.08);
            border: 1px solid rgba(45, 212, 191, 0.25);
            color: {THEME["cyan"]};
            font-size: 0.75rem;
            font-weight: 700;
        }}
        .prediction-up {{
            color: {THEME["green"]};
            text-shadow: 0 0 18px rgba(0, 209, 167, 0.25);
        }}
        .prediction-down {{
            color: {THEME["red"]};
            text-shadow: 0 0 18px rgba(255, 77, 90, 0.25);
        }}
        .prediction-stationary {{
            color: {THEME["amber"]};
        }}
        .news-item {{
            border-bottom: 1px solid {THEME["border"]};
            padding: 0.65rem 0;
        }}
        .news-item:last-child {{
            border-bottom: 0;
        }}
        .news-meta {{
            color: {THEME["muted"]};
            font-size: 0.75rem;
            margin-top: 0.2rem;
        }}
        .dataframe {{
            background: {THEME["panel"]};
        }}
        .bbg-strip {{
            background: #0b0b0b;
            border: 1px solid #404040;
            color: #d8d8d8;
            font-family: Monaco, Menlo, Consolas, monospace;
            font-size: 0.78rem;
            padding: 0.45rem 0.55rem;
            margin-bottom: 0.35rem;
        }}
        .bbg-orange {{
            color: #ff9f1a;
        }}
        .bbg-green {{
            color: #55ff55;
        }}
        .bbg-red {{
            color: #ff4b4b;
        }}
        .bbg-table {{
            width: 100%;
            border-collapse: collapse;
            background: #050505;
            color: #d9d9d9;
            font-family: Monaco, Menlo, Consolas, monospace;
            font-size: 0.72rem;
            border: 1px solid #343434;
        }}
        .bbg-table th {{
            background: #ff9f1a;
            color: #050505;
            text-align: right;
            padding: 0.22rem 0.28rem;
            font-weight: 900;
            border-right: 1px solid #151515;
        }}
        .bbg-table td {{
            padding: 0.18rem 0.28rem;
            text-align: right;
            border-right: 1px solid #202020;
            border-bottom: 1px solid #151515;
            white-space: nowrap;
        }}
        .bbg-table tr:nth-child(even) td {{
            background: #0b0b0b;
        }}
        .bbg-level {{
            color: #ffbf4d;
            font-weight: 900;
        }}
        .bbg-bid {{
            color: #69a8ff;
        }}
        .bbg-ask {{
            color: #ff6b6b;
        }}
        .bbg-imb-pos {{
            color: #55ff55;
            font-weight: 800;
        }}
        .bbg-imb-neg {{
            color: #ff4b4b;
            font-weight: 800;
        }}
        .depth-summary-grid {{
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.45rem;
            margin-top: 0.6rem;
        }}
        .depth-summary-card {{
            border: 1px solid #323232;
            background: #090909;
            padding: 0.45rem;
            font-family: Monaco, Menlo, Consolas, monospace;
        }}
        .depth-summary-label {{
            color: #ff9f1a;
            font-size: 0.68rem;
        }}
        .depth-summary-value {{
            color: #f4f4f4;
            font-size: 1rem;
            font-weight: 900;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def order_book_ladder(book: pd.DataFrame, row_index: int) -> pd.DataFrame:
    row = book.iloc[row_index]
    levels = []
    for level in range(10, 0, -1):
        levels.append(
            {
                "Side": "Ask",
                "Level": level,
                "Price": row[f"ask_price_{level}"],
                "Size": row[f"ask_size_{level}"],
            }
        )
    for level in range(1, 11):
        levels.append(
            {
                "Side": "Bid",
                "Level": level,
                "Price": row[f"bid_price_{level}"],
                "Size": row[f"bid_size_{level}"],
            }
        )
    return pd.DataFrame(levels)


def multi_level_depth_features(book: pd.DataFrame, row_index: int, levels: int = 10) -> dict[str, Any]:
    """Compute institutional-style depth features across multiple book levels."""
    row = book.iloc[row_index]
    bid_sizes = [float(row[f"bid_size_{level}"]) for level in range(1, levels + 1)]
    ask_sizes = [float(row[f"ask_size_{level}"]) for level in range(1, levels + 1)]
    bid_prices = [float(row[f"bid_price_{level}"]) for level in range(1, levels + 1)]
    ask_prices = [float(row[f"ask_price_{level}"]) for level in range(1, levels + 1)]

    bid_total = sum(bid_sizes)
    ask_total = sum(ask_sizes)
    total_depth = bid_total + ask_total
    depth_imbalance = (bid_total - ask_total) / total_depth if total_depth else 0.0
    weights = [1.0 / level for level in range(1, levels + 1)]
    weighted_bid = sum(size * weight for size, weight in zip(bid_sizes, weights, strict=False))
    weighted_ask = sum(size * weight for size, weight in zip(ask_sizes, weights, strict=False))
    weighted_total = weighted_bid + weighted_ask
    weighted_imbalance = (
        (weighted_bid - weighted_ask) / weighted_total if weighted_total else 0.0
    )
    bid_slope = (bid_sizes[-1] - bid_sizes[0]) / max(levels - 1, 1)
    ask_slope = (ask_sizes[-1] - ask_sizes[0]) / max(levels - 1, 1)
    top3_depth = sum(bid_sizes[:3]) + sum(ask_sizes[:3])
    concentration = top3_depth / total_depth if total_depth else 0.0
    max_bid_level = int(max(range(levels), key=lambda index: bid_sizes[index]) + 1)
    max_ask_level = int(max(range(levels), key=lambda index: ask_sizes[index]) + 1)

    rows = []
    cumulative_bid = 0.0
    cumulative_ask = 0.0
    for level in range(1, levels + 1):
        bid_size = bid_sizes[level - 1]
        ask_size = ask_sizes[level - 1]
        cumulative_bid += bid_size
        cumulative_ask += ask_size
        level_total = bid_size + ask_size
        level_imbalance = (bid_size - ask_size) / level_total if level_total else 0.0
        rows.append(
            {
                "level": level,
                "bid_price": bid_prices[level - 1],
                "bid_size": bid_size,
                "bid_cum": cumulative_bid,
                "level_imbalance": level_imbalance,
                "ask_cum": cumulative_ask,
                "ask_size": ask_size,
                "ask_price": ask_prices[level - 1],
            }
        )

    return {
        "rows": rows,
        "bid_total": bid_total,
        "ask_total": ask_total,
        "depth_imbalance": depth_imbalance,
        "weighted_bid": weighted_bid,
        "weighted_ask": weighted_ask,
        "weighted_imbalance": weighted_imbalance,
        "bid_slope": bid_slope,
        "ask_slope": ask_slope,
        "concentration": concentration,
        "max_bid_level": max_bid_level,
        "max_ask_level": max_ask_level,
    }


def bloomberg_depth_html(book: pd.DataFrame, row_index: int) -> str:
    """Build a standalone Bloomberg-like HTML monitor."""
    depth = multi_level_depth_features(book, row_index)
    imbalance_class = "pos" if depth["depth_imbalance"] >= 0 else "neg"
    weighted_class = "pos" if depth["weighted_imbalance"] >= 0 else "neg"
    rows_html = []
    for row in depth["rows"]:
        imbalance = row["level_imbalance"]
        imbalance_class_row = "pos" if imbalance >= 0 else "neg"
        rows_html.append(
            f"""
            <tr>
              <td class="bid">{row["bid_price"]:,.2f}</td>
              <td class="bid">{row["bid_size"]:,.0f}</td>
              <td class="bid">{row["bid_cum"]:,.0f}</td>
              <td class="level">{row["level"]}</td>
              <td class="{imbalance_class_row}">{imbalance:+.1%}</td>
              <td class="ask">{row["ask_cum"]:,.0f}</td>
              <td class="ask">{row["ask_size"]:,.0f}</td>
              <td class="ask">{row["ask_price"]:,.2f}</td>
            </tr>
            """
        )

    return f"""
        <html>
        <head>
        <style>
        body {{
            margin: 0;
            background: #050505;
            color: #d9d9d9;
            font-family: Monaco, Menlo, Consolas, monospace;
        }}
        .shell {{
            border: 1px solid #303030;
            background: #050505;
            min-height: 100vh;
        }}
        .topbar {{
            display: grid;
            grid-template-columns: 1.2fr 0.9fr 0.9fr 0.9fr 0.9fr;
            gap: 2px;
            background: #131313;
            border-bottom: 1px solid #2d2d2d;
            padding: 4px;
        }}
        .tab {{
            background: #ff9f1a;
            color: #080808;
            font-weight: 900;
            padding: 5px 8px;
            font-size: 13px;
        }}
        .status {{
            background: #0a0a0a;
            color: #dcdcdc;
            padding: 5px 8px;
            font-size: 13px;
        }}
        .orange {{ color: #ff9f1a; }}
        .pos {{ color: #55ff55; font-weight: 900; }}
        .neg {{ color: #ff4b4b; font-weight: 900; }}
        .strip {{
            background: #0b0b0b;
            border-top: 1px solid #303030;
            border-bottom: 1px solid #303030;
            padding: 8px 10px;
            font-size: 13px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            background: #050505;
            font-size: 15px;
        }}
        th {{
            background: #ff9f1a;
            color: #050505;
            text-align: right;
            padding: 7px 8px;
            font-weight: 900;
            border-right: 1px solid #151515;
        }}
        td {{
            padding: 6px 8px;
            text-align: right;
            border-right: 1px solid #202020;
            border-bottom: 1px solid #151515;
            white-space: nowrap;
        }}
        tr:nth-child(even) td {{ background: #0b0b0b; }}
        .level {{ color: #ffbf4d; font-weight: 900; text-align: center; }}
        .bid {{ color: #69a8ff; }}
        .ask {{ color: #ff6b6b; }}
        .summary {{
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            padding: 10px;
            background: #070707;
        }}
        .card {{
            border: 1px solid #323232;
            background: #090909;
            padding: 10px;
        }}
        .label {{
            color: #ff9f1a;
            font-size: 12px;
            margin-bottom: 4px;
        }}
        .value {{
            color: #f4f4f4;
            font-size: 20px;
            font-weight: 900;
        }}
        .foot {{
            padding: 10px;
            color: #a8a8a8;
            font-size: 12px;
            border-top: 1px solid #222;
        }}
        </style>
        </head>
        <body>
        <div class="shell">
        <div class="topbar">
          <div class="tab">MULTI-LEVEL ORDER BOOK</div>
          <div class="status">BID DEPTH <span class="pos">{depth["bid_total"]:,.0f}</span></div>
          <div class="status">ASK DEPTH <span class="neg">{depth["ask_total"]:,.0f}</span></div>
          <div class="status">WALLS <span class="orange">B{depth["max_bid_level"]} / A{depth["max_ask_level"]}</span></div>
          <div class="status">TOP 10 LEVELS</div>
        </div>
        <div class="strip">
          <span class="orange">ORDER BOOK DEPTH MONITOR</span>
          &nbsp; Top 10 Bid/Ask Levels &nbsp;
          <span class="{imbalance_class}">Depth Imb {depth["depth_imbalance"]:+.2%}</span>
          &nbsp;|&nbsp;
          <span class="{weighted_class}">Weighted Imb {depth["weighted_imbalance"]:+.2%}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Bid Px</th>
              <th>Bid Sz</th>
              <th>Cum Bid</th>
              <th>Lvl</th>
              <th>Imb</th>
              <th>Cum Ask</th>
              <th>Ask Sz</th>
              <th>Ask Px</th>
            </tr>
          </thead>
          <tbody>
            {''.join(rows_html)}
          </tbody>
        </table>
        <div class="summary">
          <div class="card">
            <div class="label">Cumulative Bid Depth</div>
            <div class="value">{depth["bid_total"]:,.0f}</div>
          </div>
          <div class="card">
            <div class="label">Cumulative Ask Depth</div>
            <div class="value">{depth["ask_total"]:,.0f}</div>
          </div>
          <div class="card">
            <div class="label">Weighted Liquidity</div>
            <div class="value">{depth["weighted_bid"] + depth["weighted_ask"]:,.0f}</div>
          </div>
          <div class="card">
            <div class="label">Top-3 Concentration</div>
            <div class="value">{depth["concentration"]:.1%}</div>
          </div>
          <div class="card">
            <div class="label">Bid / Ask Slope</div>
            <div class="value">{depth["bid_slope"]:+.0f} / {depth["ask_slope"]:+.0f}</div>
          </div>
          <div class="card">
            <div class="label">Largest Walls</div>
            <div class="value">B{depth["max_bid_level"]} / A{depth["max_ask_level"]}</div>
          </div>
        </div>
        <div class="foot">
          Cumulative depth captures hidden pressure deeper in liquidity. Weighted liquidity emphasizes levels closer to the touch. Slope detects whether liquidity gets thicker or thinner deeper in the book.
        </div>
        </div>
        </body>
        </html>
    """


def render_multi_level_depth_monitor(
    book: pd.DataFrame,
    row_index: int,
    height: int = 720,
) -> None:
    """Render a Bloomberg-like multi-level order book monitor."""
    components.html(
        bloomberg_depth_html(book, row_index),
        height=height,
        scrolling=True,
    )


def yahoo_time_column(history: pd.DataFrame) -> str:
    for column in ["Datetime", "Date"]:
        if column in history.columns:
            return column
    return history.columns[0]


def create_candlestick_chart(history: pd.DataFrame, ticker: str) -> go.Figure:
    time_column = yahoo_time_column(history)
    fig = make_subplots(
        rows=2,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.02,
        row_heights=[0.78, 0.22],
    )
    fig.add_trace(
        go.Candlestick(
            x=history[time_column],
            open=history["Open"],
            high=history["High"],
            low=history["Low"],
            close=history["Close"],
            name=ticker,
            increasing_line_color=THEME["green"],
            increasing_fillcolor=THEME["green"],
            decreasing_line_color=THEME["red"],
            decreasing_fillcolor=THEME["red"],
            whiskerwidth=0.4,
        ),
        row=1,
        col=1,
    )
    volume_colors = [
        THEME["green"] if close >= open_ else THEME["red"]
        for open_, close in zip(history["Open"], history["Close"], strict=False)
    ]
    fig.add_trace(
        go.Bar(
            x=history[time_column],
            y=history["Volume"],
            name="Volume",
            marker_color=volume_colors,
            opacity=0.42,
        ),
        row=2,
        col=1,
    )
    fig.update_layout(
        height=610,
        margin=dict(l=10, r=10, t=24, b=8),
        paper_bgcolor=THEME["panel"],
        plot_bgcolor=THEME["panel"],
        font=dict(color=THEME["text"], family="Inter, -apple-system, BlinkMacSystemFont, sans-serif"),
        xaxis_rangeslider_visible=False,
        showlegend=False,
        hovermode="x unified",
    )
    fig.update_xaxes(
        gridcolor=THEME["grid"],
        zerolinecolor=THEME["grid"],
        linecolor=THEME["border"],
        tickfont=dict(color=THEME["muted"]),
    )
    fig.update_yaxes(
        gridcolor=THEME["grid"],
        zerolinecolor=THEME["grid"],
        linecolor=THEME["border"],
        tickfont=dict(color=THEME["muted"]),
    )
    return fig


def create_feature_chart(features: pd.DataFrame, row_index: int, chart_window: int) -> go.Figure:
    start_index = max(0, row_index - chart_window)
    chart = features.iloc[start_index : row_index + 1]
    fig = go.Figure()
    traces = [
        ("Mid", "mid_price", THEME["text"]),
        ("Microprice", "microprice", THEME["cyan"]),
        ("Spread", "spread", THEME["amber"]),
        ("Imbalance", "imbalance_total", THEME["blue"]),
        ("Toxicity", "toxicity_proxy", THEME["red"]),
    ]
    for name, column, color in traces:
        fig.add_trace(
            go.Scatter(
                x=chart.index,
                y=chart[column],
                mode="lines",
                name=name,
                line=dict(color=color, width=1.7),
            )
        )
    fig.update_layout(
        height=280,
        margin=dict(l=8, r=8, t=18, b=8),
        paper_bgcolor=THEME["panel"],
        plot_bgcolor=THEME["panel"],
        font=dict(color=THEME["text"]),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
        hovermode="x unified",
    )
    fig.update_xaxes(gridcolor=THEME["grid"], tickfont=dict(color=THEME["muted"]))
    fig.update_yaxes(gridcolor=THEME["grid"], tickfont=dict(color=THEME["muted"]))
    return fig


def create_probability_chart(probabilities: list[float] | Any) -> go.Figure:
    fig = go.Figure(
        go.Bar(
            x=["Down", "Stationary", "Up"],
            y=probabilities,
            marker_color=[THEME["red"], THEME["amber"], THEME["green"]],
        )
    )
    fig.update_layout(
        height=230,
        margin=dict(l=8, r=8, t=18, b=8),
        paper_bgcolor=THEME["panel"],
        plot_bgcolor=THEME["panel"],
        font=dict(color=THEME["text"]),
        yaxis=dict(range=[0, 1]),
        showlegend=False,
    )
    fig.update_xaxes(gridcolor=THEME["grid"], tickfont=dict(color=THEME["muted"]))
    fig.update_yaxes(gridcolor=THEME["grid"], tickfont=dict(color=THEME["muted"]))
    return fig


def latest_market_stats(history: pd.DataFrame) -> dict[str, float]:
    close = history["Close"].dropna()
    latest_close = float(close.iloc[-1])
    first_close = float(close.iloc[0])
    change = latest_close - first_close
    change_pct = (change / first_close) * 100 if first_close else 0.0
    return {
        "latest_close": latest_close,
        "change": change,
        "change_pct": change_pct,
        "high": float(history["High"].dropna().iloc[-1]),
        "low": float(history["Low"].dropna().iloc[-1]),
        "volume": float(history["Volume"].dropna().iloc[-1]) if "Volume" in history else 0.0,
    }


def prediction_class(prediction: str) -> str:
    if prediction == "Up":
        return "prediction-up"
    if prediction == "Down":
        return "prediction-down"
    return "prediction-stationary"


def render_market_context(
    yahoo_news: list[dict[str, Any]] | None,
    fetch_allowed: bool,
) -> None:
    st.markdown(
        """
        <div class="terminal-header">
          <div>
            <div class="terminal-title">Coinbase / Crypto News</div>
            <div class="terminal-subtitle">Yahoo Finance API feed for COIN and crypto market context</div>
          </div>
          <span class="pill">YF LIVE</span>
        </div>
        """,
        unsafe_allow_html=True,
    )
    if yahoo_news is not None:
        news_items = yahoo_news
    elif fetch_allowed:
        try:
            news_items = load_yahoo_news("COIN")
        except Exception as exc:  # noqa: BLE001
            st.warning(f"Yahoo Finance news is unavailable right now: {exc}")
            return
    else:
        st.info("Yahoo Finance news is disabled. Enable it in the sidebar and refresh.")
        return

    if not news_items:
        st.info("Yahoo Finance did not return Coinbase news items right now.")
        return

    for item in news_items[:5]:
        normalized = normalize_yahoo_news_item(item)
        title = normalized["title"]
        publisher = normalized["publisher"]
        link = normalized["link"]
        published_text = normalized["published"]
        href = link or "#"
        if link:
            st.markdown(
                f"""
                <div class="news-item">
                  <a href="{href}" target="_blank" style="color:{THEME["text"]}; text-decoration:none; font-weight:700;">{title}</a>
                  <div class="news-meta">{publisher} | {published_text}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                f"""
                <div class="news-item">
                  <div style="color:{THEME["text"]}; font-weight:700;">{title}</div>
                  <div class="news-meta">{publisher} | {published_text}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )


def normalize_yahoo_news_item(item: dict[str, Any]) -> dict[str, str | None]:
    content = item.get("content", {})
    title = item.get("title") or content.get("title") or "Untitled"
    publisher = (
        item.get("publisher")
        or content.get("provider", {}).get("displayName")
        or "Yahoo Finance"
    )
    link = (
        item.get("link")
        or content.get("canonicalUrl", {}).get("url")
        or content.get("clickThroughUrl", {}).get("url")
    )
    published = item.get("providerPublishTime") or content.get("pubDate") or content.get("displayTime")
    published_text = format_yahoo_news_time(published)
    return {
        "title": str(title),
        "publisher": str(publisher),
        "link": str(link) if link else None,
        "published": published_text,
    }


def format_yahoo_news_time(value: Any) -> str:
    if value is None:
        return ""
    try:
        if isinstance(value, (int, float)):
            return pd.to_datetime(value, unit="s").strftime("%Y-%m-%d %H:%M")
        return pd.to_datetime(value).strftime("%Y-%m-%d %H:%M")
    except (TypeError, ValueError):
        return ""


def format_optional_money(value: Any) -> str:
    try:
        if value is None:
            return "N/A"
        return f"${float(value):,.2f}"
    except (TypeError, ValueError):
        return "N/A"


def render_bloomberg_depth_page(
    book: pd.DataFrame,
    row_index: int,
    ticker: str,
    prediction_name: str,
    confidence: float,
) -> None:
    depth = multi_level_depth_features(book, row_index)
    st.markdown(
        f"""
        <div class="terminal-header">
          <div>
            <div class="terminal-title">Bloomberg-Style Multi-Level Order Book</div>
            <div class="terminal-subtitle">{ticker} top 10 bid/ask liquidity monitor</div>
          </div>
          <span class="pill">FULL SCREEN DEPTH</span>
        </div>
        """,
        unsafe_allow_html=True,
    )
    metric_cols = st.columns(6)
    metric_cols[0].metric("Prediction", prediction_name, f"{confidence:.1%}")
    metric_cols[1].metric("Cumulative Bid", f"{depth['bid_total']:,.0f}")
    metric_cols[2].metric("Cumulative Ask", f"{depth['ask_total']:,.0f}")
    metric_cols[3].metric("Depth Imbalance", f"{depth['depth_imbalance']:+.2%}")
    metric_cols[4].metric("Weighted Imbalance", f"{depth['weighted_imbalance']:+.2%}")
    metric_cols[5].metric("Largest Walls", f"B{depth['max_bid_level']} / A{depth['max_ask_level']}")

    render_multi_level_depth_monitor(book, row_index, height=830)

    explain_cols = st.columns(4)
    explain_cols[0].metric("Weighted Bid Liq", f"{depth['weighted_bid']:,.0f}")
    explain_cols[1].metric("Weighted Ask Liq", f"{depth['weighted_ask']:,.0f}")
    explain_cols[2].metric("Top-3 Concentration", f"{depth['concentration']:.1%}")
    explain_cols[3].metric("Bid / Ask Slope", f"{depth['bid_slope']:+.0f} / {depth['ask_slope']:+.0f}")

    with st.expander("How to read this monitor"):
        st.markdown(
            """
            - **Cum Bid / Cum Ask** shows how much visible liquidity is stacked through each level.
            - **Imb** shows whether each level is bid-heavy or ask-heavy.
            - **Weighted liquidity** gives more importance to levels closer to the best bid/ask.
            - **Slope** shows whether liquidity gets thicker or thinner deeper in the book.
            - **Largest walls** identify the deepest visible bid and ask levels in the top 10.
            """
        )


def main() -> None:
    inject_trading_terminal_css()

    with st.sidebar:
        st.markdown("### LOB TERMINAL")
        st.caption("Coinbase-style trading dashboard")
        st.divider()
        page = st.radio(
            "Page",
            ["Trading Terminal", "Bloomberg Depth Monitor"],
            label_visibility="collapsed",
        )
        st.divider()
        st.markdown("**Market**")
        crypto_name = st.selectbox("Asset", list(CRYPTO_TICKERS.keys()), label_visibility="collapsed")
        ticker = CRYPTO_TICKERS[crypto_name]
        period = st.selectbox("Chart period", ["1d", "5d", "1mo", "3mo", "6mo", "1y"], index=1)
        interval = st.selectbox("Candle interval", ["5m", "15m", "30m", "1h", "1d"], index=1)
        st.divider()
        st.markdown("**Prediction Data**")
        use_yahoo_context = st.checkbox("Enable Yahoo market context", value=True)
        news_limit = st.slider("News items", 1, 10, 5, step=1)
        refresh_yahoo = st.button("Fetch Yahoo (candles + news)", type="primary")
        source = st.radio(
            "Choose source",
            ["Synthetic demo", "Upload CSV", "Local CSV path", "Live Coinbase snapshot"],
            label_visibility="collapsed",
        )
        horizon = st.slider("Forecast horizon", 5, 200, 50, step=5)
        threshold_bps = st.slider("Stationary threshold (bps)", 0.0, 5.0, 0.5, step=0.1)
        train_fraction = st.slider("Train fraction", 0.5, 0.9, 0.8, step=0.05)

        if source == "Synthetic demo":
            rows = st.slider("Synthetic rows", 500, 10000, 3000, step=500)
            seed = st.number_input("Random seed", min_value=0, value=42, step=1)
            book = synthetic_book(rows=rows, seed=int(seed))
        elif source == "Upload CSV":
            uploaded = st.file_uploader("Upload canonical L2 CSV", type=["csv", "txt"])
            if uploaded is None:
                st.info("Upload a CSV with 40 L2 columns, or use the synthetic demo.")
                book = synthetic_book(rows=3000, seed=42)
            else:
                book = parse_uploaded_book(uploaded.getvalue())
        elif source == "Local CSV path":
            default_path = "data/raw/coinbase_btcusd.csv"
            path = st.text_input("Local CSV path", value=default_path)
            try:
                book = load_local_book(path)
            except Exception as exc:  # noqa: BLE001
                st.warning(f"Could not load `{path}`: {exc}. Falling back to synthetic data.")
                book = synthetic_book(rows=3000, seed=42)
        else:
            st.caption("Fetches one current Coinbase BTC-USD book snapshot. Model trains on synthetic demo data.")
            try:
                snapshot = CoinbaseClient(symbol="BTC-USD").fetch_snapshot().to_row()
                book = pd.concat(
                    [synthetic_book(rows=3000, seed=42), pd.DataFrame([snapshot]).drop(
                        columns=["timestamp", "exchange", "symbol"],
                        errors="ignore",
                    )],
                    ignore_index=True,
                )
            except Exception as exc:  # noqa: BLE001
                st.warning(f"Live Coinbase fetch failed: {exc}. Falling back to synthetic data.")
                book = synthetic_book(rows=3000, seed=42)

    market_history = st.session_state.get("yahoo_market_history", pd.DataFrame())
    market_info = st.session_state.get("yahoo_market_info", {})
    yahoo_news: list[dict[str, Any]] | None = st.session_state.get("yahoo_news")

    if use_yahoo_context:
        last_attempt = st.session_state.get("yahoo_last_attempt", 0.0)
        now = time.time()
        can_attempt = (now - float(last_attempt)) >= YAHOO_COOLDOWN_SECONDS
        # Avoid auto-fetch on every rerun; this prevents accidental "too many requests"
        # in Streamlit Cloud when widgets trigger rerenders.
        should_attempt = refresh_yahoo

        if should_attempt and can_attempt:
            st.session_state["yahoo_last_attempt"] = now
            try:
                market_history = load_yahoo_history(ticker, period, interval)
                market_info = load_yahoo_info(ticker)
                yahoo_news = load_yahoo_news("COIN")[: int(news_limit)]
                st.session_state["yahoo_market_history"] = market_history
                st.session_state["yahoo_market_info"] = market_info
                st.session_state["yahoo_news"] = yahoo_news
            except Exception as exc:  # noqa: BLE001
                st.session_state["yahoo_market_history"] = pd.DataFrame()
                st.session_state["yahoo_market_info"] = {}
                st.session_state["yahoo_news"] = None
                st.error(f"Yahoo Finance is rate-limited right now; using fallback candles. ({exc})")

    if len(book) < horizon + 20:
        st.error("Need more rows than the selected forecast horizon. Increase data rows or lower horizon.")
        return

    book_csv = book.to_csv(index=False)
    with st.spinner("Training cached baseline model and computing features..."):
        model, features, labels, metrics = train_demo_model(
            book_csv=book_csv,
            horizon=horizon,
            threshold_bps=threshold_bps,
            train_fraction=train_fraction,
        )

    max_index = min(len(features) - 1, len(book) - horizon - 1)
    with st.sidebar:
        row_index = st.slider("Replay position", 0, max_index, max_index)

    feature_row = features.iloc[row_index]
    start = time.perf_counter()
    probabilities = model.predict_proba(feature_row.to_frame().T)[0]
    prediction = int(probabilities.argmax())
    latency_ms = (time.perf_counter() - start) * 1000.0
    prediction_name = LABEL_NAMES[prediction]
    confidence = float(probabilities[prediction])

    if page == "Bloomberg Depth Monitor":
        render_bloomberg_depth_page(book, row_index, ticker, prediction_name, confidence)
        return

    if not market_history.empty:
        stats = latest_market_stats(market_history)
        last_price = stats["latest_close"]
        price_delta = f"{stats['change']:+,.2f} ({stats['change_pct']:+.2f}%)"
        high = stats["high"]
        low = stats["low"]
        volume = stats["volume"]
    else:
        last_price = float(feature_row["mid_price"])
        price_delta = "Yahoo unavailable"
        high = float(feature_row["mid_price"])
        low = float(feature_row["mid_price"])
        volume = 0.0

    st.markdown(
        f"""
        <div class="terminal-header">
          <div>
            <div class="terminal-title">LOB Prediction Trading Terminal</div>
            <div class="terminal-subtitle">COINBASE {ticker} / Yahoo Finance candles / L2 prediction engine</div>
          </div>
          <span class="pill">LIVE SIMULATION</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    header_cols = st.columns([1.1, 1.1, 1.0, 1.0, 1.0, 1.1])
    header_cols[0].metric(ticker, f"${last_price:,.2f}", price_delta)
    header_cols[1].metric("Prediction", prediction_name, f"{confidence:.1%} confidence")
    header_cols[2].metric("24h High", f"${high:,.2f}")
    header_cols[3].metric("24h Low", f"${low:,.2f}")
    header_cols[4].metric("Volume", f"{volume:,.0f}")
    header_cols[5].metric("Latency", f"{latency_ms:.2f} ms")

    chart_col, ladder_col, action_col = st.columns([2.2, 0.95, 0.9])
    with chart_col:
        st.markdown(
            f"""
            <div class="terminal-card">
              <div class="terminal-header">
                <div>
                  <div class="terminal-title">{ticker} Candlestick Chart</div>
                  <div class="terminal-subtitle">Yahoo Finance OHLCV (fallback to synthetic candles if rate-limited)</div>
                </div>
                <span class="pill">{period} / {interval}</span>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if market_history.empty:
            st.info("Yahoo Finance candles are unavailable (rate-limited). Showing synthetic candles derived from the L2 mid-price instead.")
            synthetic_history = synthetic_candles_from_l2(book=book, features=features, row_index=row_index)
            st.plotly_chart(create_candlestick_chart(synthetic_history, ticker), use_container_width=True)
        else:
            st.plotly_chart(create_candlestick_chart(market_history, ticker), use_container_width=True)

    with ladder_col:
        st.markdown(
            """
            <div class="terminal-card">
              <div class="terminal-header">
                <div>
                  <div class="terminal-title">Volume Ladder</div>
                  <div class="terminal-subtitle">Top 10 bid / ask levels</div>
                </div>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        ladder = order_book_ladder(book, row_index)
        st.dataframe(
            ladder,
            hide_index=True,
            use_container_width=True,
            column_config={
                "Price": st.column_config.NumberColumn(format="%.5f"),
                "Size": st.column_config.NumberColumn(format="%.4f"),
            },
        )
        st.markdown(
            f"""
            <div class="terminal-card" style="margin-top:0.75rem;">
              <div class="terminal-title">Spread</div>
              <div style="font-size:1.8rem;font-weight:800;color:{THEME["cyan"]};">{feature_row["spread"]:.5f}</div>
              <div class="terminal-subtitle">Best ask minus best bid</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with action_col:
        st.markdown(
            f"""
            <div class="terminal-card">
              <div class="terminal-title">Prediction</div>
              <div class="{prediction_class(prediction_name)}" style="font-size:2.7rem;font-weight:900;margin-top:0.4rem;">
                {prediction_name.upper()}
              </div>
              <div class="terminal-subtitle">Short-horizon mid-price movement</div>
              <div style="height:0.75rem;"></div>
              <div class="terminal-subtitle">Confidence</div>
              <div style="font-size:1.45rem;font-weight:800;">{confidence:.1%}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.progress(confidence, text="Model confidence")
        st.plotly_chart(create_probability_chart(probabilities), use_container_width=True)

    st.divider()
    lower_left, lower_mid, lower_right = st.columns([1.25, 1.25, 1.0])
    chart_window = st.slider("Feature chart lookback", 50, 500, 200, step=50)

    with lower_left:
        st.markdown(
            """
            <div class="terminal-card">
              <div class="terminal-header">
                <div>
                  <div class="terminal-title">Streaming Feature Updates</div>
                  <div class="terminal-subtitle">Mid, microprice, spread, imbalance, toxicity</div>
                </div>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.plotly_chart(create_feature_chart(features, row_index, chart_window), use_container_width=True)

    with lower_mid:
        st.markdown(
            f"""
            <div class="terminal-card">
              <div class="terminal-title">Multi-Level Depth</div>
              <div class="terminal-subtitle">Open the Bloomberg Depth Monitor page for the full table</div>
              <div style="height:0.7rem;"></div>
              <div style="color:{THEME["muted"]};font-size:0.82rem;">
                The full multi-level book is now on its own subpage so the dense bid/ask table has enough room.
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        depth = multi_level_depth_features(book, row_index)
        summary_cols = st.columns(2)
        summary_cols[0].metric("Depth Imbalance", f"{depth['depth_imbalance']:+.2%}")
        summary_cols[1].metric("Weighted Imb", f"{depth['weighted_imbalance']:+.2%}")
        summary_cols[0].metric("Cum Bid", f"{depth['bid_total']:,.0f}")
        summary_cols[1].metric("Cum Ask", f"{depth['ask_total']:,.0f}")
        st.info("Use the sidebar page selector: Bloomberg Depth Monitor.")

    with lower_right:
        st.markdown('<div class="terminal-card">', unsafe_allow_html=True)
        render_market_context(
            yahoo_news=st.session_state.get("yahoo_news"),
            fetch_allowed=use_yahoo_context and refresh_yahoo,
        )
        st.markdown("</div>", unsafe_allow_html=True)

    st.caption(
        f"Rows used: {len(features):,} | Current label: "
        f"{LABEL_NAMES.get(int(labels.iloc[row_index]), 'Unknown')} | "
        "Candles and news from Yahoo Finance; prediction data from L2 snapshots."
    )


if __name__ == "__main__":
    main()
