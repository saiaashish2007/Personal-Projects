import { ShowcaseFrame } from "./showcase-frame";

export function FlaggedSkuShowcase() {
  return (
    <ShowcaseFrame title="envelope.app / flagged SKUs">
      <div className="space-y-3">
        {[
          {
            sku: "ST-8821",
            name: "Silicone spatula set",
            mode: "Deformable",
            rate: "61%",
            fix: "Route to soft-gripper cell",
          },
          {
            sku: "ST-4410",
            name: "Mirror compact (chrome)",
            mode: "Reflective",
            rate: "54%",
            fix: "Add matte sleeve before cell",
          },
          {
            sku: "SB-4420",
            name: "Screen protector kit",
            mode: "Size OOR",
            rate: "49%",
            fix: "Exception lane — too thin",
          },
        ].map((row) => (
          <div
            key={row.sku}
            className="rounded-xl border border-neutral-100 bg-neutral-50 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] text-neutral-400">{row.sku}</p>
                <p className="text-sm font-medium text-neutral-900">{row.name}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Failure mode:{" "}
                  <span className="font-medium text-red-600">{row.mode}</span>
                </p>
              </div>
              <span className="text-sm font-semibold text-red-600">{row.rate}</span>
            </div>
            <p className="mt-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-neutral-600 ring-1 ring-neutral-100">
              Mitigation: {row.fix}
            </p>
          </div>
        ))}
      </div>
    </ShowcaseFrame>
  );
}
