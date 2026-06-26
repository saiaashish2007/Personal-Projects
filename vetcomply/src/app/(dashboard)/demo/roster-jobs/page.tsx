import { RosterJobsPanel } from "@/components/demo/roster-jobs-panel";

export default function RosterJobsPage() {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Roster jobs</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ingest messy acquisition or onboarding rosters and resolve them to canonical regulatory
          entities.
        </p>
      </div>
      <RosterJobsPanel />
    </div>
  );
}
