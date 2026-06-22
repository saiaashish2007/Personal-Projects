export type ComplianceStatus = "compliant" | "at_risk" | "expired" | "pending";

export type LicenseType =
  | "dea_registration"
  | "state_vet_license"
  | "controlled_substance"
  | "facility_permit";

export interface Organization {
  name: string;
  locationCount: number;
  statesActive: number;
  acquisitionsYtd: number;
}

export interface Clinic {
  id: string;
  name: string;
  city: string;
  state: string;
  acquiredAt: string;
  deaNumber: string;
  deaExpires: string;
  deaStatus: ComplianceStatus;
  stateLicenseExpires: string;
  stateLicenseStatus: ComplianceStatus;
  csLogStatus: ComplianceStatus;
  lastAudit: string;
  integrationStatus: "complete" | "in_progress" | "not_started";
}

export interface Acquisition {
  id: string;
  targetName: string;
  locations: number;
  states: string[];
  stage: "diligence" | "loi" | "integration" | "closed";
  closeDate: string;
  riskScore: number;
  flags: AcquisitionFlag[];
  checklist: ChecklistItem[];
}

export interface AcquisitionFlag {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  owner: string;
  dueDate: string;
  done: boolean;
}

export interface LicenseRecord {
  id: string;
  clinicId: string;
  clinicName: string;
  type: LicenseType;
  identifier: string;
  state: string;
  expires: string;
  status: ComplianceStatus;
  daysUntilExpiry: number;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  clinicId?: string;
  createdAt: string;
  category: "dea" | "license" | "acquisition" | "cs_log";
}

export interface DashboardMetrics {
  compliantLocations: number;
  atRiskLocations: number;
  expiredItems: number;
  renewalsDue30Days: number;
  acquisitionsInPipeline: number;
  avgIntegrationDays: number;
}
