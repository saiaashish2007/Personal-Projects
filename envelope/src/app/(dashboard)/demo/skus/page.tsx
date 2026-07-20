import { SkuExplorer } from "@/components/demo/sku-explorer";

export default function SkusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">SKU explorer</h2>
        <p className="mt-1 text-sm text-stone-500">
          Browse scored SKUs with predicted pick rates, packaging, and verdicts.
        </p>
      </div>
      <SkuExplorer />
    </div>
  );
}
