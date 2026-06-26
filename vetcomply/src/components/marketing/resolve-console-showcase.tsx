import { ShowcaseFrame } from "@/components/marketing/showcase-frame";
import { metrics, rosterJobs } from "@/lib/resolve-data";

export function ResolveConsoleShowcase() {
  const job = rosterJobs[0];
  const pct = Math.round((job.resolvedRecords / job.totalRecords) * 100);

  return (
    <ShowcaseFrame title="VetComply console" subtitle="Resolution health" badge="Live demo">
      <div className="p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["12.4k", "Resolve calls"],
            [`${metrics.autoMatchRate}%`, "Auto-match"],
            ["6", "Review queue"],
            ["1,842", "Entities"],
          ].map(([val, label]) => (
            <div key={label} className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3">
              <p className="text-lg font-semibold text-neutral-900">{val}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                {label}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-neutral-100 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-900">{job.name}</p>
            <span className="text-sm font-semibold text-emerald-600">{pct}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full w-[91%] rounded-full bg-emerald-500" />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {job.resolvedRecords} resolved · {job.reviewCount} need review
          </p>
        </div>
      </div>
    </ShowcaseFrame>
  );
}
