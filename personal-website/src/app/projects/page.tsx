import type { Metadata } from "next";
import { ArrowUpRight, LineChart, Phone, ShieldCheck } from "lucide-react";
import { projects, type Project } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Projects",
  description: "Deep Lob, Firstcall, and Vetcomply.",
};

const ICONS = {
  "deep-lob": LineChart,
  firstcall: Phone,
  vetcomply: ShieldCheck,
} as const;

function ProjectLinks({ project }: { project: Project }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={project.github}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent"
      >
        GitHub
        <ArrowUpRight className="size-3.5" />
      </a>
      {project.live ? (
        <a
          href={project.live.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
        >
          {project.live.label}
          <ArrowUpRight className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-14 sm:px-6 md:pt-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Projects</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
          Deep Lob, Firstcall, and Vetcomply.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Three public projects. Descriptions follow each project’s own README or site. Links go to
          the repository, and to a live demo only when one is already published.
        </p>
      </section>

      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:px-6">
          {projects.map((project) => {
            const Icon = ICONS[project.id as keyof typeof ICONS];
            return (
              <article
                key={project.id}
                id={project.id}
                className="scroll-mt-28 rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md md:p-8"
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Icon className="size-5" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {project.eyebrow}
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h2>
                    </div>
                  </div>
                  <ProjectLinks project={project} />
                </div>
                <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
                  {project.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
