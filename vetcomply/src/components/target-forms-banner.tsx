import { ArrowRight, FileText, Sparkles } from "lucide-react";
import { targetForms } from "@/lib/forms-data";

export function TargetFormsBanner() {
  const agentReady = targetForms.filter((f) => f.agentCapable);

  return (
    <section className="overflow-hidden rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white shadow-sm">
      <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Compliance Agent (v2)</h3>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Pre-fills DEA renewals, biennial inventories, Form 106, ownership changes,
              and M&A diligence packets from your registry — not just document storage.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {agentReady.map((form) => (
                <span
                  key={form.id}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                >
                  <FileText className="h-3 w-3 text-teal-600" />
                  {form.code}
                </span>
              ))}
            </div>
          </div>
        </div>
        <a
          href="#compliance-agent"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
        >
          Try Compliance Agent
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
