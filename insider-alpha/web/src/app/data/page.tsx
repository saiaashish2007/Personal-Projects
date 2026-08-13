import type { Metadata } from "next";

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
import { loadArtifacts } from "@/lib/data";
import { int, monthLabel, num, pct, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Data & Parsing" };

export default function DataPage() {
  const { meta, data_profile: dp } = loadArtifacts();
  const included = dp.transaction_codes.filter((c) => c.included_in_signal);
  const compensation = dp.transaction_codes.filter((c) => ["A", "M", "F"].includes(c.code));
  const compShare = compensation.reduce((a, c) => a + c.share, 0);

  const densityData = dp.event_density.map((d) => ({
    month: monthLabel(d.month),
    purchases: d.qualifying_purchases,
    issuers: d.distinct_issuers,
  }));

  const codeData = [...dp.transaction_codes]
    .sort((a, b) => b.share - a.share)
    .slice(0, 8)
    .map((c) => ({ code: c.code, share: c.share, included: c.included_in_signal }));

  const lagData = dp.filing_lag.histogram.map((b) => ({
    lag: b.lag_days === 30 ? "30+" : String(b.lag_days),
    share: b.share,
  }));

  return (
    <>
      <PageHeader
        step="02"
        title="Four and a half million filings, and why 89% of them are noise"
        standfirst="The transaction table is built from the SEC's DERA Insider Transactions Data Sets — quarterly bulk archives of the XML contents of every Form 3/4/5. Getting the ingestion and the transaction-code filter right is most of the work, and it is where implementations of this signal usually go wrong."
      />

      {dp.data_status === "placeholder" ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="The table" kicker="Scale">
        <StatGrid>
          <StatTile label="Transactions parsed" value={int(dp.totals.transactions)} sub={`${dp.coverage.start} to ${dp.coverage.end}`} />
          <StatTile
            label="Open-market purchases"
            value={int(dp.totals.open_market_purchases)}
            sub={`${pct(dp.totals.open_market_purchases / dp.totals.transactions, 1)} of all transactions`}
          />
          <StatTile label="Distinct insiders" value={int(dp.totals.distinct_insiders)} sub={`across ${int(dp.totals.distinct_issuers)} issuers`} />
          <StatTile
            label="Superseded rows removed"
            value={int(dp.totals.superseded_rows_removed)}
            sub="Form 4/A amendments, deduplicated only within groups that contain one"
          />
        </StatGrid>

        <Prose>
          <p className="mt-6">
            The obvious ingestion path — walk EDGAR&apos;s <code className="tnum">master.idx</code>,
            then fetch each Form 4 XML — is infeasible at this scale. Roughly 4.5 million
            transactions against a hard ceiling of 10 requests per second is multiple days of
            continuous downloading from an endpoint whose operator actively blocks bulk scrapers.
            DERA publishes the same content as sixty quarterly tab-delimited archives of 8–16 MB
            each, which download in about three minutes and parse in about eighty seconds.
          </p>
        </Prose>

        <MethodNote>
          Ingestion runs locally, never in CI: the SEC blocks cloud-provider IP ranges for bulk
          access and requires a <code className="tnum">User-Agent</code> declaring a name and
          contact address. Archives are cached on disk, so re-runs are incremental.
        </MethodNote>
      </Section>

      <Section title="The transaction-code filter" kicker="Where signals die">
        <Callout tone="warn" title="This is the single most consequential line of code in the project">
          <p>
            Grants (<code className="tnum">A</code>), option exercises (
            <code className="tnum">M</code>) and shares withheld for tax (
            <code className="tnum">F</code>) account for {pct(compShare, 0)} of all transactions.
            They are payroll mechanics, not views. Only {pct(included[0]?.share ?? 0, 1)} of rows
            are open-market purchases. A signal built on undifferentiated &ldquo;insider
            buying&rdquo; is mostly measuring compensation.
          </p>
        </Callout>

        <div className="mt-5">
          <Figure
            title="Transaction codes by share of all reported transactions"
            subtitle="Blue is the only code that enters the signal."
            caption="Sales (code S) are tested separately as part of the buys-versus-net robustness cut, but do not enter the core signal: the Jeng-Metrick-Zeckhauser asymmetry says purchases inform and sales mostly do not."
          >
            <BarChart
              data={codeData.map((c) => ({
                code: c.code,
                included: c.included ? c.share : null,
                excluded: c.included ? null : c.share,
              }))}
              xKey="code"
              yTickFormat="percent"
              height={260}
              series={[
                { key: "included", label: "In signal", color: CHART.accent },
                { key: "excluded", label: "Excluded", color: CHART.neutral },
              ]}
            />
          </Figure>
        </div>

        <div className="mt-6">
          <Table
            dense
            head={
              <>
                <Th>Code</Th>
                <Th>Meaning</Th>
                <Th align="right">Count</Th>
                <Th align="right">Share</Th>
                <Th align="right">In signal</Th>
              </>
            }
          >
            {[...dp.transaction_codes]
              .sort((a, b) => b.share - a.share)
              .map((c) => (
                <tr key={c.code} className={c.included_in_signal ? "bg-accent-soft/40" : undefined}>
                  <Td mono>{c.code}</Td>
                  <Td>{c.label}</Td>
                  <Td align="right" mono>
                    {int(c.count)}
                  </Td>
                  <Td align="right" mono>
                    {pct(c.share, 2)}
                  </Td>
                  <Td align="right">{c.included_in_signal ? "yes" : "—"}</Td>
                </tr>
              ))}
          </Table>
        </div>
      </Section>

      <Section title="Event density" kicker="Is there enough to trade?">
        <Prose>
          <p>
            Sparsity was the main design risk going in. A median of{" "}
            {int(median(dp.event_density.map((d) => d.qualifying_purchases)))} qualifying purchases
            a month across a median of{" "}
            {int(median(dp.event_density.map((d) => d.distinct_issuers)))} issuers, against a
            1,500-name universe, is roughly a quarter of the universe carrying signal in any given
            month. That is thin for deciles and adequate for quintiles, which is why the validation
            uses five buckets rather than ten.
          </p>
        </Prose>

        <div className="mt-5">
          <Figure
            title="Qualifying purchases and issuers with signal, by month"
            subtitle="Direct open-market purchases by officers and directors."
            caption="The March–April 2020 spike is insiders buying their own stock into the COVID drawdown. It is the single largest cluster in the sample, which is why the robustness battery reports a cut that excludes those two quarters."
          >
            <LineChart
              data={densityData}
              xKey="month"
              height={280}
              yTickFormat="plain"
              series={[
                { key: "purchases", label: "Qualifying purchases", color: CHART.accent },
                { key: "issuers", label: "Distinct issuers", color: CHART.neutral },
              ]}
            />
          </Figure>
        </div>

        <div className="mt-4">
          <StatGrid cols={4}>
            <StatTile label="Median trade value" value={usd(dp.trade_value_usd.median)} sub={`mean ${usd(dp.trade_value_usd.mean)}, heavily right-skewed`} />
            <StatTile label="Indirect ownership" value={pct(dp.ownership.indirect_share, 1)} sub="trust, spouse or LLC — flagged and tested separately" />
            <StatTile label="Joint filings" value={pct(dp.joint_filings.share, 1)} sub="attributed to the primary owner, owner count retained" />
            <StatTile label="Dropped, no price" value={int(dp.totals.dropped_missing_price)} sub="purchases filed without a price are dropped, never imputed" />
          </StatGrid>
        </div>
      </Section>

      <Section title="Filing lag" kicker="Lookahead control">
        <Prose>
          <p>
            Insiders must file within two business days of transacting.{" "}
            {pct(dp.filing_lag.share_within_statutory_window, 1)} do, with a median lag of{" "}
            {num(dp.filing_lag.median_days, 0)} days and a 95th percentile of{" "}
            {num(dp.filing_lag.p95_days, 0)} days. The tail matters more than the median: a late
            filing carries information the market could not have had on the transaction date.
          </p>
          <p>
            Every signal on this site is therefore timestamped by <strong>filing date</strong>,
            never transaction date. That choice costs some measured effect — the insider&apos;s
            entry price is unavailable by construction — and it is the difference between a
            backtest and a lookahead artifact.
          </p>
        </Prose>

        <div className="mt-5">
          <Figure
            title="Distribution of filing lag, in calendar days"
            caption={`${pct(dp.filing_lag.share_flagged_late, 1)} of filings carry the late-filing flag. Bars beyond day 6 are grouped.`}
          >
            <BarChart
              data={lagData}
              xKey="lag"
              yTickFormat="percent"
              height={230}
              series={[{ key: "share", label: "Share of purchases", color: CHART.accent }]}
            />
          </Figure>
        </div>
      </Section>

      <Section title="Hygiene decisions" kicker="Detail that changes results">
        <Table
          head={
            <>
              <Th>Issue</Th>
              <Th>Decision</Th>
            </>
          }
          caption="Each of these is a place where a defensible-looking shortcut silently changes the answer."
        >
          <tr>
            <Td>Amendments (Form 4/A)</Td>
            <Td>
              Deduplication is applied only to (owner, issuer, transaction date, code, security)
              groups that actually contain an amendment; within those, the latest filing wins.
              Groups without an amendment are untouched, so two genuine same-day trades by one
              insider are never silently collapsed. {int(dp.totals.superseded_rows_removed)} rows
              removed.
            </Td>
          </tr>
          <tr>
            <Td>Joint filings</Td>
            <Td>
              About {pct(dp.joint_filings.share, 0)} of filings report several owners. Joining all
              owners against the transaction table would multiply each transaction by the owner
              count and inflate dollar volume, so transactions are attributed to the primary owner
              with the owner count retained.
            </Td>
          </tr>
          <tr>
            <Td>Indirect ownership</Td>
            <Td>
              Holdings through trusts, spouses and LLCs are flagged rather than dropped, and tested
              as a separate bucket in the robustness grid.
            </Td>
          </tr>
          <tr>
            <Td>Missing prices</Td>
            <Td>Purchases filed without a price are dropped rather than imputed.</Td>
          </tr>
          <tr>
            <Td>Schema drift</Td>
            <Td>
              {dp.schema_drift_notes.length > 0
                ? dp.schema_drift_notes.join(" ")
                : "None recorded."}
            </Td>
          </tr>
        </Table>
      </Section>

      <PageFooter meta={meta} currentHref="/data/" />
    </>
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
