import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader, SiteSidebar } from "@/components/SiteNav";
import { anyPlaceholder } from "@/lib/data";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Opportunistic Insider Alpha",
    template: "%s · Opportunistic Insider Alpha",
  },
  description:
    "An out-of-sample replication of Cohen, Malloy & Pomorski (2012) on 2014–2025: do open-market purchases by opportunistic corporate insiders still predict returns?",
  openGraph: {
    title: "Opportunistic Insider Alpha",
    description:
      "Out-of-sample replication of Cohen, Malloy & Pomorski (2012) on 2014–2025, with costs, factor attribution, and a full robustness battery.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const placeholder = anyPlaceholder();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SiteHeader placeholder={placeholder} />
        <div className="mx-auto flex max-w-[88rem]">
          <SiteSidebar />
          <main id="main" className="min-w-0 flex-1 px-5 py-10 sm:px-8 lg:px-12">
            <div className="mx-auto max-w-4xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
