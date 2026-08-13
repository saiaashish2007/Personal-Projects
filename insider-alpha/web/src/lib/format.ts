const INT = new Intl.NumberFormat("en-US");

export function int(n: number): string {
  return INT.format(Math.round(n));
}

export function num(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function pct(fraction: number, digits = 1): string {
  return `${num(fraction * 100, digits)}%`;
}

export function signedPct(fraction: number, digits = 1): string {
  return `${fraction >= 0 ? "+" : ""}${pct(fraction, digits)}`;
}

export function bps(value: number, digits = 0): string {
  return `${value >= 0 ? "" : "\u2212"}${num(Math.abs(value), digits)} bps`;
}

export function signedBps(value: number, digits = 0): string {
  return `${value >= 0 ? "+" : "\u2212"}${num(Math.abs(value), digits)} bps`;
}

export function usd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${num(value / 1_000_000, 1)}M`;
  if (Math.abs(value) >= 1_000) return `$${num(value / 1_000, 1)}k`;
  return `$${int(value)}`;
}

export function tstat(t: number | null): string {
  if (t === null) return "—";
  return `t = ${num(t, 2)}`;
}

/** Conventional reading of a two-sided t-statistic at 144 monthly observations. */
export function significance(t: number | null): "strong" | "marginal" | "none" {
  if (t === null) return "none";
  const a = Math.abs(t);
  if (a >= 2.0) return "strong";
  if (a >= 1.65) return "marginal";
  return "none";
}

export function ci(low: number | null, high: number | null, digits = 2): string {
  if (low === null || high === null) return "—";
  return `[${num(low, digits)}, ${num(high, digits)}]`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${m}/${(y ?? "").slice(2)}`;
}

export function yearOf(dateOrMonth: string): string {
  return dateOrMonth.slice(0, 4);
}

export function horizonLabel(days: number): string {
  if (days === 1) return "1d";
  if (days === 252) return "252d (1y)";
  if (days === 126) return "126d (6m)";
  if (days === 63) return "63d (3m)";
  if (days === 21) return "21d (1m)";
  return `${days}d`;
}
