import { formatMonthDay, byRecordOrder } from "./format";
import { findClosestPriorDecision } from "./similarity";
import type { Decision } from "./types";

export type Drift = {
  id: string;
  summary: string;
  topic: string;
  similarity: number;
  earlier: Decision;
  later: Decision;
};

export function driftSummary(earlier: Decision, later: Decision): string {
  return `You decided ${earlier.shortLabel} on ${formatMonthDay(earlier.date)}, but ${later.shortLabel} on ${formatMonthDay(later.date)}.`;
}

export function detectDrifts(decisions: Decision[]): Drift[] {
  const ordered = [...decisions].sort(byRecordOrder);
  const drifts: Drift[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const later = ordered[index];
    const match = findClosestPriorDecision(later, ordered.slice(0, index));
    if (!match) continue;
    const earlier = match.decision;
    drifts.push({
      id: `drift_${earlier.id}_${later.id}`,
      summary: driftSummary(earlier, later),
      topic: later.topic,
      similarity: match.score,
      earlier,
      later,
    });
  }
  drifts.sort((a, b) => {
    if (a.later.date !== b.later.date) return a.later.date < b.later.date ? 1 : -1;
    if (a.earlier.date !== b.earlier.date) return a.earlier.date < b.earlier.date ? -1 : 1;
    return a.earlier.position - b.earlier.position;
  });
  return drifts;
}
