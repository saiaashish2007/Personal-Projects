import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { catalogJobs, driftAlerts, metrics, organization } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

export default function DemoOverviewPage() {
  const activeJobs = catalogJobs.filter(
    (j) => j.status === "processing" || j.status === "queued",
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-stone-900">Rollout risk health</h2>
        <p className="mt-1 text-sm text-stone-500">
          SKU stress scoring across live sites for {organization.name} ({organization.robotModel}).
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="SKUs scored (7d)"
            value={metrics.skusScoredThisWeek.toLocaleString()}
            hint="Catalog + continuous"
          />
          <StatCard
            label="In-envelope rate"
            value={`${metrics.inEnvelopeRate}%`}
            hint={`Avg confidence ${(metrics.avgConfidence * 100).toFixed(0)}%`}
            variant="success"
          />
          <StatCard
            label="Pending review"
            value={metrics.pendingReviews}
            hint="Marginal + fail flags"
            variant="warning"
          />
          <StatCard
            label="Predicted fails"
            value={metrics.predictedFails}
            hint="Across active catalogs"
            variant="danger"
          />
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h3 className="font-semibold text-stone-900">Active catalog jobs</h3>
          <Link
            href="/demo/catalogs"
            className="text-sm font-medium text-amber-700 hover:text-amber-800"
          >
            Score catalog
          </Link>
        </div>
        <ul className="divide-y divide-stone-100">
          {catalogJobs.slice(0, 3).map((job) => {
            const pct =
              job.totalSkus === 0
                ? 0
                : Math.round((job.scoredSkus / job.totalSkus) * 100);
            return (
              <li key={job.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-stone-900">{job.name}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {job.scoredSkus.toLocaleString()} / {job.totalSkus.toLocaleString()}{" "}
                      scored · {job.failCount} fails · {job.marginalCount} marginal
                    </p>
                  </div>
                  <span
                    className={
                      job.status === "completed"
                        ? "text-sm font-semibold text-emerald-600"
                        : "text-sm font-semibold text-amber-700"
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

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-5 py-4">
          <h3 className="font-semibold text-stone-900">Condition drift alerts</h3>
        </div>
        <ul className="divide-y divide-stone-100">
          {driftAlerts.map((alert) => (
            <li key={alert.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-stone-900">
                    {alert.signal} · {alert.site}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">{alert.detail}</p>
                </div>
                <div className="text-right">
                  <span
                    className={
                      alert.severity === "critical"
                        ? "text-xs font-semibold uppercase text-red-600"
                        : alert.severity === "warning"
                          ? "text-xs font-semibold uppercase text-amber-700"
                          : "text-xs font-semibold uppercase text-stone-500"
                    }
                  >
                    {alert.severity}
                  </span>
                  <p className="mt-1 text-xs text-stone-400">
                    {formatDate(alert.detectedAt)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Link
          href="/demo/review"
          className="group rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition-colors hover:border-amber-200 hover:bg-amber-50/30"
        >
          <h3 className="font-semibold text-stone-900">Flagged SKUs</h3>
          <p className="mt-2 text-sm text-stone-500">
            {metrics.pendingReviews} SKUs need engineer review — failure modes and
            mitigation playbooks ready.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition-all group-hover:gap-2">
            Open queue
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/demo/skus"
          className="group rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition-colors hover:border-amber-200 hover:bg-amber-50/30"
        >
          <h3 className="font-semibold text-stone-900">SKU explorer</h3>
          <p className="mt-2 text-sm text-stone-500">
            Browse scored SKUs with predicted pick rates, packaging attributes, and
            verdicts.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition-all group-hover:gap-2">
            Browse SKUs
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/demo/catalogs"
          className="group rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition-colors hover:border-amber-200 hover:bg-amber-50/30"
        >
          <h3 className="font-semibold text-stone-900">Catalog jobs</h3>
          <p className="mt-2 text-sm text-stone-500">
            Upload a customer catalog, track scoring progress, and export go/no-go
            reports.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition-all group-hover:gap-2">
            Manage jobs
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/demo/developers"
          className="group rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition-colors hover:border-amber-200 hover:bg-amber-50/30"
        >
          <h3 className="font-semibold text-stone-900">Developers</h3>
          <p className="mt-2 text-sm text-stone-500">
            API keys, score endpoints, telemetry ingest, and request logs.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition-all group-hover:gap-2">
            API docs
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>

      {activeJobs.length > 0 && (
        <p className="text-sm text-amber-700">
          {activeJobs.length} job{activeJobs.length > 1 ? "s" : ""} in flight —{" "}
          {activeJobs[0].name} at{" "}
          {Math.round(
            (activeJobs[0].scoredSkus / Math.max(activeJobs[0].totalSkus, 1)) * 100,
          )}
          %
        </p>
      )}
    </div>
  );
}
