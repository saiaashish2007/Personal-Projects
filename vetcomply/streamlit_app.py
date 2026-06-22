"""VetComply — Streamlit demo matching Next.js UI for Streamlit Community Cloud."""

from __future__ import annotations

import time

import streamlit as st

from mock_data import (
    ACQUISITIONS,
    AGENT_JOBS,
    AGENT_STEPS,
    ALERTS,
    CLINICS,
    LICENSE_RECORDS,
    METRICS,
    ORGANIZATION,
    TARGET_FORMS,
)

st.set_page_config(
    page_title="VetComply",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

STATUS_STYLES = {
    "compliant": ("Compliant", "#059669", "#d1fae5", "#a7f3d0"),
    "at_risk": ("At risk", "#b45309", "#fef3c7", "#fde68a"),
    "expired": ("Expired", "#b91c1c", "#fee2e2", "#fecaca"),
    "pending": ("Pending", "#475569", "#f1f5f9", "#e2e8f0"),
}

SEVERITY_STYLES = {
    "critical": ("Critical", "#b91c1c", "#fee2e2", "#fecaca"),
    "warning": ("Warning", "#b45309", "#fef3c7", "#fde68a"),
    "info": ("Info", "#1d4ed8", "#dbeafe", "#bfdbfe"),
}


def inject_css() -> None:
    st.markdown(
        """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        html, body, [class*="css"] { font-family: 'Inter', sans-serif; }
        .block-container { padding-top: 0 !important; max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
        header[data-testid="stHeader"] { display: none; }
        [data-testid="stSidebar"] {
            background-color: #020617 !important;
            border-right: 1px solid #1e293b;
            min-width: 16rem !important;
            max-width: 16rem !important;
        }
        [data-testid="stSidebar"] > div:first-child { padding-top: 0; }
        [data-testid="stSidebar"] [data-testid="stMarkdown"] p,
        [data-testid="stSidebar"] [data-testid="stMarkdown"] h1,
        [data-testid="stSidebar"] [data-testid="stMarkdown"] h2,
        [data-testid="stSidebar"] [data-testid="stMarkdown"] h3 { color: #f8fafc; }
        [data-testid="stSidebar"] .sidebar-brand { padding: 1.25rem 1.25rem 1rem; border-bottom: 1px solid #1e293b; }
        [data-testid="stSidebar"] .sidebar-org { padding: 1rem 1.25rem; border-bottom: 1px solid #1e293b; }
        [data-testid="stSidebar"] .sidebar-footer { padding: 1rem 1.25rem; border-top: 1px solid #1e293b; margin-top: auto; }
        [data-testid="stSidebar"] [data-testid="stRadio"] label p { font-size: 0.875rem !important; font-weight: 500 !important; }
        [data-testid="stSidebar"] [data-testid="stRadio"] > div { gap: 0.25rem; }
        [data-testid="stSidebar"] [data-testid="stRadio"] label {
            background: transparent !important;
            border-radius: 0.5rem !important;
            padding: 0.55rem 0.75rem !important;
            border: none !important;
        }
        [data-testid="stSidebar"] [data-testid="stRadio"] label:hover {
            background: #0f172a !important;
        }
        [data-testid="stSidebar"] [data-testid="stRadio"] label[data-checked="true"],
        [data-testid="stSidebar"] [data-testid="stRadio"] div[aria-checked="true"] label {
            background: rgba(20, 184, 166, 0.15) !important;
        }
        [data-testid="stSidebar"] [data-testid="stRadio"] label[data-checked="true"] p,
        [data-testid="stSidebar"] [data-testid="stRadio"] div[aria-checked="true"] label p {
            color: #5eead4 !important;
        }
        .main-wrap { background: #f8fafc; min-height: 100vh; }
        .page-header {
            background: white;
            border-bottom: 1px solid #e2e8f0;
            padding: 1.25rem 2rem;
            margin-bottom: 0;
        }
        .page-header .eyebrow {
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: #0d9488;
            margin: 0;
        }
        .page-header h1 {
            font-size: 1.25rem;
            font-weight: 600;
            color: #0f172a;
            margin: 0.25rem 0 0 0;
        }
        .page-body { padding: 2rem; }
        .section-title { font-size: 1.125rem; font-weight: 600; color: #0f172a; margin: 0 0 0.25rem 0; }
        .section-sub { font-size: 0.875rem; color: #64748b; margin: 0 0 1.25rem 0; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
        @media (max-width: 1100px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
        .stat-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 0.75rem;
            padding: 1.25rem;
            box-shadow: 0 1px 2px rgba(15,23,42,0.04);
        }
        .stat-card.success { border-color: #a7f3d0; }
        .stat-card.warning { border-color: #fde68a; }
        .stat-card.danger { border-color: #fecaca; }
        .stat-card .label { font-size: 0.875rem; font-weight: 500; color: #64748b; margin: 0; }
        .stat-card .value { font-size: 1.875rem; font-weight: 600; margin: 0.5rem 0 0 0; line-height: 1; }
        .stat-card .hint { font-size: 0.75rem; color: #64748b; margin: 0.25rem 0 0 0; }
        .stat-card .value.success { color: #047857; }
        .stat-card .value.warning { color: #b45309; }
        .stat-card .value.danger { color: #b91c1c; }
        .stat-card .value.default { color: #0f172a; }
        .agent-banner {
            background: linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%);
            border: 1px solid #99f6e4;
            border-radius: 0.75rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 2px rgba(15,23,42,0.04);
        }
        .agent-banner h3 { margin: 0; font-size: 1rem; font-weight: 600; color: #0f172a; }
        .agent-banner p { margin: 0.35rem 0 0 0; font-size: 0.875rem; color: #475569; max-width: 42rem; }
        .pill-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
        .pill {
            display: inline-flex; align-items: center; gap: 0.25rem;
            background: white; border: 1px solid #e2e8f0; border-radius: 9999px;
            padding: 0.25rem 0.625rem; font-size: 0.75rem; font-weight: 500; color: #334155;
        }
        .panel {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 0.75rem;
            box-shadow: 0 1px 2px rgba(15,23,42,0.04);
            overflow: hidden;
            margin-bottom: 1.5rem;
        }
        .panel-head {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1rem 1.25rem; border-bottom: 1px solid #f1f5f9;
            font-weight: 600; color: #0f172a; font-size: 0.95rem;
        }
        .panel-head a { color: #0d9488; font-size: 0.875rem; font-weight: 500; text-decoration: none; }
        .panel-body { padding: 0; }
        .alert-item, .deal-item, .table-row {
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #f1f5f9;
        }
        .alert-item:last-child, .deal-item:last-child { border-bottom: none; }
        .deal-item { display: flex; justify-content: space-between; gap: 1rem; }
        .deal-meta { font-size: 0.875rem; color: #64748b; margin-top: 0.25rem; }
        .risk-high { color: #dc2626; font-weight: 600; font-size: 0.875rem; }
        .risk-med { color: #d97706; font-weight: 600; font-size: 0.875rem; }
        .risk-low { color: #059669; font-weight: 600; font-size: 0.875rem; }
        .badge {
            display: inline-block; border-radius: 9999px; padding: 0.125rem 0.625rem;
            font-size: 0.75rem; font-weight: 600; margin-right: 0.5rem;
        }
        .alert-title { font-size: 0.875rem; font-weight: 600; color: #0f172a; margin: 0.35rem 0 0 0; }
        .alert-detail { font-size: 0.875rem; color: #64748b; margin: 0.25rem 0 0 0; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
        @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
        table.data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        table.data-table th {
            text-align: left; padding: 0.75rem 1.25rem; background: #f8fafc;
            color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em;
            border-bottom: 1px solid #f1f5f9; font-weight: 600;
        }
        table.data-table td {
            padding: 0.75rem 1.25rem; border-bottom: 1px solid #f1f5f9; color: #334155;
        }
        table.data-table tr:hover td { background: #f8fafc; }
        table.data-table td:first-child { font-weight: 600; color: #0f172a; }
        .agent-panel {
            background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem;
            overflow: hidden; margin-bottom: 2rem; box-shadow: 0 1px 2px rgba(15,23,42,0.04);
        }
        .agent-panel-head {
            background: linear-gradient(90deg, #0f172a, #1e293b);
            padding: 1rem 1.25rem; color: white;
        }
        .agent-panel-head h3 { margin: 0; font-size: 1rem; font-weight: 600; }
        .agent-panel-head p { margin: 0.15rem 0 0 0; font-size: 0.75rem; color: #94a3b8; }
        .agent-panel-body { padding: 1.25rem; }
        .form-pick {
            border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 0.75rem 1rem;
            margin-bottom: 0.5rem; cursor: pointer; background: white;
        }
        .form-pick.active { border-color: #5eead4; background: #f0fdfa; }
        .form-pick h4 { margin: 0; font-size: 0.875rem; font-weight: 600; color: #0f172a; }
        .form-pick p { margin: 0.2rem 0 0 0; font-size: 0.75rem; color: #64748b; }
        .hitl {
            background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 0.5rem;
            padding: 0.875rem 1rem; font-size: 0.875rem; color: #115e59; margin-top: 1rem;
        }
        div[data-testid="stButton"] button[kind="primary"] {
            background: #0d9488 !important; border: none !important;
        }
        div[data-testid="stButton"] button[kind="primary"]:hover {
            background: #0f766e !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def badge_html(kind: str, label: str | None = None) -> str:
    if kind in STATUS_STYLES:
        text, color, bg, ring = STATUS_STYLES[kind]
    elif kind in SEVERITY_STYLES:
        text, color, bg, ring = SEVERITY_STYLES[kind]
    else:
        text, color, bg, ring = STATUS_STYLES["pending"]
    display = label if label is not None else text
    return f'<span class="badge" style="color:{color};background:{bg};border:1px solid {ring}">{display}</span>'


def stat_card(label: str, value: str | int, hint: str, variant: str = "default") -> str:
    return f"""
    <div class="stat-card {variant}">
        <p class="label">{label}</p>
        <p class="value {variant}">{value}</p>
        <p class="hint">{hint}</p>
    </div>
    """


def page_shell_open() -> None:
    st.markdown('<div class="main-wrap"><div class="page-header"><p class="eyebrow">Veterinary roll-up compliance</p><h1>Platform compliance command center</h1></div><div class="page-body">', unsafe_allow_html=True)


def page_shell_close() -> None:
    st.markdown("</div></div>", unsafe_allow_html=True)


def render_sidebar() -> str:
    st.sidebar.markdown(
        """
        <div class="sidebar-brand">
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <div style="width:36px;height:36px;background:#14b8a6;border-radius:8px;display:flex;align-items:center;justify-content:center;">🛡️</div>
                <div>
                    <div style="font-size:0.875rem;font-weight:600;color:#f8fafc;">VetComply</div>
                    <div style="font-size:0.75rem;color:#94a3b8;">Compliance OS</div>
                </div>
            </div>
        </div>
        <div class="sidebar-org">
            <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">Organization</div>
            <div style="font-size:0.875rem;font-weight:500;color:#f8fafc;margin-top:0.25rem;">"""
        + ORGANIZATION["name"]
        + """</div>
            <div style="font-size:0.75rem;color:#94a3b8;margin-top:0.15rem;">"""
        + f"{ORGANIZATION['location_count']} locations · {ORGANIZATION['states_active']} states"
        + """</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    pages = ["Overview", "Locations", "Acquisitions", "Licenses & DEA", "Alerts"]
    choice = st.sidebar.radio("Navigation", pages, label_visibility="collapsed")

    st.sidebar.markdown(
        '<div class="sidebar-footer"><div style="background:rgba(245,158,11,0.1);border-radius:8px;padding:0.75rem;font-size:0.75rem;color:#fcd34d;">Demo mode — mock data for VC pitch</div></div>',
        unsafe_allow_html=True,
    )
    return choice


def render_agent_banner() -> None:
    pills = "".join(
        f'<span class="pill">📄 {f["code"]}</span>'
        for f in TARGET_FORMS
        if f["agent_capable"]
    )
    st.markdown(
        f"""
        <div class="agent-banner">
            <div style="display:flex;gap:1rem;align-items:flex-start;">
                <div style="width:44px;height:44px;background:#0d9488;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✨</div>
                <div style="flex:1;">
                    <h3>Compliance Agent (v2)</h3>
                    <p>Pre-fills DEA renewals, biennial inventories, Form 106, ownership changes, and M&A diligence packets from your registry — not just document storage.</p>
                    <div class="pill-row">{pills}</div>
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_compliance_agent_on_overview() -> None:
    st.markdown(
        """
        <div class="agent-panel">
            <div class="agent-panel-head">
                <h3>🤖 Compliance Agent</h3>
                <p>Pre-fill & package — you review and submit</p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    agent_ready = [f for f in TARGET_FORMS if f["agent_capable"]]
    col_forms, col_run = st.columns([1, 1.4])

    with col_forms:
        st.markdown("**Target forms**")
        form_labels = [f["code"] for f in agent_ready]
        if "selected_form_code" not in st.session_state:
            st.session_state.selected_form_code = form_labels[0]
        selected_code = st.radio(
            "Select form",
            form_labels,
            label_visibility="collapsed",
            key="overview_form_radio",
        )
        form = next(f for f in agent_ready if f["code"] == selected_code)
        st.caption(form["description"])
        st.caption(f"_{form['submit_note']}_")

        with st.expander("All target forms (roadmap)"):
            for f in TARGET_FORMS:
                tag = "✨ Agent-ready" if f["agent_capable"] else f"📋 {f['phase']} roadmap"
                st.markdown(f"**{f['code']}** — {tag}  \n{f['description']}")

    with col_run:
        form_id = form["id"]
        st.markdown(f"**Selected:** {form['name']}")
        if st.button("✨ Generate with Compliance Agent", type="primary", use_container_width=True):
            progress = st.progress(0)
            status = st.empty()
            for i, step in enumerate(AGENT_STEPS):
                status.markdown(f"⏳ {step}")
                progress.progress((i + 1) / len(AGENT_STEPS))
                time.sleep(0.5)
            status.markdown("✅ **Agent complete**")
            st.session_state["overview_agent_result"] = form_id

        if st.session_state.get("overview_agent_result") == form_id:
            job = AGENT_JOBS[form_id]
            st.success(f"**{job['title']}** — ready for review")

            rows = ""
            for field, value, source, review in job["fields"]:
                review_tag = ' <span style="color:#b45309;font-size:0.7rem;font-weight:700;">REVIEW</span>' if review else ""
                rows += f"""
                <tr style="{"background:#fffbeb;" if review else ""}">
                    <td>{field}{review_tag}</td>
                    <td>{value}</td>
                    <td style="color:#64748b;font-size:0.8rem;">{source}</td>
                </tr>
                """

            st.markdown(
                f"""
                <table class="data-table">
                    <thead><tr><th>Field</th><th>Pre-filled value</th><th>Source</th></tr></thead>
                    <tbody>{rows}</tbody>
                </table>
                <div class="hitl"><strong>Human-in-the-loop:</strong> Compliance manager reviews, then submits via official portal.</div>
                """,
                unsafe_allow_html=True,
            )


def page_overview() -> None:
    page_shell_open()

    st.markdown('<p class="section-title">Portfolio health</p>', unsafe_allow_html=True)
    st.markdown(
        '<p class="section-sub">Single source of truth for DEA registrations, state licenses, and controlled substance compliance across all locations.</p>',
        unsafe_allow_html=True,
    )

    total = METRICS["compliant_locations"] + METRICS["at_risk_locations"]
    st.markdown(
        f"""
        <div class="stat-grid">
            {stat_card("Compliant locations", METRICS["compliant_locations"], f"of {total} active", "success")}
            {stat_card("At-risk locations", METRICS["at_risk_locations"], "Renewal or log gaps", "warning")}
            {stat_card("Expired items", METRICS["expired_items"], "DEA, licenses, or logs", "danger")}
            {stat_card("Renewals due (30d)", METRICS["renewals_due_30_days"], "Across all states", "default")}
        </div>
        """,
        unsafe_allow_html=True,
    )

    render_agent_banner()
    render_compliance_agent_on_overview()

    critical = [a for a in ALERTS if a["severity"] == "critical"]
    alerts_html = ""
    for a in critical:
        alerts_html += f"""
        <div class="alert-item">
            {badge_html("critical")}
            <p class="alert-title">{a["title"]}</p>
            <p class="alert-detail">{a["detail"]}</p>
        </div>
        """

    deals_html = ""
    for deal in ACQUISITIONS:
        risk_class = "risk-high" if deal["risk_score"] >= 60 else "risk-med" if deal["risk_score"] >= 40 else "risk-low"
        deals_html += f"""
        <div class="deal-item">
            <div>
                <div style="font-size:0.875rem;font-weight:600;color:#0f172a;">{deal["target_name"]}</div>
                <div class="deal-meta">{deal["locations"]} clinics · Close {deal["close_date"]} · {deal["stage"].title()}</div>
            </div>
            <div class="{risk_class}">Risk {deal["risk_score"]}</div>
        </div>
        """

    st.markdown(
        f"""
        <div class="two-col">
            <div class="panel">
                <div class="panel-head">Critical alerts</div>
                <div class="panel-body">{alerts_html}</div>
            </div>
            <div class="panel">
                <div class="panel-head">Acquisition pipeline</div>
                <div class="panel-body">{deals_html}
                    <div style="padding:0.75rem 1.25rem;border-top:1px solid #f1f5f9;font-size:0.875rem;color:#64748b;">
                        Avg. integration timeline: {METRICS["avg_integration_days"]} days
                    </div>
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    at_risk = [
        c for c in CLINICS
        if c["dea_status"] != "compliant"
        or c["state_license_status"] != "compliant"
        or c["cs_log_status"] != "compliant"
    ]
    rows = ""
    for c in at_risk:
        rows += f"""
        <tr>
            <td>{c["name"]}</td>
            <td>{c["state"]}</td>
            <td>{badge_html(c["dea_status"])}</td>
            <td>{badge_html(c["state_license_status"])}</td>
            <td>{badge_html(c["cs_log_status"])}</td>
            <td style="text-transform:capitalize;">{c["integration_status"].replace("_", " ")}</td>
        </tr>
        """

    st.markdown(
        f"""
        <div class="panel">
            <div class="panel-head">Locations needing attention</div>
            <table class="data-table">
                <thead><tr>
                    <th>Clinic</th><th>State</th><th>DEA</th><th>State license</th><th>CS logs</th><th>Integration</th>
                </tr></thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
        """,
        unsafe_allow_html=True,
    )
    page_shell_close()


def page_locations() -> None:
    page_shell_open()
    st.markdown('<p class="section-title">All locations</p>', unsafe_allow_html=True)
    st.markdown('<p class="section-sub">Compliance status per clinic — DEA, state board licenses, and controlled substance logs.</p>', unsafe_allow_html=True)

    rows = ""
    for c in CLINICS:
        rows += f"""
        <tr>
            <td>{c["name"]}</td>
            <td>{c["city"]}, {c["state"]}</td>
            <td style="font-family:monospace;font-size:0.8rem;">{c["dea_number"]}</td>
            <td>{c["dea_expires"]}</td>
            <td>{badge_html(c["dea_status"])}</td>
            <td>{badge_html(c["state_license_status"])}</td>
            <td>{badge_html(c["cs_log_status"])}</td>
        </tr>
        """
    st.markdown(f'<div class="panel"><table class="data-table"><thead><tr><th>Clinic</th><th>Location</th><th>DEA #</th><th>DEA expires</th><th>DEA</th><th>License</th><th>CS logs</th></tr></thead><tbody>{rows}</tbody></table></div>', unsafe_allow_html=True)
    page_shell_close()


def page_acquisitions() -> None:
    page_shell_open()
    st.markdown('<p class="section-title">M&A compliance diligence</p>', unsafe_allow_html=True)
    st.markdown('<p class="section-sub">Track DEA and license gaps discovered during diligence — before they become post-close liabilities.</p>', unsafe_allow_html=True)

    for deal in ACQUISITIONS:
        risk_class = "risk-high" if deal["risk_score"] >= 60 else "risk-med" if deal["risk_score"] >= 40 else "risk-low"
        flags_html = ""
        for flag in deal["flags"]:
            sev = flag["severity"]
            flags_html += f'<div style="padding:0.75rem 1rem;background:#f8fafc;border-radius:8px;margin-bottom:0.5rem;">{badge_html(sev)}<strong style="font-size:0.875rem;">{flag["title"]}</strong><div style="font-size:0.875rem;color:#64748b;margin-top:0.25rem;">{flag["detail"]}</div></div>'

        checklist_html = ""
        for item in deal["checklist"]:
            mark = "✅" if item["done"] else "⬜"
            style = "text-decoration:line-through;color:#94a3b8;" if item["done"] else ""
            checklist_html += f'<div style="padding:0.6rem 0;border-bottom:1px solid #f1f5f9;"><span>{mark}</span> <span style="{style}font-size:0.875rem;">{item["label"]}</span><div style="font-size:0.75rem;color:#94a3b8;">{item["owner"]} · Due {item["due"]}</div></div>'

        st.markdown(
            f"""
            <div class="panel" style="margin-bottom:1.5rem;">
                <div class="panel-head">
                    <span>{deal["target_name"]}</span>
                    <span class="{risk_class}">Risk {deal["risk_score"]}</span>
                </div>
                <div style="padding:1rem 1.25rem;">
                    <div class="deal-meta" style="margin-bottom:1rem;">{deal["locations"]} clinics · {", ".join(deal["states"])} · Close {deal["close_date"]} · {deal["stage"].title()}</div>
                    <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:0.5rem;">Diligence findings</div>
                    {flags_html}
                    <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;color:#64748b;margin:1rem 0 0.5rem;">Integration checklist</div>
                    {checklist_html}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    page_shell_close()


def page_licenses() -> None:
    page_shell_open()
    st.markdown('<p class="section-title">Licenses & DEA registry</p>', unsafe_allow_html=True)
    st.markdown('<p class="section-sub">Renewal calendar across all locations — replaces spreadsheet tracking.</p>', unsafe_allow_html=True)

    expired = len([r for r in LICENSE_RECORDS if r["days_left"] < 0])
    soon = len([r for r in LICENSE_RECORDS if 0 <= r["days_left"] <= 60])
    st.markdown(
        f"""
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
            <div class="stat-card danger"><p class="label">Expired</p><p class="value danger">{expired}</p></div>
            <div class="stat-card warning"><p class="label">Expiring within 60 days</p><p class="value warning">{soon}</p></div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    rows = ""
    for r in LICENSE_RECORDS:
        days_str = f"{abs(r['days_left'])}d overdue" if r["days_left"] < 0 else f"{r['days_left']}d"
        color = "#dc2626" if r["days_left"] < 0 else "#d97706" if r["days_left"] <= 30 else "#334155"
        rows += f"""
        <tr>
            <td>{r["clinic"]}</td><td>{r["type"]}</td>
            <td style="font-family:monospace;font-size:0.8rem;">{r["identifier"]}</td>
            <td>{r["state"]}</td><td>{r["expires"]}</td>
            <td style="color:{color};font-weight:600;">{days_str}</td>
            <td>{badge_html(r["status"])}</td>
        </tr>
        """
    st.markdown(f'<div class="panel"><table class="data-table"><thead><tr><th>Clinic</th><th>Type</th><th>Identifier</th><th>State</th><th>Expires</th><th>Days left</th><th>Status</th></tr></thead><tbody>{rows}</tbody></table></div>', unsafe_allow_html=True)
    page_shell_close()


def page_alerts() -> None:
    page_shell_open()
    st.markdown('<p class="section-title">Compliance alerts</p>', unsafe_allow_html=True)
    st.markdown('<p class="section-sub">Proactive notifications — expired DEAs, renewal deadlines, and diligence flags.</p>', unsafe_allow_html=True)

    order = {"critical": 0, "warning": 1, "info": 2}
    items = ""
    for a in sorted(ALERTS, key=lambda x: order[x["severity"]]):
        items += f"""
        <div class="alert-item">
            {badge_html(a["severity"])}
            <span class="badge" style="color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;">{a["category"].upper()}</span>
            <span style="font-size:0.75rem;color:#94a3b8;">{a["date"]}</span>
            <p class="alert-title">{a["title"]}</p>
            <p class="alert-detail">{a["detail"]}</p>
        </div>
        """
    st.markdown(f'<div class="panel"><div class="panel-body">{items}</div></div>', unsafe_allow_html=True)
    page_shell_close()


def main() -> None:
    inject_css()
    choice = render_sidebar()

    pages = {
        "Overview": page_overview,
        "Locations": page_locations,
        "Acquisitions": page_acquisitions,
        "Licenses & DEA": page_licenses,
        "Alerts": page_alerts,
    }
    pages[choice]()


if __name__ == "__main__":
    main()
