import { ComplianceAgent } from "@/components/compliance-agent";

export default function AgentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Compliance Agent</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          VetComply doesn&apos;t just track licenses — it pre-fills the forms roll-up
          compliance teams waste hours on. Select a target form, run the agent, and see
          what ships in v2.
        </p>
      </div>
      <ComplianceAgent />
    </div>
  );
}
