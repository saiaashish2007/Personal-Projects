import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileCheck2,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "VetComply — Compliance OS for Veterinary Roll-ups",
  description:
    "VetComply is the platform-level compliance operating system for PE-backed veterinary roll-ups. DEA, licensing, controlled substances, and M&A diligence — in one place.",
};

const features = [
  {
    icon: Building2,
    title: "Portfolio-wide visibility",
    description:
      "See DEA registrations, state licenses, and controlled substance log status across every clinic — without spreadsheets or clinic-by-clinic PIMS exports.",
  },
  {
    icon: ClipboardCheck,
    title: "M&A diligence & integration",
    description:
      "Standardized diligence checklists, risk scoring, and integration tracking so every acquisition closes with a clear compliance baseline.",
  },
  {
    icon: FileCheck2,
    title: "Renewal calendar",
    description:
      "Never miss a DEA renewal or state license deadline. Centralized renewal tracking with alerts before items expire.",
  },
  {
    icon: Sparkles,
    title: "Compliance Agent",
    description:
      "AI-assisted form pre-fill for DEA Form 224a, biennial inventory, Form 106, ownership changes, and diligence packets.",
  },
];

const pillars = [
  {
    label: "Roll-up first",
    detail:
      "Built for platform ops, not individual clinics. VetComply sits above your PIMS — the single source of truth for compliance across 50, 100, or 500+ locations.",
  },
  {
    label: "Regulatory depth",
    detail:
      "DEA registrations, state veterinary licenses, controlled substance logs, and facility permits — modeled the way compliance teams actually work.",
  },
  {
    label: "Action, not dashboards",
    detail:
      "Alerts that drive renewals. Diligence findings that block close until resolved. A Compliance Agent that turns data into filed forms.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-900/40 via-slate-950 to-slate-950" />
        <div className="absolute -right-24 top-24 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-teal-600/5 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-sm font-medium text-teal-300">
              <Layers className="h-4 w-4" />
              Compliance OS for veterinary roll-ups
            </p>
            <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              One platform for compliance across your entire portfolio
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-300 md:text-xl">
              VetComply gives PE-backed veterinary platforms a single command
              center for DEA registrations, state licenses, controlled
              substances, and M&A diligence — so compliance scales with your
              roll-up, not against it.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
              >
                Explore the demo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#contact"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-slate-500 hover:bg-slate-900"
              >
                Get in touch
              </a>
            </div>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-3">
            {[
              { value: "127+", label: "Locations tracked in demo" },
              { value: "18", label: "States covered" },
              { value: "1", label: "Source of truth" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-800 bg-slate-900/50 px-6 py-5"
              >
                <p className="text-3xl font-bold text-teal-400">{stat.value}</p>
                <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="scroll-mt-20 bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-teal-600">
                Who we are
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Built for the teams keeping roll-ups compliant
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-slate-600">
                VetComply was founded on a simple observation: as veterinary
                platforms consolidate, compliance complexity grows faster than
                headcount. Platform ops, legal, and integration teams are left
                stitching together clinic-level tools, shared drives, and
                spreadsheets — while DEA deadlines and acquisition timelines
                don&apos;t wait.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                We&apos;re building the compliance layer that roll-ups actually
                need — portfolio-level, audit-ready, and designed to move at the
                speed of M&A.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100">
                <Users className="h-6 w-6 text-teal-700" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-slate-900">
                Who we serve
              </h3>
              <ul className="mt-4 space-y-3 text-slate-600">
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                  Platform operations & central compliance teams
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                  Legal & regulatory affairs during acquisitions
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                  Integration leads onboarding new clinic groups
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                  PE-backed veterinary platforms scaling past 50+ locations
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Platform */}
      <section id="platform" className="scroll-mt-20 bg-slate-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-600">
              The platform
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Everything compliance needs, at roll-up scale
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              VetComply replaces fragmented tracking with a unified compliance
              command center — from day-one diligence through ongoing
              operations.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50">
                  <Icon className="h-5 w-5 text-teal-600" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">
                  {title}
                </h3>
                <p className="mt-2 leading-relaxed text-slate-600">
                  {description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 text-sm font-semibold text-teal-600 hover:text-teal-700"
            >
              See it in action — open the interactive demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why VetComply */}
      <section id="why-vetcomply" className="scroll-mt-20 bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-600">
              Why VetComply
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Not another clinic tool
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              Per-clinic PIMS solutions like controlled substance loggers solve
              one location at a time. VetComply is the roll-up-level operating
              system — the wedge PE platforms need as they scale.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {pillars.map(({ label, detail }) => (
              <div key={label} className="text-center md:text-left">
                <div className="mx-auto h-1 w-12 rounded-full bg-teal-500 md:mx-0" />
                <h3 className="mt-6 text-lg font-semibold text-slate-900">
                  {label}
                </h3>
                <p className="mt-3 leading-relaxed text-slate-600">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA / Contact */}
      <section id="contact" className="scroll-mt-20 bg-slate-950 py-24 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-10 md:p-16">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Ready to see VetComply on your portfolio?
              </h2>
              <p className="mt-4 text-lg text-slate-300">
                Walk through our live demo to see portfolio health, M&A
                diligence, and the Compliance Agent in action — or reach out to
                talk about your roll-up&apos;s compliance challenges.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-400"
                >
                  Open demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="mailto:hello@vetcomply.com"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-white hover:border-slate-500"
                >
                  hello@vetcomply.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
