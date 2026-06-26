"use client";

import { useCallback, useState } from "react";
import { ArrowLeftRight, CheckCircle2, XCircle } from "lucide-react";
import { reviewQueue as initialQueue } from "@/lib/resolve-data";
import type { MatchCandidate } from "@/lib/resolve-types";
import { cn } from "@/lib/utils";

function ConfidenceBadge({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
        value >= 0.7 && "bg-amber-50 text-amber-800",
        value >= 0.5 && value < 0.7 && "bg-orange-50 text-orange-800",
        value < 0.5 && "bg-red-50 text-red-800",
      )}
    >
      {(value * 100).toFixed(0)}% confidence
    </span>
  );
}

function MatchCard({
  item,
  onConfirm,
  onReject,
}: {
  item: MatchCandidate;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [showExplain, setShowExplain] = useState(false);

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-400">{item.rosterJobName}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {item.entityType}
            </p>
          </div>
          <ConfidenceBadge value={item.confidence} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-400">Source record</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{item.sourceLabel}</p>
            <p className="mt-0.5 text-xs text-slate-500">{item.sourceDetail}</p>
          </div>
          <ArrowLeftRight className="h-4 w-4 shrink-0 text-slate-300" />
          <div className="flex-1 rounded-lg border border-teal-100 bg-teal-50/50 px-4 py-3">
            <p className="text-xs font-medium text-teal-600">Canonical match</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{item.targetLabel}</p>
            <p className="mt-0.5 text-xs text-slate-500">{item.targetDetail}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowExplain((v) => !v)}
          className="mt-3 text-sm font-medium text-teal-600 hover:text-teal-700"
        >
          {showExplain ? "Hide" : "Explain match"} →
        </button>

        {showExplain && (
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Field breakdown
            </p>
            <ul className="mt-3 space-y-2">
              {item.fieldScores.map((fs) => (
                <li key={fs.field} className="flex items-center justify-between gap-4 text-sm">
                  <span className="capitalize text-slate-600">{fs.field}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${fs.score * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-xs text-slate-700">
                      {(fs.score * 100).toFixed(0)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {item.fieldScores.some((f) => f.note) && (
              <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3">
                {item.fieldScores
                  .filter((f) => f.note)
                  .map((f) => (
                    <li key={f.field} className="text-xs text-slate-500">
                      <span className="capitalize font-medium">{f.field}:</span> {f.note}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex border-t border-slate-100">
        <button
          type="button"
          onClick={() => onConfirm(item.id)}
          className="flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          <CheckCircle2 className="h-4 w-4" />
          Confirm match
        </button>
        <div className="w-px bg-slate-100" />
        <button
          type="button"
          onClick={() => onReject(item.id)}
          className="flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <XCircle className="h-4 w-4" />
          Different entity
        </button>
      </div>
    </li>
  );
}

export function ReviewQueue() {
  const [queue, setQueue] = useState<MatchCandidate[]>(
    () => initialQueue.filter((q) => q.decision === "pending"),
  );
  const [resolved, setResolved] = useState<{ id: string; action: "confirmed" | "rejected" }[]>([]);

  const handleConfirm = useCallback((id: string) => {
    setQueue((q) => q.filter((item) => item.id !== id));
    setResolved((r) => [...r, { id, action: "confirmed" }]);
  }, []);

  const handleReject = useCallback((id: string) => {
    setQueue((q) => q.filter((item) => item.id !== id));
    setResolved((r) => [...r, { id, action: "rejected" }]);
  }, []);

  const confirmed = resolved.filter((r) => r.action === "confirmed").length;
  const rejected = resolved.filter((r) => r.action === "rejected").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-800">
          {queue.length} pending review
        </span>
        {confirmed > 0 && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
            {confirmed} confirmed this session
          </span>
        )}
        {rejected > 0 && (
          <span className="rounded-full bg-red-50 px-3 py-1 font-medium text-red-700">
            {rejected} rejected this session
          </span>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-4 text-lg font-semibold text-slate-900">Queue cleared</p>
          <p className="mt-2 text-sm text-slate-600">
            All low-confidence matches reviewed. High-confidence resolutions were auto-linked.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {queue.map((item) => (
            <MatchCard
              key={item.id}
              item={item}
              onConfirm={handleConfirm}
              onReject={handleReject}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
