import { ShowcaseFrame } from "@/components/marketing/showcase-frame";

export function ReviewQueueShowcase() {
  return (
    <ShowcaseFrame title="Review queue" subtitle="Dr J. Smith → Jonathan Smith, DVM" badge="62%">
      <div className="p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3">
            <p className="text-[10px] font-medium uppercase text-neutral-400">Source</p>
            <p className="mt-1 text-sm font-medium text-neutral-900">Dr J. Smith</p>
            <p className="text-xs text-neutral-500">Sunrise Animal Hospital · CO</p>
          </div>
          <div className="rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-3">
            <p className="text-[10px] font-medium uppercase text-teal-600">Match</p>
            <p className="mt-1 text-sm font-medium text-neutral-900">Jonathan Smith, DVM</p>
            <p className="text-xs text-neutral-500">DEA AB1234567 · VET-88421</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {[
            ["name", 88],
            ["clinic", 71],
            ["dea", 100],
            ["state", 100],
          ].map(([field, score]) => (
            <div key={field as string} className="flex items-center gap-3 text-xs">
              <span className="w-12 capitalize text-neutral-500">{field}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-teal-500"
                  style={{ width: `${score}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-neutral-600">{score}%</span>
            </div>
          ))}
        </div>
      </div>
    </ShowcaseFrame>
  );
}
