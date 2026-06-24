import { acquisitions } from "@/lib/mock-data";
import { ShowcaseFrame } from "./showcase-frame";

const deal = acquisitions[0];

export function DiligenceShowcase() {
  return (
    <ShowcaseFrame title="M&A Diligence" subtitle={deal.targetName} badge="Exception">
      <div className="p-5">
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-neutral-900">
            {deal.flags[0].title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            {deal.flags[0].detail.split(".")[0]}.
            <span className="font-medium text-neutral-900">
              {" "}Biennial inventories missing at 3 of 6 clinics
            </span>
            <sup className="ml-0.5 text-[10px] text-neutral-400">1</sup>.
            Recommend{" "}
            <span className="font-medium text-neutral-900">
              price adjustment or escrow before close
            </span>
            <sup className="ml-0.5 text-[10px] text-neutral-400">2</sup>.
          </p>
          <div className="mt-4 space-y-1.5 border-t border-red-100 pt-3 text-xs text-neutral-500">
            <p>
              <sup>1</sup>CS log audit — 3 of 6 clinics missing biennial inventory
            </p>
            <p>
              <sup>2</sup>Agent estimate — $4,200 remediation + 3-week delay
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-xs text-neutral-400">Risk score</p>
            <p className="text-lg font-semibold text-red-600">{deal.riskScore}</p>
          </div>
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-xs text-neutral-400">Stage</p>
            <p className="text-lg font-semibold capitalize text-neutral-900">
              {deal.stage}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Diligence checklist
          </p>
          <ul className="space-y-2">
            {deal.checklist.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 px-3 py-2 text-sm"
              >
                <span className={item.done ? "text-neutral-400 line-through" : "text-neutral-900"}>
                  {item.label}
                </span>
                <span
                  className={`shrink-0 text-xs font-medium ${item.done ? "text-emerald-600" : "text-amber-600"}`}
                >
                  {item.done ? "Done" : item.owner}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ShowcaseFrame>
  );
}
