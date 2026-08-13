"use client";

import {
  Bar,
  CartesianGrid,
  BarChart as RBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { asLabel, AXIS_TICK, CHART, TOOLTIP_STYLE } from "./theme";

export default function RandomizationChart({
  data,
  observed,
  height = 260,
}: {
  data: Array<{ bin_center: number; count: number }>;
  observed: number;
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 6, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="bin_center"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            type="number"
            domain={["dataMin", "dataMax"]}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            {...TOOLTIP_STYLE}
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
            formatter={(value: unknown) => [asLabel(value), "draws"]}
            labelFormatter={(label: unknown) => `alpha ${asLabel(label)} bps`}
          />
          <Bar dataKey="count" fill={CHART.neutral} isAnimationActive={false} />
          <ReferenceLine
            x={observed}
            stroke={CHART.accent}
            strokeWidth={2}
            label={{
              value: `observed ${Math.round(observed)}`,
              position: "top",
              fill: CHART.accent,
              fontSize: 11,
            }}
          />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
