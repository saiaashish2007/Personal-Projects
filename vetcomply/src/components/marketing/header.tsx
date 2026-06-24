"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "#about", label: "About" },
  { href: "#platform", label: "Platform" },
  { href: "#why-vetcomply", label: "Why VetComply" },
  { href: "#contact", label: "Contact" },
];

export function MarketingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            VetComply
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/demo"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
          >
            View demo
          </Link>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={cn(
          "border-t border-slate-100 bg-white px-6 py-4 md:hidden",
          mobileOpen ? "block" : "hidden",
        )}
      >
        <nav className="flex flex-col gap-3">
          {navLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-slate-600"
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </a>
          ))}
          <Link
            href="/demo"
            className="mt-2 rounded-lg bg-teal-600 px-4 py-2.5 text-center text-sm font-medium text-white"
            onClick={() => setMobileOpen(false)}
          >
            View demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
