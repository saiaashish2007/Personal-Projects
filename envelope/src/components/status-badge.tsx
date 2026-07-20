import { cn, verdictColor, verdictLabel } from "@/lib/utils";
import type { SkuVerdict } from "@/lib/types";

export function VerdictBadge({ verdict }: { verdict: SkuVerdict }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        verdictColor(verdict),
      )}
    >
      {verdictLabel(verdict)}
    </span>
  );
}
