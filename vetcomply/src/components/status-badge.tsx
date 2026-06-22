import type { ComplianceStatus } from "@/lib/types";
import { cn, statusColor, statusLabel } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: ComplianceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        statusColor(status),
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function SeverityBadge({
  severity,
}: {
  severity: "critical" | "warning" | "info";
}) {
  const labels = { critical: "Critical", warning: "Warning", info: "Info" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        severity === "critical" && "bg-red-500/15 text-red-700 ring-red-500/30",
        severity === "warning" && "bg-amber-500/15 text-amber-800 ring-amber-500/30",
        severity === "info" && "bg-blue-500/15 text-blue-700 ring-blue-500/30",
      )}
    >
      {labels[severity]}
    </span>
  );
}
