"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  Link2,
  User,
  X,
} from "lucide-react";
import { canonicalEntities } from "@/lib/resolve-data";
import type { CanonicalEntity, EntityType } from "@/lib/resolve-types";
import { cn } from "@/lib/utils";

function EntityIcon({ type }: { type: EntityType }) {
  return type === "provider" ? (
    <User className="h-4 w-4" />
  ) : (
    <Building2 className="h-4 w-4" />
  );
}

function EntityDetail({ entity, onClose }: { entity: CanonicalEntity; onClose: () => void }) {
  const linked = canonicalEntities.filter((e) => entity.linkedEntityIds.includes(e.id));

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
            {entity.type}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{entity.displayName}</h3>
          <p className="mt-1 text-sm text-slate-600">{entity.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {entity.deaNumber && (
          <div>
            <dt className="text-xs text-slate-500">DEA</dt>
            <dd className="font-mono text-sm font-medium text-slate-900">{entity.deaNumber}</dd>
          </div>
        )}
        {entity.licenseNumber && (
          <div>
            <dt className="text-xs text-slate-500">License</dt>
            <dd className="font-mono text-sm font-medium text-slate-900">{entity.licenseNumber}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-slate-500">State</dt>
          <dd className="text-sm font-medium text-slate-900">{entity.state}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Confidence</dt>
          <dd className="text-sm font-medium text-slate-900">
            {(entity.confidence * 100).toFixed(0)}%
          </dd>
        </div>
        {entity.acquisitionSource && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Acquisition source</dt>
            <dd className="text-sm font-medium text-slate-900">{entity.acquisitionSource}</dd>
          </div>
        )}
      </dl>

      {linked.length > 0 && (
        <div className="mt-5 border-t border-teal-200/60 pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Link2 className="h-3.5 w-3.5" />
            Linked entities
          </p>
          <ul className="mt-2 space-y-2">
            {linked.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700"
              >
                <EntityIcon type={e.type} />
                {e.displayName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function EntityExplorer() {
  const [filter, setFilter] = useState<"all" | EntityType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      filter === "all"
        ? canonicalEntities
        : canonicalEntities.filter((e) => e.type === filter),
    [filter],
  );

  const selected = canonicalEntities.find((e) => e.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
        {(
          [
            ["all", "All"],
            ["provider", "Providers"],
            ["clinic", "Clinics"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              filter === id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {selected && <EntityDetail entity={selected} onClose={() => setSelectedId(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
        {filtered.map((entity) => (
          <button
            key={entity.id}
            type="button"
            onClick={() => setSelectedId(entity.id)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  entity.type === "provider" ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600",
                )}
              >
                <EntityIcon type={entity.type} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{entity.displayName}</p>
                <p className="mt-0.5 text-sm text-slate-500">{entity.subtitle}</p>
                {entity.acquisitionSource && (
                  <p className="mt-1 text-xs text-slate-400">via {entity.acquisitionSource}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-medium text-slate-600">
                {(entity.confidence * 100).toFixed(0)}%
              </span>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
