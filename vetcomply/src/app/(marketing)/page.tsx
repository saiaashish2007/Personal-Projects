import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { FaqSection } from "@/components/marketing/faq-section";
import { IntegrationsMarquee } from "@/components/marketing/integrations-marquee";
import { McpDevelopersShowcase } from "@/components/marketing/mcp-developers-showcase";
import { ResolveConsoleShowcase } from "@/components/marketing/resolve-console-showcase";
import { ReviewQueueShowcase } from "@/components/marketing/review-queue-showcase";
import { RosterResolveShowcase } from "@/components/marketing/roster-resolve-showcase";

export const metadata: Metadata = {
  title: "VetComply — Regulatory Entity Resolution for Veterinary Roll-ups",
  description:
    "Agent-native API and MCP tools that resolve messy post-acquisition rosters into canonical vet provider and clinic identities — with human review for edge cases.",
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
            Regulatory entity resolution for veterinary roll-ups
          </p>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-neutral-900 md:text-6xl lg:text-7xl">
            Messy rosters in.
            <br />
            <em className="font-serif italic">Canonical entities</em> out.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-500 md:text-xl">
            VetComply resolves post-acquisition provider and clinic records into
            structured regulatory identities — via API, MCP tools for your agents,
            and a review console for the edge cases.
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
            <ResolveConsoleShowcase />
          </div>
        </div>
      </section>

      {/* Platform features */}
      <section id="platform" className="scroll-mt-16 border-b border-neutral-200 bg-neutral-50 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <SectionLabel>Platform</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              The resolution layer your
              <br className="hidden sm:block" />
              acquisition pipeline needs.
            </h2>
          </div>

          <div className="mt-16 space-y-24 md:mt-20 md:space-y-32">
            <FeatureBlock
              label="Roster jobs"
              title="Upload messy data. Get structured entities."
              description="Ingest CSV or Excel from your deal room, seller export, or HR system. VetComply resolves providers and clinics, auto-links high-confidence matches, and routes uncertain rows to human review."
            >
              <RosterResolveShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="Review queue"
              title="Human stewardship for regulated identities."
              description="Low-confidence matches land in a review queue with field-level explanations — name similarity, clinic variants, DEA exact matches. Your team confirms or rejects before entities are linked."
              reverse
            >
              <ReviewQueueShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="Agent-native"
              title="MCP tools your agents actually call."
              description="resolve_provider, resolve_roster, explain_match, and more — exposed as MCP tools and REST endpoints. Connect from Cursor, Claude Desktop, or your internal acquisition automation."
            >
              <McpDevelopersShowcase />
            </FeatureBlock>

            <FeatureBlock
              label="Entity graph"
              title="Canonical providers and clinics, linked."
              description="Every resolved entity carries DEA numbers, state licenses, acquisition provenance, and links between providers and clinics — the structured graph your compliance systems and agents reason over."
              reverse
            >
              <ResolveConsoleShowcase />
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
              Built for regulated data.
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Human in the loop",
                detail:
                  "Auto-match only above your confidence threshold. Every merge below that requires explicit human approval in the review queue.",
                rows: [
                  ["Auto-match", "Configurable threshold"],
                  ["Review", "Field-level explain"],
                  ["Override", "Reject or rematch"],
                ],
              },
              {
                title: "Auditable by design",
                detail:
                  "Every API and MCP call logged with request IDs. Match decisions, approvals, and entity links exportable for diligence files.",
                rows: [
                  ["Logs", "Per request ID"],
                  ["Retention", "7+ years available"],
                  ["Export", "JSON + CSV"],
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
              Resolution infrastructure, not another dashboard.
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
            Stop cleaning rosters by hand.
            <br />
            Start resolving at scale.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-neutral-400">
            Talk to our team about VetComply for your acquisition pipeline.
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
