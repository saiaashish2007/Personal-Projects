import { ReviewQueue } from "@/components/demo/review-queue";

export default function ReviewPage() {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Review queue</h2>
        <p className="mt-1 text-sm text-slate-500">
          Low-confidence matches require human approval before linking to canonical entities.
        </p>
      </div>
      <ReviewQueue />
    </div>
  );
}
