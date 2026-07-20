const rows = [
  {
    feature: "SKU-level prediction",
    manual: "Sample only",
    sim: "Physics approx.",
    fleet: "Post-hoc",
    envelope: "Full catalog",
  },
  {
    feature: "Uses real telemetry",
    manual: "No",
    sim: "No",
    fleet: "Dashboards only",
    envelope: "Native",
  },
  {
    feature: "Catalog pre-screening",
    manual: "No",
    sim: "Slow",
    fleet: "No",
    envelope: "Built-in",
  },
  {
    feature: "Failure mode + mitigation",
    manual: "Tribal",
    sim: "Generic",
    fleet: "Alerts only",
    envelope: "Playbooks",
  },
  {
    feature: "Pre-SLA sales tool",
    manual: "No",
    sim: "Rarely",
    fleet: "No",
    envelope: "Yes",
  },
];

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-3 font-medium text-neutral-500">Capability</th>
            <th className="px-4 py-3 font-medium text-neutral-500">Manual testing</th>
            <th className="px-4 py-3 font-medium text-neutral-500">Simulation</th>
            <th className="px-4 py-3 font-medium text-neutral-500">Fleet dashboards</th>
            <th className="px-4 py-3 font-semibold text-neutral-900">Envelope</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={row.feature}>
              <td className="px-4 py-3 font-medium text-neutral-800">
                {row.feature}
              </td>
              <td className="px-4 py-3 text-neutral-500">{row.manual}</td>
              <td className="px-4 py-3 text-neutral-500">{row.sim}</td>
              <td className="px-4 py-3 text-neutral-500">{row.fleet}</td>
              <td className="px-4 py-3 font-semibold text-amber-800">
                {row.envelope}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
