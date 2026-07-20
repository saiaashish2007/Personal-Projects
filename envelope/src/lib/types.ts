export type SkuVerdict = "pass" | "marginal" | "fail";

export type CatalogJobStatus = "queued" | "processing" | "completed" | "failed";

export type FailureMode =
  | "grasp_slip"
  | "vision_miss"
  | "deformable"
  | "reflective"
  | "size_out_of_range"
  | "throughput_drop";

export interface Organization {
  name: string;
  robotModel: string;
  sitesLive: number;
  skusScoredThisWeek: number;
  pendingReviews: number;
}

export interface Metrics {
  skusScoredThisWeek: number;
  inEnvelopeRate: number;
  pendingReviews: number;
  catalogsScored: number;
  avgConfidence: number;
  predictedFails: number;
}

export interface CatalogJob {
  id: string;
  name: string;
  customer: string;
  site: string;
  status: CatalogJobStatus;
  totalSkus: number;
  scoredSkus: number;
  passCount: number;
  marginalCount: number;
  failCount: number;
  createdAt: string;
}

export interface SkuRecord {
  id: string;
  sku: string;
  name: string;
  category: string;
  packaging: string;
  dimensions: string;
  weightG: number;
  verdict: SkuVerdict;
  predictedPickRate: number;
  confidence: number;
  failureMode?: FailureMode;
  mitigation?: string;
  catalogId: string;
}

export interface DriftAlert {
  id: string;
  site: string;
  signal: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  detectedAt: string;
}

export interface ApiRequestLog {
  id: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  at: string;
}
