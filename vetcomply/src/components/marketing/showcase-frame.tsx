import { cn } from "@/lib/utils";

export function ShowcaseFrame({
  title,
  subtitle,
  badge,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl shadow-neutral-200/40",
        className,
      )}
    >
      {(title || badge) && (
        <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-3">
          <div>
            {title && (
              <p className="text-xs font-medium text-neutral-500">{title}</p>
            )}
            {subtitle && (
              <p className="text-sm font-semibold text-neutral-900">{subtitle}</p>
            )}
          </div>
          {badge && (
            <span className="rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
