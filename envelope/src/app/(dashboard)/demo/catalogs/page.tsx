import { CatalogJobsPanel } from "@/components/demo/catalog-jobs-panel";

export default function CatalogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Catalog jobs</h2>
        <p className="mt-1 text-sm text-stone-500">
          Score customer catalogs against your robot&apos;s operating envelope.
          Interactive demo — run a score to watch progress.
        </p>
      </div>
      <CatalogJobsPanel />
    </div>
  );
}
