"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { asLabel, AXIS_TICK, CHART, formatTooltipValue, TOOLTIP_STYLE } from "./theme";

export interface SeriesSpec {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  width?: number;
}

export interface LineChartProps {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  series: SeriesSpec[];
  height?: number;
  yTickFormat?: "percent" | "decimal2" | "decimal3" | "multiple" | "bps" | "plain";
  xTickEvery?: number;
  zeroLine?: boolean;
  yDomain?: [number | "auto", number | "auto"];
  valueSuffix?: string;
}

const fmt: Record<NonNullable<LineChartProps["yTickFormat"]>, (v: number) => string> = {
  percent: (v) => `${(v * 100).toFixed(0)}%`,
  decimal2: (v) => v.toFixed(2),
  decimal3: (v) => v.toFixed(3),
  multiple: (v) => `${v.toFixed(1)}x`,
  bps: (v) => `${Math.round(v)}`,
  plain: (v) => String(v),
};

export default function LineChart({
  data,
  xKey,
  series,
  height = 300,
  yTickFormat = "decimal2",
  xTickEvery,
  zeroLine = false,
  yDomain,
  valueSuffix = "",
}: LineChartProps) {
  const tick = fmt[yTickFormat];
  const interval = xTickEvery ?? Math.max(0, Math.floor(data.length / 8) - 1);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RLineChart data={data} margin={{ top: 6, right: 10, bottom: 4, left: 0 }}>
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
            domain={yDomain ?? ["auto", "auto"]}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown, name: unknown) => [
              formatTooltipValue(value, tick, valueSuffix),
              asLabel(name),
            ]}
          />
          {series.length > 1 ? (
            <Legend
              verticalAlign="top"
              align="left"
              height={28}
              iconType="plainline"
              wrapperStyle={{ fontSize: 12, color: CHART.muted }}
            />
          ) : null}
          {zeroLine ? <ReferenceLine y={0} stroke={CHART.axis} strokeWidth={1} /> : null}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={s.width ?? 1.6}
              strokeDasharray={s.dashed ? "4 3" : undefined}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
