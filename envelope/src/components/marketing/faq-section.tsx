"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "Who is Envelope for?",
    a: "Robotics OEMs and integrators deploying picking, packing, or manipulation systems into warehouses — especially teams moving from pilot to multi-site rollout where SKU mix changes constantly.",
  },
  {
    q: "What data do you need?",
    a: "Historical pick telemetry from your robots (success/fail, cycle time) plus SKU attributes from WMS or catalog exports. We train an operating envelope on your fleet — no new hardware required.",
  },
  {
    q: "How is this different from simulation?",
    a: "Simulation models physics in a virtual world. Envelope scores real catalogs against the boundary where your specific robot has already proven it works — using production telemetry, not CAD assumptions.",
  },
  {
    q: "How long does a catalog score take?",
    a: "Most catalogs (1k–10k SKUs) score in minutes once the envelope is trained. Engineers only review flagged SKUs — not the entire catalog.",
  },
  {
    q: "What does pricing look like?",
    a: "Per-site SaaS starting at $490/mo, fleet plans at $2,450/mo (up to 15 sites), and enterprise from $60K/yr. Priced against the cost of one failed rollout.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-neutral-200 border-y border-neutral-200">
      {faqs.map((item, i) => {
        const isOpen = open === i;
        return (
          <button
            key={item.q}
            type="button"
            className="flex w-full flex-col py-5 text-left"
            onClick={() => setOpen(isOpen ? null : i)}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-base font-medium text-neutral-900">
                {item.q}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-neutral-400 transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </div>
            {isOpen && (
              <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                {item.a}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
