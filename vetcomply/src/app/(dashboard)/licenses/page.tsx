import Link from "next/link";
import { Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { licenseRecords } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

const typeLabels: Record<string, string> = {
  dea_registration: "DEA registration",
  state_vet_license: "State vet license",
  controlled_substance: "Controlled substance",
  facility_permit: "Facility permit",
};

export default function LicensesPage() {
  const expiringSoon = licenseRecords.filter(
    (r) => r.daysUntilExpiry <= 60 && r.daysUntilExpiry >= 0,
  );
  const expired = licenseRecords.filter((r) => r.daysUntilExpiry < 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Licenses & DEA registry</h2>
          <p className="mt-1 text-sm text-slate-500">
            Renewal calendar across all locations — replaces spreadsheet tracking.
          </p>
        </div>
        <a
          href="/#compliance-agent"
          className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100"
        >
          <Sparkles className="h-4 w-4" />
          Pre-fill DEA Form 224a
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-medium text-red-800">Expired</p>
          <p className="mt-1 text-2xl font-semibold text-red-900">{expired.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-800">Expiring within 60 days</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{expiringSoon.length}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Clinic</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Identifier</th>
              <th className="px-5 py-3 font-medium">State</th>
              <th className="px-5 py-3 font-medium">Expires</th>
              <th className="px-5 py-3 font-medium">Days left</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {licenseRecords.map((record) => (
              <tr key={record.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{record.clinicName}</td>
                <td className="px-5 py-3 text-slate-600">{typeLabels[record.type]}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-600">
                  {record.identifier}
                </td>
                <td className="px-5 py-3 text-slate-600">{record.state}</td>
                <td className="px-5 py-3 text-slate-600">{formatDate(record.expires)}</td>
                <td
                  className={
                    record.daysUntilExpiry < 0
                      ? "px-5 py-3 font-medium text-red-600"
                      : record.daysUntilExpiry <= 30
                        ? "px-5 py-3 font-medium text-amber-600"
                        : "px-5 py-3 text-slate-600"
                  }
                >
                  {record.daysUntilExpiry < 0
                    ? `${Math.abs(record.daysUntilExpiry)}d overdue`
                    : `${record.daysUntilExpiry}d`}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={record.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
