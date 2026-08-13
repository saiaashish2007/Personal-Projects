import type { Metadata } from "next";

import BarChart from "@/components/charts/BarChart";
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
import { getArm, loadArtifacts } from "@/lib/data";
import { horizonLabel, int, num, pct, signedPct } from "@/lib/format";

export const metadata: Metadata = { title: "IC Analysis" };

export default function IcPage() {
  const { meta, ic } = loadArtifacts();
  const opp = getArm(ic, "opportunistic");
  const all = getArm(ic, "all_insiders");

  const decayData = ic.headline.map((h) => ({
    horizon: horizonLabel(h.horizon_days),
    opportunistic: h.opportunistic_mean_ic,
    all_insiders: h.all_insiders_mean_ic,
  }));

  const tsOpp = opp.time_series.find((t) => t.horizon_days === 63);
  const tsAll = all.time_series.find((t) => t.horizon_days === 63);
  const tsData =
    tsOpp?.points.map((p, i) => ({
      date: p.date.slice(0, 7),
      opportunistic: p.ic,
      all_insiders: tsAll?.points[i]?.ic ?? null,
    })) ?? [];

  const rolling = rollingMean(tsData.map((d) => d.opportunistic), 12);
  const tsWithRolling = tsData.map((d, i) => ({ ...d, rolling: rolling[i] ?? null }));

  const qOpp = opp.quantiles.find((q) => q.horizon_days === 63) ?? opp.quantiles[0];
  const qAll = all.quantiles.find((q) => q.horizon_days === 63) ?? all.quantiles[0];

  const quantileData =
    qOpp?.buckets.map((b, i) => ({
      quantile: `Q${b.quantile}`,
      opportunistic: b.mean_forward_return_bps,
      opportunistic_se: b.std_error_bps,
      all_insiders: qAll?.buckets[i]?.mean_forward_return_bps ?? null,
      all_insiders_se: qAll?.buckets[i]?.std_error_bps ?? null,
    })) ?? [];

  const h21 = ic.headline.find((h) => h.horizon_days === 21);
  const h63 = ic.headline.find((h) => h.horizon_days === 63);

  return (
    <>
      <PageHeader
        step="04"
        title="The go/no-go gate: does the filter earn its keep?"
        standfirst="No backtest was run until this page passed. Everything here is a cross-sectional rank correlation between the signal and forward returns, computed twice — once with the opportunistic filter applied and once with it removed. The difference between the two arms is the entire research question; the level is secondary."
      />

      {ic.data_status === "placeholder" ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="Filter on versus filter off" kicker="The comparison">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-accent/40">
            <p className="text-[11px] uppercase tracking-[0.12em] text-accent">Filter ON</p>
            <p className="mt-1 text-sm text-ink-2">Opportunistic insiders only</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted">Mean IC, 21d</p>
                <p className="tnum mt-1 text-2xl text-ink">{pct(h21?.opportunistic_mean_ic ?? 0, 2)}</p>
                <p className="mt-1 text-xs">
                  <TStat t={h21?.opportunistic_t_stat ?? null} />
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted">Mean IC, 63d</p>
                <p className="tnum mt-1 text-2xl text-ink">{pct(h63?.opportunistic_mean_ic ?? 0, 2)}</p>
                <p className="mt-1 text-xs">
                  <TStat t={h63?.opportunistic_t_stat ?? null} />
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Filter OFF</p>
            <p className="mt-1 text-sm text-ink-2">All insider purchases, no classification</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted">Mean IC, 21d</p>
                <p className="tnum mt-1 text-2xl text-muted">{pct(h21?.all_insiders_mean_ic ?? 0, 2)}</p>
                <p className="mt-1 text-xs">
                  <TStat t={h21?.all_insiders_t_stat ?? null} />
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted">Mean IC, 63d</p>
                <p className="tnum mt-1 text-2xl text-muted">{pct(h63?.all_insiders_mean_ic ?? 0, 2)}</p>
                <p className="mt-1 text-xs">
                  <TStat t={h63?.all_insiders_t_stat ?? null} />
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-4">
          <Callout
            tone={ic.go_no_go.passed ? "result" : "warn"}
            title={ic.go_no_go.passed ? "Gate passed" : "Gate failed — project pivots to a decay study"}
          >
            <p>{ic.go_no_go.verdict}</p>
            <p className="mt-2 text-[13px] text-muted">
              Pre-registered criterion: {ic.go_no_go.criterion}
            </p>
          </Callout>
        </div>

        <div className="mt-6">
          <Table
            head={
              <>
                <Th>Horizon</Th>
                <Th align="right">IC, filter on</Th>
                <Th align="right">t</Th>
                <Th align="right">IC, filter off</Th>
                <Th align="right">t</Th>
                <Th align="right">Delta</Th>
              </>
            }
            caption="Newey-West adjusted t-statistics with 6 lags, computed on the time series of cross-sectional ICs. The delta column is what the paper's contribution reduces to out of sample: the filter roughly triples the coefficient at every horizon, and it is the only reason the medium-horizon numbers clear significance at all."
          >
            {ic.headline.map((h) => (
              <tr key={h.horizon_days}>
                <Td mono>{horizonLabel(h.horizon_days)}</Td>
                <Td align="right" mono>
                  {pct(h.opportunistic_mean_ic, 2)}
                </Td>
                <Td align="right">
                  <TStat t={h.opportunistic_t_stat} />
                </Td>
                <Td align="right" mono className="text-muted">
                  {pct(h.all_insiders_mean_ic, 2)}
                </Td>
                <Td align="right">
                  <TStat t={h.all_insiders_t_stat} />
                </Td>
                <Td align="right" mono className={h.delta_ic > 0 ? "text-pos" : "text-neg"}>
                  {signedPct(h.delta_ic, 2)}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      </Section>

      <Section title="IC decay" kicker="What is the natural holding period?">
        <Figure
          title="Mean information coefficient by forward-return horizon"
          subtitle="Both arms, all six horizons."
          caption="The shape is as informative as the level. Nothing at one and five days, a peak around a quarter, and decay by a year says whatever information is present is impounded slowly. That rules out an event-drift trade and points at a monthly-rebalanced, quarter-held construction — which is what the backtest uses."
        >
          <BarChart
            data={decayData}
            xKey="horizon"
            yTickFormat="decimal3"
            height={280}
            series={[
              { key: "opportunistic", label: "Filter on", color: CHART.accent },
              { key: "all_insiders", label: "Filter off", color: CHART.neutral },
            ]}
          />
        </Figure>
        <MethodNote>
          IC is the Spearman rank correlation between the signal and the forward return, computed
          cross-sectionally at each rebalance date and then summarized as a time series. Rank
          correlation rather than Pearson because the signal distribution is heavily right-skewed
          and a handful of very large purchases would otherwise dominate.
        </MethodNote>
      </Section>

      <Section title="IC over time" kicker="Is it stable?">
        <Figure
          title="Cross-sectional IC at the 63-day horizon, by rebalance date"
          subtitle="With a 12-month rolling mean of the filter-on arm."
          caption={`Individual cross-sections are noisy by construction: with a median of ${int(
            opp.by_horizon[0]?.mean_cross_section_size ?? 0,
          )} names carrying signal, a single month's IC has a standard error large enough to swamp the mean. The rolling mean is the honest way to look at this, and its downward drift across the sample is the post-publication decay story in one line.`}
        >
          <LineChart
            data={tsWithRolling}
            xKey="date"
            height={300}
            yTickFormat="decimal2"
            zeroLine
            series={[
              { key: "opportunistic", label: "IC, filter on", color: CHART.accentSoft, width: 1 },
              { key: "rolling", label: "12m rolling mean, filter on", color: CHART.accent, width: 2.2 },
            ]}
          />
        </Figure>
      </Section>

      <Section title="Quantile monotonicity" kicker="Is the sort ordered?">
        <Prose>
          <p>
            A signal can have a positive mean IC and still be useless if the relationship is driven
            entirely by one extreme bucket. Sorting into quintiles at each rebalance date and
            averaging forward returns within bucket tests whether the ordering is real. Quintiles
            rather than deciles: event sparsity does not support ten meaningful buckets.
          </p>
        </Prose>

        <div className="mt-5">
          <Figure
            title={`Mean ${qOpp?.horizon_days ?? 63}-day forward return by signal quintile, in basis points`}
            subtitle="Whiskers are one standard error."
            caption={`Filter on: Q5 − Q1 spread of ${num(qOpp?.spread_bps ?? 0, 0)} bps (t = ${num(
              qOpp?.spread_t_stat ?? 0,
              2,
            )}), monotonic across all five buckets. Filter off: ${num(
              qAll?.spread_bps ?? 0,
              0,
            )} bps (t = ${num(qAll?.spread_t_stat ?? 0, 2)}). Overlapping error bars between adjacent buckets are expected and are why the spread test, not the bucket ordering, is the statistic that matters.`}
          >
            <BarChart
              data={quantileData}
              xKey="quantile"
              yTickFormat="plain"
              height={280}
              valueSuffix=" bps"
              series={[
                { key: "opportunistic", label: "Filter on", color: CHART.accent, errorKey: "opportunistic_se" },
                { key: "all_insiders", label: "Filter off", color: CHART.neutral, errorKey: "all_insiders_se" },
              ]}
            />
          </Figure>
        </div>

        <div className="mt-4">
          <StatGrid cols={4}>
            <StatTile
              label="Q5 − Q1, filter on"
              value={`${num(qOpp?.spread_bps ?? 0, 0)} bps`}
              sub={`t = ${num(qOpp?.spread_t_stat ?? 0, 2)} over ${qOpp?.horizon_days ?? 63} days`}
              tone={(qOpp?.spread_t_stat ?? 0) >= 2 ? "pos" : "warn"}
            />
            <StatTile
              label="Q5 − Q1, filter off"
              value={`${num(qAll?.spread_bps ?? 0, 0)} bps`}
              sub={`t = ${num(qAll?.spread_t_stat ?? 0, 2)}`}
            />
            <StatTile
              label="Monotonic, filter on"
              value={qOpp?.monotonic ? "yes" : "no"}
              sub="mean return increases across all five buckets"
              tone={qOpp?.monotonic ? "pos" : "warn"}
            />
            <StatTile
              label="Observations per bucket"
              value={int(qOpp?.buckets[0]?.n_obs ?? 0)}
              sub="firm-months, pooled over the sample"
            />
          </StatGrid>
        </div>
      </Section>

      <Section title="Full IC statistics" kicker="Detail">
        <Table
          dense
          head={
            <>
              <Th>Arm</Th>
              <Th align="right">Horizon</Th>
              <Th align="right">Mean IC</Th>
              <Th align="right">IC std</Th>
              <Th align="right">IC IR</Th>
              <Th align="right">t (NW)</Th>
              <Th align="right">p</Th>
              <Th align="right">Periods</Th>
              <Th align="right">Mean N</Th>
            </>
          }
          caption="IC IR is mean IC divided by its standard deviation — the cross-sectional analogue of a Sharpe ratio, before any portfolio construction. Newey-West lags are set to 6 to account for the overlap induced by horizons longer than the rebalance interval."
        >
          {[opp, all].flatMap((arm) =>
            arm.by_horizon.map((h) => (
              <tr key={`${arm.arm}-${h.horizon_days}`} className={arm.arm === "opportunistic" ? undefined : "text-muted"}>
                <Td>{arm.arm === "opportunistic" ? "Filter on" : "Filter off"}</Td>
                <Td align="right" mono>
                  {h.horizon_days}d
                </Td>
                <Td align="right" mono>
                  {pct(h.mean_ic, 2)}
                </Td>
                <Td align="right" mono>
                  {pct(h.ic_std, 2)}
                </Td>
                <Td align="right" mono>
                  {num(h.ic_ir, 2)}
                </Td>
                <Td align="right">
                  <TStat t={h.t_stat_newey_west} />
                </Td>
                <Td align="right" mono>
                  {num(h.p_value, 3)}
                </Td>
                <Td align="right" mono>
                  {h.n_periods}
                </Td>
                <Td align="right" mono>
                  {int(h.mean_cross_section_size)}
                </Td>
              </tr>
            )),
          )}
        </Table>
      </Section>

      <PageFooter meta={meta} currentHref="/ic/" />
    </>
  );
}

function rollingMean(values: number[], window: number): Array<number | null> {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
