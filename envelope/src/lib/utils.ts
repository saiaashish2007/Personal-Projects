import { type ClassValue, clsx } from "clsx";
import type { SkuVerdict } from "./types";

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

export function verdictLabel(verdict: SkuVerdict): string {
  const labels: Record<SkuVerdict, string> = {
    pass: "Pass",
    marginal: "Marginal",
    fail: "Fail",
  };
  return labels[verdict];
}

export function verdictColor(verdict: SkuVerdict): string {
  const colors: Record<SkuVerdict, string> = {
    pass: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30",
    marginal: "bg-amber-500/15 text-amber-800 ring-amber-500/30",
    fail: "bg-red-500/15 text-red-700 ring-red-500/30",
  };
  return colors[verdict];
}
