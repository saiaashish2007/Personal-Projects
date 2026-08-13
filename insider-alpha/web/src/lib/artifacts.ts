/**
 * Artifact contract between the offline Python research pipeline and the static
 * dashboard. The Python side writes one JSON file per interface below into
 * `artifacts/`; the dashboard reads them at build time. JSON Schema mirrors of
 * these types live in `artifacts/schema/` and are the machine-checkable version
 * of the same contract.
 *
 * Conventions used throughout:
 *   - dates are ISO-8601 `YYYY-MM-DD`, months are `YYYY-MM`, timestamps are RFC-3339 UTC
 *   - returns and alphas are basis points unless the field name says otherwise
 *   - `share` / `proportion` fields are fractions in [0, 1], not percentages
 *   - `null` means "not computed"; it is never a stand-in for zero
 */

export const SCHEMA_VERSION = "1.0.0";

export type DataStatus = "real" | "placeholder";

export type ArtifactName =
  | "meta"
  | "data_profile"
  | "classifier"
  | "ic"
  | "backtest"
  | "costs"
  | "attribution"
  | "robustness"
  | "limitations";

export interface ArtifactBase {
  schema_version: string;
  artifact: ArtifactName;
  generated_at: string;
  /** `placeholder` forces a visible badge on every page that reads this artifact. */
  data_status: DataStatus;
  notes: string | null;
}

/** A point estimate carrying the statistical context required to interpret it. */
export interface Estimate {
  value: number;
  std_error: number | null;
  t_stat: number | null;
  p_value: number | null;
  ci_low: number | null;
  ci_high: number | null;
  n_obs: number | null;
}

// --- meta.json ---------------------------------------------------------------

export interface SoftwarePackage {
  name: string;
  version: string;
}

export interface UniverseScreen {
  name: string;
  description: string;
  value: string;
}

export type StageStatus = "complete" | "partial" | "not_run";

export interface PipelineStage {
  milestone: number;
  name: string;
  status: StageStatus;
  artifact: ArtifactName | null;
}

export interface MetaArtifact extends ArtifactBase {
  artifact: "meta";
  run: {
    timestamp: string;
    git_sha: string | null;
    git_dirty: boolean | null;
    duration_seconds: number | null;
  };
  sample: {
    start: string;
    end: string;
    burn_in_start: string;
    rebalance_frequency: string;
    n_rebalance_dates: number | null;
  };
  universe: {
    name: string;
    description: string;
    target_size: number;
    screens: UniverseScreen[];
  };
  software: {
    python_version: string;
    packages: SoftwarePackage[];
  };
  pipeline_stages: PipelineStage[];
}

// --- data_profile.json -------------------------------------------------------

export interface TransactionCodeRow {
  code: string;
  label: string;
  count: number;
  share: number;
  included_in_signal: boolean;
}

export interface EventDensityPoint {
  month: string;
  qualifying_purchases: number;
  distinct_issuers: number;
  distinct_insiders: number;
  median_trade_value_usd: number;
}

export interface FilingLagBin {
  lag_days: number;
  count: number;
  share: number;
}

export interface DataProfileArtifact extends ArtifactBase {
  artifact: "data_profile";
  coverage: {
    start: string;
    end: string;
  };
  totals: {
    transactions: number;
    filings: number;
    distinct_issuers: number;
    distinct_insiders: number;
    open_market_purchases: number;
    superseded_rows_removed: number;
    dropped_missing_price: number;
  };
  transaction_codes: TransactionCodeRow[];
  event_density: EventDensityPoint[];
  filing_lag: {
    histogram: FilingLagBin[];
    median_days: number;
    mean_days: number;
    p95_days: number;
    share_within_statutory_window: number;
    share_flagged_late: number;
  };
  trade_value_usd: {
    p25: number;
    median: number;
    mean: number;
    p75: number;
    p95: number;
  };
  ownership: {
    direct_count: number;
    indirect_count: number;
    indirect_share: number;
  };
  joint_filings: {
    filings_with_multiple_owners: number;
    share: number;
  };
  schema_drift_notes: string[];
}

// --- classifier.json ---------------------------------------------------------

export type ClassifierBucket = "routine" | "opportunistic" | "unclassified";

export interface ClassifierProportionPoint {
  date: string;
  routine: number;
  opportunistic: number;
  unclassified: number;
  n_insiders: number;
}

export interface CmpComparisonRow {
  bucket: ClassifierBucket;
  cmp_reported_share: number | null;
  replication_share: number;
  delta: number | null;
}

export interface Rule10b51Validation {
  period_start: string;
  period_end: string;
  n_filings: number;
  /** Rows are the classifier's label, columns are the Form 4 10b5-1 checkbox. */
  confusion_matrix: {
    routine_and_flagged: number;
    routine_not_flagged: number;
    opportunistic_and_flagged: number;
    opportunistic_not_flagged: number;
  };
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    flag_base_rate: number;
  };
  interpretation: string;
}

export interface BucketMigrationRow {
  from: ClassifierBucket;
  to: ClassifierBucket;
  count: number;
  share: number;
}

export interface ClassifierArtifact extends ArtifactBase {
  artifact: "classifier";
  definition: string;
  pooled_proportions: {
    routine: number;
    opportunistic: number;
    unclassified: number;
    n_insider_dates: number;
  };
  proportions_over_time: ClassifierProportionPoint[];
  cmp_comparison: CmpComparisonRow[];
  rule_10b5_1_validation: Rule10b51Validation | null;
  migration: BucketMigrationRow[];
}

// --- ic.json -----------------------------------------------------------------

/** The two arms of the headline experiment: CMP filter applied vs. not applied. */
export type SignalArm = "opportunistic" | "all_insiders";

export const HORIZONS = [1, 5, 21, 63, 126, 252] as const;
export type Horizon = (typeof HORIZONS)[number];

export interface IcHorizonStat {
  horizon_days: number;
  mean_ic: number;
  ic_std: number;
  ic_ir: number;
  t_stat_newey_west: number;
  newey_west_lags: number;
  p_value: number;
  n_periods: number;
  mean_cross_section_size: number;
}

export interface IcTimeSeriesPoint {
  date: string;
  ic: number;
  n: number;
}

export interface IcTimeSeries {
  horizon_days: number;
  points: IcTimeSeriesPoint[];
}

export interface QuantileBucket {
  quantile: number;
  mean_forward_return_bps: number;
  std_error_bps: number;
  n_obs: number;
}

export interface QuantileSort {
  horizon_days: number;
  buckets: QuantileBucket[];
  spread_bps: number;
  spread_t_stat: number;
  monotonic: boolean;
  spearman_rank_of_means: number;
}

export interface IcArm {
  arm: SignalArm;
  label: string;
  by_horizon: IcHorizonStat[];
  time_series: IcTimeSeries[];
  quantiles: QuantileSort[];
}

export interface IcHeadlineRow {
  horizon_days: number;
  opportunistic_mean_ic: number;
  opportunistic_t_stat: number;
  all_insiders_mean_ic: number;
  all_insiders_t_stat: number;
  delta_ic: number;
  delta_t_stat: number | null;
}

export interface IcArtifact extends ArtifactBase {
  artifact: "ic";
  arms: IcArm[];
  headline: IcHeadlineRow[];
  go_no_go: {
    criterion: string;
    horizons_evaluated: number[];
    passed: boolean;
    verdict: string;
  };
}

// --- backtest.json -----------------------------------------------------------

export type HedgeConstruction =
  | "long_only"
  | "quintile_spread"
  | "beta_sector_matched_etf";

export interface EquityPoint {
  date: string;
  gross: number;
  net: number;
  benchmark: number | null;
}

export interface DrawdownPoint {
  date: string;
  gross: number;
  net: number;
}

export interface MonthlyReturnPoint {
  month: string;
  gross: number;
  net: number;
  benchmark: number | null;
}

export interface TurnoverPoint {
  month: string;
  turnover: number;
}

export interface PerformanceBlock {
  ann_return: number;
  ann_vol: number;
  sharpe: number;
  sharpe_std_error: number | null;
  sortino: number;
  max_drawdown: number;
  calmar: number;
  hit_rate_monthly: number;
  best_month: number;
  worst_month: number;
}

export interface BacktestVariant {
  id: string;
  label: string;
  description: string;
  hedge: HedgeConstruction;
  holding_period_months: number;
  arm: SignalArm;
  cost_assumption_bps: number;
  n_months: number;
  avg_n_positions: number;
  equity_curve: EquityPoint[];
  drawdown: DrawdownPoint[];
  monthly_returns: MonthlyReturnPoint[];
  turnover: {
    annualized: number;
    monthly: TurnoverPoint[];
  };
  stats: {
    gross: PerformanceBlock;
    net: PerformanceBlock;
    benchmark: PerformanceBlock | null;
  };
}

export interface BacktestArtifact extends ArtifactBase {
  artifact: "backtest";
  primary_variant_id: string;
  benchmark_label: string;
  variants: BacktestVariant[];
}

// --- costs.json --------------------------------------------------------------

export interface HalfSpreadRow {
  cap_tercile: "large" | "mid" | "small";
  half_spread_bps: number;
}

export interface CostSweepPoint {
  round_trip_bps: number;
  net_sharpe: number;
  net_ann_return: number;
  net_alpha_ann_bps: number;
  alpha_t_stat: number;
}

export interface CostsArtifact extends ArtifactBase {
  artifact: "costs";
  variant_id: string;
  explicit_model: {
    description: string;
    half_spreads: HalfSpreadRow[];
    impact_coefficient_k: number;
    participation_cap: number;
    estimated_round_trip_bps: number;
  };
  sweep: CostSweepPoint[];
  break_even: {
    alpha_zero_bps: number | null;
    sharpe_zero_bps: number | null;
    interpretation: string;
  };
  turnover: {
    annualized: number;
    avg_monthly: number;
    note: string;
  };
}

// --- attribution.json --------------------------------------------------------

export type FactorName = "MKT" | "SMB" | "HML" | "RMW" | "CMA" | "UMD";

export interface FactorLoading {
  factor: FactorName;
  label: string;
  beta: number;
  std_error: number;
  t_stat: number;
  p_value: number;
}

export interface FactorRegression {
  id: string;
  label: string;
  description: string;
  dependent_variable: string;
  alpha_ann_bps: number;
  alpha_std_error_bps: number;
  alpha_t_stat: number;
  alpha_p_value: number;
  loadings: FactorLoading[];
  r_squared: number;
  adj_r_squared: number;
  n_months: number;
  newey_west_lags: number;
}

export interface AttributionArtifact extends ArtifactBase {
  artifact: "attribution";
  primary_regression_id: string;
  regressions: FactorRegression[];
  interpretation: string;
}

// --- robustness.json ---------------------------------------------------------

export type RobustnessFamily =
  | "headline"
  | "subperiod"
  | "event_exclusion"
  | "cap_tercile"
  | "sector_exclusion"
  | "signal_definition";

export interface RobustnessRow {
  id: string;
  family: RobustnessFamily;
  label: string;
  description: string;
  n_months: number;
  ann_return: number;
  sharpe: number;
  sharpe_ci_low: number | null;
  sharpe_ci_high: number | null;
  alpha_ann_bps: number;
  alpha_t_stat: number;
  delta_alpha_vs_baseline_bps: number | null;
}

export interface ParameterSweepCell {
  x: number;
  y: number;
  value: number;
  t_stat: number | null;
}

export interface ParameterSweep {
  metric: string;
  x_param: string;
  x_label: string;
  x_values: number[];
  y_param: string;
  y_label: string;
  y_values: number[];
  cells: ParameterSweepCell[];
  assessment: string;
}

export interface RandomizationHistogramBin {
  bin_center: number;
  count: number;
}

export interface BootstrapInterval {
  statistic: string;
  point_estimate: number;
  ci_low: number;
  ci_high: number;
  ci_level: number;
  n_resamples: number;
  method: string;
}

export interface RobustnessArtifact extends ArtifactBase {
  artifact: "robustness";
  baseline_id: string;
  grid: RobustnessRow[];
  parameter_sweep: ParameterSweep;
  randomization: {
    n_draws: number;
    statistic: string;
    observed: number;
    null_mean: number;
    null_std: number;
    percentile: number;
    p_value: number;
    histogram: RandomizationHistogramBin[];
  };
  bootstrap: BootstrapInterval[];
  multiple_testing: {
    n_specifications_tested: number;
    deflated_sharpe: number | null;
    haircut_note: string;
  };
}

// --- limitations.json --------------------------------------------------------

export type Severity = "high" | "medium" | "low";

export interface Limitation {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  description: string;
  direction_of_bias: string | null;
  mitigation: string;
  quantification: string | null;
}

export interface EvidenceItem {
  label: string;
  value: string;
  t_stat: number | null;
}

export interface DidNotWorkItem {
  id: string;
  title: string;
  hypothesis: string;
  what_we_did: string;
  what_happened: string;
  evidence: EvidenceItem[];
  takeaway: string;
}

export type Verdict = "signal_persists" | "signal_decayed" | "inconclusive";

export interface LimitationsArtifact extends ArtifactBase {
  artifact: "limitations";
  headline_verdict: {
    verdict: Verdict;
    summary: string;
  };
  limitations: Limitation[];
  what_did_not_work: DidNotWorkItem[];
}

// --- bundle ------------------------------------------------------------------

export interface ArtifactBundle {
  meta: MetaArtifact;
  data_profile: DataProfileArtifact;
  classifier: ClassifierArtifact;
  ic: IcArtifact;
  backtest: BacktestArtifact;
  costs: CostsArtifact;
  attribution: AttributionArtifact;
  robustness: RobustnessArtifact;
  limitations: LimitationsArtifact;
}

export const ARTIFACT_FILES: Record<ArtifactName, string> = {
  meta: "meta.json",
  data_profile: "data_profile.json",
  classifier: "classifier.json",
  ic: "ic.json",
  backtest: "backtest.json",
  costs: "costs.json",
  attribution: "attribution.json",
  robustness: "robustness.json",
  limitations: "limitations.json",
};
