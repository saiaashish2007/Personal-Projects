import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductPreview } from "@/components/marketing/product-preview";

export const metadata: Metadata = {
  title: "VetComply — Compliance OS for Veterinary Roll-ups",
  description:
    "Platform-level DEA, licensing, and controlled substance compliance for PE-backed veterinary roll-ups.",
};

const capabilities = [
  {
    num: "01",
    title: "Portfolio visibility",
    description:
      "DEA registrations, state licenses, and controlled substance logs across every location — one view, no spreadsheets.",
  },
  {
    num: "02",
    title: "M&A diligence",
    description:
      "Standardized checklists, risk scoring, and integration tracking from first LOI through close.",
  },
  {
    num: "03",
    title: "Renewal management",
    description:
      "Centralized calendar with alerts before DEA registrations and state licenses expire.",
  },
  {
    num: "04",
    title: "Compliance Agent",
    description:
      "Pre-fills DEA Form 224a, biennial inventory, Form 106, and ownership change filings from your data.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero — only place with demo CTA */}
      <section className="border-b border-neutral-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-5xl px-6 pb-20 pt-20 md:pb-28 md:pt-28">
          <p className="text-sm font-medium tracking-wide text-neutral-500">
            Compliance OS for veterinary roll-ups
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 md:text-6xl">
            Compliance that scales with your roll-up
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-500">
            One platform for DEA, licensing, controlled substances, and M&A
            diligence across your entire portfolio.
          </p>
          <div className="mt-10">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              View demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-neutral-200 bg-white py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
            The problem
          </p>
          <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">
            Clinic tools don&apos;t work at roll-up scale
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-500">
            As veterinary platforms consolidate, compliance complexity outpaces
            headcount. Platform ops teams stitch together PIMS exports, shared
            drives, and spreadsheets — while DEA deadlines and acquisition
            timelines don&apos;t wait.
          </p>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutral-500">
            VetComply is the portfolio-level layer above your clinic systems.
            Built for platform ops, not individual hospitals.
          </p>
        </div>
      </section>

      {/* Platform */}
      <section id="platform" className="scroll-mt-16 border-b border-neutral-200 bg-[#fafaf9] py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
            Platform
          </p>
          <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">
            Everything compliance needs, in one place
          </h2>

          <div className="mt-14 divide-y divide-neutral-200 border-y border-neutral-200">
            {capabilities.map(({ num, title, description }) => (
              <div
                key={num}
                className="grid gap-4 py-8 md:grid-cols-[4rem_1fr_2fr] md:gap-8 md:py-10"
              >
                <span className="font-mono text-sm text-neutral-400">{num}</span>
                <h3 className="text-base font-medium text-neutral-900">{title}</h3>
                <p className="text-base leading-relaxed text-neutral-500">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="scroll-mt-16 border-b border-neutral-200 bg-white py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
            About
          </p>
          <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">
            Built for the teams keeping roll-ups compliant
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {[
              "Platform operations & central compliance",
              "Legal & regulatory during acquisitions",
              "Integration leads onboarding new clinics",
            ].map((item) => (
              <p key={item} className="text-base leading-relaxed text-neutral-500">
                {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="scroll-mt-16 bg-[#fafaf9] py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
            Contact
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">
            Talk to us
          </h2>
          <p className="mt-4 max-w-md text-base text-neutral-500">
            Interested in VetComply for your platform? We&apos;d love to hear
            about your compliance challenges.
          </p>
          <a
            href="mailto:hello@vetcomply.com"
            className="mt-8 inline-block text-base font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-neutral-900"
          >
            hello@vetcomply.com
          </a>
        </div>
      </section>
    </>
  );
}
