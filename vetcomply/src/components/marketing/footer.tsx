import Link from "next/link";
import { Shield } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-neutral-900" strokeWidth={1.75} />
              <span className="text-base font-semibold text-neutral-900">VetComply</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-neutral-500">
              The compliance operating system for PE-backed veterinary roll-ups.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Company
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-500">
                <li>
                  <a href="#platform" className="hover:text-neutral-900">
                    Platform
                  </a>
                </li>
                <li>
                  <a href="#security" className="hover:text-neutral-900">
                    Security
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-neutral-900">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Product
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-500">
                <li>
                  <Link href="/demo" className="hover:text-neutral-900">
                    Live demo
                  </Link>
                </li>
                <li>
                  <a href="#contact" className="hover:text-neutral-900">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Contact
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-500">
                <li>
                  <a
                    href="mailto:hello@vetcomply.com"
                    className="hover:text-neutral-900"
                  >
                    hello@vetcomply.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-neutral-100 pt-8 text-sm text-neutral-400">
          &copy; {new Date().getFullYear()} VetComply. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
