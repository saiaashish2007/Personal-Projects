import Link from "next/link";
import { Target } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-neutral-900" />
          <span className="text-sm font-semibold text-neutral-900">Envelope</span>
        </div>
        <p className="text-sm text-neutral-500">
          Predict robot performance on new SKUs — before rollout.
        </p>
        <div className="flex gap-6 text-sm text-neutral-500">
          <Link href="/demo" className="hover:text-neutral-900">
            Demo
          </Link>
          <a href="mailto:saiaashishb@gmail.com" className="hover:text-neutral-900">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
