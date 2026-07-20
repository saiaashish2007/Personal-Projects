"use client";

import { useState } from "react";
import { catalogJobs as initialJobs } from "@/lib/mock-data";
import type { CatalogJob } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function CatalogJobsPanel() {
  const [jobs, setJobs] = useState<CatalogJob[]>(initialJobs);
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [scoring, setScoring] = useState(false);

  function startScore(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || scoring) return;
    setScoring(true);
    const id = `job_${Date.now()}`;
    const total = 800 + Math.floor(Math.random() * 2000);
    const newJob: CatalogJob = {
      id,
      name: name.trim(),
      customer: customer.trim() || "Prospect",
      site: "New site",
      status: "processing",
      totalSkus: total,
      scoredSkus: 0,
      passCount: 0,
      marginalCount: 0,
      failCount: 0,
      createdAt: new Date().toISOString(),
    };
    setJobs((prev) => [newJob, ...prev]);
    setName("");
    setCustomer("");

    let scored = 0;
    const tick = setInterval(() => {
      scored = Math.min(total, scored + Math.ceil(total / 8));
      const pass = Math.round(scored * 0.93);
      const fail = Math.round(scored * 0.02);
      const marginal = scored - pass - fail;
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? {
                ...j,
                scoredSkus: scored,
                passCount: pass,
                marginalCount: marginal,
                failCount: fail,
                status: scored >= total ? "completed" : "processing",
              }
            : j,
        ),
      );
      if (scored >= total) {
        clearInterval(tick);
        setScoring(false);
      }
    }, 400);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={startScore}
        className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <h3 className="font-semibold text-stone-900">Score a new catalog</h3>
        <p className="mt-1 text-sm text-stone-500">
          Demo: paste a job name to simulate scoring a customer SKU export.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Catalog name (e.g. Acme — Chicago DC)"
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Customer"
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <button
          type="submit"
          disabled={scoring || !name.trim()}
          className="mt-4 rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {scoring ? "Scoring…" : "Run score"}
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 text-stone-500">
            <tr>
              <th className="px-5 py-3 font-medium">Job</th>
              <th className="px-5 py-3 font-medium">Progress</th>
              <th className="px-5 py-3 font-medium">Pass / Marg / Fail</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {jobs.map((job) => {
              const pct =
                job.totalSkus === 0
                  ? 0
                  : Math.round((job.scoredSkus / job.totalSkus) * 100);
              return (
                <tr key={job.id}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-stone-900">{job.name}</p>
                    <p className="text-xs text-stone-500">
                      {job.customer} · {job.site}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      {job.scoredSkus.toLocaleString()} / {job.totalSkus.toLocaleString()}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-xs text-stone-600">
                    <span className="text-emerald-700">{job.passCount}</span>
                    {" / "}
                    <span className="text-amber-700">{job.marginalCount}</span>
                    {" / "}
                    <span className="text-red-700">{job.failCount}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={
                        job.status === "completed"
                          ? "text-xs font-semibold uppercase text-emerald-600"
                          : job.status === "processing"
                            ? "text-xs font-semibold uppercase text-amber-700"
                            : "text-xs font-semibold uppercase text-stone-500"
                      }
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-stone-500">
                    {formatDate(job.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
