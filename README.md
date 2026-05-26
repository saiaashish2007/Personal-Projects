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
  -d '{"asks": [[100.10, 5], [100.11, 6], [100.12, 7], [100.13, 8], [100.14, 9], [100.15, 10], [100.16, 11], [100.17, 12], [100.18, 13], [100.19, 14]], "bids": [[100.00, 5], [99.99, 6], [99.98, 7], [99.97, 8], [99.96, 9], [99.95, 10], [99.94, 11], [99.93, 12], [99.92, 13], [99.91, 14]}'
```

The service keeps a small in-memory history so rolling features such as spread averages and order-flow proxies update as messages arrive.

## Live App

**https://personal-projects-edihazbejm4yf53jdr9nfe.streamlit.app/**

The Streamlit trading dashboard includes:

- Dark Coinbase/trading-terminal style layout.
- Yahoo Finance candlestick and volume chart for selected crypto tickers.
- Top 10 bid/ask order book ladder.
- Bloomberg-style multi-level order book monitor with cumulative depth, depth imbalance, weighted liquidity, liquidity slope, top-3 concentration, and large-wall detection.
- Up/down/stationary prediction card.
- Confidence, mid-price, spread, microprice, queue imbalance, toxicity proxy, and latency.
- Streaming-style feature charts.
- Yahoo Finance crypto price charts and Coinbase (`COIN`) news.
- Synthetic demo data, uploaded CSV data, or one live Coinbase BTC-USD snapshot.

Yahoo Finance data is used only for frontend market context: crypto price charts, broad quote stats, and Coinbase news. The prediction engine itself still uses L2 order book snapshots from synthetic data, uploaded files, Coinbase, or Binance-compatible collectors.

## AI Health Model (Skin Lesion Temporal Change Detection)

This repository also includes an AI notebook (`AI Health Model.ipynb`) focused on **detecting clinically concerning changes in skin lesions over time** (baseline vs follow-up), rather than doing a “skin cancer classification” from a single photo.

### What it predicts

For an image pair (baseline + follow-up), the model outputs:
- **Multi-class change label**: `None`, `Minor`, `Moderate`, `Significant`
- **Binary label**: `Concerning` vs `Non-concerning`

The notebook explicitly frames the model as a **monitoring/triage tool** (safer/legal intent), answering:
> “Has this lesion changed in a clinically concerning way over time?”

### Data and pair construction

- Uses the **ISIC 2019 Challenge** dataset (downloaded via `kagglehub` in the notebook).
- Creates **temporal training pairs** by simulating lesion evolution between baseline and follow-up using a temporal lesion simulator (progressive changes in lesion appearance such as size, border irregularity, and color variation).
- Splits images into **train / validation / test** and wraps them in a `TemporalPairDataset` so each training example contains:
  - `baseline` image tensor
  - `followup` image tensor
  - multi-class change target
  - binary concerning target

### Feature extraction pipeline (clinically motivated)

Section 3 builds a lesion feature extractor that:
- Performs a simple segmentation/foreground isolation (multiple thresholding strategies, then selects the best mask for the central lesion region)
- Computes and tracks interpretable features for **shape**, **border**, and **color**:
  - Shape: area, asymmetry, circularity
  - Border: irregularity, edge smoothness
  - Color: per-channel variance and color distribution/entropy

These features are mainly used for simulation/analysis and interpretability, while the main prediction model is trained end-to-end.

### Model architecture: ViT + temporal attention

Section 4 defines `TemporalChangeDetectionViT`, a **Vision Transformer** model that:
- Encodes baseline and follow-up images with a pretrained ViT backbone
- Uses **temporal attention** (multi-head attention) to compare follow-up tokens against baseline tokens
- Fuses baseline and follow-up representations and produces:
  - multi-class logits (4 classes)
  - binary logits (concerning vs non-concerning)

### Training setup

Section 5 uses a combined objective:
- **Multi-class focal loss** (to handle class imbalance)
- **Binary BCE-with-logits loss**
- Weighted combination of the two losses

Training uses common performance safeguards (batch sizing, workers, optional GPU optimizations, mixed precision when CUDA is available, and gradient clipping).

### Reported evaluation (from the notebook)

On the notebook’s test set evaluation, it prints:
- **Multi-class accuracy**: `0.7650`
- **Binary accuracy**: `0.9150`
- **ROC-AUC (binary)**: `0.9533`

It also prints confusion matrices and classification reports for both the multi-class and binary tasks.

## Next Upgrade

After the REST snapshot collector works, the next step is a true WebSocket depth-update collector that stores incremental book changes. That would be closer to exchange-native streaming and would reduce the information loss from one-second polling. The current simulator and HTTP service are designed so a WebSocket collector can feed the same `MarketDataMessage` path later.

