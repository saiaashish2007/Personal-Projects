import Link from "next/link";

import type { MetaArtifact } from "@/lib/artifacts";
import { NAV, REPO_URL, SPEC_URL } from "@/lib/nav";

export default function PageFooter({
  meta,
  currentHref,
}: {
  meta: MetaArtifact;
  currentHref: string;
}) {
  const index = NAV.findIndex((n) => n.href === currentHref);
  const prev = index > 0 ? NAV[index - 1] : undefined;
  const next = index >= 0 && index < NAV.length - 1 ? NAV[index + 1] : undefined;

  return (
    <footer className="mt-20 border-t border-rule pt-6">
      <nav className="flex flex-wrap items-center justify-between gap-4 text-sm no-print">
        {prev ? (
          <Link href={prev.href} className="text-accent underline-offset-4 hover:underline">
            ← {prev.label}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={next.href} className="text-accent underline-offset-4 hover:underline">
            {next.label} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-muted">
        <span>
          Sample {meta.sample.start} to {meta.sample.end}, classification burn-in from{" "}
          {meta.sample.burn_in_start}
        </span>
        <span className="tnum">
          Artifacts generated {meta.generated_at.slice(0, 10)}
          {meta.run.git_sha ? ` · ${meta.run.git_sha.slice(0, 7)}` : ""}
        </span>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
          Source
        </a>
        <a href={SPEC_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
          Research protocol
        </a>
      </div>
    </footer>
  );
}
