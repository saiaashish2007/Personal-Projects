import type { Metadata } from "next";

import Heatmap from "@/components/charts/Heatmap";
import RandomizationChart from "@/components/charts/RandomizationChart";
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
import type { RobustnessFamily, RobustnessRow } from "@/lib/artifacts";
import { loadArtifacts } from "@/lib/data";
import { ci, num, pct, signedBps } from "@/lib/format";

export const metadata: Metadata = { title: "Robustness" };

const FAMILY_ORDER: RobustnessFamily[] = [
  "headline",
  "subperiod",
  "event_exclusion",
  "cap_tercile",
  "sector_exclusion",
  "signal_definition",
];

const FAMILY_LABEL: Record<RobustnessFamily, string> = {
  headline: "Headline comparison",
  subperiod: "Subperiod stability",
  event_exclusion: "Event exclusions",
  cap_tercile: "Capitalization terciles",
  sector_exclusion: "Sector exclusions",
  signal_definition: "Signal definition",
};

export default function RobustnessPage() {
  const { meta, robustness: r } = loadArtifacts();
  const baseline = r.grid.find((row) => row.id === r.baseline_id);
  const grouped = FAMILY_ORDER.map((family) => ({
    family,
    rows: r.grid.filter((row) => row.family === family),
  })).filter((g) => g.rows.length > 0);

  return (
    <>
      <PageHeader
        step="08"
        title="How fragile is it?"
        standfirst="A result that only exists in one specification is not a result. This page reports every cut in the pre-registered robustness battery, the parameter surface rather than its maximum, a randomization test that the alpha should fail if it is noise, bootstrap intervals wide enough to be uncomfortable, and the count of specifications run — because that count is the difference between a finding and a search."
      />

      {r.data_status === "placeholder" ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="Multiple testing, stated up front" kicker="Discipline">
        <Callout tone="warn" title={`${r.multiple_testing.n_specifications_tested} specifications tested`}>
          <p>{r.multiple_testing.haircut_note}</p>
        </Callout>
        <div className="mt-4">
          <StatGrid cols={3}>
            <StatTile label="Specifications run" value={String(r.multiple_testing.n_specifications_tested)} sub="parameter sweep plus robustness grid" />
            <StatTile
              label="Headline Sharpe"
              value={num(baseline?.sharpe ?? 0, 2)}
              sub={`95% CI ${ci(baseline?.sharpe_ci_low ?? null, baseline?.sharpe_ci_high ?? null)}`}
            />
            <StatTile
              label="Deflated Sharpe"
              value={r.multiple_testing.deflated_sharpe === null ? "—" : num(r.multiple_testing.deflated_sharpe, 2)}
              sub="after adjusting for the number of trials"
              tone="warn"
            />
          </StatGrid>
        </div>
      </Section>

      <Section title="The robustness grid" kicker="Every cut">
        <Table
          dense
          head={
            <>
              <Th>Cut</Th>
              <Th align="right">Months</Th>
              <Th align="right">Ann. return</Th>
              <Th align="right">Sharpe</Th>
              <Th align="right">Sharpe 95% CI</Th>
              <Th align="right">Alpha (bps)</Th>
              <Th align="right">t</Th>
              <Th align="right">vs. baseline</Th>
            </>
          }
          caption="All figures net of the explicit cost model. The baseline row is highlighted; the delta column measures each cut against it. Bootstrap confidence intervals are stationary-block, not asymptotic, because monthly returns on a sparse signal are neither independent nor normal."
        >
          {grouped.flatMap((group) => [
            <tr key={`h-${group.family}`}>
              <td
                colSpan={8}
                className="border-b border-rule-strong pb-1 pt-5 text-[11px] uppercase tracking-[0.12em] text-muted"
              >
                {FAMILY_LABEL[group.family]}
              </td>
            </tr>,
            ...group.rows.map((row) => <GridRow key={row.id} row={row} isBaseline={row.id === r.baseline_id} />),
          ])}
        </Table>

        <Prose>
          <p className="mt-6">
            Three patterns in that table matter more than any single number. The effect is roughly
            twice as strong in the first half of the sample as the second. It is monotone in
            capitalization, with nothing at all in large caps. And it survives the sector exclusions
            without much damage, which at least rules out the interpretation that the whole result
            is a post-drawdown energy or financials trade.
          </p>
        </Prose>
      </Section>

      <Section title="Parameter surface" kicker="Plateau or spike?">
        <Figure
          title={`${r.parameter_sweep.metric} across the two main free parameters`}
          subtitle={`${r.parameter_sweep.x_label} horizontally, ${r.parameter_sweep.y_label} vertically.`}
          caption={r.parameter_sweep.assessment}
        >
          <Heatmap sweep={r.parameter_sweep} />
        </Figure>
        <MethodNote>
          The sweep is presented as a surface rather than as its maximum on purpose. A broad plateau
          means the result does not depend on a lucky parameter choice; a lone bright cell in an
          otherwise dark grid is the visual signature of overfitting, and it is worth being able to
          tell the two apart at a glance.
        </MethodNote>
      </Section>

      <Section title="Signal randomization" kicker="Does the alpha collapse under the null?">
        <Prose>
          <p>
            The signal is shuffled within each date {num(r.randomization.n_draws, 0)} times,
            preserving the cross-sectional distribution and the number of positions while destroying
            any relationship with future returns, and the whole pipeline is re-run on each draw. If
            the machinery itself generates alpha — through a construction artifact, a survivorship
            quirk, or a subtle lookahead — the null distribution will not be centred on zero.
          </p>
        </Prose>

        <div className="mt-5">
          <Figure
            title="Null distribution of annualized alpha under shuffled signals"
            caption={`Null mean ${num(r.randomization.null_mean, 1)} bps with a standard deviation of ${num(
              r.randomization.null_std,
              1,
            )} bps. The observed value sits at the ${pct(
              r.randomization.percentile,
              1,
            )} percentile, p = ${num(r.randomization.p_value, 3)}. The null being centred on zero is the part that matters: it means the pipeline does not manufacture alpha out of nothing.`}
          >
            <RandomizationChart data={r.randomization.histogram} observed={r.randomization.observed} />
          </Figure>
        </div>
      </Section>

      <Section title="Bootstrap intervals" kicker="How wide is the uncertainty?">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {r.bootstrap.map((b) => {
            const crossesZero = b.ci_low <= 0 && b.ci_high >= 0;
            return (
              <Card key={b.statistic}>
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted">{b.statistic}</p>
                <p className="tnum mt-2 text-2xl text-ink">{num(b.point_estimate, b.point_estimate > 10 ? 0 : 3)}</p>
                <p className="tnum mt-2 text-[13px] text-ink-2">
                  {pct(b.ci_level, 0)} CI [{num(b.ci_low, b.point_estimate > 10 ? 0 : 3)},{" "}
                  {num(b.ci_high, b.point_estimate > 10 ? 0 : 3)}]
                </p>
                <p className={`mt-2 text-[12px] ${crossesZero ? "text-warn" : "text-pos"}`}>
                  {crossesZero ? "Interval contains zero" : "Interval excludes zero"}
                </p>
                <p className="mt-2 text-[11.5px] leading-snug text-muted">
                  {b.method}, {num(b.n_resamples, 0)} resamples
                </p>
              </Card>
            );
          })}
        </div>
        <Prose>
          <p className="mt-5">
            These intervals are the most honest single view of the result. A Sharpe point estimate
            of {num(baseline?.sharpe ?? 0, 2)} with a 95% interval running from roughly{" "}
            {num(r.bootstrap[0]?.ci_low ?? 0, 2)} to {num(r.bootstrap[0]?.ci_high ?? 0, 2)} is
            consistent with a modest real edge and also consistent with almost nothing. Twelve years
            of monthly data on a sparse signal simply does not resolve the difference, and no amount
            of chart polish changes that.
          </p>
        </Prose>
      </Section>

      <PageFooter meta={meta} currentHref="/robustness/" />
    </>
  );
}

function GridRow({ row, isBaseline }: { row: RobustnessRow; isBaseline: boolean }) {
  return (
    <tr className={isBaseline ? "bg-accent-soft/50" : undefined}>
      <Td>
        <span className="block">{row.label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{row.description}</span>
      </Td>
      <Td align="right" mono>
        {row.n_months}
      </Td>
      <Td align="right" mono>
        {pct(row.ann_return)}
      </Td>
      <Td align="right" mono>
        {num(row.sharpe, 2)}
      </Td>
      <Td align="right" mono className="text-muted">
        {ci(row.sharpe_ci_low, row.sharpe_ci_high)}
      </Td>
      <Td align="right" mono className={row.alpha_ann_bps < 0 ? "text-neg" : undefined}>
        {num(row.alpha_ann_bps, 0)}
      </Td>
      <Td align="right">
        <TStat t={row.alpha_t_stat} />
      </Td>
      <Td align="right" mono className={(row.delta_alpha_vs_baseline_bps ?? 0) < 0 ? "text-neg" : "text-pos"}>
        {row.delta_alpha_vs_baseline_bps === null ? "—" : signedBps(row.delta_alpha_vs_baseline_bps)}
      </Td>
    </tr>
  );
}
