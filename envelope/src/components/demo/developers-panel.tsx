"use client";

import { useState } from "react";
import { apiLogs } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

export function DevelopersPanel() {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-stone-900">API key</h3>
        <p className="mt-1 text-sm text-stone-500">
          Use this key to call catalog scoring and envelope predict endpoints.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-stone-100 px-3 py-2 font-mono text-sm text-stone-800">
            {revealed
              ? "env_live_8f3a2c91b7e04d6a"
              : "env_live_••••••••••••••••"}
          </code>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-stone-900">Score a catalog</h3>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-stone-950 p-4 text-xs leading-relaxed text-stone-300">
          {`curl -X POST https://api.envelope.dev/v1/catalogs/score \\
  -H "Authorization: Bearer env_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "robot_id": "apex-arm-v3",
    "site_id": "dallas-dc",
    "catalog_url": "s3://customer/catalog.csv"
  }'`}
        </pre>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-5 py-4">
          <h3 className="font-semibold text-stone-900">Recent requests</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 text-stone-500">
            <tr>
              <th className="px-5 py-3 font-medium">Method</th>
              <th className="px-5 py-3 font-medium">Path</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Latency</th>
              <th className="px-5 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {apiLogs.map((log) => (
              <tr key={log.id}>
                <td className="px-5 py-3 font-mono text-xs text-stone-600">
                  {log.method}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-stone-800">
                  {log.path}
                </td>
                <td className="px-5 py-3 text-stone-700">{log.status}</td>
                <td className="px-5 py-3 text-stone-500">{log.latencyMs} ms</td>
                <td className="px-5 py-3 text-xs text-stone-500">
                  {formatDate(log.at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
