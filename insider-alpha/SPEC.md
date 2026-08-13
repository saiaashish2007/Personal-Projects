# Opportunistic Insider Alpha — Research Specification

**Status:** Milestones 1–6 complete. Decay study — IC gate failed; residual FF5+UMD alpha −341 bps/year.
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
| Daily OHLCV | yfinance | Free | Partial (survivorship) |
| Shares outstanding | SEC XBRL `companyfacts` | Free | Yes |
| Fama-French 5 + UMD | Ken French Data Library | Free | Yes |
| Sector mapping | SIC code from EDGAR submissions | Free | Yes |

Stooq was the intended price source, being the one free provider that retains delisted
symbols. Its bulk history is behind a paid tier and its per-symbol endpoint is gated by a
JavaScript proof-of-work challenge, so the project runs on yfinance and treats the
resulting survivorship hole as a measured quantity rather than a caveat (§13).

### 4.2 Checking a price panel that has no second opinion

Prices arrive split-adjusted and are run backwards through the vendor's own split history
to recover what actually printed. That reconstruction is only as good as the split
history, and where the history is incomplete the failure is silent: the series stays
smooth, plausible, and wrong. Two independent checks catch it.

**Insider transaction prices.** Every open-market Form 4 reports the price per share
actually paid, filed within two business days and owing nothing to any market data
vendor. Matched against the panel on the same date — routed through the point-in-time
ticker map, so a reassigned symbol is not mistaken for a pricing error — they agree to a
median of 0.1%. Where they disagree they disagree by a clean multiple, which is what a
missing corporate action looks like: Booking Holdings prices at a twenty-fifth of the
market it traded in.

**Unexplained overnight jumps.** Names no insider trades cannot be checked that way. For
those, a jump surviving in the vendor's *split-adjusted* series is one the vendor never
recorded — Cenntro Electric moves a hundred-fold overnight and enters the universe at a
$253 billion valuation. The test must run on the adjusted series and not the
reconstructed one, where every genuine split is a discontinuity by design and the same
rule would throw out Apple.

Insider evidence outranks the jump heuristic where both apply, since a stock can
genuinely move five-fold in a day and contemporaneous insider fills are direct evidence
that the series is sound.

**Share counts get the same treatment.** XBRL carries scale errors that no price screen
can see — BioNTech reports 241 billion shares against a true count near 240 million — so
counts are compared against the issuer's own filing history and dropped when orders of
magnitude out, with a band wide enough to pass a real 20-for-1 split. As a backstop for
issuers with neither insider prints nor a clean history, a market cap more than fifty
times the company's own reported public float is rejected.

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

### 6.1 Judgment calls, as implemented

The rule above leaves four genuine ambiguities. Each is a named parameter of
`ClassifierConfig` so Section 12's robustness sweep can vary it; the defaults are below.

| Choice | Default | Why |
|---|---|---|
| Which codes define the pattern | `{P, S}` | See below — the single most consequential call |
| Where the evaluation dates sit | Calendar (1 January) | CMP "designate all insiders … at the beginning of each calendar year" |
| Which month a trade belongs to | Transaction month | The pattern is a claim about when the insider *trades*; observability is still governed by filing date |
| Insiders with a gap year | Unclassified | CMP "require an insider to make at least one trade in each of the three preceding years" |

The window is always the 36 months immediately preceding the evaluation month, so the
calendar and rolling anchors differ only in where evaluation dates sit. A trade is
visible at date `t` only if it was filed in a strictly earlier month, so no trade can
ever contribute to its own label.

**The transaction-code call.** Measuring the pattern over *all* codes makes 83% of
classified trades routine, against CMP's 54.8%: RSU vesting and the tax withholding it
triggers (code `F`) recur on a fixed monthly calendar and mechanically make nearly every
compensated employee routine. Under that rule an executive with monthly vesting is
permanently routine and every discretionary purchase they ever make is discarded —
which would quietly destroy the headline result. Restricting the pattern to open-market
codes reproduces CMP closely and validates better against the 10b5-1 flag, and matches
CMP's source being a database of open-market transactions. Both settings are retained
and swept.

**Gap years.** Requiring a trade in every one of the three prior years is what keeps the
sporadic filer out of the opportunistic bucket. Relaxing it to a filing-history *span*
rule (available as `require_trade_every_year=False`) roughly doubles the opportunistic
bucket with insiders who simply trade rarely, which is not the same economic object.

**Known bias.** The routine test is existential over months, so an insider who trades in
many months per year is mechanically more likely to be labelled routine. CMP's
definition has the same property and it is intended: an insider trading every month is
the paper's canonical routine trader.

### 6.2 Realized distribution and replication check

Measured over 2014–2025 with the defaults above (`scripts/03_classify.py`, 1.5s to
classify 102,461 insiders with open-market history at 15 annual evaluation dates):

| Metric | This sample (2014–2025) | CMP Table I (1989–2007) |
|---|---|---|
| Classified share of all transactions | 25.4% | ~33% |
| Routine share of classified trades | 48.7% | 54.8% |
| Routine share of classified buys | 59.2% | 64.4% |
| Routine share of classified sells | 56.6% | 52.0% |

Close on every dimension, and materially closer than any other parameterization tested.
Residual divergence has three plausible sources, none of which is resolvable from free
data: CMP screen to CRSP-listed firms while this table is the entire Form 4 universe
including microcaps and OTC names that trade rarely and so fail the three-year test;
their Thomson Reuters feed is analyst-cleaned while DERA is raw filer output; and
same-month sell programs are far more prevalent post-2003 than in their sample, which
plausibly explains the one metric that runs *higher* here than in CMP (routine sells).

Labels are sticky without being frozen, which is what a behavioral proxy should look
like. Among insiders classified at two consecutive evaluation dates, 76% of routine
insiders stay routine and 82% of opportunistic insiders stay opportunistic; counting
lapses out of the classified universe as well, the annual persistence rates are 58% and
51%. Across the sample, 24% of insiders ever classified appear in both buckets at some
point.

At insider level the buckets are much less balanced than the trade counts suggest —
about 2,400 routine insiders against 5,400 opportunistic ones at the 2014 evaluation
date, with the routine group trading several times as often. That asymmetry is expected
and is the reason CMP report trade shares rather than insider shares.

### 6.3 Validation against the Rule 10b5-1 checkbox

The checkbox exists only from 2023Q1 (67% coverage in 2023, 100% from 2024), so the
classifier never sees it — a genuine held-out label. Trades filed 2024 onward,
classified insiders only:

| Subset | Routine flagged | Opportunistic flagged | Odds ratio | Insider-clustered OR |
|---|---|---|---|---|
| All codes | 47.7% | 24.8% | 2.77 | 2.87 (p≈1e-125) |
| Open-market (`P`, `S`) | 58.6% | 43.0% | 1.88 | 2.43 (p≈6e-80) |
| Purchases only (`P`) | 13.3% | 3.5% | 4.27 | 2.36 (p=0.004) |

The classifier agrees with the flag in the predicted direction everywhere, and the
agreement survives collapsing to one observation per insider-year, which is the
conservative test — trade-level counts cluster hard within a handful of prolific sellers.

Purchases are the subset the signal actually trades, and there the separation is
strongest in relative terms: a routine-labelled purchase is roughly four times as likely
to be filed under a pre-scheduled plan. Absolute rates are low because pre-scheduled
purchase plans are rare in the first place.

This is corroboration, not an accuracy score. The flag is imperfect ground truth in both
directions — a plan can be adopted for a single trade, and a genuinely calendar-locked
trader can trade without one — and 2024–2025 is a two-year window at the very end of the
sample, well after the behavioral definition was set.

## 7. Signal construction

### 7.1 Trade-level score

For each qualifying purchase `j` at firm `i`:

```
value_j     = shares_j × price_j
size_j      = ln(1 + value_j / ADV20_i)          # normalize by tradability, not mktcap
conviction_j = shares_j / sharesOwnedAfter_j     # what fraction of the position is new
role_j      = w_role(title)
```

Normalizing by 20-day dollar volume rather than market cap keeps the quantity on a
usable scale across the cap spectrum, where `value/mktcap` would be near-zero for large caps.
Implemented ADV20 is the universe's 20-day **median** dollar volume at `t` (the same
quantity the liquidity screen uses). SPEC originally said average; the two would rank
almost identically, and using the screen's own liquidity measure avoids a second
trailing-window construction.

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

### 8.1 Measured (Milestone 4, 2014–2025)

Run on the realized universe (144 monthly rebalances, median 1,500 names) with
`W = 90`, `λ = 0.5`, timestamped on filing date. Spearman rank IC of the
cross-sectionally standardized signal versus forward returns. Newey-West lags scale
with overlap (`h/21`).

| Horizon | Opp. mean IC | Opp. t | All-insider mean IC | All t | Δ IC |
|---|---:|---:|---:|---:|---:|
| 1d | −0.0023 | −0.25 | −0.0024 | −0.33 | +0.0002 |
| 5d | +0.0093 | +1.09 | +0.0132 | +1.86 | −0.0039 |
| 21d | +0.0165 | +2.16 | +0.0138 | +2.19 | +0.0027 |
| 63d | +0.0157 | +1.54 | +0.0157 | +1.82 | +0.0000 |
| 126d | +0.0188 | +1.48 | +0.0188 | +1.92 | −0.0000 |
| 252d | +0.0203 | +1.23 | +0.0211 | +2.06 | −0.0009 |

**Gate: NO-GO.** The 21-day opportunistic IC is positive with t = 2.16, but the
63-day IC, while positive, has t = 1.54 and does not clear the pre-registered
hurdle. The opportunistic filter's lift versus all insider purchases is
indistinguishable from zero at every horizon that matters. Quintile sorts are
monotonic at 63d and 126d for the opportunistic arm (Q5−Q1 = +84 bps and
+165 bps) and not at 21d.

Event coverage is sparse once the classifier is applied: median **46** universe
names per month with a nonzero opportunistic score (3.3% of the universe),
versus median **221** (15.9%) with any open-market purchase. That is thinner
than the unfiltered officer/director counts in §9.1, which do not impose the
CMP split.

The project proceeds to Milestone 5 as a decay study: an equity curve still
documents how the faint ranking behaves in portfolio space, but the headline is
that Cohen, Malloy & Pomorski does not replicate at the pre-registered gate on
2014–2025.

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

That table is officer/director open-market purchases **without** the CMP split. Once
the opportunistic filter is applied, median coverage drops to **46** names (SPEC §8.1),
so the top quintile is ~9 names. A 3% per-name cap then cannot fill a 100% long book
(that needs 34 names) and a 25% sector cap is often infeasible on a book that clustered
in one SIC division. Implemented rule: apply the SPEC caps when they are feasible;
otherwise relax each cap to the minimum that still fully invests. That is a spec
tension forced by sparsity, not a tuned parameter.

Hedge returns for `beta_sector_matched_etf` are cap-weighted SIC-division portfolios
from the universe, standing in for the SPDR sector ETF implied by the SIC → XL* map.
The price panel does not carry the XL* products; SPY (which it does carry) is used
for trailing 60-day betas. The short is sector-matched dollar-for-dollar, then scaled
by the long book's weighted SPY-beta.

### 9.2 Measured (Milestone 5, 2014–2025)

144 monthly rebalances. Primary variant `opp_etf_3m`: opportunistic arm, ETF hedge,
three overlapping vintages. Net of the explicit cost model (~16 bps round-trip).
Sharpe is arithmetic excess versus Ken French RF / annualized vol. Returns are
decimals, drawdowns negative.

| Variant | Arm | Hedge | Hold | Avg longs | Turn (x) | Gross Sharpe | Net Sharpe | Net CAGR | Max DD |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| `opp_etf_3m` (primary) | opportunistic | sector ETF | 3m | 18.8 | 5.42 | −0.36 | −0.41 | −6.3% | −66.4% |
| `opp_spread_3m` | opportunistic | quintile spread | 3m | 18.8 | 6.96 | −0.15 | −0.20 | −4.2% | −72.0% |
| `opp_etf_1m` | opportunistic | sector ETF | 1m | 10.2 | 9.94 | −0.17 | −0.26 | −4.4% | −51.0% |
| `all_etf_3m` (filter off) | all insiders | sector ETF | 3m | 81.1 | 4.22 | −0.23 | −0.28 | −2.9% | −42.8% |

The faint positive IC does not survive portfolio construction. The hedged opportunistic
book loses money gross of costs; net of ~16 bps round-trip against 5.4x turnover it
loses more. The filter-off twin is less bad, not better — the CMP split does not
earn its keep in portfolio space any more than it did in the IC table. The quintile
spread is the least-bad Sharpe and still negative, on a short leg that is as thin
as the long and has no borrow cost. No parameter was retuned.

## 10. Transaction costs

Two layers, because a single cost assumption is easy to game:

**Explicit model** — round-trip cost per name = half-spread + market impact, where
half-spread is proxied by cap tercile (5 / 10 / 20 bps for large / mid / small) and impact
is `k · √(participation rate)` assuming a 10% participation cap.

**Sensitivity sweep** — the headline chart. Net Sharpe and net annualized alpha plotted
against a flat round-trip cost from 0 to 100 bps. The number reported is the **break-even
cost** at which alpha reaches zero. A strategy that survives 50 bps is real; one that dies
at 8 bps is a spread illusion, and that is worth showing either way.

Turnover is reported explicitly in annualized terms (one-sided notional / NAV per year).

### 10.1 Measured (Milestone 5, primary variant `opp_etf_3m`)

Explicit-model round-trip on the primary book: **15.7 bps** (half-spread by cap
tercile plus \(k=0.32\) percent × √participation, 10% participation cap, $10mm
notional). Annualized one-sided turnover: **5.42x**.

Flat round-trip sweep, 0 to 100 bps in 5 bp steps. Alpha is annualized excess versus
Ken French RF (Newey-West t-stat, 3 lags) — not a full FF5 alpha (Milestone 6).

| | |
|---|---|
| Excess vs RF at 0 bps | −598 bps / year (t = −1.24) |
| Net Sharpe at 0 bps | −0.39 |
| Break-even cost (alpha = 0) | **none** — excess is never positive |
| Break-even cost (Sharpe = 0) | **none** |

Net alpha is dead at realistic costs because it is already dead at zero cost. That is
the expected reading of a NO-GO IC gate, not a surprise.

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

### 11.1 Measured (Milestone 6, 2014–2025)

Newey-West HAC, 6 monthly lags (three-month overlap). Alpha is annualized basis points. 144 months.

| Regression | α (bps/yr) | t | MKT | SMB (t) | HML (t) | UMD (t) | R² |
|---|---:|---:|---:|---:|---:|---:|---:|
| `opp_etf_3m_net` (primary) | **−341** | **−0.84** | −0.04 | **+0.69 (3.71)** | +0.10 (0.72) | −0.22 (−2.20) | 0.33 |
| `opp_etf_3m_gross` | −256 | −0.63 | −0.04 | +0.69 | +0.10 | −0.22 | 0.32 |
| `opp_spread_3m_net` | −305 | −0.55 | +0.05 | +0.44 | +0.14 | −0.14 | 0.13 |
| `all_etf_3m_net` | −102 | −0.43 | +0.01 | +0.79 (8.80) | +0.13 | −0.15 (−2.46) | 0.57 |

Residual alpha on the primary net book is negative and indistinguishable from zero. Costs do not create the hole — the gross residual is also negative. The book loads significantly on **SMB**, not on HML: this is a small-cap tilt with a residual that is still a loss, not a stealth value factor. UMD is reliably negative (buying weakness). The filter-off twin has a smaller hole (−102 bps) and an even larger SMB loading. After factors there is nothing left.

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

### 12.1 Measured (Milestone 6)

Grid, net of the explicit cost model, FF5+UMD alpha. Baseline is `opp_etf_3m` net.

| Cut | Family | n | Sharpe | α (bps) | t |
|---|---|---:|---:|---:|---:|
| Baseline `opp_etf_3m` | headline | 144 | **−0.41** | **−341** | −0.84 |
| 2014–2019 | subperiod | 72 | +0.11 | +424 | +0.81 |
| 2020–2025 | subperiod | 72 | **−0.86** | **−1,187** | **−2.52** |
| Ex-COVID 2020 Q1–Q2 | event_exclusion | 138 | −0.43 | −288 | −0.70 |
| Small-cap tercile | cap_tercile | 144 | −0.18 | −74 | −0.12 |
| Mid-cap tercile | cap_tercile | 144 | −0.84 | −1,259 | −2.48 |
| Large-cap tercile | cap_tercile | 144 | −0.38 | −475 | −1.21 |
| Drop financials | sector_exclusion | 144 | −0.29 | −151 | −0.29 |
| Drop energy (Mining) | sector_exclusion | 144 | −0.40 | −300 | −0.75 |
| All insiders (filter off) | signal_definition | 144 | −0.28 | −102 | −0.43 |

Buys-only is already the core; a net (buys−sales) variant was not built and is not invented.

The loss is not a COVID artifact (ex-COVID Sharpe −0.43). It is concentrated in 2020–2025. Small-caps are the least-bad tercile and still lose money — CMP's "stronger in smaller names" prediction does not flip the sign. Dropping financials or energy does not rescue the book.

**W×λ sweep** (metric: 21-day mean Spearman IC). W ∈ {30, 60, 90, 120, 180}, λ ∈ {0, 0.25, 0.5, 0.75, 1.0}. IC ranges from +0.0024 to +0.0182; 10 of 25 cells have |t| ≥ 2, all of them in the W = 90–120 ridge. λ does not matter. The SPEC default (W=90, λ=0.5) is +0.0165 (t = 2.16) and is not an outlier. **Weak plateau, not a spike.** There is no magic cell.

**Randomization.** Shuffle S within date, 1,000 draws, statistic = 21-day mean IC. Null mean ≈ 0, null std = 0.0023. Observed +0.0165 sits at the **100th percentile** of the shuffle (two-sided p ≈ 0). That is the faint ranking the IC gate already reported (t = 2.16). It is not a tradable alpha: the same score, put through the SPEC book, has net Sharpe −0.41.

**Bootstrap** (stationary, mean block 6 months, 2,000 resamples) on the primary net book: Sharpe 95% CI [−1.05, +0.18]; FF5+UMD alpha 95% CI [−1,131, +618] bps. Both contain zero. 21-day mean IC CI [+0.003, +0.032] does not — the whisper of ranking is real; the book is not.

**Multiple testing.** 51 specifications counted (10 grid rows, 25 sweep cells, 4 backtest variants, 12 IC horizon×arm cells). Harvey–Liu–Zhu expected-max haircut subtracts 0.20 from the headline Sharpe of −0.41 and leaves a **deflated Sharpe of −0.61**. After multiple tests there is nothing left.

## 13. Known limitations

Stated up front in the writeup, not buried:

1. **Survivorship bias — measured, and worse than "some names are missing".** Yahoo
   serves no history at all for a delisted ticker. Activision, Twitter, SVB Financial,
   Cerner and Xilinx were each requested successfully alongside live names of the same
   size and returned nothing, so this is the vendor's behaviour rather than a throttling
   artifact. The consequence is that a company is missing from the panel for the whole
   sample, not just after it dies: the 2014 universe is built only from companies that
   were still listed in 2025. Of the realized universe, essentially no name stops
   printing prices before the sample ends, against the 2–4% annual attrition the S&P
   1500 actually experiences.

   The direction is not uniform, and for this project it matters that the test is
   long/short rather than long-only. Missing names are missing from both legs, so the
   bias only distorts the result to the extent that disappearing correlates with the
   signal — and it does, in both directions. Acquisitions complete at a premium and
   insiders buy ahead of them, so the long leg loses some of its best outcomes;
   bankruptcies remove names insiders were not buying, so the short leg loses some of
   its best outcomes. The two partially offset, which is a reason to report the
   long and short legs separately rather than only the spread. See §4.2 for what the
   panel is checked against.
2. **10b5-1 opacity pre-2023.** The routine classifier is a behavioral proxy, not a direct
   observation, for most of the sample. Measured precision / recall against the
   post-2023 checkbox are 0.55 / 0.73 — near 0.6.
3. **Event sparsity.** Open-market purchases are rare, so cross-sectional breadth is
   limited and confidence intervals are wide. Bootstrapped rather than asymptotic.
4. **Two-day disclosure lag plus monthly rebalancing** means realized entry is meaningfully
   after the insider's fill. Intentional and realistic.
5. **No borrow costs or short availability** modeled on the short leg.
6. **Post-publication decay** is the expected null result and the project is designed to
   report it cleanly if that is what the data shows. Measured: gate failed; primary net
   Sharpe −0.41; residual FF5+UMD alpha −341 bps/year (t = −0.84). Verdict in
   `limitations.json` is `signal_decayed`.
7. **Name and sector cap relaxation.** Median ~9 names in the opportunistic top quintile
   cannot fill a 3% / 25% constrained book. Caps relax to the minimum that still fully
   invests (SPEC §9.1).
8. **ETF hedge is an approximation.** XL* products are not in the price panel. Hedge
   returns are cap-weighted SIC-division portfolios; SPY is used for trailing betas.

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
