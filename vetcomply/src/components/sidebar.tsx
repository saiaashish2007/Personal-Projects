"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Code2,
  LayoutDashboard,
  Shield,
  UserCheck,
} from "lucide-react";
import { organization } from "@/lib/resolve-data";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/demo", label: "Overview", icon: LayoutDashboard },
  { href: "/demo/roster-jobs", label: "Roster jobs", icon: ClipboardList },
  { href: "/demo/review", label: "Review queue", icon: UserCheck },
  { href: "/demo/entities", label: "Entities", icon: Building2 },
  { href: "/demo/developers", label: "Developers", icon: Code2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-white">
      <div className="border-b border-slate-800 px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">VetComply</p>
            <p className="text-xs text-slate-400">Entity resolution</p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-800 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Organization
        </p>
        <p className="mt-1 text-sm font-medium">{organization.name}</p>
        <p className="text-xs text-slate-400">
          {organization.apiCallsThisWeek.toLocaleString()} API calls this week
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
                  ? "bg-teal-500/15 text-teal-300"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {label === "Review queue" && organization.pendingReviews > 0 && (
                <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  {organization.pendingReviews}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-5 py-4">
        <Link
          href="/"
          className="mb-3 block text-xs font-medium text-slate-400 hover:text-white"
        >
          ← Back to website
        </Link>
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Demo mode — interactive mock resolution engine
        </p>
      </div>
    </aside>
  );
}
