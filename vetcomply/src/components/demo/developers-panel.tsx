"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Key, Terminal } from "lucide-react";
import { apiKeys, mcpTools, requestLogs } from "@/lib/resolve-data";
import { MCP_CONFIG_SNIPPET } from "@/lib/resolve-types";
import { cn } from "@/lib/utils";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function DevelopersPanel() {
  const [activeTab, setActiveTab] = useState<"keys" | "mcp" | "logs">("keys");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
        {(
          [
            ["keys", "API keys"],
            ["mcp", "MCP setup"],
            ["logs", "Request logs"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "keys" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">API keys</h3>
            <p className="mt-1 text-sm text-slate-500">
              Use keys for REST or MCP. Keys are scoped to your organization.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {apiKeys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
                    <Key className="h-4 w-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{key.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{key.prefix}••••••••</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Last used {new Date(key.lastUsedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <CopyButton text={`${key.prefix}demo_secret_key`} />
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 px-5 py-3">
            <button
              type="button"
              className="text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              + Create new key
            </button>
          </div>
        </div>
      )}

      {activeTab === "mcp" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">Cursor / Claude Desktop config</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Connect your agents to VetComply MCP tools.
                </p>
              </div>
              <CopyButton text={MCP_CONFIG_SNIPPET} />
            </div>
            <pre className="overflow-x-auto bg-slate-950 p-5 text-xs leading-relaxed text-emerald-300">
              {MCP_CONFIG_SNIPPET}
            </pre>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold text-slate-900">Available MCP tools</h3>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {mcpTools.map((tool) => (
                <li key={tool.name} className="px-5 py-3">
                  <p className="font-mono text-sm font-medium text-slate-900">{tool.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{tool.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Request logs</h3>
            <p className="mt-1 text-sm text-slate-500">
              Every API and MCP call — auditable for diligence and compliance review.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">Tool</th>
                  <th className="px-5 py-3 font-medium">Method</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Request ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requestLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-900">{log.tool}</td>
                    <td className="px-5 py-3 text-slate-600">{log.method}</td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          log.status === 200 || log.status === 202
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700",
                        )}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{log.durationMs}ms</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">{log.requestId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
