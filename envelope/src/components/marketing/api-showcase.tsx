import { ShowcaseFrame } from "./showcase-frame";

export function ApiShowcase() {
  return (
    <ShowcaseFrame title="envelope.app / developers">
      <pre className="overflow-x-auto rounded-xl bg-neutral-950 p-4 text-[11px] leading-relaxed text-neutral-300">
        {`POST /v1/catalogs/score
Authorization: Bearer env_live_•••

{
  "robot_id": "apex-arm-v3",
  "site_id": "dallas-dc",
  "catalog_url": "s3://…/stord-dallas.csv"
}

→ {
  "job_id": "job_01",
  "skus": 4820,
  "in_envelope": 0.934,
  "fails": 99
}`}
      </pre>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        <div className="rounded-lg border border-neutral-100 py-2">REST API</div>
        <div className="rounded-lg border border-neutral-100 py-2">WMS webhooks</div>
        <div className="rounded-lg border border-neutral-100 py-2">Telemetry ingest</div>
      </div>
    </ShowcaseFrame>
  );
}
