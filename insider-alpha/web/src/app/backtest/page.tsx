import type { Metadata } from "next";

import AreaChart from "@/components/charts/AreaChart";
import BarChart from "@/components/charts/BarChart";
import LineChart from "@/components/charts/LineChart";
import { CHART } from "@/components/charts/theme";
import PageFooter from "@/components/PageFooter";
import {
  Callout,
  Figure,
  MethodNote,
  PageHeader,
  PlaceholderBadge,
  Prose,
  Section,
  StatGrid,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/ui";
import type { PerformanceBlock } from "@/lib/artifacts";
import { loadArtifacts, primaryVariant } from "@/lib/data";
import { num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Backtest" };

const HEDGE_LABEL: Record<string, string> = {
  long_only: "Long only",
  quintile_spread: "Dollar-neutral quintile spread",
  beta_sector_matched_etf: "Beta/sector-matched ETF hedge",
};

export default function BacktestPage() {
  const { meta, backtest } = loadArtifacts();
  const v = primaryVariant(backtest);

  const equityData = v.equity_curve.map((p) => ({
    date: p.date.slice(0, 7),
    gross: p.gross,
    net: p.net,
    benchmark: p.benchmark,
  }));

  const ddData = v.drawdown.map((p) => ({ date: p.date.slice(0, 7), net: p.net }));

  const turnoverData = v.turnover.monthly.map((p) => ({
    month: p.month.slice(0, 7),
    turnover: p.turnover,
  }));

  const annualData = annualize(v.monthly_returns);

  return (
    <>
      <PageHeader
        step="05"
        title="What it looks like as a portfolio"
        standfirst="Monthly rebalance on the first trading day, long the top signal quintile weighted proportional to the score with a 3% per-name cap, hedged with a beta- and sector-matched basket of index ETFs. Three overlapping monthly tranches held three months each, Jegadeesh-Titman style, which cuts turnover and smooths entry timing."
      />

      {backtest.data_status === "placeholder" ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="Headline numbers" kicker={v.label}>
        <Callout tone="warn" title="Read the net column">
          <p>
            Gross of costs the primary variant returns {pct(v.stats.gross.ann_return)} a year at a
            Sharpe of {num(v.stats.gross.sharpe, 2)}. Net of a {num(v.cost_assumption_bps, 0)} bps
            round-trip assumption against {num(v.turnover.annualized, 1)}x annual turnover, that
            falls to {pct(v.stats.net.ann_return)} and {num(v.stats.net.sharpe, 2)}. Every chart
            below plots both, and the gap between them is the cost of implementation, not a
            rounding difference.
          </p>
        </Callout>

        <div className="mt-5">
          <StatGrid>
            <StatTile
              label="Net Sharpe"
              value={num(v.stats.net.sharpe, 2)}
              sub={
                v.stats.net.sharpe_std_error === null
                  ? `${num(v.stats.gross.sharpe, 2)} gross`
                  : `± ${num(v.stats.net.sharpe_std_error, 2)} SE · ${num(v.stats.gross.sharpe, 2)} gross`
              }
            />
            <StatTile label="Net annualized return" value={pct(v.stats.net.ann_return)} sub={`${pct(v.stats.gross.ann_return)} gross`} />
            <StatTile label="Annualized volatility" value={pct(v.stats.net.ann_vol)} sub={`vs. ${pct(v.stats.benchmark?.ann_vol ?? 0)} for the hedge basket`} />
            <StatTile label="Max drawdown" value={pct(v.stats.net.max_drawdown)} sub={`Calmar ${num(v.stats.net.calmar, 2)}`} tone="neg" />
          </StatGrid>
        </div>
      </Section>

      <Section title="Equity curve" kicker="Growth of 1">
        <Figure
          title="Cumulative growth, gross and net of costs"
          subtitle={`Against the ${backtest.benchmark_label}.`}
          caption={`${v.n_months} months, ${num(v.avg_n_positions, 0)} positions on average. The visible flattening in the back half of the sample is not a drawdown so much as an absence of return — see the subperiod split on the Robustness page.`}
        >
          <LineChart
            data={equityData}
            xKey="date"
            height={320}
            yTickFormat="multiple"
            series={[
              { key: "gross", label: "Gross of costs", color: CHART.accentSoft, dashed: true },
              { key: "net", label: "Net of costs", color: CHART.accent, width: 2 },
              { key: "benchmark", label: backtest.benchmark_label, color: CHART.neutral },
            ]}
          />
        </Figure>

        <div className="mt-4">
          <Figure
            title="Drawdown, net of costs"
            caption={`Peak-to-trough on the net series. Deepest drawdown ${pct(
              v.stats.net.max_drawdown,
            )}, against ${pct(v.stats.gross.max_drawdown)} gross — costs deepen the hole as well as flatten the curve.`}
          >
            <AreaChart
              data={ddData}
              xKey="date"
              height={200}
              yTickFormat="percent"
              series={[{ key: "net", label: "Drawdown", color: CHART.neg, fillOpacity: 0.12 }]}
            />
          </Figure>
        </div>
      </Section>

      <Section title="Return distribution" kicker="Where the return came from">
        <Figure
          title="Annual returns, net of costs"
          caption={`Monthly hit rate ${pct(v.stats.net.hit_rate_monthly, 0)}, best month ${pct(
            v.stats.net.best_month,
          )}, worst month ${pct(v.stats.net.worst_month)}. A hit rate near half with a positive mean is what a real, weak signal looks like; a hit rate near 70% at this Sharpe would suggest something is wrong with the accounting.`}
        >
          <BarChart
            data={annualData}
            xKey="year"
            height={240}
            yTickFormat="percent"
            series={[
              { key: "net", label: "Net return", color: CHART.accent },
              { key: "benchmark", label: "Hedge basket", color: CHART.neutral },
            ]}
          />
        </Figure>
      </Section>

      <Section title="Turnover" kicker="What it costs to run">
        <Figure
          title="Monthly one-sided turnover"
          caption={`Annualized turnover of ${num(
            v.turnover.annualized,
            2,
          )}x. Overlapping ${v.holding_period_months}-month tranches are what keep this manageable: the single-month variant turns over roughly three times as fast and, as the variant table below shows, loses most of its net return to doing so.`}
        >
          <AreaChart
            data={turnoverData}
            xKey="month"
            height={200}
            yTickFormat="percent"
            series={[{ key: "turnover", label: "Monthly turnover", color: CHART.accent }]}
          />
        </Figure>
      </Section>

      <Section title="Construction variants" kicker="Reported side by side">
        <Prose>
          <p>
            Four constructions are reported rather than one. The dollar-neutral quintile spread is
            the textbook version and the least honest one here: the short leg is thin given event
            sparsity, and no borrow cost or availability constraint is modelled. The ETF-hedged
            long book is the primary construction because it does not depend on single-name borrow.
            The filter-off row is the research comparison — the same machinery run without the
            routine/opportunistic split.
          </p>
        </Prose>

        <div className="mt-5">
          <Table
            dense
            head={
              <>
                <Th>Variant</Th>
                <Th align="right">Hold</Th>
                <Th align="right">Turnover</Th>
                <Th align="right">Gross SR</Th>
                <Th align="right">Net SR</Th>
                <Th align="right">Net return</Th>
                <Th align="right">Max DD</Th>
              </>
            }
            caption="Sharpe ratios use a 2.1% annual risk-free rate. Net figures assume a flat 30 bps round-trip cost; the next page varies that assumption from 0 to 100 bps."
          >
            {backtest.variants.map((variant) => (
              <tr
                key={variant.id}
                className={variant.id === backtest.primary_variant_id ? "bg-accent-soft/40" : undefined}
              >
                <Td>
                  <span className="block">{variant.label}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted">
                    {HEDGE_LABEL[variant.hedge]}
                    {variant.arm === "all_insiders" ? " · filter off" : ""}
                  </span>
                </Td>
                <Td align="right" mono>
                  {variant.holding_period_months}m
                </Td>
                <Td align="right" mono>
                  {num(variant.turnover.annualized, 1)}x
                </Td>
                <Td align="right" mono className="text-muted">
                  {num(variant.stats.gross.sharpe, 2)}
                </Td>
                <Td align="right" mono>
                  {num(variant.stats.net.sharpe, 2)}
                </Td>
                <Td align="right" mono>
                  {pct(variant.stats.net.ann_return)}
                </Td>
                <Td align="right" mono className="text-neg">
                  {pct(variant.stats.net.max_drawdown)}
                </Td>
              </tr>
            ))}
          </Table>
        </div>

        <div className="mt-6">
          <Table
            dense
            head={
              <>
                <Th>Statistic</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Net</Th>
                <Th align="right">{backtest.benchmark_label}</Th>
              </>
            }
            caption={`Full statistics for ${v.label}.`}
          >
            {statRows(v.stats.gross, v.stats.net, v.stats.benchmark)}
          </Table>
        </div>

        <MethodNote>
          Constraints applied at every rebalance: maximum 3% per name, maximum 25% per sector, full
          investment of the long book. Positions are entered at the close of the first trading day
          of the month using signal computed from filings received strictly before that date.
        </MethodNote>
      </Section>

      <PageFooter meta={meta} currentHref="/backtest/" />
    </>
  );
}

function statRows(
  gross: PerformanceBlock,
  net: PerformanceBlock,
  bench: PerformanceBlock | null,
) {
  const rows: Array<[string, (b: PerformanceBlock) => string]> = [
    ["Annualized return", (b) => pct(b.ann_return)],
    ["Annualized volatility", (b) => pct(b.ann_vol)],
    ["Sharpe ratio", (b) => num(b.sharpe, 2)],
    ["Sortino ratio", (b) => num(b.sortino, 2)],
    ["Maximum drawdown", (b) => pct(b.max_drawdown)],
    ["Calmar ratio", (b) => num(b.calmar, 2)],
    ["Monthly hit rate", (b) => pct(b.hit_rate_monthly, 0)],
    ["Best month", (b) => pct(b.best_month)],
    ["Worst month", (b) => pct(b.worst_month)],
  ];
  return rows.map(([label, fn]) => (
    <tr key={label}>
      <Td>{label}</Td>
      <Td align="right" mono className="text-muted">
        {fn(gross)}
      </Td>
      <Td align="right" mono>
        {fn(net)}
      </Td>
      <Td align="right" mono className="text-muted">
        {bench ? fn(bench) : "—"}
      </Td>
    </tr>
  ));
}

function annualize(monthly: Array<{ month: string; net: number; benchmark: number | null }>) {
  const byYear = new Map<string, { net: number; benchmark: number }>();
  for (const m of monthly) {
    const year = m.month.slice(0, 4);
    const prev = byYear.get(year) ?? { net: 1, benchmark: 1 };
    byYear.set(year, {
      net: prev.net * (1 + m.net),
      benchmark: prev.benchmark * (1 + (m.benchmark ?? 0)),
    });
  }
  return [...byYear.entries()].map(([year, v]) => ({
    year,
    net: v.net - 1,
    benchmark: v.benchmark - 1,
  }));
}
