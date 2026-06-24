import { SeverityBadge } from "@/components/status-badge";
import { acquisitions } from "@/lib/mock-data";
import { cn, formatDate } from "@/lib/utils";

function stageColor(stage: string) {
  const colors: Record<string, string> = {
    diligence: "bg-purple-500/15 text-purple-700",
    loi: "bg-blue-500/15 text-blue-700",
    integration: "bg-teal-500/15 text-teal-700",
    closed: "bg-emerald-500/15 text-emerald-700",
  };
  return colors[stage] ?? "bg-slate-500/15 text-slate-700";
}

export default function AcquisitionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">M&A compliance diligence</h2>
        <p className="mt-1 text-sm text-slate-500">
          Track DEA and license gaps discovered during diligence — before they become
          post-close liabilities.
        </p>
      </div>

      <div className="space-y-6">
        {acquisitions.map((deal) => (
          <article
            key={deal.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{deal.targetName}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {deal.locations} locations · {deal.states.join(", ")} · Target close{" "}
                  {formatDate(deal.closeDate)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium capitalize",
                    stageColor(deal.stage),
                  )}
                >
                  {deal.stage}
                </span>
                <span
                  className={cn(
                    "text-lg font-semibold",
                    deal.riskScore >= 60
                      ? "text-red-600"
                      : deal.riskScore >= 40
                        ? "text-amber-600"
                        : "text-emerald-600",
                  )}
                >
                  Risk {deal.riskScore}
                </span>
              </div>
            </div>

            {deal.flags.length > 0 ? (
              <div className="border-b border-slate-100 px-6 py-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Diligence findings
                </p>
                <ul className="space-y-3">
                  {deal.flags.map((flag) => (
                    <li
                      key={flag.id}
                      className="flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-3"
                    >
                      <SeverityBadge severity={flag.severity} />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{flag.title}</p>
                        <p className="mt-0.5 text-sm text-slate-500">{flag.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="px-6 py-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Integration checklist
              </p>
              <ul className="space-y-2">
                {deal.checklist.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                          item.done
                            ? "bg-emerald-500 text-white"
                            : "border border-slate-300 text-transparent",
                        )}
                      >
                        ✓
                      </span>
                      <span
                        className={cn(
                          "text-sm",
                          item.done ? "text-slate-500 line-through" : "text-slate-900",
                        )}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.owner} · Due {formatDate(item.dueDate)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
