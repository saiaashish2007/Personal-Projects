import { StatusBadge } from "@/components/status-badge";
import { clinics } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

export default function LocationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">All locations</h2>
        <p className="mt-1 text-sm text-slate-500">
          Compliance status per clinic — DEA, state board licenses, and controlled
          substance logs.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Clinic</th>
              <th className="px-5 py-3 font-medium">Location</th>
              <th className="px-5 py-3 font-medium">Acquired</th>
              <th className="px-5 py-3 font-medium">DEA #</th>
              <th className="px-5 py-3 font-medium">DEA expires</th>
              <th className="px-5 py-3 font-medium">DEA</th>
              <th className="px-5 py-3 font-medium">License</th>
              <th className="px-5 py-3 font-medium">CS logs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clinics.map((clinic) => (
              <tr key={clinic.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{clinic.name}</td>
                <td className="px-5 py-3 text-slate-600">
                  {clinic.city}, {clinic.state}
                </td>
                <td className="px-5 py-3 text-slate-600">{formatDate(clinic.acquiredAt)}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-600">
                  {clinic.deaNumber}
                </td>
                <td className="px-5 py-3 text-slate-600">{formatDate(clinic.deaExpires)}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={clinic.deaStatus} />
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={clinic.stateLicenseStatus} />
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={clinic.csLogStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
