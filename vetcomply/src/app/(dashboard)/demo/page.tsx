import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { metrics, organization, rosterJobs } from "@/lib/resolve-data";

export default function DemoOverviewPage() {
  const activeJobs = rosterJobs.filter(
    (j) => j.status === "processing" || j.status === "queued",
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-900">Resolution health</h2>
        <p className="mt-1 text-sm text-slate-500">
          Entity resolution across acquisition rosters and onboarding batches for{" "}
          {organization.name}.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Resolve calls (7d)"
            value={metrics.resolveCallsThisWeek.toLocaleString()}
            hint="API + MCP"
          />
          <StatCard
            label="Auto-match rate"
            value={`${metrics.autoMatchRate}%`}
            hint="Above 0.92 threshold"
            variant="success"
          />
          <StatCard
            label="Pending review"
            value={metrics.pendingReviews}
            hint="Low-confidence matches"
            variant="warning"
          />
          <StatCard
            label="Canonical entities"
            value={metrics.canonicalEntities.toLocaleString()}
            hint={`Avg confidence ${(metrics.avgConfidence * 100).toFixed(0)}%`}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Active roster jobs</h3>
          <Link
            href="/demo/roster-jobs"
            className="text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            Upload roster
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {rosterJobs.slice(0, 3).map((job) => {
            const pct = Math.round((job.resolvedRecords / job.totalRecords) * 100);
            return (
              <li key={job.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{job.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {job.resolvedRecords} / {job.totalRecords} resolved · {job.reviewCount}{" "}
                      need review
                    </p>
                  </div>
                  <span
                    className={
                      job.status === "completed"
                        ? "text-sm font-semibold text-emerald-600"
                        : "text-sm font-semibold text-blue-600"
                    }
                  >
                    {pct}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Link
          href="/demo/review"
          className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
        >
          <h3 className="font-semibold text-slate-900">Review queue</h3>
          <p className="mt-2 text-sm text-slate-500">
            {metrics.pendingReviews} low-confidence matches waiting for human approval.
            Confirm or reject with field-level explanations.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 group-hover:gap-2 transition-all">
            Open queue
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/demo/entities"
          className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
        >
          <h3 className="font-semibold text-slate-900">Entity explorer</h3>
          <p className="mt-2 text-sm text-slate-500">
            Browse {metrics.canonicalEntities.toLocaleString()} canonical providers and clinics
            with linked DEA, licenses, and acquisition sources.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 group-hover:gap-2 transition-all">
            Browse entities
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/demo/roster-jobs"
          className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
        >
          <h3 className="font-semibold text-slate-900">Roster jobs</h3>
          <p className="mt-2 text-sm text-slate-500">
            Upload acquisition CSVs, track resolve progress, and download structured entity
            output.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 group-hover:gap-2 transition-all">
            Manage jobs
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/demo/developers"
          className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
        >
          <h3 className="font-semibold text-slate-900">Developers</h3>
          <p className="mt-2 text-sm text-slate-500">
            API keys, MCP configuration for Cursor/Claude, and auditable request logs.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 group-hover:gap-2 transition-all">
            API & MCP
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>

      {activeJobs.length > 0 && (
        <p className="text-sm text-blue-600">
          {activeJobs.length} job processing — Heritage Animal Clinics at{" "}
          {Math.round(
            (activeJobs[0].resolvedRecords / activeJobs[0].totalRecords) * 100,
          )}
          %
        </p>
      )}
    </div>
  );
}
