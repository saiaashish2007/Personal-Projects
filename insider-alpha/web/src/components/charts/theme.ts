export const CHART = {
  ink: "#16181d",
  muted: "#6b7280",
  grid: "#eceae5",
  axis: "#cbc8c1",
  accent: "#1f4d8f",
  accentSoft: "#8fabd0",
  neutral: "#a8a29a",
  pos: "#2f6f4f",
  neg: "#a4342a",
  warn: "#8a5a00",
} as const;

export const AXIS_TICK = { fill: CHART.muted, fontSize: 11 } as const;

/**
 * Recharts types tooltip values as `ValueType | undefined`, so formatters take `unknown`
 * and narrow rather than asserting.
 */
export function formatTooltipValue(
  value: unknown,
  tick: (v: number) => string,
  suffix = "",
): string {
  if (typeof value === "number") return `${tick(value)}${suffix}`;
  if (typeof value === "string") return `${value}${suffix}`;
  return "—";
}

export function asLabel(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 6,
    border: "1px solid #e4e2dd",
    background: "#ffffff",
    fontSize: 12,
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
  },
  labelStyle: { color: CHART.ink, fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: CHART.ink },
} as const;
