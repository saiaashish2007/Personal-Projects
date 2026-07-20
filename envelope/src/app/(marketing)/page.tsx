import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { ApiShowcase } from "@/components/marketing/api-showcase";
import { CatalogScoreShowcase } from "@/components/marketing/catalog-score-showcase";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { FaqSection } from "@/components/marketing/faq-section";
import { FlaggedSkuShowcase } from "@/components/marketing/flagged-sku-showcase";
import { IntegrationsMarquee } from "@/components/marketing/integrations-marquee";
import { RiskDashboardShowcase } from "@/components/marketing/risk-dashboard-showcase";

export const metadata: Metadata = {
  title: "Envelope — Predict Robot Performance Before Rollout",
  description:
    "SKU Stress Envelope scores customer catalogs against your robot's operating boundary — before you ship and commit to an SLA.",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
      {children}
    </p>
  );
}

function FeatureBlock({
  label,
  title,
  description,
  children,
  reverse = false,
}: {
  label: string;
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}
    >
      <div>
        <SectionLabel>{label}</SectionLabel>
        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">
          {title}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-neutral-500 md:text-lg">
          {description}
        </p>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-neutral-200 bg-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 50% -20%, #fbbf24 0%, transparent 55%), linear-gradient(to bottom, #fffbeb 0%, transparent 40%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 md:pb-24 md:pt-28">
          <p className="text-sm font-medium text-neutral-500">
            Performance confidence for warehouse robotics
          </p>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-neutral-900 md:text-6xl lg:text-7xl">
            New SKUs in.
            <br />
            <em className="font-serif italic">Go / no-go</em> out.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-500 md:text-xl">
            Envelope scores every SKU in a customer catalog against your robot&apos;s
            operating boundary — so you know pick rates will hold before you ship
            and sign the SLA.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              View demo
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-7 py-3.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
            >
              Talk to founder
            </a>
          </div>

          <div className="mt-14 md:mt-20">
            <RiskDashboardShowcase />
          </div>
        </div>
      </section>

      <section
        id="platform"
        className="scroll-mt-16 border-b border-neutral-200 bg-neutral-50 py-20 md:py-28"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <SectionLabel>Platform</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              The stress layer every
              <br className="hidden sm:block" />
              robot rollout needs.
            </h2>
          </div>

          <div className="mt-16 space-y-24 md:mt-20 md:space-y-32">
            <FeatureBlock
              label="Catalog scoring"
              title="Score a full catalog before the fleet ships."
              description="Ingest a prospect's WMS export or CSV. Envelope maps SKU attributes against your trained operating boundary and returns pass, marginal, or fail — with predicted pick rates."
            >
              <CatalogScoreShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="Flagged SKUs"
              title="Failure modes and mitigations, not just red flags."
              description="Every fail and marginal SKU comes with a likely failure mode — deformable, reflective, size out of range — plus a mitigation playbook your deployment engineers can act on."
              reverse
            >
              <FlaggedSkuShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="API-first"
              title="Plug into WMS and robot telemetry."
              description="Score catalogs via REST, stream pick logs to keep the envelope fresh, and surface drift alerts when packaging mix or throughput pushes a site out of bounds."
            >
              <ApiShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="Rollout risk"
              title="One dashboard for go / no-go decisions."
              description="See predicted performance across an entire customer catalog before a robot ships. Drill down by SKU class, site, or condition — then commit to SLAs you can actually hit."
              reverse
            >
              <RiskDashboardShowcase />
            </FeatureBlock>
          </div>
        </div>
      </section>

      <IntegrationsMarquee />

      <section
        id="security"
        className="scroll-mt-16 border-b border-neutral-200 bg-white py-20 md:py-28"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <SectionLabel>Trust</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              Built for production fleets.
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Engineer in the loop",
                detail:
                  "Auto-pass only above your confidence threshold. Marginal and fail SKUs require explicit engineer review before a go decision.",
                rows: [
                  ["Auto-pass", "Configurable threshold"],
                  ["Review", "Failure mode + mitigation"],
                  ["Override", "Accept risk or rematch"],
                ],
              },
              {
                title: "Your data stays yours",
                detail:
                  "Envelopes are trained on your fleet telemetry. Catalog and pick data is tenant-isolated and never used to train models for other customers.",
                rows: [
                  ["Isolation", "Per-tenant"],
                  ["Training", "Customer-owned only"],
                  ["Export", "JSON + CSV"],
                ],
              },
              {
                title: "Enterprise infrastructure",
                detail:
                  "Encrypted at rest and in transit. Designed for OEM and integrator deployments that need audit trails for SLA underwriting.",
                rows: [
                  ["Hosting", "AWS, US regions"],
                  ["Encryption", "AES-256 + TLS 1.2+"],
                  ["Compliance", "SOC 2 in progress"],
                ],
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6"
              >
                <ShieldCheck className="h-5 w-5 text-neutral-400" />
                <h3 className="mt-4 text-lg font-semibold text-neutral-900">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  {card.detail}
                </p>
                <dl className="mt-5 space-y-2 border-t border-neutral-200 pt-5">
                  {card.rows.map(([key, val]) => (
                    <div key={key} className="flex justify-between gap-4 text-sm">
                      <dt className="text-neutral-400">{key}</dt>
                      <dd className="text-right font-medium text-neutral-700">
                        {val}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200 bg-neutral-50 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <SectionLabel>Why Envelope</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              Prediction infrastructure, not another fleet dashboard.
            </h2>
          </div>
          <div className="mt-14">
            <ComparisonTable />
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="scroll-mt-16 border-b border-neutral-200 bg-white py-20 md:py-28"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <SectionLabel>FAQ</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              Frequently asked questions.
            </h2>
          </div>
          <div className="mt-14 max-w-3xl">
            <FaqSection />
          </div>
        </div>
      </section>

      <section
        id="contact"
        className="scroll-mt-16 bg-neutral-950 py-20 text-white md:py-28"
      >
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Stop discovering SKU failures in production.
            <br />
            Score the catalog first.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-neutral-400">
            Looking for 3 design partners — free 60-day pilot on your telemetry.
          </p>
          <a
            href="mailto:saiaashishb@gmail.com?subject=Envelope%20design%20partner"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
          >
            Talk to founder
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </>
  );
}
