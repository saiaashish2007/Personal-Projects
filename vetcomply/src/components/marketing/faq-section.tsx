"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "How does VetComply connect to our clinic systems?",
    a: "VetComply integrates with PIMS platforms (ezyVet, IDEXX Neo, Cornerstone), controlled substance loggers like VetSnap, and HR/credentialing systems. During M&A, it ingests seller documentation from your deal room and cross-checks against DEA and state board records.",
  },
  {
    q: "Is this a replacement for VetSnap or clinic PIMS?",
    a: "No. VetComply sits above your clinic systems — the portfolio-level compliance layer. VetSnap handles per-clinic CS logging; VetComply gives platform ops a single view across 50, 100, or 500+ locations.",
  },
  {
    q: "What forms does the Compliance Agent pre-fill?",
    a: "DEA Form 224a (registration renewal), biennial controlled substance inventory (21 CFR §1304.11), DEA Form 106 (theft/loss), ownership change notifications, and M&A diligence packets. Every field is sourced from your registry with human review before submission.",
  },
  {
    q: "Who is VetComply built for?",
    a: "PE-backed veterinary roll-ups with platform ops, central compliance, and M&A integration teams. If you're managing compliance across dozens of acquisitions per year, VetComply is the operating system those teams need.",
  },
  {
    q: "How is VetComply different from a compliance consultant?",
    a: "Consultants are thorough but slow and expensive. VetComply automates evidence gathering, renewal tracking, diligence checklists, and form pre-fill — so your team spends time on judgment calls, not spreadsheet maintenance.",
  },
  {
    q: "Can we use VetComply during acquisitions?",
    a: "Yes. VetComply generates diligence packets that flag expired DEAs, missing biennial inventories, and license transfer risks before close — with risk scores and remediation estimates your deal team can act on.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
      {faqs.map((faq, i) => (
        <div key={faq.q}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="font-medium text-neutral-900">{faq.q}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-neutral-400 transition-transform",
                open === i && "rotate-180",
              )}
            />
          </button>
          {open === i && (
            <p className="px-5 pb-5 text-sm leading-relaxed text-neutral-500">
              {faq.a}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
