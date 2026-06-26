"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { rosterJobs as initialJobs } from "@/lib/resolve-data";
import { SAMPLE_ROSTER_CSV } from "@/lib/resolve-types";
import type { RosterJob } from "@/lib/resolve-types";
import { cn } from "@/lib/utils";

function JobProgress({ job }: { job: RosterJob }) {
  const pct =
    job.totalRecords > 0
      ? Math.round((job.resolvedRecords / job.totalRecords) * 100)
      : 0;

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-slate-500">
        <span>
          {job.resolvedRecords} / {job.totalRecords} resolved
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            job.status === "completed" ? "bg-emerald-500" : "bg-teal-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RosterJob["status"] }) {
  const styles = {
    queued: "bg-slate-100 text-slate-700",
    processing: "bg-blue-50 text-blue-700",
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", styles[status])}>
      {status}
    </span>
  );
}

export function RosterJobsPanel() {
  const [jobs, setJobs] = useState<RosterJob[]>(initialJobs);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSample, setShowSample] = useState(false);

  const simulateUpload = useCallback((fileName: string) => {
    setUploading(true);
    setUploadProgress(0);

    const newJobId = `job-${Date.now()}`;
    const newJob: RosterJob = {
      id: newJobId,
      name: fileName.replace(/\.(csv|xlsx)$/i, ""),
      source: fileName,
      status: "processing",
      totalRecords: 0,
      resolvedRecords: 0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
    };

    setJobs((j) => [newJob, ...j]);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 8;
      setUploadProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);
        setUploading(false);
        setJobs((j) =>
          j.map((job) =>
            job.id === newJobId
              ? {
                  ...job,
                  status: "completed",
                  totalRecords: 156,
                  resolvedRecords: 147,
                  reviewCount: 9,
                  completedAt: new Date().toISOString(),
                }
              : job,
          ),
        );
      } else {
        setJobs((j) =>
          j.map((job) =>
            job.id === newJobId
              ? {
                  ...job,
                  totalRecords: 156,
                  resolvedRecords: Math.floor((progress / 100) * 147),
                  reviewCount: Math.floor((progress / 100) * 9),
                }
              : job,
          ),
        );
      }
    }, 200);
  }, []);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) simulateUpload(file.name);
      e.target.value = "";
    },
    [simulateUpload],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
            <Upload className="h-6 w-6 text-teal-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-900">Upload acquisition roster</h3>
          <p className="mt-2 text-sm text-slate-500">
            CSV or Excel from your deal room, HR system, or seller export.
          </p>

          {uploading ? (
            <div className="mx-auto mt-6 max-w-sm">
              <div className="flex items-center justify-center gap-2 text-sm text-teal-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Resolving entities… {uploadProgress}%
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                <FileSpreadsheet className="h-4 w-4" />
                Choose file
                <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={handleFile} />
              </label>
              <button
                type="button"
                onClick={() => simulateUpload("sample_acquisition.csv")}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Use sample roster
              </button>
              <button
                type="button"
                onClick={() => setShowSample((v) => !v)}
                className="text-sm font-medium text-teal-600 hover:text-teal-700"
              >
                {showSample ? "Hide" : "View"} sample format
              </button>
            </div>
          )}
        </div>

        {showSample && (
          <pre className="mt-6 overflow-x-auto rounded-lg bg-slate-950 p-4 text-left text-xs text-slate-300">
            {SAMPLE_ROSTER_CSV}
          </pre>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Roster jobs</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {jobs.map((job) => (
            <li key={job.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{job.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{job.source}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(job.createdAt).toLocaleString()}
                    {job.completedAt && ` · Completed ${new Date(job.completedAt).toLocaleTimeString()}`}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
              <JobProgress job={job} />
              {job.status === "completed" && (
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {job.resolvedRecords - job.reviewCount} auto-resolved
                  </span>
                  <span>{job.reviewCount} sent to review queue</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
