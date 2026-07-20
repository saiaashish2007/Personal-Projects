"use client";

import { useMemo, useState } from "react";
import { skus } from "@/lib/mock-data";
import type { SkuVerdict } from "@/lib/types";
import { VerdictBadge } from "@/components/status-badge";

const filters: Array<"all" | SkuVerdict> = ["all", "pass", "marginal", "fail"];

export function SkuExplorer() {
  const [filter, setFilter] = useState<"all" | SkuVerdict>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return skus.filter((s) => {
      if (filter !== "all" && s.verdict !== filter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        s.sku.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.packaging.toLowerCase().includes(q)
      );
    });
  }, [filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SKU, name, packaging…"
          className="min-w-[220px] flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
        <div className="flex gap-1 rounded-lg border border-stone-200 bg-white p-1">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                filter === f
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 text-stone-500">
            <tr>
              <th className="px-5 py-3 font-medium">SKU</th>
              <th className="px-5 py-3 font-medium">Packaging</th>
              <th className="px-5 py-3 font-medium">Pick rate</th>
              <th className="px-5 py-3 font-medium">Confidence</th>
              <th className="px-5 py-3 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((sku) => (
              <tr key={sku.id} className="hover:bg-stone-50/80">
                <td className="px-5 py-3">
                  <p className="font-mono text-xs text-stone-400">{sku.sku}</p>
                  <p className="font-medium text-stone-900">{sku.name}</p>
                </td>
                <td className="px-5 py-3 text-stone-600">{sku.packaging}</td>
                <td className="px-5 py-3 font-medium text-stone-900">
                  {(sku.predictedPickRate * 100).toFixed(0)}%
                </td>
                <td className="px-5 py-3 text-stone-600">
                  {(sku.confidence * 100).toFixed(0)}%
                </td>
                <td className="px-5 py-3">
                  <VerdictBadge verdict={sku.verdict} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-stone-500">
            No SKUs match this filter.
          </p>
        )}
      </div>
    </div>
  );
}
