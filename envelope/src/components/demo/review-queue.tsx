"use client";

import { useState } from "react";
import { failureModeLabel, skus as initialSkus } from "@/lib/mock-data";
import type { SkuRecord } from "@/lib/types";
import { VerdictBadge } from "@/components/status-badge";

export function ReviewQueue() {
  const [queue, setQueue] = useState<SkuRecord[]>(
    initialSkus.filter((s) => s.verdict !== "pass"),
  );
  const [selectedId, setSelectedId] = useState(queue[0]?.id ?? null);
  const selected = queue.find((s) => s.id === selectedId) ?? null;

  function decide(id: string, action: "accept" | "exception") {
    setQueue((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setSelectedId(next[0]?.id ?? null);
      return next;
    });
    void action;
  }

  if (queue.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="font-semibold text-emerald-800">Queue clear</p>
        <p className="mt-1 text-sm text-emerald-700">
          All flagged SKUs reviewed. Ready for go / no-go.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm lg:col-span-2">
        <div className="border-b border-stone-100 px-4 py-3">
          <p className="text-sm font-semibold text-stone-900">
            {queue.length} flagged
          </p>
        </div>
        <ul className="max-h-[520px] divide-y divide-stone-100 overflow-auto">
          {queue.map((sku) => (
            <li key={sku.id}>
              <button
                type="button"
                onClick={() => setSelectedId(sku.id)}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  selectedId === sku.id ? "bg-amber-50" : "hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-stone-400">
                    {sku.sku}
                  </span>
                  <VerdictBadge verdict={sku.verdict} />
                </div>
                <p className="mt-1 text-sm font-medium text-stone-900">{sku.name}</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {(sku.predictedPickRate * 100).toFixed(0)}% predicted
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-stone-400">{selected.sku}</p>
              <h3 className="mt-1 text-lg font-semibold text-stone-900">
                {selected.name}
              </h3>
            </div>
            <VerdictBadge verdict={selected.verdict} />
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ["Category", selected.category],
              ["Packaging", selected.packaging],
              ["Dimensions", selected.dimensions],
              ["Weight", `${selected.weightG} g`],
              ["Predicted pick rate", `${(selected.predictedPickRate * 100).toFixed(0)}%`],
              ["Confidence", `${(selected.confidence * 100).toFixed(0)}%`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">
                  {k}
                </dt>
                <dd className="mt-1 text-sm font-medium text-stone-900">{v}</dd>
              </div>
            ))}
          </dl>

          {selected.failureMode && (
            <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Failure mode
              </p>
              <p className="mt-1 text-sm font-medium text-red-900">
                {failureModeLabel[selected.failureMode] ?? selected.failureMode}
              </p>
              {selected.mitigation && (
                <p className="mt-2 text-sm text-red-800">{selected.mitigation}</p>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => decide(selected.id, "accept")}
              className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800"
            >
              Accept risk & ship
            </button>
            <button
              type="button"
              onClick={() => decide(selected.id, "exception")}
              className="rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Route to exception lane
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
