/**
 * Emits placeholder fixtures for every artifact so the dashboard builds and renders
 * before the Python pipeline has produced anything. Numbers are plausible but
 * fabricated; every file carries `data_status: "placeholder"` and the UI badges it.
 *
 * Run: npm run fixtures
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(HERE, "..", "..", "artifacts");
const SCHEMA_VERSION = "1.0.0";
const GENERATED_AT = "2026-01-15T18:42:11Z";

mkdirSync(ARTIFACTS, { recursive: true });

// Deterministic PRNG so fixtures are stable across regenerations and diffs stay small.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20140103);
function normal() {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const round = (x, d = 4) => Number(x.toFixed(d));

function monthsBetween(startYear, startMonth, endYear, endMonth) {
  const out = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const MONTHS = monthsBetween(2014, 1, 2025, 12);
const base = (artifact, notes) => ({
  schema_version: SCHEMA_VERSION,
  artifact,
  generated_at: GENERATED_AT,
  data_status: "placeholder",
  notes,
});

const PLACEHOLDER_NOTE =
  "PLACEHOLDER FIXTURE. Fabricated numbers written by web/scripts/generate-placeholders.mjs so the dashboard renders before the pipeline runs. Overwrite with real pipeline output.";

const write = (name, obj) => {
  writeFileSync(join(ARTIFACTS, name), `${JSON.stringify(obj, null, 2)}\n`);
  console.log(`wrote artifacts/${name}`);
};

// --- meta --------------------------------------------------------------------

write("meta.json", {
  ...base("meta", PLACEHOLDER_NOTE),
  run: {
    timestamp: GENERATED_AT,
    git_sha: null,
    git_dirty: null,
    duration_seconds: null,
  },
  sample: {
    start: "2014-01-01",
    end: "2025-12-31",
    burn_in_start: "2011-01-01",
    rebalance_frequency: "monthly, first trading day",
    n_rebalance_dates: 144,
  },
  universe: {
    name: "Top 1500 US common stocks by market capitalization",
    description:
      "Mechanically reconstructed at each monthly rebalance date from observable fields only. No point-in-time index membership is used, so no lookahead enters through the screen.",
    target_size: 1500,
    screens: [
      {
        name: "Security type",
        description: "US-listed common stock; ETFs, ADRs and closed-end funds excluded, REITs flagged",
        value: "common stock",
      },
      { name: "Size rank", description: "Rank by market capitalization as of t", value: "top 1500" },
      { name: "Price floor", description: "Close price at t", value: ">= $5.00" },
      { name: "Liquidity floor", description: "20-day median dollar volume at t", value: ">= $1,000,000" },
    ],
  },
  software: {
    python_version: "3.12.4",
    packages: [
      { name: "pandas", version: "2.2.3" },
      { name: "numpy", version: "2.1.3" },
      { name: "pyarrow", version: "18.1.0" },
      { name: "statsmodels", version: "0.14.4" },
      { name: "scipy", version: "1.14.1" },
    ],
  },
  pipeline_stages: [
    { milestone: 1, name: "DERA ingestion + Form 4 parser", status: "complete", artifact: "data_profile" },
    { milestone: 2, name: "Universe, prices, forward returns", status: "not_run", artifact: null },
    { milestone: 3, name: "Routine/opportunistic classifier", status: "not_run", artifact: "classifier" },
    { milestone: 4, name: "Signal + IC analysis (go/no-go)", status: "not_run", artifact: "ic" },
    { milestone: 5, name: "Backtest + cost model", status: "not_run", artifact: "backtest" },
    { milestone: 6, name: "Attribution + robustness", status: "not_run", artifact: "attribution" },
    { milestone: 7, name: "Dashboard + Vercel deploy", status: "partial", artifact: null },
  ],
});

// --- data_profile ------------------------------------------------------------

const CODES = [
  ["F", "Shares withheld for tax obligation", 0.2412, false],
  ["S", "Open-market or private sale", 0.2168, false],
  ["A", "Grant, award, or other acquisition", 0.2043, false],
  ["M", "Exercise or conversion of derivative", 0.2115, false],
  ["P", "Open-market or private purchase", 0.109, true],
  ["G", "Bona fide gift", 0.0093, false],
  ["C", "Conversion of derivative security", 0.0031, false],
  ["D", "Disposition to the issuer", 0.0022, false],
  ["J", "Other acquisition or disposition", 0.0018, false],
  ["W", "Acquisition or disposition by will", 0.0005, false],
  ["Z", "Voting trust deposit or withdrawal", 0.0003, false],
];
const TOTAL_TX = 4491080;

const eventDensity = MONTHS.map((month, i) => {
  const seasonal = 1 + 0.18 * Math.sin((2 * Math.PI * (i % 12)) / 12 - 1.1);
  const crisis = month === "2020-03" || month === "2020-04" ? 3.4 : 1;
  const drift = 1 - 0.012 * (i / 12);
  const n = Math.max(382, Math.round(1000 * seasonal * crisis * drift * (1 + 0.12 * normal())));
  return {
    month,
    qualifying_purchases: n,
    distinct_issuers: Math.round(n * (0.36 + 0.02 * rand())),
    distinct_insiders: Math.round(n * (0.72 + 0.04 * rand())),
    median_trade_value_usd: Math.round(10272 * (0.8 + 0.5 * rand())),
  };
});

const lagShares = [0.041, 0.318, 0.536, 0.031, 0.019, 0.012, 0.008, 0.021, 0.014];
const lagLabels = [0, 1, 2, 3, 4, 5, 6, 10, 30];
const totalPurchases = 489372;

write("data_profile.json", {
  ...base("data_profile", PLACEHOLDER_NOTE),
  coverage: { start: "2011-01-03", end: "2025-12-31" },
  totals: {
    transactions: TOTAL_TX,
    filings: 1874203,
    distinct_issuers: 12798,
    distinct_insiders: 149693,
    open_market_purchases: totalPurchases,
    superseded_rows_removed: 59480,
    dropped_missing_price: 8317,
  },
  transaction_codes: CODES.map(([code, label, share, included]) => ({
    code,
    label,
    count: Math.round(TOTAL_TX * share),
    share,
    included_in_signal: included,
  })),
  event_density: eventDensity,
  filing_lag: {
    histogram: lagLabels.map((lag_days, i) => ({
      lag_days,
      count: Math.round(totalPurchases * lagShares[i]),
      share: lagShares[i],
    })),
    median_days: 2,
    mean_days: 2.71,
    p95_days: 6,
    share_within_statutory_window: 0.895,
    share_flagged_late: 0.062,
  },
  trade_value_usd: { p25: 3104, median: 10272, mean: 92841, p75: 39710, p95: 318452 },
  ownership: { direct_count: 371244, indirect_count: 118128, indirect_share: 0.2414 },
  joint_filings: { filings_with_multiple_owners: 37484, share: 0.02 },
  schema_drift_notes: [
    "AFF10B5ONE is absent from DERA archives 2011Q1-2022Q4 and present from 2023Q1 onward, matching the effective date of the 2022 Rule 10b5-1 amendments. Requested columns are treated as optional and absent ones filled with nulls.",
  ],
});

// --- classifier --------------------------------------------------------------

const proportions = MONTHS.filter((_, i) => i % 3 === 0).map((month, i) => {
  const routine = 0.204 + 0.03 * Math.sin(i / 5) + 0.012 * normal();
  const unclassified = 0.171 - 0.0016 * i + 0.006 * normal();
  return {
    date: `${month}-01`,
    routine: round(routine),
    opportunistic: round(1 - routine - unclassified),
    unclassified: round(unclassified),
    n_insiders: Math.round(21000 + 900 * i * 0.1 + 600 * normal()),
  };
});

write("classifier.json", {
  ...base("classifier", PLACEHOLDER_NOTE),
  definition:
    "An insider k is routine at date t if there exists a calendar month m in which k transacted in each of the three consecutive years prior to t, using only trades filed before t. Insiders with fewer than three years of filing history are unclassified rather than forced into either bucket.",
  pooled_proportions: {
    routine: 0.207,
    opportunistic: 0.641,
    unclassified: 0.152,
    n_insider_dates: 2148332,
  },
  proportions_over_time: proportions,
  cmp_comparison: [
    { bucket: "routine", cmp_reported_share: 0.229, replication_share: 0.207, delta: -0.022 },
    { bucket: "opportunistic", cmp_reported_share: 0.771, replication_share: 0.641, delta: -0.13 },
    { bucket: "unclassified", cmp_reported_share: null, replication_share: 0.152, delta: null },
  ],
  rule_10b5_1_validation: {
    period_start: "2023-01-01",
    period_end: "2025-12-31",
    n_filings: 61247,
    confusion_matrix: {
      routine_and_flagged: 8412,
      routine_not_flagged: 4967,
      opportunistic_and_flagged: 6103,
      opportunistic_not_flagged: 41765,
    },
    metrics: {
      accuracy: 0.819,
      precision: 0.629,
      recall: 0.58,
      f1: 0.603,
      flag_base_rate: 0.237,
    },
    interpretation:
      "The behavioral classifier agrees with the Form 4 10b5-1 checkbox well above the base rate but is far from a substitute for it. Roughly two in five flagged trades are labelled opportunistic by the classifier, which is the measurement error the pre-2023 sample carries silently.",
  },
  migration: [
    { from: "opportunistic", to: "routine", count: 18422, share: 0.061 },
    { from: "routine", to: "opportunistic", count: 21877, share: 0.072 },
    { from: "unclassified", to: "opportunistic", count: 44190, share: 0.146 },
    { from: "unclassified", to: "routine", count: 9315, share: 0.031 },
  ],
});

// --- ic ----------------------------------------------------------------------

const HORIZONS = [1, 5, 21, 63, 126, 252];
const ARM_SPEC = {
  opportunistic: {
    label: "Opportunistic filter ON",
    mean: { 1: 0.0021, 5: 0.0058, 21: 0.0114, 63: 0.0131, 126: 0.0092, 252: 0.0041 },
    t: { 1: 0.62, 5: 1.44, 21: 2.31, 63: 2.48, 126: 1.72, 252: 0.81 },
    csz: 341,
  },
  all_insiders: {
    label: "Opportunistic filter OFF (all insiders)",
    mean: { 1: 0.0009, 5: 0.0021, 21: 0.0043, 63: 0.0049, 126: 0.0036, 252: 0.0018 },
    t: { 1: 0.27, 5: 0.61, 21: 0.94, 63: 1.06, 126: 0.78, 252: 0.39 },
    csz: 508,
  },
};

function armPayload(arm) {
  const spec = ARM_SPEC[arm];
  const by_horizon = HORIZONS.map((h) => {
    const mean = spec.mean[h];
    const t = spec.t[h];
    const n = 144;
    const std = t === 0 ? 0.05 : Math.abs((mean * Math.sqrt(n)) / t);
    return {
      horizon_days: h,
      mean_ic: round(mean, 5),
      ic_std: round(std, 5),
      ic_ir: round(mean / std, 4),
      t_stat_newey_west: t,
      newey_west_lags: 6,
      p_value: round(2 * (1 - normalCdf(Math.abs(t))), 4),
      n_periods: n,
      mean_cross_section_size: spec.csz,
    };
  });

  const time_series = [21, 63].map((h) => {
    const mean = spec.mean[h];
    const std = by_horizon.find((r) => r.horizon_days === h).ic_std;
    return {
      horizon_days: h,
      points: MONTHS.map((month, i) => ({
        date: `${month}-01`,
        // Slow decay in the mean over the sample: the post-publication story.
        ic: round(mean * (1.7 - (1.4 * i) / MONTHS.length) + std * normal(), 5),
        n: Math.round(spec.csz * (0.85 + 0.3 * rand())),
      })),
    };
  });

  const quantiles = [21, 63].map((h) => {
    const scale = spec.mean[h] * (h === 21 ? 26000 : 52000);
    const buckets = [1, 2, 3, 4, 5].map((q) => ({
      quantile: q,
      mean_forward_return_bps: round(-scale / 2 + (scale * (q - 1)) / 4 + (arm === "all_insiders" ? 6 * normal() : 4 * normal()), 1),
      std_error_bps: round(h === 21 ? 41 + 6 * rand() : 78 + 9 * rand(), 1),
      n_obs: Math.round((spec.csz * 144) / 5),
    }));
    const means = buckets.map((b) => b.mean_forward_return_bps);
    const spread = means[4] - means[0];
    return {
      horizon_days: h,
      buckets,
      spread_bps: round(spread, 1),
      spread_t_stat: round(spread / (h === 21 ? 58 : 104), 2),
      monotonic: means.every((m, i) => i === 0 || m > means[i - 1]),
      spearman_rank_of_means: means.every((m, i) => i === 0 || m > means[i - 1]) ? 1 : 0.7,
    };
  });

  return { arm, label: spec.label, by_horizon, time_series, quantiles };
}

function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

write("ic.json", {
  ...base("ic", PLACEHOLDER_NOTE),
  arms: [armPayload("opportunistic"), armPayload("all_insiders")],
  headline: HORIZONS.map((h) => {
    const o = ARM_SPEC.opportunistic;
    const a = ARM_SPEC.all_insiders;
    return {
      horizon_days: h,
      opportunistic_mean_ic: o.mean[h],
      opportunistic_t_stat: o.t[h],
      all_insiders_mean_ic: a.mean[h],
      all_insiders_t_stat: a.t[h],
      delta_ic: round(o.mean[h] - a.mean[h], 5),
      delta_t_stat: round((o.t[h] - a.t[h]) * 0.78, 2),
    };
  }),
  go_no_go: {
    criterion:
      "Opportunistic-filtered mean IC at the 21- and 63-day horizons must be positive with a Newey-West t-statistic above roughly 2.",
    horizons_evaluated: [21, 63],
    passed: true,
    verdict:
      "Passed, but narrowly and with visible attenuation. Mean IC of 1.14% at 21 days (t = 2.31) and 1.31% at 63 days (t = 2.48) clears the gate; both are well below the magnitudes implied by Cohen, Malloy & Pomorski's in-sample results, and the IC time series trends down across the sample.",
  },
});

// --- backtest ----------------------------------------------------------------

// One shared benchmark path, rescaled to an 8.8% annualized return at 15.5% vol, so
// every variant is compared against the same series.
const BENCHMARK = (() => {
  const raw = MONTHS.map(() => normal());
  const mu = raw.reduce((a, b) => a + b, 0) / raw.length;
  const sd = Math.sqrt(raw.reduce((a, b) => a + (b - mu) ** 2, 0) / (raw.length - 1));
  return raw.map((z) => ((z - mu) / sd) * (0.155 / Math.sqrt(12)) + 0.088 / 12);
})();

function buildVariant(id, label, description, hedge, holding, arm, annRet, annVol, costBps) {
  const monthlyMu = annRet / 12;
  const monthlyVol = annVol / Math.sqrt(12);
  const turnoverAnnualized = (12 / holding) * 1.05;
  const costDrag = ((costBps / 10000) * turnoverAnnualized) / 12;

  // Draw the path first, then recentre it so the realized mean matches the target
  // exactly. The downward tilt within the path is kept: the placeholder is meant to
  // tell the post-publication decay story.
  const raw = MONTHS.map((month, i) => {
    const shock = normal();
    const tilt = 1.6 - (1.2 * i) / MONTHS.length;
    return { month, g: monthlyMu * tilt + monthlyVol * shock, shock };
  });
  const realizedMu = raw.reduce((a, r) => a + r.g, 0) / raw.length;
  const realizedSd = Math.sqrt(
    raw.reduce((a, r) => a + (r.g - realizedMu) ** 2, 0) / (raw.length - 1),
  );
  const rescale = (g) => ((g - realizedMu) / realizedSd) * monthlyVol + monthlyMu;

  let gross = 1;
  let net = 1;
  let bench = 1;
  const equity_curve = [{ date: "2013-12-31", gross: 1, net: 1, benchmark: 1 }];
  const monthly_returns = [];
  const turnoverMonthly = [];
  let peakG = 1;
  let peakN = 1;
  const drawdown = [{ date: "2013-12-31", gross: 0, net: 0 }];

  for (const [i, row] of raw.entries()) {
    const g = rescale(row.g);
    const n = g - costDrag;
    const b = BENCHMARK[i];
    gross *= 1 + g;
    net *= 1 + n;
    bench *= 1 + b;
    peakG = Math.max(peakG, gross);
    peakN = Math.max(peakN, net);
    const date = `${row.month}-28`;
    equity_curve.push({ date, gross: round(gross, 5), net: round(net, 5), benchmark: round(bench, 5) });
    drawdown.push({ date, gross: round(gross / peakG - 1, 5), net: round(net / peakN - 1, 5) });
    monthly_returns.push({ month: row.month, gross: round(g, 5), net: round(n, 5), benchmark: round(b, 5) });
    turnoverMonthly.push({
      month: row.month,
      turnover: round((turnoverAnnualized / 12) * (1 + 0.18 * (rand() - 0.5)), 4),
    });
  }

  const stat = (key) => {
    const rs = monthly_returns.map((r) => r[key]);
    const mu = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mu) ** 2, 0) / (rs.length - 1));
    const downside = Math.sqrt(
      rs.filter((r) => r < 0).reduce((a, b) => a + b * b, 0) / Math.max(1, rs.filter((r) => r < 0).length),
    );
    const series = key === "benchmark" ? null : drawdown.map((d) => d[key]);
    const mdd = series ? Math.min(...series) : Math.min(...drawdown.map((d) => d.gross)) * 1.4;
    const annR = mu * 12;
    const annV = sd * Math.sqrt(12);
    const sharpe = (annR - 0.021) / annV;
    return {
      ann_return: round(annR, 5),
      ann_vol: round(annV, 5),
      sharpe: round(sharpe, 3),
      sharpe_std_error: round(
        Math.sqrt((1 + 0.5 * (sharpe / Math.sqrt(12)) ** 2) / rs.length) * Math.sqrt(12),
        3,
      ),
      sortino: round((annR - 0.021) / (downside * Math.sqrt(12)), 3),
      max_drawdown: round(mdd, 4),
      calmar: round(annR / Math.abs(mdd), 3),
      hit_rate_monthly: round(rs.filter((r) => r > 0).length / rs.length, 4),
      best_month: round(Math.max(...rs), 5),
      worst_month: round(Math.min(...rs), 5),
    };
  };

  return {
    id,
    label,
    description,
    hedge,
    holding_period_months: holding,
    arm,
    cost_assumption_bps: costBps,
    n_months: MONTHS.length,
    avg_n_positions: hedge === "quintile_spread" ? 148 : 74,
    equity_curve,
    drawdown,
    monthly_returns,
    turnover: {
      annualized: round((turnoverMonthly.reduce((a, b) => a + b.turnover, 0) * 12) / turnoverMonthly.length, 3),
      monthly: turnoverMonthly,
    },
    stats: { gross: stat("gross"), net: stat("net"), benchmark: stat("benchmark") },
  };
}

const variants = [
  buildVariant(
    "long_matched_3m",
    "Long top quintile vs. beta/sector-matched ETF basket",
    "Long book of top-quintile opportunistic-purchase names, weighted proportional to the signal with a 3% per-name cap, hedged with a beta- and sector-matched basket of index ETFs. Three overlapping monthly tranches.",
    "beta_sector_matched_etf",
    3,
    "opportunistic",
    0.0875,
    0.087,
    30,
  ),
  buildVariant(
    "quintile_spread_3m",
    "Dollar-neutral top-minus-bottom quintile",
    "Dollar-neutral long top quintile, short bottom quintile. The short leg is thin given event sparsity and no borrow cost is modelled, so this variant is reported with caveats.",
    "quintile_spread",
    3,
    "opportunistic",
    0.084,
    0.118,
    30,
  ),
  buildVariant(
    "long_matched_1m",
    "Long/matched, one-month holding period",
    "Same construction as the primary variant with a single-month holding period. Higher turnover, and the cost drag is correspondingly larger.",
    "beta_sector_matched_etf",
    1,
    "opportunistic",
    0.079,
    0.108,
    30,
  ),
  buildVariant(
    "long_matched_3m_nofilter",
    "Long/matched, opportunistic filter OFF",
    "Identical construction run on all insider purchases regardless of routine/opportunistic classification. The difference against the primary variant is the headline research result.",
    "beta_sector_matched_etf",
    3,
    "all_insiders",
    0.0546,
    0.0875,
    30,
  ),
];

write("backtest.json", {
  ...base("backtest", PLACEHOLDER_NOTE),
  primary_variant_id: "long_matched_3m",
  benchmark_label: "Beta- and sector-matched ETF basket",
  variants,
});

// --- costs -------------------------------------------------------------------

const primary = variants[0];
const grossAlphaBps = 268;
const TURNOVER_ANN = primary.turnover.annualized;
const sweep = [];
for (let c = 0; c <= 100; c += 5) {
  const drag = (c / 10000) * TURNOVER_ANN;
  const alpha = grossAlphaBps - drag * 10000;
  sweep.push({
    round_trip_bps: c,
    net_sharpe: round((primary.stats.gross.ann_return - drag - 0.021) / primary.stats.gross.ann_vol, 3),
    net_ann_return: round(primary.stats.gross.ann_return - drag, 5),
    net_alpha_ann_bps: round(alpha, 1),
    alpha_t_stat: round((alpha / grossAlphaBps) * 1.94, 2),
  });
}
const breakEvenAlpha = round(grossAlphaBps / (TURNOVER_ANN * 10000) * 10000, 1);
const breakEvenSharpe = round(
  ((primary.stats.gross.ann_return - 0.021) / TURNOVER_ANN) * 10000,
  1,
);

write("costs.json", {
  ...base("costs", PLACEHOLDER_NOTE),
  variant_id: "long_matched_3m",
  explicit_model: {
    description:
      "Round-trip cost per name is half-spread plus market impact. Half-spread is proxied by capitalization tercile; impact is k times the square root of participation rate, assuming trades are capped at 10% of 20-day average dollar volume.",
    half_spreads: [
      { cap_tercile: "large", half_spread_bps: 5 },
      { cap_tercile: "mid", half_spread_bps: 10 },
      { cap_tercile: "small", half_spread_bps: 20 },
    ],
    impact_coefficient_k: 0.32,
    participation_cap: 0.1,
    estimated_round_trip_bps: 29.4,
  },
  sweep,
  break_even: {
    alpha_zero_bps: breakEvenAlpha,
    sharpe_zero_bps: breakEvenSharpe,
    interpretation:
      `Annualized alpha reaches zero at roughly ${Math.round(breakEvenAlpha)} bps of round-trip cost against an explicit-model estimate of 29 bps, so the strategy clears its own cost estimate by about a factor of two. That margin is real but should not be read as comfort: the alpha t-statistic peaks at 1.94 at zero assumed cost and never reaches conventional significance anywhere on the sweep. The break-even cost tells you the effect is not purely a spread illusion; it does not tell you the effect is reliably positive.`,
  },
  turnover: {
    annualized: TURNOVER_ANN,
    avg_monthly: round(TURNOVER_ANN / 12, 4),
    note: "Turnover is computed as one-sided traded notional divided by book value, summed over the year. Overlapping three-month tranches cut it to roughly a third of the single-month construction.",
  },
});

// --- attribution -------------------------------------------------------------

const mkLoading = (factor, label, beta, se) => ({
  factor,
  label,
  beta: round(beta, 4),
  std_error: round(se, 4),
  t_stat: round(beta / se, 2),
  p_value: round(2 * (1 - normalCdf(Math.abs(beta / se))), 4),
});

write("attribution.json", {
  ...base("attribution", PLACEHOLDER_NOTE),
  primary_regression_id: "primary_net",
  interpretation:
    "The portfolio loads heavily on size and value, which is exactly what a book of insider purchases should look like: insiders buy their own stock most often in smaller, cheaper names after drawdowns. Gross of costs a modest residual alpha survives at borderline significance; net of the explicit cost model it does not. The honest reading is that most of the raw return is compensated factor exposure and the incremental alpha is too small to distinguish from zero at this sample length.",
  regressions: [
    {
      id: "primary_net",
      label: "Primary variant, net of costs",
      description:
        "Monthly excess returns of the long/beta-and-sector-matched book, net of the explicit cost model, regressed on Fama-French 5 plus momentum.",
      dependent_variable: "long_matched_3m net monthly excess return",
      alpha_ann_bps: 141.0,
      alpha_std_error_bps: 138.0,
      alpha_t_stat: 1.02,
      alpha_p_value: 0.309,
      loadings: [
        mkLoading("MKT", "Market excess return", 0.213, 0.061),
        mkLoading("SMB", "Small minus big", 0.487, 0.088),
        mkLoading("HML", "High minus low", 0.362, 0.094),
        mkLoading("RMW", "Robust minus weak", -0.118, 0.107),
        mkLoading("CMA", "Conservative minus aggressive", 0.094, 0.131),
        mkLoading("UMD", "Momentum", -0.171, 0.058),
      ],
      r_squared: 0.412,
      adj_r_squared: 0.386,
      n_months: 144,
      newey_west_lags: 6,
    },
    {
      id: "primary_gross",
      label: "Primary variant, gross of costs",
      description: "Identical regression run on gross returns, shown so the cost drag on alpha is explicit.",
      dependent_variable: "long_matched_3m gross monthly excess return",
      alpha_ann_bps: 268.0,
      alpha_std_error_bps: 138.0,
      alpha_t_stat: 1.94,
      alpha_p_value: 0.052,
      loadings: [
        mkLoading("MKT", "Market excess return", 0.216, 0.061),
        mkLoading("SMB", "Small minus big", 0.491, 0.088),
        mkLoading("HML", "High minus low", 0.365, 0.094),
        mkLoading("RMW", "Robust minus weak", -0.121, 0.107),
        mkLoading("CMA", "Conservative minus aggressive", 0.096, 0.131),
        mkLoading("UMD", "Momentum", -0.174, 0.058),
      ],
      r_squared: 0.414,
      adj_r_squared: 0.388,
      n_months: 144,
      newey_west_lags: 6,
    },
    {
      id: "quintile_spread",
      label: "Raw signal quintile spread",
      description:
        "Top-minus-bottom quintile return on the raw signal sort, before portfolio construction constraints. Shown to separate signal quality from implementation.",
      dependent_variable: "Q5 minus Q1 monthly return",
      alpha_ann_bps: 312.0,
      alpha_std_error_bps: 171.0,
      alpha_t_stat: 1.82,
      alpha_p_value: 0.069,
      loadings: [
        mkLoading("MKT", "Market excess return", 0.052, 0.074),
        mkLoading("SMB", "Small minus big", 0.611, 0.113),
        mkLoading("HML", "High minus low", 0.418, 0.121),
        mkLoading("RMW", "Robust minus weak", -0.203, 0.138),
        mkLoading("CMA", "Conservative minus aggressive", 0.142, 0.166),
        mkLoading("UMD", "Momentum", -0.229, 0.074),
      ],
      r_squared: 0.351,
      adj_r_squared: 0.322,
      n_months: 144,
      newey_west_lags: 6,
    },
    {
      id: "nofilter_net",
      label: "Opportunistic filter OFF, net of costs",
      description:
        "The same portfolio built without the routine/opportunistic split. The alpha gap against the primary regression is the value added by the CMP filter.",
      dependent_variable: "long_matched_3m_nofilter net monthly excess return",
      alpha_ann_bps: 22.0,
      alpha_std_error_bps: 98.0,
      alpha_t_stat: 0.22,
      alpha_p_value: 0.826,
      loadings: [
        mkLoading("MKT", "Market excess return", 0.198, 0.058),
        mkLoading("SMB", "Small minus big", 0.442, 0.081),
        mkLoading("HML", "High minus low", 0.331, 0.089),
        mkLoading("RMW", "Robust minus weak", -0.096, 0.101),
        mkLoading("CMA", "Conservative minus aggressive", 0.081, 0.124),
        mkLoading("UMD", "Momentum", -0.148, 0.055),
      ],
      r_squared: 0.437,
      adj_r_squared: 0.412,
      n_months: 144,
      newey_west_lags: 6,
    },
  ],
});

// --- robustness --------------------------------------------------------------

const gridSpec = [
  ["baseline", "headline", "Baseline: opportunistic filter ON", "Primary variant over the full 2014-2025 sample.", 144, 0.075, 0.62, 141, 1.02, null],
  ["filter_off", "headline", "Opportunistic filter OFF", "Same construction on all insider purchases.", 144, 0.042, 0.24, 22, 0.22, -119],
  ["sub_2014_2019", "subperiod", "2014-2019", "First half of the sample.", 72, 0.098, 0.91, 268, 1.88, 127],
  ["sub_2020_2025", "subperiod", "2020-2025", "Second half of the sample.", 72, 0.044, 0.36, 18, 0.11, -123],
  ["ex_covid", "event_exclusion", "Excluding 2020 Q1-Q2", "Drops the COVID crash and the immediate rebound.", 138, 0.058, 0.53, 96, 0.94, -45],
  ["cap_small", "cap_tercile", "Small-cap tercile", "Bottom third of the universe by market capitalization.", 144, 0.112, 0.71, 284, 1.79, 143],
  ["cap_mid", "cap_tercile", "Mid-cap tercile", "Middle third by market capitalization.", 144, 0.064, 0.55, 118, 0.98, -23],
  ["cap_large", "cap_tercile", "Large-cap tercile", "Top third by market capitalization.", 144, 0.021, 0.18, -34, -0.29, -175],
  ["ex_financials", "sector_exclusion", "Excluding financials", "Financials are the single largest source of insider-purchase events.", 144, 0.052, 0.47, 88, 0.81, -53],
  ["ex_energy", "sector_exclusion", "Excluding energy", "Energy purchases cluster heavily after drawdowns.", 144, 0.068, 0.6, 131, 1.24, -10],
  ["buys_only", "signal_definition", "Buys only", "Baseline definition; purchases only.", 144, 0.071, 0.62, 141, 1.02, 0],
  ["buys_minus_sales", "signal_definition", "Net (buys minus sales)", "Tests the Jeng-Metrick-Zeckhauser asymmetry by netting sales against purchases.", 144, 0.038, 0.33, 41, 0.39, -100],
  ["direct_only", "signal_definition", "Direct ownership only", "Excludes trades held indirectly through trusts, spouses, and LLCs.", 144, 0.076, 0.66, 158, 1.44, 17],
];

const wValues = [30, 60, 90, 120, 180];
const lambdaValues = [0, 0.25, 0.5, 0.75, 1.0];
const cells = [];
for (const w of wValues) {
  for (const l of lambdaValues) {
    const peak = 1 - 0.4 * Math.abs(Math.log(w / 90)) - 0.25 * Math.abs(l - 0.5);
    const sharpe = round(0.62 * peak + 0.05 * normal(), 3);
    cells.push({ x: w, y: l, value: sharpe, t_stat: round(sharpe * 2.2, 2) });
  }
}

const nullDraws = [];
for (let i = -6; i <= 6; i += 1) {
  nullDraws.push({
    bin_center: round(i * 25, 1),
    count: Math.round(1000 * Math.exp(-(i * i) / 4.5) * 0.22),
  });
}

write("robustness.json", {
  ...base("robustness", PLACEHOLDER_NOTE),
  baseline_id: "baseline",
  grid: gridSpec.map(([id, family, label, description, n_months, ann_return, sharpe, alpha, t, delta]) => ({
    id,
    family,
    label,
    description,
    n_months,
    ann_return,
    sharpe,
    sharpe_ci_low: round(sharpe - 0.44, 3),
    sharpe_ci_high: round(sharpe + 0.46, 3),
    alpha_ann_bps: alpha,
    alpha_t_stat: t,
    delta_alpha_vs_baseline_bps: delta,
  })),
  parameter_sweep: {
    metric: "Net Sharpe ratio",
    x_param: "W",
    x_label: "Aggregation window (calendar days)",
    x_values: wValues,
    y_param: "lambda",
    y_label: "Cluster amplification lambda",
    y_values: lambdaValues,
    cells,
    assessment:
      "Performance is a broad, shallow plateau across aggregation windows of 60 to 120 days and lambda between 0.25 and 0.75 rather than a lone spike, which is mild evidence against overfitting. The level of the plateau is low enough that the distinction matters less than it would for a stronger signal.",
  },
  randomization: {
    n_draws: 1000,
    statistic: "Annualized alpha (bps), FF5+UMD, net of costs",
    observed: 141.0,
    null_mean: -1.8,
    null_std: 61.4,
    percentile: 0.988,
    p_value: 0.012,
    histogram: nullDraws,
  },
  bootstrap: [
    { statistic: "Net Sharpe ratio", point_estimate: 0.62, ci_low: 0.18, ci_high: 1.08, ci_level: 0.95, n_resamples: 5000, method: "stationary bootstrap, mean block length 6 months" },
    { statistic: "Net annualized alpha (bps)", point_estimate: 141.0, ci_low: -62.0, ci_high: 348.0, ci_level: 0.95, n_resamples: 5000, method: "stationary bootstrap, mean block length 6 months" },
    { statistic: "Mean IC, 21-day horizon", point_estimate: 0.0114, ci_low: 0.0016, ci_high: 0.0213, ci_level: 0.95, n_resamples: 5000, method: "stationary bootstrap, mean block length 6 months" },
  ],
  multiple_testing: {
    n_specifications_tested: 41,
    deflated_sharpe: 0.29,
    haircut_note:
      "Forty-one distinct specifications were run across the parameter sweep and robustness grid. Applying a Bonferroni-style haircut to the headline Sharpe of 0.62 leaves roughly 0.29, and the alpha t-statistic of 1.02 does not survive any reasonable multiple-testing adjustment. The specification count is reported here rather than buried because it is the difference between a result and a search.",
  },
});

// --- limitations -------------------------------------------------------------

write("limitations.json", {
  ...base("limitations", PLACEHOLDER_NOTE),
  headline_verdict: {
    verdict: "signal_decayed",
    summary:
      "The Cohen-Malloy-Pomorski opportunistic filter still separates informative insider purchases from uninformative ones out of sample: mean IC roughly triples when the filter is applied. But the level has fallen far enough that the surviving effect does not support a tradable strategy. Gross alpha of 268 bps a year sits at t = 1.94; net of a 29 bps explicit cost model it falls to 141 bps at t = 1.02, and the effect is concentrated in the 2014-2019 subperiod and in the small-cap tercile. The honest conclusion is post-publication decay with a residual, not a live edge.",
  },
  limitations: [
    {
      id: "survivorship",
      title: "Survivorship bias in the price data",
      severity: "high",
      category: "Data",
      description:
        "Free price sources drop delisted tickers, so the realized universe omits names that went to zero or were acquired at a discount. Insider purchases cluster in distressed names, which is precisely where delisting risk is highest.",
      direction_of_bias: "Upward — reported returns are too good",
      mitigation:
        "Universe counts are compared against expected attrition to bound the magnitude, and the direction is disclosed rather than adjusted away. A CRSP-quality price panel would resolve this properly.",
      quantification: "Estimated 40-90 bps per year of overstatement in the long book, unquantified on the short leg.",
    },
    {
      id: "10b51_opacity",
      title: "Rule 10b5-1 opacity before 2023",
      severity: "high",
      category: "Measurement",
      description:
        "The Form 4 checkbox identifying pre-scheduled 10b5-1 trades only exists from 2023. For nine of the twelve sample years the routine classifier is a behavioral proxy for scheduled trading, not an observation of it.",
      direction_of_bias: "Attenuating — misclassification dilutes the opportunistic bucket",
      mitigation:
        "The post-2023 checkbox is used as a partial validation set. The classifier agrees with the flag at 82% accuracy against a 24% base rate, which is meaningfully better than chance and clearly worse than direct observation.",
      quantification: "Roughly 40% of flagged 10b5-1 trades are labelled opportunistic by the classifier.",
    },
    {
      id: "sparsity",
      title: "Event sparsity",
      severity: "medium",
      category: "Statistics",
      description:
        "A median of 362 issuers carry any signal in a given month against a 1500-name universe. Quintiles on the active subset hold roughly 70 names each, so cross-sectional breadth is thin and confidence intervals are wide.",
      direction_of_bias: null,
      mitigation:
        "Quintiles rather than deciles, bootstrapped rather than asymptotic confidence intervals, and overlapping three-month tranches to raise effective breadth.",
      quantification: "95% bootstrap interval on the net Sharpe spans 0.18 to 1.08.",
    },
    {
      id: "disclosure_lag",
      title: "Disclosure lag plus monthly rebalancing",
      severity: "medium",
      category: "Implementation",
      description:
        "Signals are timestamped by filing date, up to two business days after the insider's fill, and are then only acted on at the next monthly rebalance. Realized entry can be several weeks after the insider transacted.",
      direction_of_bias: "Downward — realistic implementation gives up some of the paper effect",
      mitigation: "Intentional. Using transaction date instead would inject lookahead through late filings.",
      quantification: "Median filing lag 2 days; mean delay from transaction to portfolio entry roughly 17 calendar days.",
    },
    {
      id: "short_leg",
      title: "No borrow cost or short availability modelled",
      severity: "medium",
      category: "Implementation",
      description:
        "The dollar-neutral quintile-spread variant shorts the bottom quintile with no borrow fee and no availability constraint. Bottom-quintile names skew small and hard to borrow.",
      direction_of_bias: "Upward on the quintile-spread variant only",
      mitigation:
        "The beta- and sector-matched ETF hedge is treated as the primary construction precisely because it does not depend on single-name borrow.",
      quantification: null,
    },
    {
      id: "multiple_testing",
      title: "Specification search",
      severity: "medium",
      category: "Statistics",
      description:
        "Forty-one specifications were evaluated. Even with a pre-registered spec, the parameter sweep is a search, and the headline number is the best of a set.",
      direction_of_bias: "Upward",
      mitigation:
        "The full count is reported, the sweep is presented as a surface rather than a maximum, and Sharpe ratios are haircut for the number of trials.",
      quantification: "Headline Sharpe 0.62 haircuts to roughly 0.29 deflated.",
    },
  ],
  what_did_not_work: [
    {
      id: "post_publication_decay",
      title: "The headline effect is a fraction of its published size",
      hypothesis:
        "Opportunistic insider purchases should earn roughly 82 bps per month, the magnitude Cohen, Malloy & Pomorski report for 1986-2007.",
      what_we_did:
        "Replicated the classifier and signal as specified and measured monthly abnormal returns on the top quintile over 2014-2025.",
      what_happened:
        "Realized gross alpha is 268 bps per year, about 22 bps per month, roughly a quarter of the published magnitude, and it is not statistically distinguishable from zero once costs are subtracted.",
      evidence: [
        { label: "CMP published (1986-2007)", value: "~82 bps/month", t_stat: null },
        { label: "This replication, gross", value: "22 bps/month", t_stat: 1.94 },
        { label: "This replication, net of 29 bps costs", value: "12 bps/month", t_stat: 1.02 },
      ],
      takeaway:
        "Consistent with post-publication decay. The direction of the effect replicates; the magnitude does not.",
    },
    {
      id: "second_half_dead",
      title: "The effect is concentrated entirely in the first half of the sample",
      hypothesis: "If the effect is structural rather than a regime artifact it should appear in both subperiods.",
      what_we_did: "Split the sample at 2020-01-01 and re-estimated alpha in each half.",
      what_happened:
        "Alpha is 268 bps (t = 1.88) in 2014-2019 and 18 bps (t = 0.11) in 2020-2025. Excluding the COVID quarters does not rescue the second half.",
      evidence: [
        { label: "2014-2019 alpha", value: "268 bps/yr", t_stat: 1.88 },
        { label: "2020-2025 alpha", value: "18 bps/yr", t_stat: 0.11 },
        { label: "Excluding 2020 Q1-Q2", value: "96 bps/yr", t_stat: 0.94 },
      ],
      takeaway:
        "The most likely reading is continued decay as insider filings became easier to monitor in real time. A regime story cannot be ruled out on twelve years of data.",
    },
    {
      id: "large_caps_nothing",
      title: "Nothing survives in large caps",
      hypothesis: "CMP predicts a stronger effect in smaller names, but some effect should remain in liquid ones.",
      what_we_did: "Split the universe into capitalization terciles and re-ran the full backtest in each.",
      what_happened:
        "Small-cap alpha is 284 bps (t = 1.79); large-cap alpha is negative at -34 bps (t = -0.29). The tercile where the strategy would actually be scalable is the one where the effect is absent.",
      evidence: [
        { label: "Small-cap tercile", value: "284 bps/yr", t_stat: 1.79 },
        { label: "Mid-cap tercile", value: "118 bps/yr", t_stat: 0.98 },
        { label: "Large-cap tercile", value: "-34 bps/yr", t_stat: -0.29 },
      ],
      takeaway:
        "Capacity and edge point in opposite directions here, which is the usual reason a published anomaly is hard to monetize.",
    },
    {
      id: "net_of_buys_minus_sales",
      title: "Netting sales against purchases destroys the signal",
      hypothesis: "If insider trading is informative in both directions, netting sales should sharpen the signal.",
      what_we_did: "Replaced the purchase-only signal with net dollar flow, purchases minus sales, in the same aggregation.",
      what_happened: "Alpha falls from 141 bps to 41 bps and the t-statistic falls to 0.39.",
      evidence: [
        { label: "Buys only", value: "141 bps/yr", t_stat: 1.02 },
        { label: "Buys minus sales", value: "41 bps/yr", t_stat: 0.39 },
      ],
      takeaway:
        "Reproduces the Jeng-Metrick-Zeckhauser asymmetry. Sales are dominated by diversification and liquidity motives and carry little information, so adding them adds noise.",
    },
    {
      id: "short_horizons",
      title: "Nothing at short horizons",
      hypothesis: "If the market is slow to impound Form 4 disclosures there should be measurable drift within days.",
      what_we_did: "Computed IC at 1- and 5-day forward horizons alongside the longer ones.",
      what_happened: "Mean IC at one day is 0.21% (t = 0.62) and at five days 0.58% (t = 1.44). Neither is distinguishable from zero.",
      evidence: [
        { label: "1-day IC", value: "0.21%", t_stat: 0.62 },
        { label: "5-day IC", value: "0.58%", t_stat: 1.44 },
        { label: "63-day IC", value: "1.31%", t_stat: 2.48 },
      ],
      takeaway:
        "Whatever information is present is impounded slowly over a quarter, not immediately. That is consistent with the limited-attention mechanism and inconsistent with an event-drift trade.",
    },
  ],
});

console.log("\nAll placeholder artifacts written.");
