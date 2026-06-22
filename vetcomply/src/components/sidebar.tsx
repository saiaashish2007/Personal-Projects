"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Building2,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  Shield,
} from "lucide-react";
import { organization } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/locations", label: "Locations", icon: Building2 },
  { href: "/acquisitions", label: "Acquisitions", icon: ClipboardList },
  { href: "/licenses", label: "Licenses & DEA", icon: FileCheck2 },
  { href: "/agent", label: "Compliance Agent", icon: Bot },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
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
            <p className="text-xs text-slate-400">Compliance OS</p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-800 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Organization
        </p>
        <p className="mt-1 text-sm font-medium">{organization.name}</p>
        <p className="text-xs text-slate-400">
          {organization.locationCount} locations · {organization.statesActive} states
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
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
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-5 py-4">
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Demo mode — mock data for VC pitch
        </p>
      </div>
    </aside>
  );
}
