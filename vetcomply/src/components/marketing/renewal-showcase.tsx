import { licenseRecords } from "@/lib/mock-data";
import { ShowcaseFrame } from "./showcase-frame";

const expiring = licenseRecords
  .filter((r) => r.daysUntilExpiry <= 60 && r.daysUntilExpiry >= 0)
  .slice(0, 6);

export function RenewalShowcase() {
  return (
    <ShowcaseFrame title="Renewal calendar" subtitle="Licenses & DEA registry">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Clinic</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {expiring.map((record) => (
              <tr key={record.id} className="hover:bg-neutral-50/80">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {record.clinicName}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {record.type === "dea_registration" ? "DEA" : "State license"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                  {record.identifier}
                </td>
                <td className="px-4 py-3 text-neutral-600">{record.expires}</td>
                <td className="px-4 py-3">
                  <span
                    className={`font-semibold tabular-nums ${record.daysUntilExpiry <= 30 ? "text-amber-600" : "text-neutral-900"}`}
                  >
                    {record.daysUntilExpiry}d
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ShowcaseFrame>
  );
}
