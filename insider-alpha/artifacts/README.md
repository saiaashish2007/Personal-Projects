# Artifact contract

This directory is the interface between the offline Python research pipeline and the
static dashboard in `web/`. Python writes JSON here; Next.js reads it at build time.
Nothing else crosses the boundary — there is no Python on Vercel and no runtime API.

Three representations of the same contract are kept in sync:

| Representation | Location | Audience |
|---|---|---|
| JSON Schema (draft 2020-12) | `artifacts/schema/*.schema.json` | the Python pipeline, for validation |
| TypeScript types | `web/src/lib/artifacts.ts` | the dashboard |
| This document | `artifacts/README.md` | humans |

If you change one, change all three.

## Files

| File | Written by | Contents |
|---|---|---|
| `meta.json` | every run | Run timestamp, git SHA, sample window, universe definition, package versions, per-milestone pipeline status |
| `data_profile.json` | milestone 1 | Transaction counts, transaction-code distribution, monthly event density, filing-lag distribution, ownership and joint-filing splits |
| `classifier.json` | milestone 3 | Routine/opportunistic/unclassified proportions pooled and over time, comparison to CMP's published proportions, post-2023 Rule 10b5-1 confusion matrix |
| `ic.json` | milestone 4 | Information coefficients by horizon, IC time series, IC decay, quintile sorts — **each computed twice**, with and without the opportunistic filter |
| `backtest.json` | milestone 5 | Equity curves, drawdowns, monthly returns, turnover, and summary statistics gross **and** net, per portfolio variant |
| `costs.json` | milestone 5 | Explicit cost model, flat round-trip cost sweep from 0 to 100 bps, break-even cost |
| `attribution.json` | milestone 6 | FF5 + momentum regressions: annualized alpha in bps with Newey-West t-stat, every loading with t-stat, R² |
| `robustness.json` | milestone 6 | Robustness grid, parameter sweep surface, randomization test, bootstrap intervals, specification count |
| `limitations.json` | hand-written | Known limitations and the "What Didn't Work" narrative |

## Conventions

These apply to every file and the dashboard depends on them.

- **Dates** are ISO-8601 `YYYY-MM-DD`. **Months** are `YYYY-MM`. **Timestamps** are RFC-3339
  UTC, e.g. `2026-01-15T18:42:11Z`.
- **Returns, volatilities and drawdowns** are decimals, not percentages: `0.075` is 7.5%.
  Drawdowns are negative.
- **Alphas and forward returns** are basis points, and the field name says so
  (`alpha_ann_bps`, `mean_forward_return_bps`).
- **Shares and proportions** are fractions in `[0, 1]`.
- **`null` means "not computed."** It is never a stand-in for zero. A firm with no
  qualifying purchases has signal `0`, not `null`; a statistic that was not run is `null`.
- **Point estimates travel with their uncertainty.** Anywhere an alpha, IC, or Sharpe is
  reported, the schema also requires a t-statistic, standard error, or confidence
  interval. The dashboard renders them together and has no code path that shows a bare
  point estimate.
- **IDs** (`variant_id`, regression `id`, robustness row `id`) are `snake_case` and stable
  across runs. Cross-file references — `costs.variant_id`, `backtest.primary_variant_id`,
  `robustness.baseline_id` — are resolved by ID, so renaming one breaks the other page.

## Every file carries a header

```jsonc
{
  "schema_version": "1.0.0",   // bump minor for additive changes, major for breaking ones
  "artifact": "ic",            // must match the filename
  "generated_at": "2026-01-15T18:42:11Z",
  "data_status": "real",       // "real" | "placeholder"
  "notes": null                // free text surfaced in the UI when non-null
  // ... artifact-specific fields
}
```

`data_status` is load-bearing. Anything other than `"real"` makes the dashboard render a
prominent PLACEHOLDER DATA badge in the header and on every page that reads the file, so
nothing fabricated is ever published without a warning. The fixtures currently in this
directory are placeholders; overwrite them with real output as each milestone lands.

## The two-arm requirement in `ic.json`

`ic.json` must contain exactly two arms:

- `arm: "opportunistic"` — the signal built only from purchases by insiders the classifier
  labels opportunistic
- `arm: "all_insiders"` — the identical pipeline with the routine/opportunistic filter
  removed

The delta between them is the project's headline result, so the dashboard treats a missing
arm as a build error rather than degrading gracefully. `headline[]` is a precomputed
side-by-side of the two so the UI does not have to join them; keep it consistent with
`arms[]`.

The same convention applies elsewhere: `backtest.json` should carry a variant with
`arm: "all_insiders"`, and `attribution.json` a regression on that variant.

## Regenerating placeholder fixtures

```bash
cd web
npm run fixtures    # rewrites every artifacts/*.json with fabricated but plausible data
npm run validate    # checks all nine files against artifacts/schema/*.schema.json
```

## Validating from Python

```python
import json
from pathlib import Path

import jsonschema

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"


def write_artifact(name: str, payload: dict) -> None:
    """Validate against the schema before writing, so a bad artifact never reaches the dashboard."""
    schema = json.loads((ARTIFACTS / "schema" / f"{name}.schema.json").read_text())
    jsonschema.validate(payload, schema)
    (ARTIFACTS / f"{name}.json").write_text(json.dumps(payload, indent=2) + "\n")
```

Schemas set `additionalProperties: false`, so an unexpected key fails loudly rather than
being silently dropped by the dashboard. Add the key to the schema and to
`web/src/lib/artifacts.ts` in the same change.

## Size

`backtest.json` and `ic.json` are the large ones — roughly 270 KB and 80 KB with a
twelve-year monthly sample and daily-resolution IC series. That is fine for a static
build. If a future artifact needs daily portfolio series, split it into its own file
rather than inflating `backtest.json`, since the dashboard imports whole files.
