"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "Is VetComply an AI agent that runs our compliance program?",
    a: "No. VetComply is regulatory entity resolution infrastructure — API and MCP tools that turn messy acquisition rosters into canonical provider and clinic identities. Your agents and ops team call VetComply; we don't replace your compliance workflow.",
  },
  {
    q: "How does VetComply differ from license verification APIs?",
    a: "Verification APIs like The Vet Registry or MedPro look up known identifiers. VetComply resolves messy, incomplete records — fuzzy names, missing DEA numbers, clinic variants — and returns canonical entities with confidence scores and field-level explanations.",
  },
  {
    q: "Do you replace VetSnap or clinic PIMS?",
    a: "No. VetSnap handles per-clinic controlled substance logging. VetComply sits upstream of compliance workflows — cleaning the entity graph after acquisitions so your systems and agents know who is who.",
  },
  {
    q: "What is the MCP integration for?",
    a: "MCP (Model Context Protocol) lets AI agents in Cursor, Claude Desktop, or your internal tools call VetComply directly — resolve_provider, resolve_roster, explain_match, and more — with auditable request logs.",
  },
  {
    q: "What happens to low-confidence matches?",
    a: "Matches below your confidence threshold go to a human review queue in the VetComply console. Your team confirms or rejects with full field-level breakdowns before entities are linked.",
  },
  {
    q: "Who is VetComply built for?",
    a: "PE-backed veterinary roll-ups with platform ops, M&A integration, and engineering teams building acquisition pipelines. If you ingest provider rosters after every deal, VetComply is the resolution layer those pipelines need.",
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
