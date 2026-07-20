import { ReviewQueue } from "@/components/demo/review-queue";

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Flagged SKUs</h2>
        <p className="mt-1 text-sm text-stone-500">
          Engineer review for marginal and fail predictions — accept risk or route
          to an exception lane.
        </p>
      </div>
      <ReviewQueue />
    </div>
  );
}
