import { agentJobs } from "@/lib/forms-data";
import { ShowcaseFrame } from "./showcase-frame";

const job = agentJobs["form-224a"];

export function AgentShowcase() {
  return (
    <ShowcaseFrame
      title="Compliance Agent"
      subtitle={job.title}
      badge="Agent"
    >
      <div className="p-5">
        <div className="space-y-2">
          {[
            "Reading location registry & credentialing data",
            "Cross-checking DEA Diversion Control requirements",
            "Pre-filling form fields from system of record",
            "Flagging fields that require human attestation",
          ].map((step, i) => (
            <div key={step} className="flex items-center gap-2 text-sm text-neutral-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">
                {i + 1}
              </span>
              <span className={i < 3 ? "text-neutral-900" : undefined}>{step}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-3 py-2.5 font-medium">Field</th>
                <th className="px-3 py-2.5 font-medium">Pre-filled value</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {job.fields.slice(0, 5).map((field) => (
                <tr
                  key={field.label}
                  className={field.needsReview ? "bg-amber-50/60" : undefined}
                >
                  <td className="px-3 py-2.5 font-medium text-neutral-900">
                    {field.label}
                    {field.needsReview && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-600">
                        Review
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">{field.value}</td>
                  <td className="hidden px-3 py-2.5 text-xs text-neutral-400 sm:table-cell">
                    {field.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs text-teal-800">
          <span className="font-semibold">Human-in-the-loop:</span> Compliance manager
          reviews, then submits via DEA Diversion Control portal.
        </div>
      </div>
    </ShowcaseFrame>
  );
}
