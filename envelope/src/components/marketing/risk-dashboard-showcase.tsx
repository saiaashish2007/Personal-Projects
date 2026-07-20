import { ShowcaseFrame } from "./showcase-frame";

export function RiskDashboardShowcase() {
  return (
    <ShowcaseFrame title="envelope.app / rollout risk">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "SKUs scored", value: "4,812" },
          { label: "In-envelope", value: "93.4%", tone: "ok" },
          { label: "Marginal", value: "218", tone: "warn" },
          { label: "Predicted fails", value: "99", tone: "bad" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-3"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              {s.label}
            </p>
            <p
              className={`mt-1 text-lg font-semibold tracking-tight ${
                s.tone === "ok"
                  ? "text-emerald-700"
                  : s.tone === "warn"
                    ? "text-amber-700"
                    : s.tone === "bad"
                      ? "text-red-700"
                      : "text-neutral-900"
              }`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-100">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 text-neutral-400">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Packaging</th>
              <th className="px-3 py-2 font-medium">Pick rate</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-700">
            {[
              ["ST-8821", "Poly bag", "61%", "Fail"],
              ["ST-2204", "Shrink wrap", "82%", "Marginal"],
              ["ST-1099", "Corrugated", "98%", "Pass"],
              ["ST-4410", "Chrome shrink", "54%", "Fail"],
            ].map(([sku, pkg, rate, verdict]) => (
              <tr key={sku}>
                <td className="px-3 py-2 font-mono text-[11px]">{sku}</td>
                <td className="px-3 py-2">{pkg}</td>
                <td className="px-3 py-2">{rate}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      verdict === "Pass"
                        ? "font-semibold text-emerald-600"
                        : verdict === "Marginal"
                          ? "font-semibold text-amber-600"
                          : "font-semibold text-red-600"
                    }
                  >
                    {verdict}
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
