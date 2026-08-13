# Opportunistic Insider Alpha

An out-of-sample replication of Cohen, Malloy & Pomorski, *Decoding Inside Information*
(Journal of Finance, 2012), tested on 2014–2025 — a window entirely after the original
paper's sample ends.

**The question.** Corporate insiders file Form 4 within two business days of trading their
own company's stock. Most of that flow is uninformative: stock grants, option exercises,
and shares withheld for taxes are compensation mechanics, and much of the rest is
pre-scheduled diversification. The claim under test is that open-market purchases by
insiders who *don't* trade on a predictable annual schedule predict returns, and that the
routine-versus-opportunistic split is what separates signal from noise.

The headline experiment is therefore a comparison, not a backtest: run the strategy with
and without the opportunistic filter and measure the difference. If the effect has decayed
since publication, that is the finding.

See [`SPEC.md`](SPEC.md) for the full research protocol — hypothesis, universe
construction, signal math, validation gates, cost model, and robustness battery — written
before any code.

---

## Status

| # | Milestone | State |
|---|---|---|
| 1 | DERA ingestion + Form 4 transaction table | **Done** |
| 2 | Point-in-time universe, prices, forward returns | **Done** |
| 3 | Routine/opportunistic classifier | **Done** |
| 4 | Signal construction + IC analysis (**go/no-go**) | **NO-GO** — decay study |
| 5 | Backtest + transaction cost model | **Done** — decay: net Sharpe −0.41, no break-even |
| 6 | Factor attribution + robustness | **Done** — residual α −341 bps/yr (t=−0.84); deflated Sharpe −0.61 |
| 7 | Dashboard (static Next.js) | **Built** — nine pages, artifacts validate as real. Vercel: set root to `insider-alpha/web` (see `web/README.md`) |

## Data

Built from the SEC's [Insider Transactions Data
Sets](https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets) —
quarterly bulk archives of the XML contents of every Form 3/4/5 filing.

Using the bulk archives rather than scraping filings individually is what makes this
tractable: 4.5 million transactions would take days to fetch one at a time against EDGAR's
10 requests/second ceiling, versus about three minutes for 60 quarterly archives.

Current table, 2011-01-03 through 2025-12-31:

| | |
|---|---|
| Transactions | 4,491,080 |
| Open-market purchases (code `P`) | 489,372 (10.9%) |
| Distinct issuers | 12,798 |
| Distinct insiders | 149,693 |
| Superseded amendment rows removed | 59,480 |

Form 4 history starts in 2011, three years before the 2014 sample start, so the
routine/opportunistic classifier has the trailing history it needs on day one.

### Why the transaction code filter matters

Transaction codes in the realized sample:

| Code | Meaning | Share |
|---|---|---|
| `F` | Shares withheld for tax | most common |
| `S` | Open-market sale | |
| `A` | Grant / award | |
| `M` | Option exercise | |
| `P` | **Open-market purchase** | **10.9%** |

`A`, `M` and `F` together are roughly two thirds of all transactions. A signal built on
undifferentiated "insider buying" is mostly measuring payroll.

## Routine vs. opportunistic

An insider is **routine** at date `t` if there is a calendar month in which they traded
in each of the three years before `t`, **opportunistic** if they traded in each of those
three years with no such month, and **unclassified** otherwise. Classification is
strictly point-in-time: only filings from months strictly earlier than `t` are visible,
so a trade can never influence its own label and insiders migrate between buckets over
time. See [`SPEC.md` §6](SPEC.md) for every judgment call.

Realized proportions, 2014–2025, against the figures CMP report in their Table I:

| | This sample | CMP (1989–2007) |
|---|---|---|
| Classified share of all transactions | 25.4% | ~33% |
| Routine share of classified trades | 48.7% | 54.8% |
| Routine share of classified buys | 59.2% | 64.4% |
| Routine share of classified sells | 56.6% | 52.0% |

**The Rule 10b5-1 checkbox validates it.** The flag only exists from 2023, so the
classifier never sees it. Among 2024+ open-market trades, 58.6% of routine-labelled
trades were filed under a pre-scheduled plan versus 43.0% of opportunistic ones; among
purchases specifically, 13.3% versus 3.5% (odds ratio 4.3). The gap survives collapsing
to one observation per insider-year.

**The consequential judgment call** was measuring the pattern over open-market codes
only. Including grants, option exercises and tax withholding makes 83% of classified
trades routine, because monthly RSU vesting is perfectly calendar-locked — which would
mark every executive with equity comp permanently routine and discard their
discretionary purchases. Both settings are swept in `--sensitivity`.

Classifying 102,461 insiders across 4.5M transactions takes **1.5 seconds**.

## Signal and IC (go/no-go)

The pre-registered gate: opportunistic-filtered mean Spearman IC at 21 and 63
trading days must be positive with Newey-West t ≳ 2. Measured on 144 monthly
rebalances, 2014–2025:

| Horizon | Opp. IC | Opp. t | All-insider IC | All t |
|---|---:|---:|---:|---:|
| 1d | −0.0023 | −0.25 | −0.0024 | −0.33 |
| 5d | +0.0093 | +1.09 | +0.0132 | +1.86 |
| **21d** | **+0.0165** | **+2.16** | +0.0138 | +2.19 |
| **63d** | **+0.0157** | **+1.54** | +0.0157 | +1.82 |
| 126d | +0.0188 | +1.48 | +0.0188 | +1.92 |
| 252d | +0.0203 | +1.23 | +0.0211 | +2.06 |

**NO-GO.** 21-day clears; 63-day is positive but t = 1.54. The CMP filter does
not improve on unfiltered insider purchases (delta ≈ 0 at every horizon that
matters). Median opportunistic coverage is 46 names per month (3.3% of the
universe). Milestone 5 still runs a backtest so the decay is an equity curve,
not just a table. See [`SPEC.md` §8.1](SPEC.md).

```bash
python scripts/04_signal.py
```

## Backtest and costs (decay study)

SPEC defaults, 144 months, no Sharpe hunting. Primary variant `opp_etf_3m`
(opportunistic, sector-ETF hedge, 3-month overlapping vintages):

| | Gross | Net of ~16 bp RT |
|---|---:|---:|
| Sharpe (vs RF) | −0.36 | **−0.41** |
| CAGR | −5.5% | **−6.3%** |
| Max drawdown | | **−66.4%** |
| Turnover | | **5.42x** |
| Avg longs (overlapping book) | | **18.8** |

Break-even round-trip cost: **none**. Excess versus RF is −598 bps/year at zero
assumed cost (t = −1.24) and falls from there. The filter-off twin `all_etf_3m`
is less bad (net Sharpe −0.28, CAGR −2.9%), so the CMP filter does not help in
portfolio space either. See [`SPEC.md` §9.2–10.1](SPEC.md).

```bash
python scripts/05_backtest.py
```

## Attribution and robustness (decay writeup)

FF5+UMD on the primary net book `opp_etf_3m`, Newey-West 6 lags, 144 months:

| | |
|---|---|
| Residual α | **−341 bps/year** (t = −0.84) |
| SMB | **+0.69** (t = 3.71) |
| HML | +0.10 (t = 0.72) |
| UMD | −0.22 (t = −2.20) |
| R² | 0.33 |

The book is a small-cap tilt whose residual is still a loss, not a stealth value factor. Gross residual is −256 bps — costs do not create the hole. The filter-off twin is less bad (−102 bps).

Subperiod split: 2014–2019 net Sharpe +0.11 / α +424 bps (t = 0.81); **2020–2025 Sharpe −0.86 / α −1,187 bps (t = −2.52)**. Not a COVID artifact (ex-2020 Q1–Q2 Sharpe −0.43). Small-caps are the least-bad tercile and still lose money.

W×λ surface (21-day mean IC): +0.0024 to +0.0182, a weak plateau on W = 90–120; λ does not matter. No magic cell.

Randomization (shuffle S within date, 1,000 draws): observed 21-day IC +0.0165 sits at the **100th percentile** of the null — the faint ranking the IC gate already reported. That ranking does not survive the SPEC book.

Deflated Sharpe after 51 counted specifications: **−0.61**. Verdict: `signal_decayed`.

```bash
python scripts/06_attribution.py
```

## Setup

```bash
pip install -e .
export SEC_USER_AGENT="Your Name your@email.edu (research)"   # SEC requires this
python scripts/01_ingest.py --start-year 2011 --end-year 2025
python scripts/02_universe.py
python scripts/03_classify.py --sensitivity
python scripts/04_signal.py
python scripts/05_backtest.py
python scripts/06_attribution.py
```

Downloads are cached under `data/raw/` (gitignored), so re-runs are incremental. Run
ingestion locally — the SEC blocks cloud-provider IP ranges for bulk access.

## Dashboard

The findings are published as a static research dashboard: Thesis → Data & Parsing →
Signal Construction → IC Analysis → Backtest → Cost Sensitivity → Factor Attribution →
Robustness → What Didn't Work.

```bash
cd web
npm install
npm run build       # static export to web/out
```

The Python pipeline writes versioned JSON to [`artifacts/`](artifacts/README.md) and the
dashboard reads it at build time — no Python on the host, no runtime API. Until the
pipeline has produced real output the site renders placeholder fixtures and badges every
page accordingly. Deployment notes, including the Vercel root-directory setting, are in
[`web/README.md`](web/README.md).

## Layout

```
src/insider_alpha/
  config.py           paths, sample windows, transaction code constants
  ingest/dera.py      quarterly archive download with caching and backoff
  parse/form345.py    flatten archives into the transaction table
  signal/classify.py  point-in-time routine/opportunistic classifier
  signal/construct.py firm-level purchase score (two arms)
  analysis/ic.py      Spearman IC, quintile sorts, go/no-go
  analysis/attribution.py  FF5+UMD Newey-West regressions
  analysis/robustness.py   SPEC §12 battery
  backtest/           overlapping portfolios, cost model, engine
scripts/
  01_ingest.py        milestone 1 runner
  02_universe.py      milestone 2 runner
  03_classify.py      milestone 3 runner
  04_signal.py        milestone 4 runner (writes artifacts/ic.json)
  05_backtest.py      milestone 5 runner (writes backtest.json, costs.json)
  06_attribution.py   milestone 6 runner (writes attribution, robustness, limitations)
artifacts/            versioned JSON consumed by the dashboard
web/                  Next.js dashboard (Vercel root directory)
```

Python runs offline and writes JSON artifacts; the dashboard reads them statically.
