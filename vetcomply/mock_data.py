"""Mock data for VetComply Streamlit demo."""

from __future__ import annotations

from datetime import date, datetime

ORGANIZATION = {
    "name": "Demo Vet Partners",
    "location_count": 127,
    "states_active": 18,
    "acquisitions_ytd": 4,
}

METRICS = {
    "compliant_locations": 98,
    "at_risk_locations": 21,
    "expired_items": 8,
    "renewals_due_30_days": 34,
    "acquisitions_in_pipeline": 3,
    "avg_integration_days": 47,
}

CLINICS = [
    {
        "id": "cln-001",
        "name": "Northside Animal Hospital",
        "city": "Austin",
        "state": "TX",
        "acquired_at": "2024-03-12",
        "dea_number": "FA1234567",
        "dea_expires": "2026-04-15",
        "dea_status": "at_risk",
        "state_license_expires": "2026-06-30",
        "state_license_status": "compliant",
        "cs_log_status": "compliant",
        "last_audit": "2025-11-02",
        "integration_status": "complete",
    },
    {
        "id": "cln-002",
        "name": "Paws & Claws Veterinary",
        "city": "Denver",
        "state": "CO",
        "acquired_at": "2025-01-08",
        "dea_number": "FB2345678",
        "dea_expires": "2025-12-01",
        "dea_status": "expired",
        "state_license_expires": "2026-02-28",
        "state_license_status": "at_risk",
        "cs_log_status": "at_risk",
        "last_audit": "2024-08-14",
        "integration_status": "in_progress",
    },
    {
        "id": "cln-003",
        "name": "Lakeview Pet Care",
        "city": "Chicago",
        "state": "IL",
        "acquired_at": "2023-09-20",
        "dea_number": "FC3456789",
        "dea_expires": "2027-01-10",
        "dea_status": "compliant",
        "state_license_expires": "2027-01-10",
        "state_license_status": "compliant",
        "cs_log_status": "compliant",
        "last_audit": "2026-01-15",
        "integration_status": "complete",
    },
    {
        "id": "cln-004",
        "name": "Sunrise Veterinary Clinic",
        "city": "Phoenix",
        "state": "AZ",
        "acquired_at": "2025-11-01",
        "dea_number": "FD4567890",
        "dea_expires": "2026-08-22",
        "dea_status": "pending",
        "state_license_expires": "2026-05-01",
        "state_license_status": "pending",
        "cs_log_status": "pending",
        "last_audit": "—",
        "integration_status": "not_started",
    },
    {
        "id": "cln-005",
        "name": "Heritage Animal Clinic",
        "city": "Nashville",
        "state": "TN",
        "acquired_at": "2024-07-04",
        "dea_number": "FE5678901",
        "dea_expires": "2026-03-28",
        "dea_status": "at_risk",
        "state_license_expires": "2026-04-01",
        "state_license_status": "at_risk",
        "cs_log_status": "compliant",
        "last_audit": "2025-09-30",
        "integration_status": "complete",
    },
    {
        "id": "cln-006",
        "name": "Coastal Pet Hospital",
        "city": "Tampa",
        "state": "FL",
        "acquired_at": "2022-11-15",
        "dea_number": "FF6789012",
        "dea_expires": "2026-11-15",
        "dea_status": "compliant",
        "state_license_expires": "2026-11-15",
        "state_license_status": "compliant",
        "cs_log_status": "compliant",
        "last_audit": "2026-02-01",
        "integration_status": "complete",
    },
    {
        "id": "cln-007",
        "name": "Midwest Animal Care",
        "city": "Columbus",
        "state": "OH",
        "acquired_at": "2025-06-18",
        "dea_number": "FG7890123",
        "dea_expires": "2026-02-10",
        "dea_status": "expired",
        "state_license_expires": "2026-07-20",
        "state_license_status": "compliant",
        "cs_log_status": "at_risk",
        "last_audit": "2025-04-22",
        "integration_status": "in_progress",
    },
    {
        "id": "cln-008",
        "name": "Valley Veterinary Group",
        "city": "Sacramento",
        "state": "CA",
        "acquired_at": "2024-01-22",
        "dea_number": "FH8901234",
        "dea_expires": "2026-09-05",
        "dea_status": "compliant",
        "state_license_expires": "2026-03-15",
        "state_license_status": "at_risk",
        "cs_log_status": "compliant",
        "last_audit": "2025-12-10",
        "integration_status": "complete",
    },
]

ACQUISITIONS = [
    {
        "id": "acq-001",
        "target_name": "Blue Ridge Veterinary (6 clinics)",
        "locations": 6,
        "states": ["NC", "SC"],
        "stage": "diligence",
        "close_date": "2026-05-15",
        "risk_score": 72,
        "flags": [
            {
                "severity": "critical",
                "title": "2 expired DEA registrations found",
                "detail": "Asheville and Greenville locations have DEA registrations expired 4+ months.",
            },
            {
                "severity": "warning",
                "title": "Incomplete controlled substance logs",
                "detail": "3 of 6 clinics missing biennial inventory records required by DEA.",
            },
        ],
        "checklist": [
            {"label": "Pull DEA registrations for all locations", "owner": "K. Farrell", "due": "2026-03-20", "done": True},
            {"label": "Verify state board licenses per clinic", "owner": "D. DeAngelo", "due": "2026-03-25", "done": True},
            {"label": "Audit controlled substance log completeness", "owner": "D. DeAngelo", "due": "2026-04-01", "done": False},
            {"label": "Draft license transfer timeline", "owner": "Integration team", "due": "2026-04-10", "done": False},
        ],
    },
    {
        "id": "acq-002",
        "target_name": "Prairie Pet Partners (3 clinics)",
        "locations": 3,
        "states": ["NE", "IA"],
        "stage": "integration",
        "close_date": "2026-02-28",
        "risk_score": 38,
        "flags": [
            {
                "severity": "warning",
                "title": "State license transfer pending",
                "detail": "Iowa location awaiting board approval — est. 3 weeks.",
            },
        ],
        "checklist": [
            {"label": "File DEA address change notifications", "owner": "Compliance", "due": "2026-03-10", "done": True},
            {"label": "Migrate CS logs to platform template", "owner": "Field integration", "due": "2026-03-18", "done": False},
            {"label": "Schedule post-close compliance audit", "owner": "Regional ops", "due": "2026-04-15", "done": False},
        ],
    },
    {
        "id": "acq-003",
        "target_name": "Pacific Coast Vets (4 clinics)",
        "locations": 4,
        "states": ["OR", "WA"],
        "stage": "loi",
        "close_date": "2026-07-01",
        "risk_score": 55,
        "flags": [
            {
                "severity": "info",
                "title": "LOI signed — diligence not started",
                "detail": "Compliance review scheduled to begin after data room access.",
            },
        ],
        "checklist": [
            {"label": "Request DEA/license documentation from seller", "owner": "M&A", "due": "2026-03-30", "done": False},
            {"label": "Assign integration lead", "owner": "Ops", "due": "2026-04-05", "done": False},
        ],
    },
]

ALERTS = [
    {"severity": "critical", "title": "DEA registration expired — Paws & Claws Veterinary", "detail": "FB2345678 expired 106 days ago.", "category": "dea", "date": "2026-03-14"},
    {"severity": "critical", "title": "DEA registration expired — Midwest Animal Care", "detail": "FG7890123 expired 32 days ago.", "category": "dea", "date": "2026-03-12"},
    {"severity": "warning", "title": "DEA renewal due in 14 days — Northside Animal Hospital", "detail": "FA1234567 renewal not yet submitted.", "category": "dea", "date": "2026-03-15"},
    {"severity": "warning", "title": "State license renewal due — Valley Veterinary Group", "detail": "CA facility license expires in 18 days.", "category": "license", "date": "2026-03-15"},
    {"severity": "warning", "title": "Acquisition diligence: 2 expired DEAs found", "detail": "Blue Ridge Veterinary flagged critical gaps.", "category": "acquisition", "date": "2026-03-10"},
    {"severity": "info", "title": "New acquisition onboarding started", "detail": "Sunrise Veterinary Clinic added to queue.", "category": "acquisition", "date": "2026-03-08"},
    {"severity": "warning", "title": "CS log gap — Paws & Claws", "detail": "Biennial inventory not on file.", "category": "cs_log", "date": "2026-03-11"},
]

TARGET_FORMS = [
    {"id": "form-224a", "code": "DEA Form 224a", "name": "DEA Registration Renewal", "phase": "v2", "agent_capable": True,
     "description": "Renew practitioner DEA registration every 3 years per location.",
     "submit_note": "Registrant reviews pre-filled PDF, then submits via DEA Diversion Control portal."},
    {"id": "form-biennial", "code": "21 CFR §1304.11", "name": "Biennial CS Inventory", "phase": "v2", "agent_capable": True,
     "description": "Complete inventory of Schedules II–V required at least every 2 years.",
     "submit_note": "Agent assembles audit-ready packet; DVM signs and retains on-site."},
    {"id": "form-106", "code": "DEA Form 106", "name": "Theft or Loss Report", "phase": "v2", "agent_capable": True,
     "description": "Report significant theft or loss of controlled substances.",
     "submit_note": "Agent drafts from incident data; registrant submits within required timeframe."},
    {"id": "form-address", "code": "DEA Modification", "name": "Address / Ownership Change", "phase": "v2", "agent_capable": True,
     "description": "Notify DEA of address or ownership changes during acquisitions.",
     "submit_note": "Pre-filled change notification for acquired or relocated clinics."},
    {"id": "form-state-renewal", "code": "State-specific", "name": "State Vet Board Renewal", "phase": "v3", "agent_capable": False,
     "description": "Facility and DVM license renewals — 50 different portals.",
     "submit_note": "Roadmap: state rules engine + portal-specific pre-fill."},
    {"id": "form-diligence", "code": "M&A Diligence", "name": "Acquisition Diligence Packet", "phase": "v2", "agent_capable": True,
     "description": "DEA, license, and CS log gaps for target clinics before close.",
     "submit_note": "Agent cross-checks seller docs against registry before LOI."},
]

AGENT_JOBS = {
    "form-224a": {
        "title": "DEA Form 224a — Northside Animal Hospital",
        "fields": [
            ("DEA registration number", "FA1234567", "Location registry", False),
            ("Registrant name", "Dr. Sarah Chen, DVM", "HR / credentialing", False),
            ("Business activity", "Practitioner — Veterinary", "DEA schedule", False),
            ("Schedules authorized", "II, III, IV, V", "Prior registration", False),
            ("Practice address", "1842 North Lamar Blvd, Austin, TX 78756", "Location registry", False),
            ("State license number", "TX-VET-88421", "State board record", False),
            ("Expiration date (current)", "April 15, 2026", "Renewal calendar", True),
            ("Attestation — CS training (CAA 2023)", "Eligible — 8hr training on file", "Credentialing", True),
        ],
    },
    "form-biennial": {
        "title": "Biennial Inventory — Lakeview Pet Care",
        "fields": [
            ("DEA registration number", "FC3456789", "Location registry", False),
            ("Inventory date", "March 15, 2026", "Compliance calendar", False),
            ("Schedule II substances", "12 line items", "CS log sync (VetSnap)", False),
            ("Schedule III–V substances", "34 line items", "CS log sync", False),
            ("Last biennial inventory", "March 12, 2024", "Audit history", False),
            ("Discrepancies flagged", "0", "Reconciliation engine", False),
        ],
    },
    "form-106": {
        "title": "DEA Form 106 — Midwest Animal Care (draft)",
        "fields": [
            ("DEA registration number", "FG7890123", "Location registry", False),
            ("Substance", "Ketamine HCl 100mg/mL", "Incident report", False),
            ("Quantity lost", "50 mL (1 vial)", "Incident report", False),
            ("Date discovered", "March 10, 2026", "Incident report", False),
            ("Circumstances", "Vial unaccounted for during weekly count", "Agent draft", True),
        ],
    },
    "form-address": {
        "title": "Ownership Change — Sunrise Veterinary Clinic",
        "fields": [
            ("DEA registration number", "FD4567890", "Location registry", False),
            ("Change type", "Ownership transfer (acquisition)", "M&A record", False),
            ("Previous registrant", "Sunrise Vet LLC", "Seller diligence", False),
            ("New registrant", "Demo Vet Partners — AZ Holdings", "Platform org", False),
            ("Effective date", "November 1, 2025", "Acquisition close", False),
        ],
    },
    "form-diligence": {
        "title": "Diligence Packet — Blue Ridge Veterinary",
        "fields": [
            ("Locations reviewed", "6 clinics (NC, SC)", "Deal room", False),
            ("Expired DEA registrations", "2 (Asheville, Greenville)", "Agent scan", False),
            ("Missing biennial inventories", "3 of 6 clinics", "CS log audit", False),
            ("State license transfer risk", "Low — all current", "State board check", False),
            ("Estimated remediation cost", "$4,200 + 3-week delay", "Agent estimate", True),
            ("Recommendation", "Proceed with price adjustment or escrow", "Agent summary", True),
        ],
    },
}

AGENT_STEPS = [
    "Reading location registry & credentialing data",
    "Cross-checking DEA Diversion Control requirements",
    "Pre-filling form fields from system of record",
    "Flagging fields that require human attestation",
    "Packaging PDF for compliance manager review",
]


def days_until(iso: str) -> int:
    today = date.today()
    target = datetime.strptime(iso, "%Y-%m-%d").date()
    return (target - today).days


def build_license_records() -> list[dict]:
    records = []
    for c in CLINICS:
        records.append({
            "clinic": c["name"],
            "type": "DEA registration",
            "identifier": c["dea_number"],
            "state": c["state"],
            "expires": c["dea_expires"],
            "status": c["dea_status"],
            "days_left": days_until(c["dea_expires"]),
        })
        records.append({
            "clinic": c["name"],
            "type": "State vet license",
            "identifier": f"{c['state']}-VET-{c['id'][-3:]}",
            "state": c["state"],
            "expires": c["state_license_expires"],
            "status": c["state_license_status"],
            "days_left": days_until(c["state_license_expires"]),
        })
    return sorted(records, key=lambda r: r["days_left"])

LICENSE_RECORDS = build_license_records()
