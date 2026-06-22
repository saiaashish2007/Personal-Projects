import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "danger" | "warning" | "success";
}

export function StatCard({
  label,
  value,
  hint,
  variant = "default",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-5 shadow-sm",
        variant === "danger" && "border-red-200",
        variant === "warning" && "border-amber-200",
        variant === "success" && "border-emerald-200",
      )}
    >
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tracking-tight",
          variant === "danger" && "text-red-700",
          variant === "warning" && "text-amber-700",
          variant === "success" && "text-emerald-700",
          variant === "default" && "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
