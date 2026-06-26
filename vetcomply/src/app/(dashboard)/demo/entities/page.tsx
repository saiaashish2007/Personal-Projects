import { EntityExplorer } from "@/components/demo/entity-explorer";

export default function EntitiesPage() {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Entity explorer</h2>
        <p className="mt-1 text-sm text-slate-500">
          Canonical providers and clinics with DEA, license links, and acquisition provenance.
        </p>
      </div>
      <EntityExplorer />
    </div>
  );
}
