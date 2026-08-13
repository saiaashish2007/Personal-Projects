import Link from "next/link";

import { NAV } from "@/lib/nav";

export default function NotFound() {
  return (
    <div className="py-16">
      <p className="tnum text-xs uppercase tracking-[0.18em] text-muted">404</p>
      <h1 className="mt-2 font-serif text-3xl tracking-tight text-ink">Page not found</h1>
      <p className="prose-measure mt-4 text-[15px] leading-relaxed text-ink-2">
        That route does not exist on this site. The research is organized as nine sequential
        sections:
      </p>
      <ol className="mt-6 space-y-1.5">
        {NAV.map((item) => (
          <li key={item.href} className="flex gap-3 text-sm">
            <span className="tnum text-muted">{item.step}</span>
            <Link href={item.href} className="text-accent underline-offset-4 hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
