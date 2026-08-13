import type { Metadata } from "next";

import AreaChart from "@/components/charts/AreaChart";
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
} from "@/components/ui";
import { loadArtifacts } from "@/lib/data";
import { int, num, pct, yearOf } from "@/lib/format";

export const metadata: Metadata = { title: "Signal Construction" };

export default function SignalPage() {
  const { meta, classifier } = loadArtifacts();
  const v = classifier.rule_10b5_1_validation;

  const propsData = classifier.proportions_over_time.map((p) => ({
    date: `${p.date.slice(2, 4)}Q${Math.floor(Number(p.date.slice(5, 7)) / 3) + 1}`,
    routine: p.routine,
    opportunistic: p.opportunistic,
    unclassified: p.unclassified,
  }));

  return (
    <>
      <PageHeader
        step="03"
        title="Separating the schedule from the view"
        standfirst="An insider who buys every February is telling you about their bonus cycle. An insider who has never bought before and buys today is telling you something else. The classifier is the mechanism that distinguishes them, and it is the one piece of Cohen, Malloy & Pomorski that has to be reproduced exactly for the replication to mean anything."
      />

      {classifier.data_status === "placeholder" ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="The classification rule" kicker="Definition">
        <Card>
          <pre className="tnum overflow-x-auto text-[12.5px] leading-relaxed text-ink-2">
{`routine(k, t) = True   if there exists a calendar month m such that insider k
                       transacted in month m in each of the 3 consecutive
                       years prior to t
              = False  otherwise                          -> opportunistic
              = None   if k has fewer than 3 years of filing history
                                                          -> unclassified`}
          </pre>
        </Card>
        <Prose>
          <p className="mt-4">{classifier.definition}</p>
          <p>
            Three properties matter. The classification is <strong>rolling</strong>, so an insider
            migrates between buckets as their behaviour changes. It is{" "}
            <strong>point-in-time</strong>, using only trades filed before <em>t</em>. And it has a{" "}
            <strong>third bucket</strong>: insiders without three years of history are reported
            separately rather than being quietly counted as opportunistic, which would inflate the
            treatment group with newly-appointed officers.
          </p>
        </Prose>
        <MethodNote>
          Form 4 history is pulled from {yearOf(meta.sample.burn_in_start)} — three years before the{" "}
          {yearOf(meta.sample.start)} sample start — so classifications are fully populated on day
          one and no insider is classified using a truncated window.
        </MethodNote>
      </Section>

      <Section title="Where insiders land" kicker="Distribution">
        <StatGrid cols={4}>
          <StatTile label="Opportunistic" value={pct(classifier.pooled_proportions.opportunistic, 1)} sub="the treatment group" />
          <StatTile label="Routine" value={pct(classifier.pooled_proportions.routine, 1)} sub="predictable annual schedule" />
          <StatTile label="Unclassified" value={pct(classifier.pooled_proportions.unclassified, 1)} sub="under three years of history" />
          <StatTile label="Insider-dates classified" value={int(classifier.pooled_proportions.n_insider_dates)} sub="pooled over the sample" />
        </StatGrid>

        <div className="mt-5">
          <Figure
            title="Bucket proportions over time"
            subtitle="Evaluated quarterly, point in time."
            caption="Stability matters here: a classifier whose proportions drift sharply is picking up filing-behaviour regime change rather than insider type. The unclassified share declines slowly as the panel accumulates history."
          >
            <AreaChart
              data={propsData}
              xKey="date"
              stacked
              height={260}
              series={[
                { key: "opportunistic", label: "Opportunistic", color: CHART.accent },
                { key: "routine", label: "Routine", color: CHART.neutral },
                { key: "unclassified", label: "Unclassified", color: "#dcd8d0" },
              ]}
            />
          </Figure>
        </div>

        <div className="mt-6">
          <Table
            head={
              <>
                <Th>Bucket</Th>
                <Th align="right">CMP (1986–2007)</Th>
                <Th align="right">This replication</Th>
                <Th align="right">Delta</Th>
              </>
            }
            caption="Milestone 3's exit criterion was that the replication's proportions land near CMP's. They are close on routine and lower on opportunistic, because CMP have no unclassified bucket — their denominator folds short-history insiders into one of the two groups."
          >
            {classifier.cmp_comparison.map((row) => (
              <tr key={row.bucket}>
                <Td className="capitalize">{row.bucket}</Td>
                <Td align="right" mono>
                  {row.cmp_reported_share === null ? "n/a" : pct(row.cmp_reported_share, 1)}
                </Td>
                <Td align="right" mono>
                  {pct(row.replication_share, 1)}
                </Td>
                <Td align="right" mono className={row.delta === null ? "text-muted" : undefined}>
                  {row.delta === null ? "—" : `${row.delta >= 0 ? "+" : "\u2212"}${pct(Math.abs(row.delta), 1)}`}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      </Section>

      {v ? (
        <Section title="Validating the classifier against the 10b5-1 checkbox" kicker="A natural experiment">
          <Prose>
            <p>
              Rule 10b5-1 pre-scheduled trading plans only got a dedicated checkbox on Form 4 after
              the 2022 amendments took effect in {yearOf(v.period_start)}. For the bulk of the
              sample the routine classifier is a behavioural <em>proxy</em> for scheduled trading
              with no ground truth. From {v.period_start} the checkbox provides a partial
              validation set: {int(v.n_filings)} filings where the actual answer is observable.
            </p>
          </Prose>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
            <Card>
              <p className="text-sm font-semibold text-ink">Confusion matrix</p>
              <table className="mt-3 w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.08em] text-muted">
                    <th className="py-1 text-left font-medium">Classifier</th>
                    <th className="py-1 text-right font-medium">Flagged</th>
                    <th className="py-1 text-right font-medium">Not flagged</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-t border-rule py-2">Routine</td>
                    <td className="tnum border-t border-rule py-2 text-right text-pos">
                      {int(v.confusion_matrix.routine_and_flagged)}
                    </td>
                    <td className="tnum border-t border-rule py-2 text-right">
                      {int(v.confusion_matrix.routine_not_flagged)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-t border-rule py-2">Opportunistic</td>
                    <td className="tnum border-t border-rule py-2 text-right text-neg">
                      {int(v.confusion_matrix.opportunistic_and_flagged)}
                    </td>
                    <td className="tnum border-t border-rule py-2 text-right text-pos">
                      {int(v.confusion_matrix.opportunistic_not_flagged)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                Rows are the behavioural classifier, columns are the filed 10b5-1 flag. The red cell
                is the contamination that matters: pre-scheduled trades that land in the
                opportunistic bucket.
              </p>
            </Card>

            <div className="space-y-3">
              <StatGrid cols={2}>
                <StatTile label="Accuracy" value={pct(v.metrics.accuracy, 1)} sub={`against a ${pct(v.metrics.flag_base_rate, 1)} base rate`} />
                <StatTile label="Precision" value={pct(v.metrics.precision, 1)} sub="of trades called routine, share actually flagged" />
                <StatTile label="Recall" value={pct(v.metrics.recall, 1)} sub="of flagged trades, share called routine" />
                <StatTile label="F1" value={num(v.metrics.f1, 2)} />
              </StatGrid>
              <Callout tone="warn" title="What this means for the pre-2023 sample">
                <p>{v.interpretation}</p>
              </Callout>
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="From trade to firm-level score" kicker="Signal math">
        <Prose>
          <p>
            Each qualifying purchase <em>j</em> at firm <em>i</em> is scored on three dimensions,
            then aggregated to the firm over a trailing window of filing dates.
          </p>
        </Prose>

        <Card className="mt-4">
          <pre className="tnum overflow-x-auto text-[12.5px] leading-relaxed text-ink-2">
{`value_j      = shares_j x price_j
size_j       = ln(1 + value_j / ADV20_i)        # normalize by tradability
conviction_j = shares_j / sharesOwnedAfter_j    # fraction of position that is new
role_j       = w_role(title)

raw_i,t      = SUM_j  role_j . 1[opportunistic_j] . size_j . (1 + conviction_j)
                       over filings with filing_date in (t - W, t],  W = 90 days

S_i,t        = raw_i,t x (1 + lambda . ln(n_i,t))     # n = distinct insiders buying`}
          </pre>
        </Card>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-semibold text-ink">Why normalize by dollar volume</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
              Dividing trade value by 20-day average dollar volume rather than market cap keeps the
              quantity on a usable scale across the cap spectrum. A $250k purchase is a meaningful
              signal in a small cap and rounding error against a mega-cap&apos;s market value, but
              value-over-market-cap is so close to zero for large names that the distribution
              collapses.
            </p>
          </Card>
          <Card>
            <p className="text-sm font-semibold text-ink">Role weights</p>
            <table className="mt-2 w-full text-[13.5px]">
              <tbody>
                {[
                  ["CEO / CFO / Chairman / President", "1.00"],
                  ["Other named officer", "0.60"],
                  ["Director", "0.40"],
                  ["10% owner only", "0.25"],
                ].map(([role, weight]) => (
                  <tr key={role}>
                    <td className="border-b border-rule py-1.5 text-ink-2">{role}</td>
                    <td className="tnum border-b border-rule py-1.5 text-right">{weight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Treated as tested parameters, not constants. The robustness page reports how much the
              result moves when they change.
            </p>
          </Card>
        </div>

        <Prose>
          <p className="mt-5">
            Firms with no qualifying purchases in the window receive <code className="tnum">S = 0</code>,
            not <code className="tnum">NaN</code>. The distinction matters: absence of insider
            buying is informative-neutral, not missing data, and treating it as missing would drop
            three quarters of the universe from every cross-section.
          </p>
          <p>
            Cross-sectionally, at each rebalance date, the score is winsorized at the 1st and 99th
            percentiles, z-scored within date, then sector-neutralized by subtracting the SIC
            division mean and re-standardizing. Sector neutralization is not cosmetic here: insider
            buying clusters heavily in financials and energy after drawdowns, and without it the
            signal becomes an unintentional sector-timing bet.
          </p>
        </Prose>
      </Section>

      {classifier.migration.length > 0 ? (
        <Section title="Bucket migration" kicker="Is the label sticky?">
          <Table
            dense
            head={
              <>
                <Th>From</Th>
                <Th>To</Th>
                <Th align="right">Insider-years</Th>
                <Th align="right">Share of transitions</Th>
              </>
            }
            caption="An insider's label is not permanent. Migration out of the unclassified bucket is mechanical — it happens as history accumulates — but routine-to-opportunistic movement is behavioural and is what the rolling window is designed to capture."
          >
            {classifier.migration.map((m) => (
              <tr key={`${m.from}-${m.to}`}>
                <Td className="capitalize">{m.from}</Td>
                <Td className="capitalize">{m.to}</Td>
                <Td align="right" mono>
                  {int(m.count)}
                </Td>
                <Td align="right" mono>
                  {pct(m.share, 1)}
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      ) : null}

      <PageFooter meta={meta} currentHref="/signal/" />
    </>
  );
}
