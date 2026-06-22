import { Sidebar } from "@/components/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-teal-600">
            Veterinary roll-up compliance
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            Platform compliance command center
          </h1>
        </header>
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
