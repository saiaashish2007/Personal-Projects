# VetComply

**Compliance OS for PE-backed veterinary roll-ups** — company website + interactive demo for VC pitches. Tracks DEA registrations, state licenses, controlled substance compliance, M&A diligence, and a **Compliance Agent** that pre-fills regulatory forms.

## Run locally

```bash
cd vetcomply
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the company website. The interactive demo lives at [http://localhost:3000/demo](http://localhost:3000/demo).

## Deploy on Vercel (free public link)

This app is a standard Next.js project. Deploy it from GitHub in a few minutes:

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository.
3. Set **Root Directory** to `vetcomply` (the app lives in a subfolder of the repo).
4. Framework preset should auto-detect **Next.js** — leave build command as `npm run build` and output as default.
5. Click **Deploy**.

Vercel will give you a URL like `https://vetcomply-xxx.vercel.app` for the company site. Share `/demo` for the interactive product walkthrough. Every push to `main` redeploys automatically.

### CLI deploy (optional)

```bash
cd vetcomply
npx vercel
```

Follow the prompts. Use the same root directory if deploying from the monorepo root.

## Site structure

| Route | What it shows |
|-------|----------------|
| **/** | Company website — who we are, platform overview, contact |
| **/demo** | Interactive demo — portfolio health, Compliance Agent, alerts |
| **/demo/locations** | Per-clinic DEA, license, CS log status |
| **/demo/acquisitions** | M&A diligence findings + checklists |
| **/demo/licenses** | Renewal calendar |
| **/demo/alerts** | Expired DEAs, renewal deadlines |

## Pitch framing

- **Buyer:** Platform ops, compliance, and integration teams at vet roll-ups
- **Wedge:** Roll-up-level compliance OS (not per-clinic PIMS like VetSnap)
- **v2 differentiator:** Compliance Agent pre-fills DEA Form 224a, biennial inventory, Form 106, ownership changes, M&A diligence packets

## Project structure

```
vetcomply/
├── src/
│   ├── app/
│   │   ├── (marketing)/    # Company website (/)
│   │   └── (dashboard)/    # Interactive demo (/demo/*)
│   ├── components/         # UI components (sidebar, compliance agent, etc.)
│   └── lib/                # Mock data, form definitions, utilities
├── package.json
└── next.config.ts
```
