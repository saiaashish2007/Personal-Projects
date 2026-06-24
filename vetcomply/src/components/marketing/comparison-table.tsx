const rows = [
  {
    feature: "Portfolio visibility",
    vetcomply: "127+ locations, 18 states — single command center",
    spreadsheets: "One spreadsheet per region, always stale",
    pims: "Per-clinic only — no roll-up view",
    consulting: "Quarterly snapshots at $300+/hr",
  },
  {
    feature: "DEA & license tracking",
    vetcomply: "Automated renewal calendar with alerts",
    spreadsheets: "Manual date tracking, missed renewals",
    pims: "Not designed for regulatory compliance",
    consulting: "Reactive — finds issues after expiry",
  },
  {
    feature: "M&A diligence",
    vetcomply: "Risk scoring, checklists, diligence packets",
    spreadsheets: "Email chains and shared drives",
    pims: "No acquisition workflow",
    consulting: "Thorough but slow and expensive",
  },
  {
    feature: "Form pre-fill",
    vetcomply: "Compliance Agent pre-fills DEA 224a, 106, inventory",
    spreadsheets: "Manual data entry per form",
    pims: "No regulatory form generation",
    consulting: "Junior staff at billable rates",
  },
  {
    feature: "Audit readiness",
    vetcomply: "Every field linked to source evidence",
    spreadsheets: "Error-prone cross-referencing",
    pims: "CS logs only — incomplete picture",
    consulting: "Holds up, priced accordingly",
  },
  {
    feature: "Time to resolve",
    vetcomply: "Minutes per renewal or diligence check",
    spreadsheets: "Days per clinic",
    pims: "Same manual compliance work",
    consulting: "Weeks per engagement",
  },
];

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-4 font-medium text-neutral-500" />
            <th className="px-4 py-4 font-semibold text-neutral-900">VetComply</th>
            <th className="px-4 py-4 font-medium text-neutral-500">Spreadsheets</th>
            <th className="px-4 py-4 font-medium text-neutral-500">Clinic PIMS</th>
            <th className="px-4 py-4 font-medium text-neutral-500">Consulting</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={row.feature} className="bg-white">
              <td className="px-4 py-4 font-medium text-neutral-900">{row.feature}</td>
              <td className="px-4 py-4 text-neutral-700">
                <span className="mr-1.5 text-emerald-600">✓</span>
                {row.vetcomply}
              </td>
              <td className="px-4 py-4 text-neutral-500">{row.spreadsheets}</td>
              <td className="px-4 py-4 text-neutral-500">{row.pims}</td>
              <td className="px-4 py-4 text-neutral-500">{row.consulting}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
