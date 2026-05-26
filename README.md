# Limit Order Book Prediction Engine

Predict short-horizon mid-price movement from Level 2 limit order book snapshots.

This version can train on benchmark-style CSVs, synthetic data, or free real L2 snapshots collected from Binance/Coinbase public APIs.

## Data

Expected local layout:

```text
data/
  raw/
    binance_btcusdt.csv
    coinbase_btcusd.csv
  processed/
models/
reports/
```

The loader supports two practical formats:

1. A simple CSV with 40 L2 columns:
   `ask_price_1`, `ask_size_1`, `bid_price_1`, `bid_size_1`, through level 10.
2. A FI-2010-style numeric matrix where the first 40 features are L2 book values. If the matrix is stored as features by samples, the loader transposes it automatically.

## Collect Real Free L2 Data

Collect Binance BTC/USDT snapshots:

```bash
PYTHONPATH=src python3 scripts/collect_l2_snapshots.py \
  --exchange binance \
  --symbol BTCUSDT \
  --samples 3600 \
  --interval 1 \
  --out data/raw/binance_btcusdt.csv
```

Binance may return HTTP 451 from some regions or networks. If that happens, use Coinbase as the default free source.

Collect Coinbase BTC/USD snapshots:

```bash
PYTHONPATH=src python3 scripts/collect_l2_snapshots.py \
  --exchange coinbase \
  --symbol BTC-USD \
  --samples 3600 \
  --interval 1 \
  --out data/raw/coinbase_btcusd.csv
```

These commands use free public REST APIs and save the top 10 bid/ask levels into the same canonical columns used by the trainer. Longer collection windows produce more useful training data. For example, `--samples 21600 --interval 1` collects about six hours of one-second snapshots. Coinbase is the recommended first real-data source because it worked from the current environment during smoke testing.

For quick testing without downloading a dataset, generate synthetic L2 data:

```bash
PYTHONPATH=src python3 scripts/generate_sample_data.py --rows 20000 --out data/raw/sample_lob.csv
```

## What The Features Mean

- Queue imbalance: compares bid-side size with ask-side size. More bid size means more visible buy interest; more ask size means more visible sell interest.
- Microprice: a mid-price adjusted by best bid and ask sizes. It leans toward the side where the book is thinner.
- Order flow toxicity proxy: estimates whether recent changes in the book look one-sided and aggressive.
- Spread dynamics: tracks the gap between best ask and best bid, plus how that gap changes.
- Short-horizon forecast: predicts whether the future mid-price moves down, stays flat, or moves up.

## Train A Baseline

```bash
PYTHONPATH=src python3 scripts/train_baseline.py \
  --data data/raw/binance_btcusdt.csv \
  --horizon 50 \
  --threshold-bps 0.5 \
  --model-out models/baseline.joblib \
  --report-out reports/baseline_metrics.json
```

## Train DeepLOB-Style Model

```bash
PYTHONPATH=src python3 scripts/train_deeplob.py \
  --data data/raw/binance_btcusdt.csv \
  --epochs 3 \
  --window 100 \
  --horizon 50 \
  --model-out models/deeplob.pt
```

## Streaming Inference Demo

The streaming demo replays historical rows as if they were live market updates:

```bash
PYTHONPATH=src python3 scripts/replay_stream.py \
  --data data/raw/coinbase_btcusd.csv \
  --model models/baseline.joblib \
  --limit 20 \
  --interval 1 \
  --realtime
```

## Low-Latency Inference Service

Start a local prediction service from a trained baseline model:

```bash
PYTHONPATH=src python3 scripts/serve_inference.py \
  --model models/baseline.joblib \
  --host 127.0.0.1 \
  --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Prediction requests can use either the 40 canonical columns or nested `asks`/`bids` arrays:

```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"asks": [[100.10, 5], [100.11, 6], [100.12, 7], [100.13, 8], [100.14, 9], [100.15, 10], [100.16, 11], [100.17, 12], [100.18, 13], [100.19, 14]], "bids": [[100.00, 5], [99.99, 6], [99.98, 7], [99.97, 8], [99.96, 9], [99.95, 10], [99.94, 11], [99.93, 12], [99.92, 13], [99.91, 14]]}'
```

The service keeps a small in-memory history so rolling features such as spread averages and order-flow proxies update as messages arrive.

## Free Public UI

The project includes a Streamlit trading dashboard in `streamlit_app.py`. It shows:

- Dark Coinbase/trading-terminal style layout.
- Yahoo Finance candlestick and volume chart for selected crypto tickers.
- Top 10 bid/ask order book ladder.
- Bloomberg-style multi-level order book monitor with cumulative depth, depth imbalance, weighted liquidity, liquidity slope, top-3 concentration, and large-wall detection.
- Up/down/stationary prediction card.
- Confidence, mid-price, spread, microprice, queue imbalance, toxicity proxy, and latency.
- Streaming-style feature charts.
- Yahoo Finance crypto price charts and Coinbase (`COIN`) news.
- Synthetic demo data, uploaded CSV data, local CSV data, or one live Coinbase BTC-USD snapshot.

Run locally:

```bash
pip install -r requirements.txt
PYTHONPATH=src streamlit run streamlit_app.py
```

Deploy for free on Streamlit Community Cloud:

1. Push this project to a public GitHub repository.
2. Go to [Streamlit Community Cloud](https://streamlit.io/cloud).
3. Create a new app from the GitHub repository.
4. Set the main file path to `streamlit_app.py`.
5. Leave the default branch selected and deploy.

Streamlit Cloud will install dependencies from `requirements.txt`. The app works without paid data because the default source is synthetic demo L2 data, and users can upload CSVs or fetch a Coinbase snapshot.

Yahoo Finance data is used only for frontend market context: crypto price charts, broad quote stats, and Coinbase news. The prediction engine itself still uses L2 order book snapshots from synthetic data, uploaded files, Coinbase, or Binance-compatible collectors.

## Next Upgrade

After the REST snapshot collector works, the next step is a true WebSocket depth-update collector that stores incremental book changes. That would be closer to exchange-native streaming and would reduce the information loss from one-second polling. The current simulator and HTTP service are designed so a WebSocket collector can feed the same `MarketDataMessage` path later.
