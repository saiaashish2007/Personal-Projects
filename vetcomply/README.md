# VetComply

**Compliance OS for PE-backed veterinary roll-ups** — demo for VC pitches. Tracks DEA registrations, state licenses, controlled substance compliance, M&A diligence, and a **Compliance Agent** that pre-fills regulatory forms.

## Run locally (Streamlit)

```bash
cd vetcomply
pip install -r requirements.txt
streamlit run streamlit_app.py
```

Open the URL shown in the terminal (usually http://localhost:8501).

## Deploy on Streamlit Community Cloud (free public link)

1. Push this folder to GitHub (see below).
2. Go to [share.streamlit.io](https://share.streamlit.io) and sign in with GitHub.
3. Click **New app** → select your repo.
4. Set **Main file path** to: `vetcomply/streamlit_app.py`
5. Set **App directory** (if prompted) to: `vetcomply`
6. Deploy — you'll get a URL like `https://vetcomply-xxx.streamlit.app` to share with VCs.

## Demo screens

| Page | What it shows |
|------|----------------|
| **Overview** | Portfolio health, alerts, acquisition pipeline |
| **Locations** | Per-clinic DEA, license, CS log status |
| **Acquisitions** | M&A diligence findings + checklists |
| **Licenses & DEA** | Renewal calendar |
| **Compliance Agent** | Interactive pre-fill for DEA 224a, biennial inventory, Form 106, etc. |
| **Alerts** | Expired DEAs, renewal deadlines |

## Pitch framing

- **Buyer:** Platform ops, compliance, and integration teams at vet roll-ups
- **Wedge:** Roll-up-level compliance OS (not per-clinic PIMS like VetSnap)
- **v2 differentiator:** Compliance Agent pre-fills DEA Form 224a, biennial inventory, Form 106, ownership changes, M&A diligence packets

## Project structure

```
vetcomply/
├── streamlit_app.py    # ← deploy this (Streamlit Cloud)
├── mock_data.py        # demo data
├── requirements.txt
├── .streamlit/config.toml
└── src/                # optional Next.js version (local dev only)
```

## Next.js version (optional)

A Next.js UI also exists under `src/` for local development:

```bash
npm install && npm run dev
```

For sharing with VCs, use the **Streamlit** deploy above.
