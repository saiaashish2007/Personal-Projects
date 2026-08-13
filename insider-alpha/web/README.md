# Dashboard

The public research dashboard for the Opportunistic Insider Alpha project. Next.js App
Router, TypeScript, Tailwind, Recharts, exported as a fully static site.

There is no server and no runtime API. The Python pipeline runs offline and writes
versioned JSON to `../artifacts/`; this app reads those files **at build time** and
prerenders every page to HTML. Deploying is therefore just uploading a folder.

## Local development

```bash
cd insider-alpha/web
npm install
npm run fixtures     # only if ../artifacts is empty — writes placeholder data
npm run dev          # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-checks and writes the static site to `out/` |
| `npm run start` | Serves the built `out/` directory locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate` | Validates every artifact against `../artifacts/schema/*.schema.json` |
| `npm run fixtures` | Regenerates the placeholder artifacts |
| `npm run sync:artifacts` | Copies `../artifacts/*.json` into `web/artifacts/` (see below) |

`npm run build` runs `tsc` as part of the Next build and fails on any type error, so a
green build means the artifacts on disk satisfy the TypeScript contract in
`src/lib/artifacts.ts`. It does **not** re-validate against JSON Schema — run
`npm run validate` for that, which the Vercel build command does automatically.

## Where the data comes from

The loader in `src/lib/data.ts` looks for artifacts in two places, in order:

1. `../artifacts/` — the committed source of truth, written by the Python pipeline
2. `./artifacts/` — a local copy, only used when the build host cannot read above the
   project root

Every artifact carries a `data_status` field. While it reads `placeholder`, the header and
every page display a PLACEHOLDER DATA badge. Replacing the fixtures with real pipeline
output and setting `data_status: "real"` removes the badge — nothing else needs to change.

The contract itself is documented in [`../artifacts/README.md`](../artifacts/README.md).

## Deploying to Vercel

The repository is a multi-project monorepo. **Root directory is the setting that breaks
monorepo deploys**, so get it right first.

### One-time setup, via the dashboard

1. Go to <https://vercel.com/new> and import the GitHub repository
   `saiaashish2007/Personal-Projects`.
2. **Set Root Directory to `insider-alpha/web`.** Click *Edit* next to Root Directory
   during import; the default of `./` will fail because there is no `package.json` at the
   repository root.
3. Under *Build & Development Settings*, leave everything on the defaults — the framework
   preset is Next.js. **Do not set Output Directory to `out`.** The Next.js builder looks
   for `routes-manifest.json` there and fails; `next.config` `output: "export"` is enough.
4. Expand *Root Directory* options and **enable "Include source files outside of the Root
   Directory in the Build Step."** The build reads `../artifacts/`, which lives above the
   root directory. If this is left off, the build fails with
   `Artifact meta.json not found in any of: ...`.
5. Deploy. The build takes well under a minute; the first one installs dependencies.

If step 4 is unavailable or you would rather not depend on it, run
`npm run sync:artifacts`, remove `web/artifacts/` from `insider-alpha/.gitignore`, and
commit the copy. The loader picks it up automatically and the build no longer touches
anything outside `web/`.

### Or, from the command line

```bash
cd insider-alpha/web
npx vercel link          # answer: link to existing project or create new
npx vercel --prod        # deploys the current directory as the project root
```

`vercel link` records the project in `.vercel/`, which is gitignored. Running the CLI from
inside `web/` makes this directory the root, so the root-directory setting is handled
implicitly — but the "include files outside root directory" concern above still applies.

### After the first deploy

- Add the live URL to the repository description and to the top of `../README.md`.
- Every push to `main` redeploys. There is nothing to configure for previews.
- To publish new research output: rerun the pipeline, commit the changed
  `artifacts/*.json`, push. The site rebuilds against the new numbers.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Could not read package.json` / `No Next.js version detected` | Root Directory is not `insider-alpha/web` |
| `routes-manifest.json couldn't be found` under `.../out/` | Output Directory was set to `out`; clear it so Next.js uses `.next` |
| `Artifact meta.json not found in any of: …` | "Include source files outside of the Root Directory" is off; enable it or run `npm run sync:artifacts` and commit `web/artifacts/` |
| `ic.json is missing the "…" arm` | The pipeline wrote only one arm. Both the filter-on and filter-off arms are required; the comparison is the headline result |
| `npm ci` fails | `package-lock.json` is out of sync with `package.json`; run `npm install` locally and commit the lockfile |
| Charts render blank | A chart component was imported into a server component without `"use client"` at the top of the chart file |

## Structure

```
src/
  app/                 one directory per page, matching SPEC.md section 14
    page.tsx           Thesis
    data/              Data & Parsing
    signal/            Signal Construction
    ic/                IC Analysis
    backtest/          Backtest
    costs/             Cost Sensitivity
    attribution/       Factor Attribution
    robustness/        Robustness
    what-didnt-work/   What Didn't Work
  components/
    ui.tsx             typography, tables, stat tiles, callouts, placeholder badge
    charts/            client components wrapping Recharts, plus a CSS-only heatmap
  lib/
    artifacts.ts       TypeScript mirror of the artifact contract
    data.ts            build-time artifact loading
    format.ts          number, percent, basis-point and t-statistic formatting
scripts/
  generate-placeholders.mjs
  validate-artifacts.mjs
  sync-artifacts.mjs
```

Charting is Recharts: it renders SVG, works under static export with no server component,
has first-class error bars and reference lines — both of which this site needs in order to
never show a point estimate without its uncertainty — and is small enough that the whole
site ships in a few hundred kilobytes. The parameter-sweep heatmap is plain CSS grid, with
no JavaScript at all.
