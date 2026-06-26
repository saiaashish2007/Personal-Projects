export type RosterJobStatus = "queued" | "processing" | "completed" | "failed";

export type EntityType = "provider" | "clinic";

export type ReviewDecision = "pending" | "confirmed" | "rejected";

export interface Organization {
  name: string;
  apiCallsThisWeek: number;
  autoMatchRate: number;
  activeJobs: number;
  pendingReviews: number;
}

export interface ResolveMetrics {
  resolveCallsThisWeek: number;
  autoMatchRate: number;
  pendingReviews: number;
  canonicalEntities: number;
  avgConfidence: number;
}

export interface FieldScore {
  field: string;
  score: number;
  note?: string;
}

export interface MatchCandidate {
  id: string;
  sourceLabel: string;
  sourceDetail: string;
  targetLabel: string;
  targetDetail: string;
  confidence: number;
  entityType: EntityType;
  rosterJobId: string;
  rosterJobName: string;
  fieldScores: FieldScore[];
  decision: ReviewDecision;
}

export interface CanonicalEntity {
  id: string;
  type: EntityType;
  displayName: string;
  subtitle: string;
  state: string;
  deaNumber?: string;
  licenseNumber?: string;
  acquisitionSource?: string;
  linkedEntityIds: string[];
  lastResolvedAt: string;
  confidence: number;
}

export interface RosterJob {
  id: string;
  name: string;
  source: string;
  status: RosterJobStatus;
  totalRecords: number;
  resolvedRecords: number;
  reviewCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface RequestLog {
  id: string;
  tool: string;
  method: string;
  status: number;
  durationMs: number;
  timestamp: string;
  requestId: string;
}

export const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "vetcomply": {
      "url": "https://api.vetcomply.com/mcp",
      "headers": {
        "Authorization": "Bearer vc_live_••••••••"
      }
    }
  }
}`;

export const SAMPLE_ROSTER_CSV = `provider_name,clinic_name,state,dea_number,license_number
Dr J Smith,Sunrise Animal Hosp,CO,,VET-88421
Jonathan Smith DVM,Sunrise Veterinary Clinic,CO,AB1234567,
J. Smith,Sunrise Animal Hospital Denver,CO,AB1234567,VET-88421
Maria Chen,,TX,BC9876543,VET-12044
M Chen DVM,Paws & Claws Vet,TX,,VET-12044`;
