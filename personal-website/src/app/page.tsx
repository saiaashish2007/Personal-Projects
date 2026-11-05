import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LineChart, Phone, ShieldCheck } from "lucide-react";
import { projects } from "@/lib/projects";
import { GITHUB_PROFILE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Sai Aashish Bharadwaj builds software around voice intake, limit-order-book forecasting, and regulatory entity resolution.",
};

const FOCUS = [
  {
    icon: Phone,
    title: "Voice intake",
    body: "An agent that answers a firm’s line and leaves behind a qualified case file, not a voicemail.",
  },
  {
    icon: LineChart,
    title: "Order books",
    body: "Level 2 snapshots turned into a short-horizon view of whether the mid-price moves.",
  },
  {
    icon: ShieldCheck,
    title: "Entity resolution",
    body: "Post-acquisition rosters resolved into canonical provider and clinic identities.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 md:pt-10">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="text-center lg:text-left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              Selected work
            </div>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
              Sai Aashish Bharadwaj
            </h1>
            <p className="mt-4 text-lg text-muted-foreground md:text-xl">
              I build software around the moment a workflow gets messy: a call that has to become a
              case file, an order book that has to become a short-horizon forecast, a roster that
              has to become a canonical record.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link
                href="/projects"
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
              >
                View projects
              </Link>
              <a
                href={GITHUB_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="w-full min-w-0">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
                <span className="ml-2 text-xs text-muted-foreground">projects</span>
              </div>
              <div className="p-3 sm:p-4">
                <div className="mb-3 grid gap-2 sm:grid-cols-3">
                  {[
                    { label: "Projects", value: "3" },
                    { label: "With a live link", value: "3", accent: true },
                    { label: "Pages", value: "2" },
                  ].map(({ label, value, accent }) => (
                    <div key={label} className="rounded-lg border border-border p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {label}
                      </div>
                      <div
                        className={`mt-1 text-2xl font-bold tracking-tight ${accent ? "text-primary" : ""}`}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Project</span>
                    <span>Focus</span>
                    <span>Link</span>
                  </div>
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects#${project.id}`}
                      className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/30"
                    >
                      <span className="truncate font-medium">{project.name}</span>
                      <span className="truncate text-muted-foreground">{project.eyebrow}</span>
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 sm:text-xs">
                        Live
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">About</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Three problems, shipped.
            </h2>
          </div>
          <Link
            href="/projects"
            className="hidden items-center text-sm font-medium text-foreground hover:text-muted-foreground sm:inline-flex"
          >
            All projects
            <ArrowRight className="ml-1 size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FOCUS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Icon className="size-5" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center sm:hidden">
          <Link
            href="/projects"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            All projects
          </Link>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 px-4 py-10 sm:px-6">
        <blockquote className="mx-auto max-w-3xl text-center">
          <p className="text-xl font-medium leading-relaxed md:text-2xl">
            The public work is the product: a voice intake agent, a limit-order-book model, and an
            entity-resolution console.
          </p>
          <footer className="mt-6 text-sm text-muted-foreground">
            <strong className="text-foreground">Sai Aashish Bharadwaj</strong>
            {" · "}
            <a
              href={GITHUB_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-border underline-offset-4 hover:text-foreground"
            >
              github.com/saiaashish2007
            </a>
          </footer>
        </blockquote>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm md:px-12">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Read the projects.</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Each one has a short description taken from its own README, plus the repository and the
            live link where one exists.
          </p>
          <div className="mt-8">
            <Link
              href="/projects"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open projects
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
