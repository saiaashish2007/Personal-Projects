import { ShowcaseFrame } from "./showcase-frame";

export function CatalogScoreShowcase() {
  const steps = [
    { n: "01", label: "Ingest catalog", detail: "CSV / WMS export" },
    { n: "02", label: "Map attributes", detail: "Size, pack, material" },
    { n: "03", label: "Score vs envelope", detail: "4,820 SKUs · 14 min" },
    { n: "04", label: "Export go/no-go", detail: "99 fails flagged" },
  ];

  return (
    <ShowcaseFrame title="envelope.app / catalog job">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            Stord — Dallas DC catalog
          </p>
          <p className="text-xs text-neutral-500">Apex-Arm V3 · Site Dallas</p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          Completed
        </span>
      </div>
      <div className="space-y-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-3"
          >
            <span className="font-mono text-xs font-semibold text-amber-700">
              {s.n}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-900">{s.label}</p>
              <p className="text-xs text-neutral-500">{s.detail}</p>
            </div>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        ))}
      </div>
    </ShowcaseFrame>
  );
}
