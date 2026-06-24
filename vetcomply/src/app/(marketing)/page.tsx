import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AgentShowcase } from "@/components/marketing/agent-showcase";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { DiligenceShowcase } from "@/components/marketing/diligence-showcase";
import { FaqSection } from "@/components/marketing/faq-section";
import { IntegrationsMarquee } from "@/components/marketing/integrations-marquee";
import { PortfolioDashboardShowcase } from "@/components/marketing/portfolio-dashboard-showcase";
import { RenewalShowcase } from "@/components/marketing/renewal-showcase";
import { organization } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "VetComply — Compliance OS for Veterinary Roll-ups",
  description:
    "Agents that track DEA registrations, state licenses, controlled substances, and M&A diligence across your entire veterinary portfolio.",
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
      {/* Hero */}
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-20 md:pb-24 md:pt-28">
          <p className="text-sm font-medium text-neutral-500">
            Compliance OS for veterinary roll-ups
          </p>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-neutral-900 md:text-6xl lg:text-7xl">
            Roll-up compliance,
            <br />
            on <em className="font-serif italic">autopilot</em>.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-500 md:text-xl">
            Agents that track DEA registrations, state licenses, controlled
            substances, and M&A diligence — then pre-fill the forms your
            compliance team actually files.
          </p>
          <div className="mt-10">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              View demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-14 md:mt-20">
            <PortfolioDashboardShowcase />
          </div>
        </div>
      </section>

      {/* Platform features */}
      <section id="platform" className="scroll-mt-16 border-b border-neutral-200 bg-neutral-50 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <SectionLabel>Platform</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              Monitor every clinic in minutes,
              <br className="hidden sm:block" />
              not weeks.
            </h2>
          </div>

          <div className="mt-16 space-y-24 md:mt-20 md:space-y-32">
            <FeatureBlock
              label="Portfolio command center"
              title="One view across your entire roll-up."
              description={`${organization.locationCount} locations across ${organization.statesActive} states — DEA status, state licenses, controlled substance logs, and integration progress in a single dashboard. No more regional spreadsheets.`}
            >
              <PortfolioDashboardShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="Compliance Agent"
              title="Pre-fills regulatory forms from your registry."
              description="The Compliance Agent reads your location registry, credentialing data, and CS logs — then pre-fills DEA Form 224a, biennial inventory, Form 106, and ownership change notifications. Your team reviews, then submits."
              reverse
            >
              <AgentShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="M&A diligence"
              title="Exceptions that explain themselves."
              description="Every diligence finding is grounded in source evidence — expired DEA registrations, missing biennial inventories, license transfer risks — with risk scores and remediation estimates your deal team can act on before close."
            >
              <DiligenceShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="Renewal calendar"
              title="Never miss a DEA or license deadline."
              description="Centralized renewal tracking across every location. Alerts fire before registrations expire — so your team renews proactively instead of discovering expired DEAs during an audit."
              reverse
            >
              <RenewalShowcase />
            </FeatureBlock>
          </div>
        </div>
      </section>

      <IntegrationsMarquee />

      {/* Security */}
      <section id="security" className="scroll-mt-16 border-b border-neutral-200 bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <SectionLabel>Security</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              Roll-up grade security.
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Read-only by default",
                detail:
                  "Integrations use read-only credentials. Write access to systems of record requires explicit approval per engagement.",
                rows: [
                  ["Access", "Read-only by default"],
                  ["Writes", "Scoped approval required"],
                  ["Logging", "Recorded per location"],
                ],
              },
              {
                title: "Human in the loop",
                detail:
                  "Forms finalize only after compliance manager sign-off. Every revision stays in the audit trail.",
                rows: [
                  ["Approvals", "Role-gated by reviewer"],
                  ["Override", "Editable by compliance lead"],
                  ["Trail", "Logged with evidence"],
                ],
              },
              {
                title: "Enterprise infrastructure",
                detail:
                  "Tenant-isolated data, encrypted at rest and in transit. Customer data never used to train models.",
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
                      <dd className="text-right font-medium text-neutral-700">{val}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-b border-neutral-200 bg-neutral-50 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <SectionLabel>Why VetComply</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              A smarter way to run roll-up compliance.
            </h2>
          </div>
          <div className="mt-14">
            <ComparisonTable />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 border-b border-neutral-200 bg-white py-20 md:py-28">
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

      {/* Contact CTA */}
      <section id="contact" className="scroll-mt-16 bg-neutral-950 py-20 text-white md:py-28">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Stop chasing renewals.
            <br />
            Start running compliance at scale.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-neutral-400">
            Talk to our team about VetComply for your veterinary platform.
          </p>
          <a
            href="mailto:hello@vetcomply.com"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
          >
            Talk to our team
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </>
  );
}
