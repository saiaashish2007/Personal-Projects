export type FormPhase = "v2" | "v3";

export type FormCategory =
  | "dea"
  | "inventory"
  | "incident"
  | "acquisition"
  | "state_license";

export interface TargetForm {
  id: string;
  name: string;
  code: string;
  description: string;
  phase: FormPhase;
  category: FormCategory;
  agentCapable: boolean;
  humanReviewRequired: boolean;
  submitNote: string;
}

export const targetForms: TargetForm[] = [
  {
    id: "form-224a",
    name: "DEA Registration Renewal",
    code: "DEA Form 224a",
    description:
      "Renew practitioner DEA registration every 3 years per location. Pre-filled from registry data.",
    phase: "v2",
    category: "dea",
    agentCapable: true,
    humanReviewRequired: true,
    submitNote: "Registrant reviews pre-filled PDF, then submits via DEA Diversion Control portal.",
  },
  {
    id: "form-biennial",
    name: "Biennial Controlled Substance Inventory",
    code: "21 CFR §1304.11",
    description:
      "Complete inventory of Schedules II–V required at least every 2 years. Assembled from CS log data.",
    phase: "v2",
    category: "inventory",
    agentCapable: true,
    humanReviewRequired: true,
    submitNote: "Agent assembles audit-ready packet; DVM signs and retains on-site for inspection.",
  },
  {
    id: "form-106",
    name: "Theft or Loss Report",
    code: "DEA Form 106",
    description:
      "Report significant theft or loss of controlled substances to DEA Field Division.",
    phase: "v2",
    category: "incident",
    agentCapable: true,
    humanReviewRequired: true,
    submitNote: "Agent drafts from incident data; registrant submits within required timeframe.",
  },
  {
    id: "form-address",
    name: "Address / Ownership Change",
    code: "DEA Modification",
    description:
      "Notify DEA of practice address changes or ownership transfers — common during acquisitions.",
    phase: "v2",
    category: "dea",
    agentCapable: true,
    humanReviewRequired: true,
    submitNote: "Pre-filled change notification; required when clinics are acquired or relocated.",
  },
  {
    id: "form-state-renewal",
    name: "State Veterinary Board License Renewal",
    code: "State-specific",
    description:
      "Facility and DVM license renewals — 50 different portals and requirements.",
    phase: "v3",
    category: "state_license",
    agentCapable: false,
    humanReviewRequired: true,
    submitNote: "Roadmap: state rules engine + portal-specific pre-fill (high moat, harder build).",
  },
  {
    id: "form-diligence",
    name: "Acquisition Compliance Diligence Packet",
    code: "M&A Diligence",
    description:
      "Auto-generated summary of DEA, license, and CS log gaps for target clinics before close.",
    phase: "v2",
    category: "acquisition",
    agentCapable: true,
    humanReviewRequired: true,
    submitNote: "Agent ingests seller docs + cross-checks registry; flags expired DEAs before LOI.",
  },
];

export interface AgentPrefillField {
  label: string;
  value: string;
  source: string;
  needsReview?: boolean;
}

export interface AgentJob {
  formId: string;
  clinicId?: string;
  acquisitionId?: string;
  title: string;
  fields: AgentPrefillField[];
}

export const agentJobs: Record<string, AgentJob> = {
  "form-224a": {
    formId: "form-224a",
    clinicId: "cln-001",
    title: "DEA Form 224a — Northside Animal Hospital",
    fields: [
      { label: "DEA registration number", value: "FA1234567", source: "Location registry" },
      { label: "Registrant name", value: "Dr. Sarah Chen, DVM", source: "HR / credentialing" },
      { label: "Business activity", value: "Practitioner — Veterinary", source: "DEA schedule" },
      { label: "Schedules authorized", value: "II, III, IV, V", source: "Prior registration" },
      {
        label: "Practice address",
        value: "1842 North Lamar Blvd, Austin, TX 78756",
        source: "Location registry",
      },
      { label: "State license number", value: "TX-VET-88421", source: "State board record" },
      {
        label: "Expiration date (current)",
        value: "April 15, 2026",
        source: "Renewal calendar",
        needsReview: true,
      },
      {
        label: "Attestation — CS training (CAA 2023)",
        value: "Eligible — 8hr training on file",
        source: "Credentialing",
        needsReview: true,
      },
    ],
  },
  "form-biennial": {
    formId: "form-biennial",
    clinicId: "cln-003",
    title: "Biennial Inventory — Lakeview Pet Care",
    fields: [
      { label: "DEA registration number", value: "FC3456789", source: "Location registry" },
      { label: "Inventory date", value: "March 15, 2026", source: "Compliance calendar" },
      { label: "Schedule II substances", value: "12 line items", source: "CS log sync (VetSnap)" },
      { label: "Schedule III–V substances", value: "34 line items", source: "CS log sync" },
      { label: "Last biennial inventory", value: "March 12, 2024", source: "Audit history" },
      { label: "Discrepancies flagged", value: "0", source: "Reconciliation engine" },
    ],
  },
  "form-106": {
    formId: "form-106",
    clinicId: "cln-007",
    title: "DEA Form 106 — Midwest Animal Care (draft)",
    fields: [
      { label: "DEA registration number", value: "FG7890123", source: "Location registry" },
      { label: "Substance", value: "Ketamine HCl 100mg/mL", source: "Incident report" },
      { label: "Quantity lost", value: "50 mL (1 vial)", source: "Incident report" },
      { label: "Date discovered", value: "March 10, 2026", source: "Incident report" },
      {
        label: "Circumstances",
        value: "Vial unaccounted for during weekly count",
        source: "Agent draft",
        needsReview: true,
      },
    ],
  },
  "form-address": {
    formId: "form-address",
    clinicId: "cln-004",
    title: "Ownership Change — Sunrise Veterinary Clinic",
    fields: [
      { label: "DEA registration number", value: "FD4567890", source: "Location registry" },
      { label: "Change type", value: "Ownership transfer (acquisition)", source: "M&A record" },
      { label: "Previous registrant", value: "Sunrise Vet LLC", source: "Seller diligence" },
      { label: "New registrant", value: "Demo Vet Partners — AZ Holdings", source: "Platform org" },
      { label: "Effective date", value: "November 1, 2025", source: "Acquisition close" },
    ],
  },
  "form-diligence": {
    formId: "form-diligence",
    acquisitionId: "acq-001",
    title: "Diligence Packet — Blue Ridge Veterinary",
    fields: [
      { label: "Locations reviewed", value: "6 clinics (NC, SC)", source: "Deal room" },
      { label: "Expired DEA registrations", value: "2 (Asheville, Greenville)", source: "Agent scan" },
      { label: "Missing biennial inventories", value: "3 of 6 clinics", source: "CS log audit" },
      { label: "State license transfer risk", value: "Low — all current", source: "State board check" },
      {
        label: "Estimated remediation cost",
        value: "$4,200 + 3-week delay",
        source: "Agent estimate",
        needsReview: true,
      },
      {
        label: "Recommendation",
        value: "Proceed with price adjustment or escrow",
        source: "Agent summary",
        needsReview: true,
      },
    ],
  },
};

export const agentSteps = [
  "Reading location registry & credentialing data",
  "Cross-checking DEA Diversion Control requirements",
  "Pre-filling form fields from system of record",
  "Flagging fields that require human attestation",
  "Packaging PDF for compliance manager review",
];
