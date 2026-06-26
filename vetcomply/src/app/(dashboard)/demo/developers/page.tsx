import { DevelopersPanel } from "@/components/demo/developers-panel";

export default function DevelopersPage() {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Developers</h2>
        <p className="mt-1 text-sm text-slate-500">
          API keys, MCP server configuration, and request logs for your integrations and agents.
        </p>
      </div>
      <DevelopersPanel />
    </div>
  );
}
