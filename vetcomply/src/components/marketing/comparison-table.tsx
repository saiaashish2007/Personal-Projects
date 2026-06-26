const rows = [
  {
    feature: "Post-acquisition roster cleanup",
    vetcomply: "Upload CSV → auto-resolve with review queue",
    spreadsheets: "Manual matching across 3+ files",
    verifyApis: "Lookup by known ID only — no fuzzy match",
    consulting: "Junior staff at billable rates",
  },
  {
    feature: "Entity resolution",
    vetcomply: "Provider + clinic canonical graph with confidence scores",
    spreadsheets: "Duplicate rows, no graph",
    verifyApis: "One record per API call",
    consulting: "Thorough but not scalable",
  },
  {
    feature: "Explainability",
    vetcomply: "Field-level match breakdown + audit trail",
    spreadsheets: "No provenance",
    verifyApis: "Status JSON only",
    consulting: "Narrative in email",
  },
  {
    feature: "Agent integration",
    vetcomply: "MCP tools + REST — works with Cursor, internal bots",
    spreadsheets: "Not machine-callable",
    verifyApis: "REST only, no agent tools",
    consulting: "Human-only",
  },
  {
    feature: "Human review",
    vetcomply: "Stewardship queue for low-confidence matches",
    spreadsheets: "Informal escalation",
    verifyApis: "No review workflow",
    consulting: "Expert judgment, expensive",
  },
  {
    feature: "Time to resolve roster",
    vetcomply: "Minutes for 800+ rows",
    spreadsheets: "Days per acquisition",
    verifyApis: "Same manual prep work",
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
            <th className="px-4 py-4 font-medium text-neutral-500">Verify APIs</th>
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
              <td className="px-4 py-4 text-neutral-500">{row.verifyApis}</td>
              <td className="px-4 py-4 text-neutral-500">{row.consulting}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
