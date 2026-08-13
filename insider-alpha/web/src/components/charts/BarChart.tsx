"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ErrorBar,
  Legend,
  BarChart as RBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { asLabel, AXIS_TICK, CHART, formatTooltipValue, TOOLTIP_STYLE } from "./theme";

export interface BarSeriesSpec {
  key: string;
  label: string;
  color: string;
  /** Field holding a symmetric error bar half-width, drawn as a 1-SE whisker. */
  errorKey?: string;
}

export interface BarChartProps {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  series: BarSeriesSpec[];
  height?: number;
  yTickFormat?: "percent" | "decimal2" | "decimal3" | "plain";
  zeroLine?: boolean;
  colorBySign?: boolean;
  stacked?: boolean;
  valueSuffix?: string;
}

const fmt: Record<NonNullable<BarChartProps["yTickFormat"]>, (v: number) => string> = {
  percent: (v) => `${(v * 100).toFixed(0)}%`,
  decimal2: (v) => v.toFixed(2),
  decimal3: (v) => v.toFixed(3),
  plain: (v) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-US") : String(Math.round(v * 100) / 100)),
};

export default function BarChart({
  data,
  xKey,
  series,
  height = 300,
  yTickFormat = "plain",
  zeroLine = true,
  colorBySign = false,
  stacked = false,
  valueSuffix = "",
}: BarChartProps) {
  const tick = fmt[yTickFormat];
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 6, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            minTickGap={8}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={tick}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
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
              wrapperStyle={{ fontSize: 12, color: CHART.muted }}
            />
          ) : null}
          {zeroLine ? <ReferenceLine y={0} stroke={CHART.axis} /> : null}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? "a" : undefined}
              isAnimationActive={false}
              maxBarSize={54}
            >
              {colorBySign
                ? data.map((row, i) => {
                    const v = row[s.key];
                    return (
                      <Cell
                        key={i}
                        fill={typeof v === "number" && v < 0 ? CHART.neg : s.color}
                      />
                    );
                  })
                : null}
              {s.errorKey ? (
                <ErrorBar dataKey={s.errorKey} width={4} strokeWidth={1} stroke={CHART.muted} />
              ) : null}
            </Bar>
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
