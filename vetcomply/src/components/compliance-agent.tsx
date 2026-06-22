"use client";

import { useCallback, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { agentJobs, agentSteps, targetForms } from "@/lib/forms-data";
import { cn } from "@/lib/utils";

type AgentState = "idle" | "running" | "complete";

export function ComplianceAgent() {
  const [selectedFormId, setSelectedFormId] = useState("form-224a");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [completedSteps, setCompletedSteps] = useState(0);

  const selectedForm = targetForms.find((f) => f.id === selectedFormId)!;
  const job = agentJobs[selectedFormId];

  const runAgent = useCallback(() => {
    if (!selectedForm.agentCapable || !job) return;

    setAgentState("running");
    setCompletedSteps(0);

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      setCompletedSteps(step);
      if (step >= agentSteps.length) {
        clearInterval(interval);
        setAgentState("complete");
      }
    }, 650);
  }, [job, selectedForm.agentCapable]);

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Target forms</h2>
          <p className="mt-1 text-sm text-slate-500">
            Regulatory forms VetComply pre-fills from your portfolio registry — human
            reviews, then submits.
          </p>
        </div>

        <ul className="space-y-2">
          {targetForms.map((form) => (
            <li key={form.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedFormId(form.id);
                  setAgentState("idle");
                  setCompletedSteps(0);
                }}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                  selectedFormId === form.id
                    ? "border-teal-300 bg-teal-50 ring-1 ring-teal-200"
                    : "border-slate-200 bg-white hover:border-slate-300",
                  !form.agentCapable && "opacity-75",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{form.code}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{form.name}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      form.phase === "v2"
                        ? "bg-teal-100 text-teal-700"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {form.phase}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {form.description}
                </p>
                {form.agentCapable ? (
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-600">
                    <Sparkles className="h-3 w-3" />
                    Agent-ready
                  </span>
                ) : (
                  <span className="mt-2 text-xs text-slate-400">Roadmap</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4 xl:col-span-3">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white">Compliance Agent</p>
              <p className="text-xs text-slate-300">
                Pre-fill & package — you review and submit
              </p>
            </div>
          </div>

          <div className="p-5">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Selected form
              </p>
              <p className="mt-1 font-semibold text-slate-900">{selectedForm.code}</p>
              <p className="mt-1 text-sm text-slate-600">{selectedForm.submitNote}</p>
            </div>

            {!selectedForm.agentCapable ? (
              <div className="mt-5 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  Coming in v3 — state rules engine
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  50 state vet board portals — high moat, builds on v1 registry.
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={runAgent}
                  disabled={agentState === "running" || !job}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {agentState === "running" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Agent working…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate with Compliance Agent
                    </>
                  )}
                </button>

                {(agentState === "running" || agentState === "complete") && (
                  <ul className="mt-5 space-y-2">
                    {agentSteps.map((step, i) => {
                      const done = i < completedSteps;
                      const active =
                        agentState === "running" && i === completedSteps;
                      return (
                        <li
                          key={step}
                          className="flex items-center gap-3 text-sm text-slate-600"
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" />
                          ) : active ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                          )}
                          <span className={done ? "text-slate-900" : undefined}>{step}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {agentState === "complete" && job && (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{job.title}</p>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download PDF (demo)
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">Field</th>
                            <th className="px-4 py-2.5 font-medium">Pre-filled value</th>
                            <th className="px-4 py-2.5 font-medium">Source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {job.fields.map((field) => (
                            <tr
                              key={field.label}
                              className={field.needsReview ? "bg-amber-50/50" : undefined}
                            >
                              <td className="px-4 py-2.5 font-medium text-slate-900">
                                {field.label}
                                {field.needsReview ? (
                                  <span className="ml-2 text-[10px] font-semibold uppercase text-amber-600">
                                    Review
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-2.5 text-slate-700">{field.value}</td>
                              <td className="px-4 py-2.5 text-xs text-slate-500">
                                {field.source}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
                      <p className="text-sm text-teal-800">
                        <span className="font-semibold">Human-in-the-loop:</span> Compliance
                        manager reviews, then submits via official portal.
                      </p>
                      <button
                        type="button"
                        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-teal-700 ring-1 ring-teal-200 hover:bg-teal-50"
                      >
                        Mark reviewed & assign submitter
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
