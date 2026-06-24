import { SeverityBadge } from "@/components/status-badge";
import { alerts } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

const categoryLabels: Record<string, string> = {
  dea: "DEA",
  license: "State license",
  acquisition: "Acquisition",
  cs_log: "Controlled substance",
};

export default function AlertsPage() {
  const sorted = [...alerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Compliance alerts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Proactive notifications — expired DEAs, renewal deadlines, and diligence flags.
        </p>
      </div>

      <ul className="space-y-3">
        {sorted.map((alert) => (
          <li
            key={alert.id}
            className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start gap-3">
              <SeverityBadge severity={alert.severity} />
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {categoryLabels[alert.category]}
              </span>
              <span className="text-xs text-slate-400">{formatDate(alert.createdAt)}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-900">{alert.title}</p>
            <p className="mt-1 text-sm text-slate-500">{alert.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
