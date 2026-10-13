import forecastJson from '../../data/forecast.json';
import riskJson from '../../data/risk.json';
import strategyJson from '../../data/strategy.json';
import summaryJson from '../../data/summary.json';

export type StrategyKey = 'always' | 'naive' | 'harx' | 'xgb' | 'oracle';
export type Interval = { lo: number; mid: number; hi: number };

export type Summary = {
  generated_at: string;
  data_through: string;
  oos_start: string;
  oos_end: string;
  train_start: string;
  oos_days: number;
  current: {
    date: string;
    vix: number;
    iv_atm: number;
    fc_xgb: number;
    fc_harx: number;
    rv_trailing: number;
    edge: number;
    sell: boolean;
  };
  headline: {
    sharpe_xgb: number;
    sharpe_always: number;
    mdd_xgb: number;
    mdd_always: number;
    prob_beats_always: number;
    qlike_gain_vs_harx: number;
    time_in_market: number;
  };
  costs: { atm_ratio: number; spread_vol_pts: number; hedge_cost_bps: number };
};

export type ForecastMetric = {
  model: 'har' | 'harx' | 'xgb' | 'vix';
  rmse: number;
  mae: number;
  bias: number;
  r2_log: number;
  qlike: number;
  dm_vs_har?: number;
  dm_vs_harx?: number;
};

export type Forecast = {
  metrics: ForecastMetric[];
  importance: { feature: string; value: number }[];
  rounds: { median: number; max: number; zero_share: number; history: { d: string; rounds: number }[] };
  series: { d: string; vix: number; realized: number | null; har: number; harx: number; xgb: number }[];
  params: {
    horizon: number;
    refit_every: number;
    embargo: number;
    min_train: number;
    holdout: number;
    xgb: Record<string, number | string>;
  };
};

export type Stats = {
  ann_return: number;
  ann_vol: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  worst_month: number;
  worst_month_date: string;
  skew: number;
  cvar_5: number;
  time_in_market: number;
};

export type Strategy = {
  labels: Record<StrategyKey, string>;
  stats: Record<StrategyKey, Stats>;
  equity: ({ d: string } & Record<StrategyKey, number>)[];
  drawdown: { d: string; always: number; xgb: number }[];
  exposure: { d: string; xgb: number }[];
  yearly: ({ year: number } & Record<StrategyKey, number>)[];
  crashes: ({ name: string; start: string; end: string; vix_peak: number } & Record<StrategyKey, number>)[];
  sensitivity: ({ threshold: number } & Stats)[];
  costs: {
    atm_ratio: number;
    spread_vol_pts: number;
    sharpe_always: number;
    sharpe_xgb: number;
    return_always: number;
    return_xgb: number;
  }[];
  ic: Record<'naive' | 'harx' | 'xgb', number>;
  hit_rate: number;
};

export type Risk = {
  bootstrap: {
    draws: number;
    mean_block: number;
    bins: number[];
    strategies: Record<
      Exclude<StrategyKey, 'oracle'>,
      {
        sharpe: Interval;
        max_drawdown: Interval;
        ann_return: Interval;
        prob_negative_sharpe: number;
        hist: number[];
      }
    >;
    paired: Record<'naive' | 'harx' | 'xgb', { prob_beats_always: number; sharpe_diff: Interval }>;
  };
  stress: {
    implied: number;
    diffusion: number;
    jump_mean: number;
    jump_sd: number;
    paths: number;
    premium: number;
    rows: {
      jumps_per_year: number;
      realized_vol: number;
      mean: number;
      median: number;
      p5: number;
      p1: number;
      prob_loss: number;
    }[];
    curve: { realized: number; simulated: number; bs_gap: number }[];
  };
};

export const summary = summaryJson as Summary;
export const forecast = forecastJson as unknown as Forecast;
export const strategy = strategyJson as unknown as Strategy;
export const risk = riskJson as unknown as Risk;

export const REPO = 'https://github.com/saiaashish2007/Personal-Projects/tree/main/vol-premium';

export const MODEL_LABELS: Record<ForecastMetric['model'], string> = {
  har: 'HAR (realized vol only)',
  harx: 'HAR-X (HAR + VIX)',
  xgb: 'XGBoost on HAR-X',
  vix: 'VIX as the forecast',
};

export const FEATURE_LABELS: Record<string, string> = {
  log_rv_d: 'Daily range vol',
  log_rv_w: '5-day realized vol',
  log_rv_m: '21-day realized vol',
  log_park_w: '5-day Parkinson vol',
  log_park_m: '21-day Parkinson vol',
  log_gk_m: '21-day Garman-Klass vol',
  log_semi_m: '21-day downside semivol',
  log_vix: 'VIX',
  log_vix9d: 'VIX9D',
  log_vix3m: 'VIX3M',
  log_vvix: 'VVIX (vol of VIX)',
  vix_term: 'Term slope VIX3M / VIX',
  vix_front: 'Front slope VIX9D / VIX',
  vrp_trailing: 'VIX minus trailing realized',
  dvix_5: '5-day change in VIX',
  ret_5: '5-day S&P return',
  ret_21: '21-day S&P return',
  drawdown: 'S&P drawdown from 1-year high',
};

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const signedPct = (x: number, digits = 1) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;
export const num = (x: number, digits = 2) => x.toFixed(digits);
export const year = (d: string) => d.slice(0, 4);
