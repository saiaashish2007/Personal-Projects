import { type ClassValue, clsx } from "clsx";
import type { ComplianceStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function statusLabel(status: ComplianceStatus): string {
  const labels: Record<ComplianceStatus, string> = {
    compliant: "Compliant",
    at_risk: "At risk",
    expired: "Expired",
    pending: "Pending",
  };
  return labels[status];
}

export function statusColor(status: ComplianceStatus): string {
  const colors: Record<ComplianceStatus, string> = {
    compliant: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30",
    at_risk: "bg-amber-500/15 text-amber-800 ring-amber-500/30",
    expired: "bg-red-500/15 text-red-700 ring-red-500/30",
    pending: "bg-slate-500/15 text-slate-700 ring-slate-500/30",
  };
  return colors[status];
}

export function severityColor(severity: "critical" | "warning" | "info"): string {
  const colors = {
    critical: "bg-red-500/15 text-red-700 ring-red-500/30",
    warning: "bg-amber-500/15 text-amber-800 ring-amber-500/30",
    info: "bg-blue-500/15 text-blue-700 ring-blue-500/30",
  };
  return colors[severity];
}
