# Opportunistic Insider Alpha — Research Specification

**Status:** Draft for review (pre-implementation)
**Author:** Sai Bharadwaj
**Universe:** Top 1500 US common stocks by market cap
**Sample:** 2014-01-01 → 2025-12-31 (Form 4 history pulled from 2011 for classification burn-in)

---

## 1. Thesis

Corporate insiders file Form 4 within two business days of transacting in their own
company's stock. The naive reading of this data — "insiders bought, so buy" — is close to
worthless, because the overwhelming majority of insider transactions are compensation
mechanics or pre-scheduled diversification sales that carry no information about future
returns.

The claim being tested is narrower and economically motivated:

> Open-market purchases made by insiders who **do not** trade on a predictable annual
> schedule contain information about future returns that the market does not immediately
> impound.

Two filters do the work. First, restricting to open-market purchases isolates the only
transaction type where the insider is voluntarily putting personal capital at risk.
Second, separating insiders who trade opportunistically from those who trade routinely
removes the scheduled, liquidity-driven flow that dilutes the signal.

The economic mechanism is asymmetric information combined with limited attention. An
insider buying on the open market is making a costly, undiversified bet, and disclosure is
delayed by up to two business days and buried in a high-volume filing stream that most
market participants do not systematically monitor.

## 2. Prior literature

| Paper | Finding we rely on |
|---|---|
| Lakonishok & Lee (2001) | Aggregate insider purchases predict returns; effect concentrated outside mega-caps |
| Jeng, Metrick & Zeckhauser (2003) | Purchases earn abnormal returns; sales do not — the asymmetry is real |
| Cohen, Malloy & Pomorski (2012), *Decoding Inside Information*, JF | Routine vs. opportunistic split; opportunistic buys earned ~82bps/month, routine ~0 |

The headline experiment of this project is a direct test of Cohen, Malloy & Pomorski on a
modern out-of-sample period (2014–2025), which is entirely after their sample ends. If the
effect has decayed post-publication, that is a reportable finding, not a failure.

## 3. Universe construction

Point-in-time index membership for the S&P 1500 is not freely available, and
reconstructing it from vendor snapshots introduces exactly the lookahead bias this project
is meant to avoid. Instead the universe is defined **mechanically**, which is reproducible
and point-in-time by construction:

At each monthly rebalance date `t`, include a security if:

- It is a US-listed common stock (exclude ETFs, ADRs, REITs flagged separately, closed-end funds)
- It ranks in the top 1500 by market capitalization as of `t`
- Close price at `t` ≥ $5.00
- 20-day median dollar volume at `t` ≥ $1,000,000

No forward-looking information enters the screen. Every field is observable at `t`.

**Survivorship caveat.** Free price sources drop delisted tickers, which biases realized
returns upward. This is disclosed explicitly rather than papered over, and Section 12
describes the mitigation and the expected direction of the bias.

## 4. Data sources

| Dataset | Source | Cost | Point-in-time? |
|---|---|---|---|
| Form 4 filings | SEC DERA Insider Transactions Data Sets (quarterly bulk) | Free | Yes — filing date stamped |
| Daily OHLCV | yfinance / Stooq | Free | Partial (survivorship) |
| Shares outstanding | SEC XBRL `companyfacts` | Free | Yes |
| Fama-French 5 + UMD | Ken French Data Library | Free | Yes |
| Sector mapping | SIC code from EDGAR submissions | Free | Yes |

### 4.1 Why bulk archives rather than per-filing scraping

The obvious ingestion path — walk EDGAR's `master.idx`, then fetch each Form 4 XML — is
infeasible. There are roughly 4.5 million Form 4 transactions in this window, and EDGAR
enforces a hard ceiling of **10 requests/second**. That is multiple days of continuous
downloading against an endpoint whose operator actively blocks bulk scrapers.

SEC DERA instead publishes the XML-derived contents of every Form 3/4/5 as **quarterly
tab-delimited archives** covering 2006Q1 to present, at roughly 8–16 MB each:

```
https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/{YYYY}q{Q}_form345.zip
```

Sixty archives cover 2011–2025 and download in about three minutes. Measured wall-clock
for the full ingest is **~3 minutes of download plus ~80 seconds of parsing**, versus days
for the naive path.

Access notes that still apply: a `User-Agent` header declaring name and contact email is
required, and the SEC blocks cloud-provider IP ranges for bulk access, so **ingestion runs
locally, never in CI**. Archives are cached on disk and re-runs are incremental.

### 4.2 Schema drift

The DERA schema has gained columns over time. Auditing all 60 quarters, exactly one column
relevant here drifts: `AFF10B5ONE` is absent 2011Q1–2022Q4 and present from 2023Q1 onward,
matching the effective date of the 2022 Rule 10b5-1 amendments. The reader treats requested
columns as optional and fills absent ones with nulls, so one code path spans the full history.

## 5. Building the transaction table

Each archive contains eight files keyed on `ACCESSION_NUMBER`. Three matter:

| File | Grain | Fields used |
|---|---|---|
| `SUBMISSION.tsv` | one row per filing | filing date, period, form type, issuer CIK/name/ticker, 10b5-1 flag |
| `REPORTINGOWNER.tsv` | one+ rows per filing | owner CIK, name, relationship, title |
| `NONDERIV_TRANS.tsv` | one+ rows per filing | transaction date, code, shares, price, acquired/disposed, shares owned after, direct/indirect, timeliness |

Output grain is one row per (filing, non-derivative transaction). The derivative table is
excluded from the signal.

### 5.1 Transaction code filter

This filter is where most implementations of this project go wrong.

| Code | Meaning | Included? |
|---|---|---|
| `P` | Open-market or private purchase | **Yes — the entire signal** |
| `S` | Open-market or private sale | Tested separately, not in core signal |
| `A` | Grant / award | No — compensation, not a view |
| `M` | Option exercise | No — compensation mechanics |
| `F` | Shares withheld for tax | No — mechanical |
| `G` | Bona fide gift | No |
| `C`, `D`, `J`, `W`, `Z` | Conversion, disposition to issuer, other, will, voting trust | No |

Measured on the realized sample, `F` is the single **most common** code, and `A`, `M` and
`F` together are roughly two thirds of all transactions. Only 10.9% are `P`. Treating
undifferentiated "insider buying" as the signal means mostly measuring payroll mechanics.

### 5.2 Data hygiene

- **Amendments.** Form `4/A` supersedes the original. Deduplication is applied only to
  (owner, issuer, transaction date, code, security) groups that actually contain an
  amendment; within those, rows from the latest filing date win. Groups without an
  amendment are untouched, so two genuine same-day trades by one insider are never
  silently collapsed. Realized effect: **59,480 superseded rows removed of 4.55M**.
- **Joint filings.** About 2% of filings report several owners. Joining all owners against
  the transaction table would multiply each transaction by the owner count and inflate
  dollar volume. Transactions are attributed to the primary owner with
  `n_reporting_owners` retained so joint filings can be flagged or excluded.
- **Indirect ownership.** `directOrIndirectOwnership == "I"` (trust, spouse, LLC) is
  flagged and tested as a separate bucket.
- **Late filings.** Signal timestamps use **filing date, never transaction date**, so late
  filings cannot leak lookahead. Measured median lag is 2 days, with 89.5% inside the
  statutory two-business-day window.
- **Missing prices.** Purchases filed without a price are dropped rather than imputed.

### 5.1 Transaction code filter

This filter is where most implementations of this project go wrong.

| Code | Meaning | Included? |
|---|---|---|
| `P` | Open-market or private purchase | **Yes — the entire signal** |
| `S` | Open-market or private sale | Tested separately, not in core signal |
| `A` | Grant / award | No — compensation, not a view |
| `M` | Option exercise | No — compensation mechanics |
| `F` | Shares withheld for tax | No — mechanical |
| `G` | Bona fide gift | No |
| `C`, `D`, `J`, `W`, `Z` | Conversion, disposition to issuer, other, will, voting trust | No |

Counting `A` and `M` as "insider buying" is the single most common way this signal gets
destroyed, because it drowns the discretionary flow in compensation noise.

### 5.2 Data hygiene

- **Amendments.** Form `4/A` supersedes the original. Deduplicate on
  (owner CIK, issuer CIK, transaction date, security title, shares), keeping the latest
  accession. Failing to do this silently double-counts.
- **Indirect ownership.** Flag `directOrIndirectOwnership == "I"` (held by trust, spouse,
  LLC). Retained but tested as a separate bucket.
- **Late filings.** `transactionTimeliness == "L"` marks a late filing. Signal timestamps
  use **filing date, never transaction date**, so late filings cannot leak lookahead.
- **Missing prices.** Some codes file no price. Purchases without a price are dropped
  rather than imputed.

## 6. Routine vs. opportunistic classification

Following Cohen, Malloy & Pomorski. For insider `k` evaluated at date `t`, using **only
trades filed before `t`**:

```
routine(k, t) = True  if ∃ calendar month m such that k transacted in month m
                      in each of the 3 consecutive years prior to t
              = False otherwise (opportunistic)
              = Unclassified if k has < 3 years of filing history
```

Unclassified insiders are held in a third bucket and reported separately rather than
lumped into either group.

This is a rolling, point-in-time classification — an insider can migrate between buckets
over time, and the classification at date `t` never uses data after `t`.

**Burn-in.** Because classification needs three prior years, Form 4 history is pulled from
2011-01-01 so that classifications are fully populated by the 2014-01-01 sample start.

**Why this matters.** Rule 10b5-1 pre-scheduled trading plans only got a dedicated
checkbox on Form 4 after the 2022 amendments took effect in 2023. For the bulk of the
sample there is no direct flag, so the routine classifier is the behavioral proxy for
scheduled trading. Post-2023 the checkbox provides a partial validation set for the
classifier — a nice bonus test.

## 7. Signal construction

### 7.1 Trade-level score

For each qualifying purchase `j` at firm `i`:

```
value_j     = shares_j × price_j
size_j      = ln(1 + value_j / ADV20_i)          # normalize by tradability, not mktcap
conviction_j = shares_j / sharesOwnedAfter_j     # what fraction of the position is new
role_j      = w_role(title)
```

Normalizing by 20-day average dollar volume rather than market cap keeps the quantity on a
usable scale across the cap spectrum, where `value/mktcap` would be near-zero for large caps.

Initial role weights (all treated as tested parameters, not constants):

| Role | Weight |
|---|---|
| CEO / CFO / Chairman / President | 1.00 |
| Other named officer | 0.60 |
| Director | 0.40 |
| 10% owner only | 0.25 |

### 7.2 Firm-level aggregation

At rebalance date `t`, over a trailing window `W` (default 90 calendar days), using filings
whose **filing date** falls in `(t−W, t]`:

```
raw_i,t = Σ_j  role_j · 1[opportunistic_j] · size_j · (1 + conviction_j)
```

Cluster amplification, where `n` is the count of distinct insiders purchasing in the window:

```
S_i,t = raw_i,t × (1 + λ · ln(n_i,t))          λ default 0.5
```

Firms with no qualifying purchases in the window receive `S = 0`, not `NaN`. The
distinction matters: absence of buying is informative-neutral, not missing.

### 7.3 Cross-sectional standardization

At each `t`, across the universe:

1. Winsorize `S` at the 1st and 99th percentiles
2. Z-score within date
3. Sector-neutralize by subtracting the SIC-division mean, then re-standardize

Sector neutralization prevents the signal from becoming an unintentional sector-timing bet
(insider buying clusters heavily in financials and energy after drawdowns).

## 8. Pre-backtest validation

**No backtest is run until this section passes.** This is the discipline that separates
research from curve-fitting, and it is the natural go/no-go checkpoint.

For horizons `h ∈ {1, 5, 21, 63, 126, 252}` trading days:

- **Information coefficient** — Spearman rank correlation between `S_i,t` and forward
  return `r_i,t→t+h`, computed cross-sectionally at each `t`, then summarized as a time
  series
- **IC summary** — mean IC, IC standard deviation, IC information ratio (mean/std),
  Newey-West adjusted t-statistic
- **IC decay curve** — mean IC as a function of `h`, which reveals the natural holding period
- **Quantile monotonicity** — sort into quintiles (not deciles; event sparsity does not
  support ten meaningful buckets) and check that mean forward return increases monotonically
- **Headline comparison** — every metric above computed twice, once with the
  opportunistic filter and once without. The delta is the core research result.

**Go/no-go:** if the opportunistic-filtered mean IC at the 21- and 63-day horizons is not
positive with a t-statistic above roughly 2, the honest conclusion is that the effect has
decayed post-publication, and the project pivots to documenting that decay rather than
building a strategy on top of noise.

## 9. Portfolio construction

- **Rebalance:** monthly, on the first trading day
- **Holding period:** tested at 1, 3, and 6 months using overlapping portfolios
  (Jegadeesh-Titman style), which cuts turnover and smooths entry timing
- **Long book:** firms in the top signal quintile among names with nonzero signal, weighted
  proportional to `S` with a 3% per-name cap
- **Hedge:** two variants reported side by side —
  1. Dollar-neutral short of the bottom quintile (thin, given sparsity — reported with caveats)
  2. Beta- and sector-matched short basket of index ETFs (the more honest construction here)
- **Constraints:** max 3% per name, max 25% per sector, full investment of the long book

### 9.1 Measured event density

Sparsity was the main design risk going in, and the realized data resolves it. Over the
2014+ sample, restricting to direct (non-indirect, non-10%-owner) officer and director
open-market purchases:

| Metric | Value |
|---|---|
| Qualifying purchases per month | median 998 (range 382–4,692) |
| Distinct issuers with signal per month | median 362 |
| Median trade value | $10,272 |
| Distinct insiders in sample | 38,788 |
| Distinct issuers in sample | 8,502 |

Roughly 360 issuers carrying signal in a given month against a 1,500-name universe is
about 24% coverage — ample for quintile sorts on the active subset. Both the long/short
and the long-versus-matched-benchmark constructions are viable, and both will be reported.

## 10. Transaction costs

Two layers, because a single cost assumption is easy to game:

**Explicit model** — round-trip cost per name = half-spread + market impact, where
half-spread is proxied by cap tercile (5 / 10 / 20 bps for large / mid / small) and impact
is `k · √(participation rate)` assuming a 10% participation cap.

**Sensitivity sweep** — the headline chart. Net Sharpe and net annualized alpha plotted
against a flat round-trip cost from 0 to 100 bps. The number reported is the **break-even
cost** at which alpha reaches zero. A strategy that survives 50 bps is real; one that dies
at 8 bps is a spread illusion, and that is worth showing either way.

Turnover is reported explicitly in annualized terms.

## 11. Risk attribution

The step most student projects skip, and the first thing a quant will ask about.

Regress monthly portfolio excess returns on the Fama-French five factors plus momentum:

```
r_p − r_f = α + β_MKT·MKT + β_SMB·SMB + β_HML·HML + β_RMW·RMW + β_CMA·CMA + β_UMD·UMD + ε
```

Report `α` in annualized basis points with a Newey-West t-statistic, every factor loading,
and R². Also report the same regression on the raw signal-sorted quintile spread.

The question being answered is direct: **is there residual alpha, or is this repackaged
small-cap value?** Insider buying loads naturally on value and size, so a large `β_SMB` and
`β_HML` with an insignificant `α` is a plausible outcome and will be reported as such.

## 12. Robustness battery

| Test | Purpose |
|---|---|
| Opportunistic filter on vs. off | **Headline** — does the CMP filter add alpha out of sample? |
| Subperiod split (2014–2019 vs. 2020–2025) | Regime stability |
| Exclude 2020 Q1–Q2 | Is the result a COVID-rebound artifact? |
| Cap tercile breakdown | CMP predicts a stronger effect in smaller names |
| Sector exclusions (drop financials, drop energy) | Concentration check |
| Buys only vs. net (buys − sales) | Tests the Jeng-Metrick-Zeckhauser asymmetry |
| Parameter sweep (`W`, `λ`, role weights, holding period) | Fragility surface, not a max-Sharpe search |
| Signal randomization (shuffle `S` within date, 1000 draws) | Alpha must collapse to zero |
| Bootstrap CIs on Sharpe and alpha | Sparse events → wide intervals, report them |
| Post-2023 10b5-1 checkbox validation | Does the classifier agree with the actual flag? |

**Multiple testing.** The total count of specifications tested is logged and reported. The
parameter sweep is presented as a heatmap showing whether performance is a broad plateau or
a lone spike — a plateau is evidence of robustness, a spike is evidence of overfitting.
Sharpe ratios are haircut accordingly rather than reported at face value.

## 13. Known limitations

Stated up front in the writeup, not buried:

1. **Survivorship bias.** Free price data omits delisted names, inflating returns.
   Direction of bias is known and disclosed; magnitude estimated by comparing universe
   counts against expected attrition.
2. **10b5-1 opacity pre-2023.** The routine classifier is a behavioral proxy, not a direct
   observation, for most of the sample.
3. **Event sparsity.** Open-market purchases are rare, so cross-sectional breadth is
   limited and confidence intervals are wide. Bootstrapped rather than asymptotic.
4. **Two-day disclosure lag plus monthly rebalancing** means realized entry is meaningfully
   after the insider's fill. Intentional and realistic.
5. **No borrow costs or short availability** modeled on the short leg.
6. **Post-publication decay** is the expected null result and the project is designed to
   report it cleanly if that is what the data shows.

## 14. Deliverable

```
insider-alpha/
├── SPEC.md                    # this document
├── README.md                  # findings summary, honest headline numbers
├── pyproject.toml
├── data/
│   ├── raw/                   # gitignored — EDGAR cache
│   └── processed/             # committed parquet: trades, universe, signal
├── src/insider_alpha/
│   ├── ingest/                # edgar.py, prices.py, factors.py
│   ├── parse/                 # form4.py
│   ├── signal/                # classify.py, construct.py
│   ├── backtest/              # portfolio.py, costs.py, engine.py
│   └── analysis/              # ic.py, attribution.py, robustness.py
├── notebooks/                 # exploratory, numbered
├── artifacts/                 # versioned JSON consumed by the dashboard
└── web/                       # Next.js → Vercel (root dir = insider-alpha/web)
```

Python runs offline and writes versioned JSON artifacts. The Next.js dashboard reads those
statically — no Python on Vercel.

**Dashboard pages:** Thesis → Data & Parsing → Signal Construction → IC Analysis →
Backtest → Cost Sensitivity → Factor Attribution → Robustness → **What Didn't Work**.

That final page is the one a quant researcher will actually read first.

## 15. Milestones

| # | Milestone | Exit criterion |
|---|---|---|
| 1 | EDGAR ingestion + Form 4 parser | Clean trade table, dedup verified, spot-checked against 10 known filings |
| 2 | Universe + prices + forward returns | Point-in-time universe reproducible at any date |
| 3 | Routine/opportunistic classifier | Classification distribution matches CMP's reported proportions |
| 4 | Signal + IC analysis | **GO/NO-GO** — IC t-stat and quantile monotonicity |
| 5 | Backtest + cost model | Break-even cost computed |
| 6 | Attribution + robustness | FF5+UMD alpha with t-stat, full robustness grid |
| 7 | Dashboard + Vercel deploy | Live URL, reproducible from a clean clone |

Milestone 4 is a real decision point. If the signal is dead, the project becomes a
well-executed decay study, which is still a strong artifact — and considerably more
credible than a strategy with a fabricated Sharpe ratio.
