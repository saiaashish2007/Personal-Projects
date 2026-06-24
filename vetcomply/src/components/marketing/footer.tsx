import { Shield } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-[#fafaf9]">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-neutral-400" strokeWidth={1.75} />
          <span className="text-sm text-neutral-500">
            &copy; {new Date().getFullYear()} VetComply
          </span>
        </div>
        <a
          href="mailto:hello@vetcomply.com"
          className="text-sm text-neutral-500 transition-colors hover:text-neutral-900"
        >
          hello@vetcomply.com
        </a>
      </div>
    </footer>
  );
}
