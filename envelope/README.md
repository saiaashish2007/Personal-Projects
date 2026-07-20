# Envelope

**SKU Stress Envelope** — predict robot performance on new SKUs and operating conditions before rollout. Marketing site + interactive demo for VCs and design partners.

## Run locally

```bash
cd envelope
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the company website. The interactive demo lives at [http://localhost:3000/demo](http://localhost:3000/demo).

## Deploy on Vercel (free public link)

1. Push this repo (or the `envelope` folder) to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Set **Root Directory** to `envelope` (if the repo is a monorepo).
4. Framework preset should auto-detect **Next.js**.
5. Click **Deploy**.

Share `/demo` for the interactive product walkthrough.

## Site structure

| Route | What it shows |
|-------|----------------|
| **/** | Company website — product, comparison, FAQ, contact |
| **/demo** | Console overview — rollout risk health, drift alerts |
| **/demo/catalogs** | Score catalogs (interactive progress simulation) |
| **/demo/review** | Flagged SKUs — accept risk / exception lane |
| **/demo/skus** | SKU explorer — filter pass / marginal / fail |
| **/demo/developers** | API keys, curl example, request logs |

## Pitch framing

- **Buyer:** Founders, CTOs, and deployment engineers at small/mid robotics OEMs
- **Product:** Pre-rollout SKU performance prediction from fleet telemetry — not another fleet dashboard
- **Wedge:** Score a full customer catalog before you commit to an SLA

## Project structure

```
envelope/
├── src/
│   ├── app/
│   │   ├── (marketing)/    # Company website (/)
│   │   └── (dashboard)/    # Interactive demo (/demo/*)
│   ├── components/
│   │   ├── demo/           # Interactive demo panels
│   │   └── marketing/      # Landing page sections
│   └── lib/                # Mock SKU / catalog data, types
├── package.json
└── next.config.ts
```
