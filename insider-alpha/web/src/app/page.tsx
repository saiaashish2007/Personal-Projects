import Link from "next/link";

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
import { loadArtifacts, primaryVariant } from "@/lib/data";
import { bps, num, pct, signedPct } from "@/lib/format";
import { NAV, SPEC_URL } from "@/lib/nav";

const VERDICT_LABEL: Record<string, string> = {
  signal_persists: "Signal persists out of sample",
  signal_decayed: "Signal has decayed since publication",
  inconclusive: "Inconclusive",
};

export default function ThesisPage() {
  const { meta, ic, backtest, costs, attribution, limitations, robustness } = loadArtifacts();
  const variant = primaryVariant(backtest);
  const headline21 = ic.headline.find((h) => h.horizon_days === 21);
  const primaryReg = attribution.regressions.find((r) => r.id === attribution.primary_regression_id);
  const placeholder = meta.data_status === "placeholder";

  return (
    <>
      <PageHeader
        step="01"
        title="Do opportunistic insiders still know something?"
        standfirst="An out-of-sample replication of Cohen, Malloy & Pomorski, “Decoding Inside Information” (Journal of Finance, 2012), tested on 2014–2025 — a window that begins seven years after their sample ends and five years after the paper was published."
      />

      {placeholder ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="The claim under test" kicker="Hypothesis">
        <Prose>
          <p>
            Corporate insiders file Form 4 within two business days of transacting in their own
            company&apos;s stock. The naive reading — insiders bought, so buy — is close to
            worthless, because the overwhelming majority of insider transactions are compensation
            mechanics or pre-scheduled diversification sales that carry no view at all.
          </p>
          <blockquote className="border-l-2 border-accent pl-4 font-serif text-[17px] leading-relaxed text-ink">
            Open-market purchases made by insiders who do <em>not</em> trade on a predictable
            annual schedule contain information about future returns that the market does not
            immediately impound.
          </blockquote>
          <p>
            Two filters do the work. Restricting to open-market purchases isolates the only
            transaction type where an insider voluntarily puts personal capital at risk. Separating
            insiders who trade opportunistically from those who trade routinely removes the
            scheduled, liquidity-driven flow that dilutes the signal. Everything downstream on this
            site is an attempt to measure whether that second filter still earns its keep.
          </p>
        </Prose>
        <MethodNote>
          The full protocol — universe screens, signal math, validation gates, cost model, and the
          robustness battery — was written before any code was run and is published unchanged as{" "}
          <a href={SPEC_URL} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
            SPEC.md
          </a>
          .
        </MethodNote>
      </Section>

      <Section title="What the data says" kicker="Headline result">
        <Callout tone="result" title={VERDICT_LABEL[limitations.headline_verdict.verdict] ?? "Verdict"}>
          <p>{limitations.headline_verdict.summary}</p>
        </Callout>

        <div className="mt-5">
          <StatGrid>
            <StatTile
              label="Mean IC, 21d, filter on"
              value={pct(headline21?.opportunistic_mean_ic ?? 0, 2)}
              sub={`vs. ${pct(headline21?.all_insiders_mean_ic ?? 0, 2)} with the filter off`}
              tone="neutral"
            />
            <StatTile
              label="Net Sharpe"
              value={num(variant.stats.net.sharpe, 2)}
              sub={`${num(variant.stats.gross.sharpe, 2)} gross, at ${num(
                variant.cost_assumption_bps,
                0,
              )} bps round trip`}
            />
            <StatTile
              label="Net alpha, FF5+UMD"
              value={bps(primaryReg?.alpha_ann_bps ?? 0)}
              sub={`per year, t = ${num(primaryReg?.alpha_t_stat ?? 0, 2)} — not significant`}
              tone={
                primaryReg && Math.abs(primaryReg.alpha_t_stat) >= 2 ? "pos" : "warn"
              }
            />
            <StatTile
              label="Break-even cost"
              value={
                costs.break_even.alpha_zero_bps === null
                  ? "—"
                  : `${num(costs.break_even.alpha_zero_bps, 0)} bps`
              }
              sub={`explicit model estimates ${num(
                costs.explicit_model.estimated_round_trip_bps,
                0,
              )} bps`}
            />
          </StatGrid>
        </div>

        <Prose>
          <p className="mt-5">
            Read those four numbers together and the shape of the result is clear. The filter still
            separates informative purchases from uninformative ones — that comparison is the point
            of the project and it survives. What does not survive is the magnitude: after a
            realistic cost model and a factor regression, the residual alpha is small, statistically
            indistinguishable from zero, and concentrated in exactly the corner of the universe
            where it would be hardest to trade.
          </p>
        </Prose>
      </Section>

      <Section title="How to read this site" kicker="Structure">
        <Prose>
          <p>
            Each page is one step of the research process, in the order it was actually run. The
            go/no-go gate sits at{" "}
            <Link href="/ic/" className="text-accent underline underline-offset-4">
              IC Analysis
            </Link>
            : no backtest was run until the information coefficient cleared a pre-registered
            threshold. The last page is the one a quant researcher will read first.
          </p>
        </Prose>
        <ol className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {NAV.slice(1).map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex h-full gap-3 rounded-lg border border-rule bg-card px-4 py-3 transition-colors hover:border-rule-strong"
              >
                <span className="tnum pt-0.5 text-[11px] text-muted">{item.step}</span>
                <span>
                  <span className="block text-[14px] font-medium text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                    {item.blurb}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Prior literature" kicker="Standing on">
        <Table
          head={
            <>
              <Th>Paper</Th>
              <Th>Finding relied on</Th>
            </>
          }
          caption="This project is a direct out-of-sample test of the third row. The first two motivate the purchase-only restriction."
        >
          <tr>
            <Td>Lakonishok &amp; Lee (2001)</Td>
            <Td>
              Aggregate insider purchases predict returns, with the effect concentrated outside
              mega-caps.
            </Td>
          </tr>
          <tr>
            <Td>Jeng, Metrick &amp; Zeckhauser (2003)</Td>
            <Td>
              Purchases earn abnormal returns and sales do not. The asymmetry is real, and it is why
              the core signal ignores sales.
            </Td>
          </tr>
          <tr>
            <Td>Cohen, Malloy &amp; Pomorski (2012), <em>JF</em></Td>
            <Td>
              The routine/opportunistic split. Opportunistic buys earned roughly 82 bps per month
              over 1986–2007; routine buys earned nothing.
            </Td>
          </tr>
        </Table>
      </Section>

      <Section title="Universe and sample" kicker="Scope">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-semibold text-ink">{meta.universe.name}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              {meta.universe.description}
            </p>
            <dl className="mt-4 space-y-2">
              {meta.universe.screens.map((s) => (
                <div key={s.name} className="flex items-baseline justify-between gap-4 border-b border-rule pb-2 last:border-0">
                  <dt className="text-[13px] text-ink-2">{s.description}</dt>
                  <dd className="tnum shrink-0 text-[13px] text-ink">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <p className="text-sm font-semibold text-ink">Pipeline status</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Python runs offline and writes versioned JSON artifacts; this site reads them at build
              time. There is no server and no runtime API.
            </p>
            <ul className="mt-4 space-y-1.5">
              {meta.pipeline_stages.map((s) => (
                <li key={s.milestone} className="flex items-baseline gap-3 text-[13px]">
                  <span className="tnum w-4 text-muted">{s.milestone}</span>
                  <span className="flex-1 text-ink-2">{s.name}</span>
                  <span
                    className={`text-[11px] uppercase tracking-[0.1em] ${
                      s.status === "complete"
                        ? "text-pos"
                        : s.status === "partial"
                          ? "text-warn"
                          : "text-muted"
                    }`}
                  >
                    {s.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section title="What would change the conclusion" kicker="Falsifiability">
        <Figure
          title="Three things that would move this from a decay study back to a strategy"
          caption={`Specification count to date: ${robustness.multiple_testing.n_specifications_tested}. Every additional test raises the bar the headline number has to clear.`}
        >
          <ol className="space-y-3 text-[14px] leading-relaxed text-ink-2">
            <li className="flex gap-3">
              <span className="tnum text-muted">1</span>
              <span>
                A net alpha t-statistic above 2 that holds in both subperiods. Currently{" "}
                <TStat t={primaryReg?.alpha_t_stat ?? null} /> full-sample, and the second half is
                flat.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="tnum text-muted">2</span>
              <span>
                Survival in the large-cap tercile, where the strategy would actually be scalable.
                Currently the effect lives entirely in small caps.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="tnum text-muted">3</span>
              <span>
                A break-even cost comfortably above the explicit model rather than roughly double
                it — the current margin of{" "}
                {costs.break_even.alpha_zero_bps === null
                  ? "—"
                  : `${num(costs.break_even.alpha_zero_bps, 0)} bps vs. ${num(
                      costs.explicit_model.estimated_round_trip_bps,
                      0,
                    )} bps`}{" "}
                leaves no room for slippage being worse than modelled.
              </span>
            </li>
          </ol>
        </Figure>
      </Section>

      <Section title="Signal quality at a glance" kicker="Preview">
        <Table
          head={
            <>
              <Th>Horizon</Th>
              <Th align="right">Filter on</Th>
              <Th align="right">Filter off</Th>
              <Th align="right">Delta</Th>
            </>
          }
          caption="Mean Spearman information coefficient between the signal and forward returns. The comparison, not the level, is the research question. Full detail on the IC Analysis page."
        >
          {ic.headline.map((h) => (
            <tr key={h.horizon_days}>
              <Td mono>{h.horizon_days}d</Td>
              <Td align="right" mono>
                {pct(h.opportunistic_mean_ic, 2)}{" "}
                <span className="ml-1 text-[12px]">
                  <TStat t={h.opportunistic_t_stat} />
                </span>
              </Td>
              <Td align="right" mono className="text-muted">
                {pct(h.all_insiders_mean_ic, 2)}{" "}
                <span className="ml-1 text-[12px]">
                  <TStat t={h.all_insiders_t_stat} />
                </span>
              </Td>
              <Td align="right" mono>
                {signedPct(h.delta_ic, 2)}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <PageFooter meta={meta} currentHref="/" />
    </>
  );
}
