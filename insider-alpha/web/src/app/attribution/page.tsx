import type { Metadata } from "next";

import BarChart from "@/components/charts/BarChart";
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
import { loadArtifacts } from "@/lib/data";
import { bps, num, significance } from "@/lib/format";

export const metadata: Metadata = { title: "Factor Attribution" };

export default function AttributionPage() {
  const { meta, attribution } = loadArtifacts();
  const primary =
    attribution.regressions.find((r) => r.id === attribution.primary_regression_id) ??
    attribution.regressions[0];

  if (!primary) throw new Error("attribution.json contains no regressions.");

  const loadingData = primary.loadings.map((l) => ({
    factor: l.factor,
    beta: l.beta,
    se: l.std_error,
  }));

  return (
    <>
      <PageHeader
        step="07"
        title="Is there residual alpha, or is this repackaged small-cap value?"
        standfirst="The step most student projects skip and the first thing a quant will ask about. Monthly portfolio excess returns regressed on the Fama-French five factors plus momentum, with Newey-West standard errors. Insider buying loads naturally on size and value, so a large SMB and HML loading with an insignificant alpha is a completely plausible outcome — and it is close to what the data shows."
      />

      {attribution.data_status === "placeholder" ? (
        <div className="mt-6">
          <PlaceholderBadge />
        </div>
      ) : null}

      <Section title="The regression" kicker="Specification">
        <Card>
          <pre className="tnum overflow-x-auto text-[12.5px] leading-relaxed text-ink-2">
{`r_p - r_f = alpha + b_MKT.MKT + b_SMB.SMB + b_HML.HML
                  + b_RMW.RMW + b_CMA.CMA + b_UMD.UMD + e`}
          </pre>
        </Card>

        <div className="mt-5">
          <StatGrid>
            <StatTile
              label="Annualized alpha"
              value={bps(primary.alpha_ann_bps)}
              sub={`± ${num(primary.alpha_std_error_bps, 0)} bps standard error`}
              tone={significance(primary.alpha_t_stat) === "strong" ? "pos" : "warn"}
            />
            <StatTile
              label="Alpha t-statistic"
              value={num(primary.alpha_t_stat, 2)}
              sub={`Newey-West, ${primary.newey_west_lags} lags · p = ${num(primary.alpha_p_value, 3)}`}
              tone={significance(primary.alpha_t_stat) === "strong" ? "pos" : "warn"}
            />
            <StatTile label="R²" value={num(primary.r_squared, 3)} sub={`adjusted ${num(primary.adj_r_squared, 3)}`} />
            <StatTile label="Observations" value={`${primary.n_months} months`} sub={primary.label} />
          </StatGrid>
        </div>

        <div className="mt-5">
          <Callout tone="warn" title="Interpretation">
            <p>{attribution.interpretation}</p>
          </Callout>
        </div>
      </Section>

      <Section title="Factor loadings" kicker={primary.label}>
        <Figure
          title="Factor betas with one-standard-error whiskers"
          caption="Positive SMB and HML loadings are the signature of a book of insider purchases: insiders buy their own stock most often in smaller, cheaper names, and most often after those names have fallen. The negative momentum loading is the same fact viewed from a different angle — buying weakness is short momentum by construction."
        >
          <BarChart
            data={loadingData}
            xKey="factor"
            yTickFormat="decimal2"
            height={280}
            colorBySign
            series={[{ key: "beta", label: "Beta", color: CHART.accent, errorKey: "se" }]}
          />
        </Figure>

        <div className="mt-6">
          <Table
            head={
              <>
                <Th>Factor</Th>
                <Th align="right">Beta</Th>
                <Th align="right">Std. error</Th>
                <Th align="right">t</Th>
                <Th align="right">p</Th>
              </>
            }
            caption="A t-statistic marked with an asterisk exceeds 2 in absolute value."
          >
            <tr className="bg-accent-soft/50">
              <Td>Alpha (annualized bps)</Td>
              <Td align="right" mono>
                {num(primary.alpha_ann_bps, 0)}
              </Td>
              <Td align="right" mono>
                {num(primary.alpha_std_error_bps, 0)}
              </Td>
              <Td align="right">
                <TStat t={primary.alpha_t_stat} />
              </Td>
              <Td align="right" mono>
                {num(primary.alpha_p_value, 3)}
              </Td>
            </tr>
            {primary.loadings.map((l) => (
              <tr key={l.factor}>
                <Td>
                  <span className="tnum">{l.factor}</span>
                  <span className="ml-2 text-[12px] text-muted">{l.label}</span>
                </Td>
                <Td align="right" mono>
                  {num(l.beta, 3)}
                </Td>
                <Td align="right" mono>
                  {num(l.std_error, 3)}
                </Td>
                <Td align="right">
                  <TStat t={l.t_stat} />
                </Td>
                <Td align="right" mono>
                  {num(l.p_value, 3)}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      </Section>

      <Section title="All specifications" kicker="Gross, net, raw spread, filter off">
        <Prose>
          <p>
            Four regressions are reported rather than one, because each answers a different
            question. Gross versus net isolates how much of the alpha is consumed by
            implementation. The raw quintile spread separates signal quality from portfolio
            construction. And the filter-off row is the research comparison: the alpha gap between
            it and the primary regression is what the Cohen-Malloy-Pomorski classification is worth
            out of sample.
          </p>
        </Prose>

        <div className="mt-5">
          <Table
            dense
            head={
              <>
                <Th>Specification</Th>
                <Th align="right">Alpha (bps/yr)</Th>
                <Th align="right">t</Th>
                <Th align="right">MKT</Th>
                <Th align="right">SMB</Th>
                <Th align="right">HML</Th>
                <Th align="right">UMD</Th>
                <Th align="right">R²</Th>
              </>
            }
            caption="Betas shown for the four factors that carry the story; RMW and CMA are in the detail table above for the primary specification and are small and insignificant throughout."
          >
            {attribution.regressions.map((r) => (
              <tr key={r.id} className={r.id === primary.id ? "bg-accent-soft/40" : undefined}>
                <Td>{r.label}</Td>
                <Td align="right" mono>
                  {num(r.alpha_ann_bps, 0)}
                </Td>
                <Td align="right">
                  <TStat t={r.alpha_t_stat} />
                </Td>
                {(["MKT", "SMB", "HML", "UMD"] as const).map((f) => {
                  const l = r.loadings.find((x) => x.factor === f);
                  return (
                    <Td key={f} align="right" mono>
                      {l ? num(l.beta, 2) : "—"}
                    </Td>
                  );
                })}
                <Td align="right" mono>
                  {num(r.r_squared, 2)}
                </Td>
              </tr>
            ))}
          </Table>
        </div>

        <div className="mt-6 space-y-3">
          {attribution.regressions.map((r) => (
            <details key={r.id} className="rounded-lg border border-rule bg-card px-4 py-3">
              <summary className="cursor-pointer text-[14px] font-medium text-ink">
                {r.label}
              </summary>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{r.description}</p>
              <p className="mt-2 text-[12.5px] text-muted">
                Dependent variable: <span className="tnum">{r.dependent_variable}</span> ·{" "}
                {r.n_months} months · Newey-West {r.newey_west_lags} lags · adjusted R²{" "}
                {num(r.adj_r_squared, 3)}
              </p>
            </details>
          ))}
        </div>

        <MethodNote>
          Factor returns are the Ken French Data Library monthly series for the five-factor model
          plus momentum. Newey-West lag length is set to 6, which covers the overlap induced by the
          three-month holding period; results are not sensitive to lag choices between 3 and 12.
        </MethodNote>
      </Section>

      <PageFooter meta={meta} currentHref="/attribution/" />
    </>
  );
}
