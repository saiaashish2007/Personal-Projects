"use client";

import {
  Area,
  CartesianGrid,
  Legend,
  AreaChart as RAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { asLabel, AXIS_TICK, CHART, formatTooltipValue, TOOLTIP_STYLE } from "./theme";

export interface AreaSeriesSpec {
  key: string;
  label: string;
  color: string;
  fillOpacity?: number;
}

export default function AreaChart({
  data,
  xKey,
  series,
  height = 240,
  stacked = false,
  yTickFormat = "percent",
  xTickEvery,
}: {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  series: AreaSeriesSpec[];
  height?: number;
  stacked?: boolean;
  yTickFormat?: "percent" | "plain";
  xTickEvery?: number;
}) {
  const tick =
    yTickFormat === "percent"
      ? (v: number) => `${(v * 100).toFixed(0)}%`
      : (v: number) => v.toLocaleString("en-US");
  const interval = xTickEvery ?? Math.max(0, Math.floor(data.length / 8) - 1);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RAreaChart data={data} margin={{ top: 6, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            interval={interval}
            minTickGap={16}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={tick}
            domain={stacked ? [0, 1] : ["auto", 0]}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown, name: unknown) => [
              formatTooltipValue(value, tick),
              asLabel(name),
            ]}
          />
          {series.length > 1 ? (
            <Legend
              verticalAlign="top"
              align="left"
              height={28}
              wrapperStyle={{ fontSize: 12, color: CHART.muted }}
            />
          ) : null}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "a" : undefined}
              stroke={s.color}
              strokeWidth={1.2}
              fill={s.color}
              fillOpacity={s.fillOpacity ?? (stacked ? 0.75 : 0.14)}
              isAnimationActive={false}
            />
          ))}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
