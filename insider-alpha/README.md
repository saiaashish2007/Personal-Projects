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
| 2 | Point-in-time universe, prices, forward returns | Not started |
| 3 | Routine/opportunistic classifier | Not started |
| 4 | Signal construction + IC analysis (**go/no-go**) | Not started |
| 5 | Backtest + transaction cost model | Not started |
| 6 | Factor attribution + robustness | Not started |
| 7 | Dashboard + Vercel deploy | Not started |

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

## Setup

```bash
pip install -e .
export SEC_USER_AGENT="Your Name your@email.edu (research)"   # SEC requires this
python scripts/01_ingest.py --start-year 2011 --end-year 2025
```

Downloads are cached under `data/raw/` (gitignored), so re-runs are incremental. Run
ingestion locally — the SEC blocks cloud-provider IP ranges for bulk access.

## Layout

```
src/insider_alpha/
  config.py           paths, sample windows, transaction code constants
  ingest/dera.py      quarterly archive download with caching and backoff
  parse/form345.py    flatten archives into the transaction table
scripts/
  01_ingest.py        milestone 1 runner
artifacts/            versioned JSON consumed by the dashboard
web/                  Next.js dashboard (Vercel root directory)
```

Python runs offline and writes JSON artifacts; the dashboard reads them statically.
