import { ShowcaseFrame } from "@/components/marketing/showcase-frame";

export function RosterResolveShowcase() {
  return (
    <ShowcaseFrame title="Roster jobs" subtitle="Sunset Vet Group acquisition" badge="CSV ingest">
      <div className="p-5 space-y-4">
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center">
          <p className="text-sm font-medium text-neutral-700">deal_room_export.csv</p>
          <p className="mt-1 text-xs text-neutral-400">847 rows · 6 columns</p>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Resolving entities…</span>
            <span>91%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full w-[91%] rounded-full bg-teal-500" />
          </div>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="text-emerald-600 font-medium">771 auto-resolved</span>
          <span className="text-neutral-500">76 → review queue</span>
        </div>
      </div>
    </ShowcaseFrame>
  );
}
