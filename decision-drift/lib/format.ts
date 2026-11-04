import type { SourceKind } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMonthDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(match[3])}`;
}

export function formatFullDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${formatMonthDay(iso)}, ${match[1]}`;
}

export function kindLabel(kind: SourceKind): string {
  return kind === "slack" ? "Slack" : "Meeting";
}

export function byRecordOrder(
  a: { date: string; position: number; id: string },
  b: { date: string; position: number; id: string },
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.position !== b.position) return a.position - b.position;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
