const logos = [
  "WMS / ERP",
  "Robot telemetry",
  "AS/RS fleets",
  "AMR stacks",
  "3PL catalogs",
  "Pick-to-light",
  "Vision systems",
  "Fleet OS",
];

export function IntegrationsMarquee() {
  const items = [...logos, ...logos];
  return (
    <section className="overflow-hidden border-b border-neutral-200 bg-white py-12">
      <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-neutral-400">
        Plugs into the stack you already run
      </p>
      <div className="relative">
        <div className="animate-marquee flex w-max gap-10">
          {items.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="whitespace-nowrap text-sm font-medium text-neutral-400"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
