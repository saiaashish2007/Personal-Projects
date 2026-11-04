import type { Trace } from "./types";

const STORAGE_KEY = "harbor-pine-traces";

function isTrace(value: unknown): value is Trace {
  if (!value || typeof value !== "object") return false;
  const trace = value as Trace;
  return (
    typeof trace.id === "string" &&
    typeof trace.startedAt === "string" &&
    Array.isArray(trace.steps) &&
    !!trace.before &&
    !!trace.after
  );
}

export function readStoredTraces(): Trace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTrace);
  } catch {
    return [];
  }
}

export function writeStoredTraces(traces: Trace[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(traces.slice(0, 30)));
}

export function mergeTraces(local: Trace[], remote: Trace[]): Trace[] {
  const map = new Map<string, Trace>();
  for (const trace of [...local, ...remote]) {
    if (isTrace(trace)) map.set(trace.id, trace);
  }
  return [...map.values()]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 30);
}
