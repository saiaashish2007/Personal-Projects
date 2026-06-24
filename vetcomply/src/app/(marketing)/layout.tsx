import { Instrument_Serif } from "next/font/google";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHeader } from "@/components/marketing/header";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-h-screen flex-col bg-white ${instrumentSerif.variable}`}
    >
      <MarketingHeader />
      <main className="flex-1 [&_em]:font-serif [&_em]:italic">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
