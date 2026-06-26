const integrations = [
  "Cursor",
  "Claude Desktop",
  "ezyVet",
  "Workday",
  "NetSuite",
  "Dataco",
  "VDR exports",
  "REST API",
  "MCP",
  "Postman",
  "Shepherd",
  "IDEXX Neo",
];

export function IntegrationsMarquee() {
  const row = [...integrations, ...integrations];

  return (
    <div className="relative overflow-hidden border-y border-neutral-200 bg-neutral-50 py-8">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-neutral-50 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-neutral-50 to-transparent" />
      <div className="flex animate-marquee gap-12 whitespace-nowrap">
        {row.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="text-sm font-medium tracking-tight text-neutral-400"
          >
            {name}
          </span>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-2xl px-6 text-center text-sm text-neutral-500">
        VetComply ingests rosters from deal rooms, HR systems, and PIMS exports —
        and exposes resolution via REST API and MCP for your agents.
      </p>
    </div>
  );
}
