import type { Metadata } from "next";

import LineChart from "@/components/charts/LineChart";
import { CHART } from "@/components/charts/theme";
import PageFooter from "@/components/PageFooter";
import {
  Callout,
  Card,
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
  TStat,
} from "@/components/ui";
import { getVariant, loadArtifacts } from "@/lib/data";
import { num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Cost Sensitivity" };

export default function CostsPage() {
  const { meta, costs, backtest } = loadArtifacts();
  const variant = getVariant(backtest, costs.variant_id);

  const sweepData = costs.sweep.map((p) => ({
    cost: p.round_trip_bps,
    net_sharpe: p.net_sharpe,
    alpha: p.net_alpha_ann_bps,
    t: p.alpha_t_stat,
  }));

  const modelled = costs.explicit_model.estimated_round_trip_bps;
  const atModel = nearest(costs.sweep, modelled);
  const breakEven = costs.break_even.alpha_zero_bps;
  const margin = breakEven === null ? null : breakEven / modelled;
  const firstInsignificant = costs.sweep.find((p) => Math.abs(p.alpha_t_stat) < 2);

  return (
    <>
      <PageHeader
        step="06"
        title="At what cost does this stop working?"
        standfirst="A single cost assumption is easy to game, so costs are handled in two layers: an explicit model calibrated to spread and impact, and a sensitivity sweep that varies a flat round-trip cost from zero to 100 basis points. The number that matters is the break-even — the cost at which alpha reaches zero."
      />

      {costs.data_status === "placeholder" ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="Break-even" kicker="The headline">
        <StatGrid>
          <StatTile
            label="Break-even cost, alpha"
            value={breakEven === null ? "—" : `${num(breakEven, 0)} bps`}
            sub="round-trip cost at which annualized alpha reaches zero"
          />
          <StatTile
            label="Explicit model estimate"
            value={`${num(modelled, 0)} bps`}
            sub="half-spread plus square-root impact"
          />
          <StatTile
            label="Margin"
            value={margin === null ? "—" : `${num(margin, 1)}x`}
            sub="break-even over modelled cost"
            tone={margin !== null && margin >= 2 ? "pos" : "warn"}
          />
          <StatTile
            label="Annualized turnover"
            value={`${num(costs.turnover.annualized, 1)}x`}
            sub={`each 1 bp of round-trip cost costs ${num(costs.turnover.annualized, 1)} bps a year`}
          />
        </StatGrid>

        <div className="mt-5">
          <Callout tone="warn" title="What the break-even does and does not tell you">
            <p>{costs.break_even.interpretation}</p>
          </Callout>
        </div>
      </Section>

      <Section title="The sensitivity sweep" kicker="Net Sharpe and alpha vs. cost">
        <Figure
          title="Net Sharpe ratio against flat round-trip cost"
          subtitle={`Primary variant: ${variant.label}.`}
          caption={`The slope is set by turnover, not by the signal: at ${num(
            costs.turnover.annualized,
            1,
          )}x annual turnover, every basis point of round-trip cost removes about ${num(
            costs.turnover.annualized,
            1,
          )} bps of annual return. A strategy that survives 50 bps is real; one that dies at 8 bps is a spread illusion. This one sits in between.`}
        >
          <LineChart
            data={sweepData}
            xKey="cost"
            height={280}
            yTickFormat="decimal2"
            zeroLine
            xTickEvery={1}
            series={[{ key: "net_sharpe", label: "Net Sharpe", color: CHART.accent, width: 2 }]}
          />
        </Figure>

        <div className="mt-4">
          <Figure
            title="Net annualized alpha against flat round-trip cost"
            subtitle="FF5 + momentum alpha, in basis points per year."
            caption={
              firstInsignificant
                ? `Alpha crosses zero at roughly ${
                    breakEven === null ? "—" : num(breakEven, 0)
                  } bps, but it stops being statistically distinguishable from zero long before that: the t-statistic falls below 2 at ${num(
                    firstInsignificant.round_trip_bps,
                    0,
                  )} bps. Break-even is a statement about the point estimate; significance is a statement about whether the point estimate should be believed.`
                : "Alpha remains statistically significant across the full sweep."
            }
          >
            <LineChart
              data={sweepData}
              xKey="cost"
              height={280}
              yTickFormat="bps"
              zeroLine
              xTickEvery={1}
              valueSuffix=" bps"
              series={[{ key: "alpha", label: "Net alpha (bps/yr)", color: CHART.accent, width: 2 }]}
            />
          </Figure>
        </div>

        <div className="mt-6">
          <Table
            dense
            head={
              <>
                <Th align="right">Round-trip cost</Th>
                <Th align="right">Net Sharpe</Th>
                <Th align="right">Net return</Th>
                <Th align="right">Net alpha</Th>
                <Th align="right">Alpha t-stat</Th>
              </>
            }
            caption="Every tenth basis point shown. The row nearest the explicit model estimate is highlighted."
          >
            {costs.sweep
              .filter((p) => p.round_trip_bps % 10 === 0)
              .map((p) => (
                <tr key={p.round_trip_bps} className={p === atModel ? "bg-accent-soft/50" : undefined}>
                  <Td align="right" mono>
                    {num(p.round_trip_bps, 0)} bps
                  </Td>
                  <Td align="right" mono>
                    {num(p.net_sharpe, 2)}
                  </Td>
                  <Td align="right" mono>
                    {pct(p.net_ann_return)}
                  </Td>
                  <Td align="right" mono className={p.net_alpha_ann_bps < 0 ? "text-neg" : undefined}>
                    {num(p.net_alpha_ann_bps, 0)}
                  </Td>
                  <Td align="right">
                    <TStat t={p.alpha_t_stat} />
                  </Td>
                </tr>
              ))}
          </Table>
        </div>
      </Section>

      <Section title="The explicit model" kicker="Where 29 bps comes from">
        <Prose>
          <p>{costs.explicit_model.description}</p>
        </Prose>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-semibold text-ink">Half-spread by capitalization tercile</p>
            <table className="mt-3 w-full text-[13.5px]">
              <tbody>
                {costs.explicit_model.half_spreads.map((h) => (
                  <tr key={h.cap_tercile}>
                    <td className="border-b border-rule py-1.5 capitalize text-ink-2">
                      {h.cap_tercile} cap
                    </td>
                    <td className="tnum border-b border-rule py-1.5 text-right">
                      {num(h.half_spread_bps, 0)} bps
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              These are conservative for liquid names and optimistic for the smallest tercile, which
              is precisely where the Robustness page locates most of the measured effect.
            </p>
          </Card>
          <Card>
            <p className="text-sm font-semibold text-ink">Market impact</p>
            <pre className="tnum mt-3 overflow-x-auto text-[12.5px] leading-relaxed text-ink-2">
{`impact_bps = k * sqrt(participation)
k            = ${num(costs.explicit_model.impact_coefficient_k, 2)}
participation cap = ${pct(costs.explicit_model.participation_cap, 0)} of ADV20`}
            </pre>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              Square-root impact is the standard functional form and the participation cap is what
              keeps the model from quietly assuming infinite liquidity. Trades that would exceed the
              cap are spread across days, which delays entry rather than paying the impact.
            </p>
          </Card>
        </div>

        <MethodNote>{costs.turnover.note}</MethodNote>
      </Section>

      <Section title="What is not in the cost model" kicker="Honest gaps">
        <Prose>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Borrow costs and short availability.</strong> The dollar-neutral variant
              shorts small names with no fee and no availability constraint. This is why the
              ETF-hedged construction is the primary one.
            </li>
            <li>
              <strong>Financing on the hedge.</strong> ETF hedge financing is assumed at the
              risk-free rate.
            </li>
            <li>
              <strong>Capacity.</strong> The participation cap bounds impact per trade but nothing
              here models what happens to the signal itself if meaningful capital chases it.
            </li>
            <li>
              <strong>Taxes.</strong> Not modelled, and with {num(costs.turnover.annualized, 1)}x
              annual turnover a taxable account would give up a large fraction of the gross return.
            </li>
          </ul>
        </Prose>
      </Section>

      <PageFooter meta={meta} currentHref="/costs/" />
    </>
  );
}

function nearest<T extends { round_trip_bps: number }>(rows: T[], target: number): T | undefined {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const row of rows) {
    const d = Math.abs(row.round_trip_bps - target);
    if (d < bestDist) {
      bestDist = d;
      best = row;
    }
  }
  return best;
}
