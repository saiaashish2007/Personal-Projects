import { Sidebar } from "@/components/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-stone-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-stone-200 bg-white px-8 py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-700">
            SKU Stress Envelope
          </p>
          <h1 className="mt-1 text-xl font-semibold text-stone-900">
            Envelope console
          </h1>
        </header>
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
