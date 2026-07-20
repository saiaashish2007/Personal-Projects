"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "#platform", label: "Platform" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Target className="h-5 w-5 text-neutral-900" strokeWidth={1.75} />
          <span className="text-base font-semibold tracking-tight text-neutral-900">
            Envelope
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm text-neutral-500 transition-colors hover:text-neutral-900"
            >
              {label}
            </a>
          ))}
          <a
            href="#contact"
            className="text-sm text-neutral-500 transition-colors hover:text-neutral-900"
          >
            Contact
          </a>
          <Link
            href="/demo"
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            View demo
          </Link>
        </nav>

        <button
          type="button"
          className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      <div
        className={cn(
          "border-t border-neutral-100 bg-white px-6 py-4 md:hidden",
          mobileOpen ? "block" : "hidden",
        )}
      >
        <nav className="flex flex-col gap-3">
          {[...navLinks, { href: "#contact", label: "Contact" }].map(
            ({ href, label }) => (
              <a
                key={href}
                href={href}
                className="text-sm text-neutral-600"
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </a>
            ),
          )}
          <Link
            href="/demo"
            className="text-sm font-medium text-neutral-900"
            onClick={() => setMobileOpen(false)}
          >
            View demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
