"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NAV, REPO_URL, SPEC_URL } from "@/lib/nav";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || pathname.replace(/\/$/, "") === href.replace(/\/$/, "");
}

export function SiteHeader({ placeholder }: { placeholder: boolean }) {
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur no-print">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-[88rem] items-center gap-4 px-5 py-3">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span className="font-serif text-[15px] font-semibold tracking-tight text-ink">
            Opportunistic Insider Alpha
          </span>
          <span className="hidden text-[11px] uppercase tracking-[0.14em] text-muted md:inline">
            CMP (2012), out of sample 2014–2025
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3 text-[13px]">
          {placeholder ? (
            <span className="hidden rounded border border-warn/40 bg-warn-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-warn sm:inline">
              Placeholder data
            </span>
          ) : null}
          <a
            className="hidden text-muted underline-offset-4 hover:text-ink hover:underline sm:inline"
            href={SPEC_URL}
            target="_blank"
            rel="noreferrer"
          >
            SPEC.md
          </a>
          <a
            className="text-muted underline-offset-4 hover:text-ink hover:underline"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="rounded border border-rule px-2 py-1 text-[12px] text-ink-2 lg:hidden"
          >
            {open ? "Close" : "Contents"}
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Research sections" className="border-t border-rule px-5 py-3 lg:hidden">
          <ol className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex gap-3 rounded px-2 py-1.5 text-sm ${
                    isActive(item.href) ? "bg-accent-soft text-accent" : "text-ink-2"
                  }`}
                >
                  <span className="tnum text-[11px] text-muted">{item.step}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </header>
  );
}

export function SiteSidebar() {
  const isActive = useIsActive();
  return (
    <nav
      aria-label="Research sections"
      className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-[17rem] shrink-0 overflow-y-auto border-r border-rule px-5 py-8 lg:block no-print"
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Contents</p>
      <ol className="mt-4 space-y-0.5">
        {NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex gap-2.5 rounded px-2 py-1.5 ${
                isActive(item.href) ? "bg-accent-soft" : "hover:bg-card"
              }`}
            >
              <span
                className={`tnum pt-0.5 text-[11px] ${
                  isActive(item.href) ? "text-accent" : "text-muted"
                }`}
              >
                {item.step}
              </span>
              <span>
                <span
                  className={`block text-[13.5px] leading-snug ${
                    isActive(item.href) ? "font-medium text-accent" : "text-ink-2"
                  }`}
                >
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                  {item.blurb}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
