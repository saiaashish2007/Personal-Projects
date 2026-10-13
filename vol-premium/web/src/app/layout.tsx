import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Timing the Volatility Risk Premium',
  description:
    'XGBoost realized-volatility forecasts, Black-Scholes delta-hedged S&P 500 straddles, and Monte Carlo risk analysis over 28 years of out-of-sample data.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-neutral-900">{children}</body>
    </html>
  );
}
