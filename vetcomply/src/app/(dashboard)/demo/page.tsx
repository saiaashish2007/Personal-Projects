import Link from "next/link";
import { ComplianceAgent } from "@/components/compliance-agent";
import { StatCard } from "@/components/stat-card";
import { TargetFormsBanner } from "@/components/target-forms-banner";
import { SeverityBadge, StatusBadge } from "@/components/status-badge";
import { alerts, clinics, metrics, acquisitions } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

export default function OverviewPage() {
  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const atRiskClinics = clinics.filter(
    (c) =>
      c.deaStatus !== "compliant" ||
      c.stateLicenseStatus !== "compliant" ||
      c.csLogStatus !== "compliant",
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-900">Portfolio health</h2>
        <p className="mt-1 text-sm text-slate-500">
          Single source of truth for DEA registrations, state licenses, and
          controlled substance compliance across all locations.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Compliant locations"
            value={metrics.compliantLocations}
            hint={`of ${metrics.compliantLocations + metrics.atRiskLocations} active`}
            variant="success"
          />
          <StatCard
            label="At-risk locations"
            value={metrics.atRiskLocations}
            hint="Renewal or log gaps"
            variant="warning"
          />
          <StatCard
            label="Expired items"
            value={metrics.expiredItems}
            hint="DEA, licenses, or logs"
            variant="danger"
          />
          <StatCard
            label="Renewals due (30d)"
            value={metrics.renewalsDue30Days}
            hint="Across all states"
          />
        </div>
      </section>

      <TargetFormsBanner />

      <section id="compliance-agent">
        <ComplianceAgent />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Critical alerts</h3>
            <Link href="/demo/alerts" className="text-sm font-medium text-teal-600 hover:text-teal-700">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {criticalAlerts.map((alert) => (
              <li key={alert.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <SeverityBadge severity={alert.severity} />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{alert.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Acquisition pipeline</h3>
            <Link
              href="/demo/acquisitions"
              className="text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              View diligence
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {acquisitions.map((deal) => (
              <li key={deal.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{deal.targetName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {deal.locations} clinics · Close {formatDate(deal.closeDate)} ·{" "}
                      <span className="capitalize">{deal.stage}</span>
                    </p>
                  </div>
                  <span
                    className={
                      deal.riskScore >= 60
                        ? "text-sm font-semibold text-red-600"
                        : deal.riskScore >= 40
                          ? "text-sm font-semibold text-amber-600"
                          : "text-sm font-semibold text-emerald-600"
                    }
                  >
                    Risk {deal.riskScore}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            Avg. integration timeline: {metrics.avgIntegrationDays} days
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Locations needing attention</h3>
          <Link
            href="/demo/locations"
            className="text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            All locations
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Clinic</th>
                <th className="px-5 py-3 font-medium">State</th>
                <th className="px-5 py-3 font-medium">DEA</th>
                <th className="px-5 py-3 font-medium">State license</th>
                <th className="px-5 py-3 font-medium">CS logs</th>
                <th className="px-5 py-3 font-medium">Integration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {atRiskClinics.map((clinic) => (
                <tr key={clinic.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{clinic.name}</td>
                  <td className="px-5 py-3 text-slate-600">{clinic.state}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={clinic.deaStatus} />
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={clinic.stateLicenseStatus} />
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={clinic.csLogStatus} />
                  </td>
                  <td className="px-5 py-3 capitalize text-slate-600">
                    {clinic.integrationStatus.replace("_", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
