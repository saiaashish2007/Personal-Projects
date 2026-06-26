# VetComply

**Regulatory entity resolution for PE-backed veterinary roll-ups** — marketing site + interactive demo. Resolves messy post-acquisition rosters into canonical provider and clinic identities via API, MCP tools, and a human review console.

## Run locally

```bash
cd vetcomply
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the company website. The interactive demo lives at [http://localhost:3000/demo](http://localhost:3000/demo).

## Deploy on Vercel (free public link)

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository.
3. Set **Root Directory** to `vetcomply`.
4. Framework preset should auto-detect **Next.js**.
5. Click **Deploy**.

Share `/demo` for the interactive product walkthrough.

## Site structure

| Route | What it shows |
|-------|----------------|
| **/** | Company website — entity resolution platform, API/MCP, contact |
| **/demo** | Console overview — resolution health, active jobs |
| **/demo/roster-jobs** | Upload CSV, track resolve progress (interactive) |
| **/demo/review** | Review queue — confirm/reject matches with explain (interactive) |
| **/demo/entities** | Entity explorer — browse canonical providers & clinics |
| **/demo/developers** | API keys, MCP config, request logs |

## Pitch framing

- **Buyer:** Platform ops, M&A integration, and engineering teams at vet roll-ups
- **Product:** Regulatory entity resolution API + MCP — not a compliance dashboard or CS logbook
- **Wedge:** Fuzzy resolve post-acquisition rosters with human review + agent-native tools

## Project structure

```
vetcomply/
├── src/
│   ├── app/
│   │   ├── (marketing)/    # Company website (/)
│   │   └── (dashboard)/    # Interactive demo (/demo/*)
│   ├── components/
│   │   ├── demo/           # Interactive demo panels
│   │   └── marketing/      # Landing page sections
│   └── lib/                # Mock resolution data, types, utilities
├── package.json
└── next.config.ts
```
