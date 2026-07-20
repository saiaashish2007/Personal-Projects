"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Code2,
  LayoutDashboard,
  PackageSearch,
  Target,
} from "lucide-react";
import { organization } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/demo", label: "Overview", icon: LayoutDashboard },
  { href: "/demo/catalogs", label: "Catalog jobs", icon: Boxes },
  { href: "/demo/review", label: "Flagged SKUs", icon: AlertTriangle },
  { href: "/demo/skus", label: "SKU explorer", icon: PackageSearch },
  { href: "/demo/developers", label: "Developers", icon: Code2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-950 text-white">
      <div className="border-b border-stone-800 px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500">
            <Target className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Envelope</p>
            <p className="text-xs text-stone-400">Stress scoring</p>
          </div>
        </div>
      </div>

      <div className="border-b border-stone-800 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-stone-500">
          Organization
        </p>
        <p className="mt-1 text-sm font-medium">{organization.name}</p>
        <p className="text-xs text-stone-400">
          {organization.skusScoredThisWeek.toLocaleString()} SKUs scored this week
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/demo" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-amber-500/15 text-amber-300"
                  : "text-stone-400 hover:bg-stone-900 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {label === "Flagged SKUs" && organization.pendingReviews > 0 && (
                <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  {organization.pendingReviews}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-stone-800 px-5 py-4">
        <Link
          href="/"
          className="mb-3 block text-xs font-medium text-stone-400 hover:text-white"
        >
          ← Back to website
        </Link>
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Demo mode — interactive mock scoring engine
        </p>
      </div>
    </aside>
  );
}
