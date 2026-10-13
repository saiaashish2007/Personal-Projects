'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Forecast, Risk, Strategy } from '@/lib/data';
import { FEATURE_LABELS } from '@/lib/data';

export const COLORS = {
  always: '#a3a3a3',
  naive: '#d97706',
  harx: '#6366f1',
  xgb: '#0d9488',
  oracle: '#d4d4d4',
  realized: '#171717',
  vix: '#a3a3a3',
};

const axis = { fontSize: 11, fill: '#737373', fontFamily: 'var(--font-geist-mono)' };
const tooltip = {
  contentStyle: { fontSize: 12, borderRadius: 6, borderColor: '#e5e5e5' },
  labelStyle: { color: '#525252', fontFamily: 'var(--font-geist-mono)' },
};
const pctTick = (v: number) => `${Math.round(v * 100)}%`;
const pctTip = (v: unknown) => `${((v as number) * 100).toFixed(1)}%`;
const volTip = (v: unknown) => (v == null ? '—' : (v as number).toFixed(1));

function Frame({ height = 320, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ForecastChart({ data }: { data: Forecast['series'] }) {
  const start = Math.max(0, data.length - 52 * 6);
  return (
    <Frame height={360}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#f5f5f5" vertical={false} />
        <XAxis dataKey="d" tick={axis} tickFormatter={(d: string) => d.slice(0, 7)} minTickGap={48} />
        <YAxis tick={axis} />
        <Tooltip {...tooltip} formatter={volTip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="vix" name="VIX" stroke={COLORS.vix} dot={false} strokeWidth={1} />
        <Line dataKey="realized" name="Realized (next 21 days)" stroke={COLORS.realized} dot={false} strokeWidth={1.25} />
        <Line dataKey="xgb" name="XGBoost forecast" stroke={COLORS.xgb} dot={false} strokeWidth={1.5} />
        <Brush dataKey="d" height={22} stroke="#a3a3a3" startIndex={start} tickFormatter={(d: string) => d.slice(0, 4)} />
      </LineChart>
    </Frame>
  );
}

export function ImportanceChart({ data }: { data: Forecast['importance'] }) {
  const rows = data.slice(0, 10).map((r) => ({ ...r, label: FEATURE_LABELS[r.feature] ?? r.feature }));
  return (
    <Frame height={300}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <XAxis type="number" tick={axis} />
        <YAxis type="category" dataKey="label" width={170} tick={{ ...axis, fill: '#404040' }} />
        <Tooltip {...tooltip} formatter={(v: unknown) => (v as number).toFixed(4)} />
        <Bar dataKey="value" name="Mean |SHAP|" fill={COLORS.xgb} radius={[0, 3, 3, 0]} />
      </BarChart>
    </Frame>
  );
}

const SHOWN = ['always', 'naive', 'harx', 'xgb'] as const;

export function EquityChart({ data, labels }: { data: Strategy['equity']; labels: Strategy['labels'] }) {
  return (
    <Frame height={360}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="#f5f5f5" vertical={false} />
        <XAxis dataKey="d" tick={axis} tickFormatter={(d: string) => d.slice(0, 4)} minTickGap={40} />
        <YAxis tick={axis} tickFormatter={pctTick} />
        <Tooltip {...tooltip} formatter={pctTip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SHOWN.map((k) => (
          <Line
            key={k}
            dataKey={k}
            name={labels[k]}
            stroke={COLORS[k]}
            dot={false}
            strokeWidth={k === 'xgb' ? 1.75 : 1.25}
          />
        ))}
      </LineChart>
    </Frame>
  );
}

export function DrawdownChart({ data }: { data: Strategy['drawdown'] }) {
  return (
    <Frame height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="#f5f5f5" vertical={false} />
        <XAxis dataKey="d" tick={axis} tickFormatter={(d: string) => d.slice(0, 4)} minTickGap={40} />
        <YAxis tick={axis} tickFormatter={pctTick} />
        <Tooltip {...tooltip} formatter={pctTip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area dataKey="always" name="Always sell" stroke={COLORS.always} fill={COLORS.always} fillOpacity={0.25} />
        <Area dataKey="xgb" name="XGBoost-timed" stroke={COLORS.xgb} fill={COLORS.xgb} fillOpacity={0.25} />
      </AreaChart>
    </Frame>
  );
}

export function ExposureChart({ data }: { data: Strategy['exposure'] }) {
  return (
    <Frame height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
        <XAxis dataKey="d" tick={axis} tickFormatter={(d: string) => d.slice(0, 4)} minTickGap={40} />
        <YAxis tick={axis} tickFormatter={pctTick} domain={[0, 1]} />
        <Tooltip {...tooltip} formatter={pctTip} />
        <Area
          type="step"
          dataKey="xgb"
          name="Share of days selling"
          stroke={COLORS.xgb}
          fill={COLORS.xgb}
          fillOpacity={0.2}
        />
      </AreaChart>
    </Frame>
  );
}

export function SharpeHistogram({ boot }: { boot: Risk['bootstrap'] }) {
  const rows = boot.strategies.always.hist.map((_, i) => ({
    x: ((boot.bins[i]! + boot.bins[i + 1]!) / 2).toFixed(2),
    always: boot.strategies.always.hist[i],
    xgb: boot.strategies.xgb.hist[i],
  }));
  return (
    <Frame height={260}>
      <BarChart data={rows} barGap={0} barCategoryGap={1} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#f5f5f5" vertical={false} />
        <XAxis dataKey="x" tick={axis} minTickGap={24} />
        <YAxis tick={axis} />
        <Tooltip {...tooltip} labelFormatter={(l: unknown) => `Sharpe ≈ ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="always" name="Always sell" fill={COLORS.always} fillOpacity={0.8} />
        <Bar dataKey="xgb" name="XGBoost-timed" fill={COLORS.xgb} fillOpacity={0.8} />
      </BarChart>
    </Frame>
  );
}

export function GapCurve({ data }: { data: Risk['stress']['curve'] }) {
  const rows = data.map((r) => ({ ...r, x: Math.round(r.realized * 100) }));
  return (
    <Frame height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 12, left: -6 }}>
        <CartesianGrid stroke="#f5f5f5" />
        <XAxis
          dataKey="x"
          tick={axis}
          label={{ value: 'Realized vol (%)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#737373' }}
        />
        <YAxis tick={axis} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
        <Tooltip {...tooltip} formatter={(v: unknown) => `${((v as number) * 100).toFixed(2)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
        <Line dataKey="simulated" name="Monte Carlo mean P&L" stroke={COLORS.xgb} strokeWidth={2} dot={{ r: 2 }} />
        <Line
          dataKey="bs_gap"
          name="Black-Scholes V(σ implied) − V(σ realized)"
          stroke={COLORS.realized}
          strokeDasharray="4 3"
          dot={false}
        />
      </LineChart>
    </Frame>
  );
}
