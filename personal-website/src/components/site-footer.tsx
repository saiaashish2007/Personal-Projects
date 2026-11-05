import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
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
        <p className="text-sm text-muted-foreground">© 2026 Sai Aashish Bharadwaj</p>
        <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            About
          </Link>
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
        </div>
      </div>
    </footer>
  );
}
