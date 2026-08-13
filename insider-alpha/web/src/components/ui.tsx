import type { ReactNode } from "react";

import { num, significance } from "@/lib/format";

export function PageHeader({
  step,
  title,
  standfirst,
  children,
}: {
  step: string;
  title: string;
  standfirst: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-rule pb-8">
      <p className="tnum text-xs uppercase tracking-[0.18em] text-muted">Step {step}</p>
      <h1 className="mt-2 font-serif text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      <p className="prose-measure mt-4 text-[15px] leading-relaxed text-ink-2">{standfirst}</p>
      {children}
    </header>
  );
}

export function Section({
  title,
  kicker,
  children,
  id,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-24">
      {kicker ? (
        <p className="tnum text-xs uppercase tracking-[0.18em] text-muted">{kicker}</p>
      ) : null}
      <h2 className="mt-1 font-serif text-xl tracking-tight text-ink sm:text-2xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="prose-measure space-y-4 text-[15px] leading-relaxed text-ink-2">{children}</div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-rule bg-card p-5 ${className}`}>{children}</div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "pos" | "neg" | "warn";
}) {
  const toneClass =
    tone === "pos"
      ? "text-pos"
      : tone === "neg"
        ? "text-neg"
        : tone === "warn"
          ? "text-warn"
          : "text-ink";
  return (
    <div className="rounded-lg border border-rule bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`tnum mt-1.5 text-2xl leading-none ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-1.5 text-xs leading-snug text-muted">{sub}</p> : null}
    </div>
  );
}

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";
  return <div className={`grid grid-cols-1 gap-3 ${colClass}`}>{children}</div>;
}

/**
 * Renders a t-statistic with its conventional reading attached, so a point estimate is
 * never shown on this site without the reader being told whether to believe it.
 */
export function TStat({ t, className = "" }: { t: number | null; className?: string }) {
  if (t === null) return <span className="text-muted">—</span>;
  const level = significance(t);
  const color =
    level === "strong" ? "text-pos" : level === "marginal" ? "text-warn" : "text-muted";
  return (
    <span className={`tnum ${color} ${className}`}>
      t&nbsp;=&nbsp;{num(t, 2)}
      {level === "strong" ? "*" : ""}
    </span>
  );
}

export function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: "note" | "warn" | "result";
  title: string;
  children: ReactNode;
}) {
  const styles =
    tone === "warn"
      ? "border-warn/35 bg-warn-soft"
      : tone === "result"
        ? "border-accent/30 bg-accent-soft"
        : "border-rule bg-card";
  return (
    <aside className={`rounded-lg border px-5 py-4 ${styles}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">{title}</p>
      <div className="prose-measure mt-2 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </aside>
  );
}

export function MethodNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 border-l-2 border-rule-strong pl-4 text-[13px] leading-relaxed text-muted">
      <span className="font-semibold uppercase tracking-[0.12em]">Method</span> — {children}
    </div>
  );
}

export function Table({
  head,
  children,
  caption,
  dense = false,
}: {
  head: ReactNode;
  children: ReactNode;
  caption?: string;
  dense?: boolean;
}) {
  return (
    <figure className="overflow-x-auto">
      <table className={`w-full min-w-[36rem] border-collapse ${dense ? "text-[13px]" : "text-sm"}`}>
        <thead>
          <tr className="border-b border-rule-strong text-left text-[11px] uppercase tracking-[0.1em] text-muted">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {caption ? (
        <figcaption className="mt-3 text-[13px] leading-relaxed text-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th scope="col" className={`py-2 pr-4 font-medium ${align === "right" ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono = false,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-rule py-2 pr-4 align-top ${align === "right" ? "text-right" : ""} ${
        mono ? "tnum" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function Figure({
  title,
  subtitle,
  caption,
  children,
}: {
  title: string;
  subtitle?: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <figure className="rounded-lg border border-rule bg-card p-5">
      <figcaption className="mb-4">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {subtitle ? <p className="mt-1 text-[13px] text-muted">{subtitle}</p> : null}
      </figcaption>
      {children}
      {caption ? (
        <p className="mt-4 border-t border-rule pt-3 text-[13px] leading-relaxed text-muted">
          {caption}
        </p>
      ) : null}
    </figure>
  );
}

export function PlaceholderBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="rounded border border-warn/40 bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-warn">
        Placeholder
      </span>
    );
  }
  return (
    <div className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-warn">
      <span className="font-semibold uppercase tracking-[0.1em]">Placeholder data</span> — the
      numbers on this page are fabricated fixtures used to build the site before the research
      pipeline has produced output. They are plausible, and they are not results. Every artifact
      carries a <code className="tnum">data_status</code> flag and this badge disappears when it
      reads <code className="tnum">real</code>.
    </div>
  );
}
