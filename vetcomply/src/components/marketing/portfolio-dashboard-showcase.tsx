import { alerts, clinics, metrics, organization } from "@/lib/mock-data";
import { ShowcaseFrame } from "./showcase-frame";

const statusStyles = {
  compliant: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  at_risk: "bg-amber-50 text-amber-700 ring-amber-600/20",
  expired: "bg-red-50 text-red-700 ring-red-600/20",
  pending: "bg-slate-100 text-slate-600 ring-slate-500/20",
} as const;

export function PortfolioDashboardShowcase({ compact = false }: { compact?: boolean }) {
  const criticalAlerts = alerts.filter((a) => a.severity === "critical").slice(0, 2);
  const atRiskClinics = clinics.filter((c) => c.deaStatus !== "compliant").slice(0, 4);

  return (
    <ShowcaseFrame
      title={`${organization.name} · Command Center`}
      subtitle="Portfolio compliance overview"
    >
      <div className={compact ? "p-4" : "p-5 md:p-6"}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Compliant locations", value: metrics.compliantLocations, tone: "text-emerald-600" },
            { label: "At-risk locations", value: metrics.atRiskLocations, tone: "text-amber-600" },
            { label: "Expired items", value: metrics.expiredItems, tone: "text-red-600" },
            { label: "Renewals due (30d)", value: metrics.renewalsDue30Days, tone: "text-neutral-900" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-neutral-100 bg-neutral-50 p-3 md:p-4"
            >
              <p className={`text-2xl font-semibold tabular-nums ${stat.tone}`}>
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-neutral-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {!compact && (
          <>
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Critical alerts
              </p>
              <div className="space-y-2">
                {criticalAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-neutral-900">{alert.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{alert.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-neutral-100 text-xs uppercase tracking-wider text-neutral-400">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Clinic</th>
                    <th className="pb-2 pr-4 font-medium">State</th>
                    <th className="pb-2 pr-4 font-medium">DEA</th>
                    <th className="pb-2 font-medium">CS logs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {atRiskClinics.map((clinic) => (
                    <tr key={clinic.id}>
                      <td className="py-2.5 pr-4 font-medium text-neutral-900">
                        {clinic.name}
                      </td>
                      <td className="py-2.5 pr-4 text-neutral-500">{clinic.state}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles[clinic.deaStatus]}`}
                        >
                          {clinic.deaStatus.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles[clinic.csLogStatus]}`}
                        >
                          {clinic.csLogStatus.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </ShowcaseFrame>
  );
}
