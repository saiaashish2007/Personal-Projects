import Link from "next/link";
import { Shield } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold text-white">VetComply</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              The compliance operating system for PE-backed veterinary roll-ups.
              One platform for DEA, licensing, controlled substances, and M&A
              diligence across your entire portfolio.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Company
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a href="#about" className="hover:text-white">
                    About us
                  </a>
                </li>
                <li>
                  <a href="#why-vetcomply" className="hover:text-white">
                    Why VetComply
                  </a>
                </li>
                <li>
                  <a href="#contact" className="hover:text-white">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Product
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a href="#platform" className="hover:text-white">
                    Platform
                  </a>
                </li>
                <li>
                  <Link href="/demo" className="hover:text-white">
                    Live demo
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Built for
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-400">
                <li>Platform ops teams</li>
                <li>Compliance & legal</li>
                <li>M&A integration</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-slate-800 pt-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} VetComply. All rights reserved.</p>
          <p>Compliance OS for veterinary roll-ups</p>
        </div>
      </div>
    </footer>
  );
}
