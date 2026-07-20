import { DevelopersPanel } from "@/components/demo/developers-panel";

export default function DevelopersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Developers</h2>
        <p className="mt-1 text-sm text-stone-500">
          API keys, score endpoints, and auditable request logs.
        </p>
      </div>
      <DevelopersPanel />
    </div>
  );
}
