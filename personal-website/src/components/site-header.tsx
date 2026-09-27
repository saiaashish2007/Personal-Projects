"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LINKEDIN_URL, RESUME_URL } from "@/lib/site";

const NAV = [
  { href: "/", label: "About" },
  { href: "/projects", label: "Projects" },
] as const;

function navClass(active: boolean) {
  return active
    ? "font-medium text-foreground"
    : "text-muted-foreground hover:text-foreground";
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 md:grid-cols-[auto_1fr_auto]">
        <Link href="/" className="inline-flex items-center gap-2.5 justify-self-start">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            S
          </span>
          <span className="flex flex-col justify-center leading-none">
            <span className="text-[1.05rem] font-bold tracking-tight lowercase">sai</span>
            <span className="mt-1 text-[0.55rem] font-medium uppercase tracking-[0.32em] text-muted-foreground">
              Aashish
            </span>
          </span>
        </Link>

        <nav className="col-span-2 flex items-center gap-5 text-sm md:col-span-1 md:justify-center">
          {NAV.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`transition-colors ${navClass(active)}`}>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="col-start-2 row-start-1 flex items-center gap-2 md:col-start-3">
          <a
            href={RESUME_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Placeholder — replace with your resume URL"
            className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground sm:h-9 sm:px-4"
          >
            Resume
            <span className="sr-only"> (placeholder URL)</span>
          </a>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Placeholder — replace with your LinkedIn URL"
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 sm:h-9 sm:px-4"
          >
            LinkedIn
            <span className="sr-only"> (placeholder URL)</span>
          </a>
        </div>
      </div>
    </header>
  );
}
