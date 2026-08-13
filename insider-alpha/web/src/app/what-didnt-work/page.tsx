import type { Metadata } from "next";

import PageFooter from "@/components/PageFooter";
import {
  Callout,
  Card,
  MethodNote,
  PageHeader,
  PlaceholderBadge,
  Prose,
  Section,
  Table,
  Td,
  Th,
  TStat,
} from "@/components/ui";
import type { Severity } from "@/lib/artifacts";
import { loadArtifacts } from "@/lib/data";
import { num } from "@/lib/format";
import { SPEC_URL } from "@/lib/nav";

export const metadata: Metadata = { title: "What Didn't Work" };

const VERDICT_LABEL: Record<string, string> = {
  signal_persists: "Signal persists out of sample",
  signal_decayed: "Signal has decayed since publication",
  inconclusive: "Inconclusive",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "border-neg/40 text-neg",
  medium: "border-warn/40 text-warn",
  low: "border-rule-strong text-muted",
};

export default function WhatDidntWorkPage() {
  const { meta, limitations } = loadArtifacts();

  return (
    <>
      <PageHeader
        step="09"
        title="What didn't work"
        standfirst="This page exists because it was promised in the specification before any results were known. A replication that only reports the parts that worked is not a replication. Below: the hypotheses that failed, what the failure looked like numerically, and the limitations that would need to be fixed before any of this should be believed at face value."
      />

      {limitations.data_status === "placeholder" ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="The verdict" kicker="Bottom line">
        <Callout
          tone={limitations.headline_verdict.verdict === "signal_persists" ? "result" : "warn"}
          title={VERDICT_LABEL[limitations.headline_verdict.verdict] ?? "Verdict"}
        >
          <p>{limitations.headline_verdict.summary}</p>
        </Callout>
        <MethodNote>
          The specification committed to this outcome being reportable:{" "}
          <em>
            &ldquo;if the effect has decayed post-publication, that is a reportable finding, not a
            failure&rdquo;
          </em>{" "}
          (
          <a href={SPEC_URL} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
            SPEC.md
          </a>
          , §2). Writing that down before running the analysis is what makes it credible now.
        </MethodNote>
      </Section>

      <Section title="Failed hypotheses" kicker="One per finding">
        <div className="space-y-5">
          {limitations.what_did_not_work.map((item, i) => (
            <article key={item.id} className="rounded-lg border border-rule bg-card p-5">
              <div className="flex items-baseline gap-3">
                <span className="tnum text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-serif text-lg leading-snug tracking-tight text-ink">
                  {item.title}
                </h3>
              </div>

              <dl className="mt-4 space-y-3 text-[14px] leading-relaxed">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted">Hypothesis</dt>
                  <dd className="prose-measure mt-1 text-ink-2">{item.hypothesis}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted">What we did</dt>
                  <dd className="prose-measure mt-1 text-ink-2">{item.what_we_did}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted">
                    What happened
                  </dt>
                  <dd className="prose-measure mt-1 text-ink-2">{item.what_happened}</dd>
                </div>
              </dl>

              {item.evidence.length > 0 ? (
                <table className="mt-4 w-full border-collapse text-[13px]">
                  <tbody>
                    {item.evidence.map((e) => (
                      <tr key={e.label}>
                        <td className="border-b border-rule py-1.5 pr-4 text-ink-2">{e.label}</td>
                        <td className="tnum border-b border-rule py-1.5 pr-4 text-right">
                          {e.value}
                        </td>
                        <td className="border-b border-rule py-1.5 text-right">
                          <TStat t={e.t_stat} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              <p className="mt-4 border-t border-rule pt-3 text-[13.5px] leading-relaxed text-ink-2">
                <span className="text-[11px] uppercase tracking-[0.1em] text-muted">Takeaway</span>{" "}
                — {item.takeaway}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Known limitations" kicker="What would need fixing">
        <Prose>
          <p>
            These were listed in the specification before implementation, and the severity ratings
            have not been revised downward now that results are in. Where a bias has a known sign,
            it is stated, because a limitation whose direction is unknown is a much bigger problem
            than one that is merely large.
          </p>
        </Prose>

        <div className="mt-5 space-y-3">
          {limitations.limitations.map((l) => (
            <div key={l.id} className="rounded-lg border border-rule bg-card p-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="text-[15px] font-semibold text-ink">{l.title}</h3>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${SEVERITY_STYLE[l.severity]}`}
                >
                  {l.severity}
                </span>
                <span className="text-[11px] uppercase tracking-[0.1em] text-muted">
                  {l.category}
                </span>
              </div>
              <p className="prose-measure mt-2 text-[14px] leading-relaxed text-ink-2">
                {l.description}
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted">
                    Direction of bias
                  </dt>
                  <dd className="mt-1 text-ink-2">{l.direction_of_bias ?? "No clear sign"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted">Mitigation</dt>
                  <dd className="mt-1 text-ink-2">{l.mitigation}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted">Magnitude</dt>
                  <dd className="mt-1 text-ink-2">{l.quantification ?? "Not quantified"}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </Section>

      <Section title="If this were continued" kicker="Next">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-semibold text-ink">Data upgrades that would settle things</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-2">
              <li>
                A survivorship-free price panel with delisting returns. This is the single largest
                unquantified bias and it points in the flattering direction.
              </li>
              <li>
                Intraday or daily spread data instead of a cap-tercile proxy, which would replace
                the weakest assumption in the cost model.
              </li>
              <li>
                Point-in-time fundamentals, which would allow the signal to be conditioned on
                valuation rather than only sector-neutralized.
              </li>
            </ul>
          </Card>
          <Card>
            <p className="text-sm font-semibold text-ink">Research questions this raises</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-2">
              <li>
                Is the decay explained by faster dissemination? Testing whether the effect
                concentrates in names with low analyst coverage or slow filing-alert adoption would
                be a direct test of the limited-attention mechanism.
              </li>
              <li>
                Does the 2023 10b5-1 checkbox, now that it exists, outperform the behavioural
                classifier on the post-2023 subsample? Three years is not enough to answer this yet.
              </li>
              <li>
                Does conditioning on insider purchase clustering — several insiders buying within
                days — rescue the large-cap tercile, where single-insider events dominate?
              </li>
            </ul>
          </Card>
        </div>
      </Section>

      <Section title="Reproducing this" kicker="Method">
        <Table
          head={
            <>
              <Th>Step</Th>
              <Th>Command</Th>
            </>
          }
          caption="The pipeline runs offline and writes versioned JSON artifacts; this site reads them at build time. Ingestion must run locally because the SEC blocks cloud-provider IP ranges for bulk archive access."
        >
          <tr>
            <Td>Install</Td>
            <Td mono>pip install -e .</Td>
          </tr>
          <tr>
            <Td>Ingest Form 4 archives</Td>
            <Td mono>python scripts/01_ingest.py --start-year 2011 --end-year 2025</Td>
          </tr>
          <tr>
            <Td>Build the site</Td>
            <Td mono>cd web &amp;&amp; npm install &amp;&amp; npm run build</Td>
          </tr>
        </Table>
        <p className="mt-4 text-[13px] text-muted">
          Artifacts generated {meta.generated_at.slice(0, 10)} with Python {meta.software.python_version}
          {meta.run.git_sha ? ` at commit ${meta.run.git_sha.slice(0, 7)}` : ""}. Package versions:{" "}
          {meta.software.packages.map((p) => `${p.name} ${p.version}`).join(", ")}. Sample runs{" "}
          {meta.sample.start} to {meta.sample.end} with {num(meta.sample.n_rebalance_dates ?? 0, 0)}{" "}
          monthly rebalance dates.
        </p>
      </Section>

      <PageFooter meta={meta} currentHref="/what-didnt-work/" />
    </>
  );
}
