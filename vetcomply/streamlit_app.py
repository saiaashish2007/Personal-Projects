"""VetComply — Streamlit demo for VC pitch (deploy on Streamlit Community Cloud)."""

from __future__ import annotations

import time

import pandas as pd
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

STATUS_EMOJI = {
    "compliant": "🟢",
    "at_risk": "🟡",
    "expired": "🔴",
    "pending": "⚪",
}

SEVERITY_EMOJI = {
    "critical": "🔴",
    "warning": "🟡",
    "info": "🔵",
}


def inject_css() -> None:
    st.markdown(
        """
        <style>
        .vetcomply-header {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            padding: 1.25rem 1.5rem;
            border-radius: 12px;
            margin-bottom: 1.5rem;
            color: white;
        }
        .vetcomply-header h1 { color: white !important; margin: 0; font-size: 1.5rem; }
        .vetcomply-header p { color: #94a3b8; margin: 0.25rem 0 0 0; font-size: 0.9rem; }
        .agent-banner {
            background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%);
            border: 1px solid #99f6e4;
            border-radius: 12px;
            padding: 1.25rem;
            margin: 1rem 0;
        }
        div[data-testid="stMetric"] {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 0.75rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_header(subtitle: str) -> None:
    st.markdown(
        f"""
        <div class="vetcomply-header">
            <h1>🛡️ VetComply</h1>
            <p>{subtitle}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def sidebar_org() -> None:
    st.sidebar.markdown("### Organization")
    st.sidebar.markdown(f"**{ORGANIZATION['name']}**")
    st.sidebar.caption(
        f"{ORGANIZATION['location_count']} locations · "
        f"{ORGANIZATION['states_active']} states"
    )
    st.sidebar.divider()
    st.sidebar.caption("Demo mode — mock data for VC pitch")


def page_overview() -> None:
    render_header("Platform compliance command center for veterinary roll-ups")
    sidebar_org()

    st.subheader("Portfolio health")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Compliant locations", METRICS["compliant_locations"])
    c2.metric("At-risk locations", METRICS["at_risk_locations"])
    c3.metric("Expired items", METRICS["expired_items"])
    c4.metric("Renewals due (30d)", METRICS["renewals_due_30_days"])

    st.markdown(
        """
        <div class="agent-banner">
        <strong>✨ Compliance Agent (v2)</strong> — Pre-fills DEA Form 224a, biennial inventory,
        Form 106, ownership changes, and M&A diligence packets from your registry.
        Go to <strong>Compliance Agent</strong> in the sidebar to try it.
        </div>
        """,
        unsafe_allow_html=True,
    )

    col_l, col_r = st.columns(2)
    with col_l:
        st.markdown("#### Critical alerts")
        for a in [x for x in ALERTS if x["severity"] == "critical"]:
            st.error(f"**{a['title']}**\n\n{a['detail']}")
    with col_r:
        st.markdown("#### Acquisition pipeline")
        for deal in ACQUISITIONS:
            risk_color = "🔴" if deal["risk_score"] >= 60 else "🟡" if deal["risk_score"] >= 40 else "🟢"
            st.markdown(
                f"**{deal['target_name']}**  \n"
                f"{deal['locations']} clinics · {deal['stage'].title()} · "
                f"{risk_color} Risk {deal['risk_score']}"
            )
        st.caption(f"Avg. integration timeline: {METRICS['avg_integration_days']} days")

    st.markdown("#### Locations needing attention")
    at_risk = [
        c for c in CLINICS
        if c["dea_status"] != "compliant"
        or c["state_license_status"] != "compliant"
        or c["cs_log_status"] != "compliant"
    ]
    df = pd.DataFrame(
        [
            {
                "Clinic": c["name"],
                "State": c["state"],
                "DEA": f"{STATUS_EMOJI[c['dea_status']]} {c['dea_status'].replace('_', ' ').title()}",
                "License": f"{STATUS_EMOJI[c['state_license_status']]} {c['state_license_status'].replace('_', ' ').title()}",
                "CS Logs": f"{STATUS_EMOJI[c['cs_log_status']]} {c['cs_log_status'].replace('_', ' ').title()}",
                "Integration": c["integration_status"].replace("_", " ").title(),
            }
            for c in at_risk
        ]
    )
    st.dataframe(df, use_container_width=True, hide_index=True)


def page_locations() -> None:
    render_header("Per-clinic DEA, license, and controlled substance log status")
    sidebar_org()

    df = pd.DataFrame(
        [
            {
                "Clinic": c["name"],
                "Location": f"{c['city']}, {c['state']}",
                "DEA #": c["dea_number"],
                "DEA Expires": c["dea_expires"],
                "DEA": f"{STATUS_EMOJI[c['dea_status']]} {c['dea_status'].replace('_', ' ').title()}",
                "License": f"{STATUS_EMOJI[c['state_license_status']]} {c['state_license_status'].replace('_', ' ').title()}",
                "CS Logs": f"{STATUS_EMOJI[c['cs_log_status']]} {c['cs_log_status'].replace('_', ' ').title()}",
            }
            for c in CLINICS
        ]
    )
    st.dataframe(df, use_container_width=True, hide_index=True)


def page_acquisitions() -> None:
    render_header("M&A compliance diligence — catch expired DEAs before close")
    sidebar_org()

    for deal in ACQUISITIONS:
        risk = deal["risk_score"]
        risk_label = "🔴 High" if risk >= 60 else "🟡 Medium" if risk >= 40 else "🟢 Low"
        with st.expander(f"**{deal['target_name']}** — {risk_label} risk ({risk})", expanded=deal["id"] == "acq-001"):
            st.caption(
                f"{deal['locations']} clinics · {', '.join(deal['states'])} · "
                f"Close {deal['close_date']} · {deal['stage'].title()}"
            )
            if deal["flags"]:
                st.markdown("**Diligence findings**")
                for flag in deal["flags"]:
                    icon = SEVERITY_EMOJI.get(flag["severity"], "⚪")
                    st.markdown(f"{icon} **{flag['title']}** — {flag['detail']}")
            st.markdown("**Integration checklist**")
            for item in deal["checklist"]:
                check = "✅" if item["done"] else "⬜"
                style = "~~" if item["done"] else ""
                st.markdown(
                    f"{check} {style}{item['label']}{style}  \n"
                    f"<small>{item['owner']} · Due {item['due']}</small>",
                    unsafe_allow_html=True,
                )


def page_licenses() -> None:
    render_header("Renewal calendar — replaces spreadsheet tracking")
    sidebar_org()

    expired = len([r for r in LICENSE_RECORDS if r["days_left"] < 0])
    soon = len([r for r in LICENSE_RECORDS if 0 <= r["days_left"] <= 60])
    c1, c2 = st.columns(2)
    c1.metric("Expired", expired)
    c2.metric("Expiring within 60 days", soon)

    st.info("💡 Use **Compliance Agent** in the sidebar to pre-fill DEA Form 224a renewals.")

    rows = []
    for r in LICENSE_RECORDS:
        if r["days_left"] < 0:
            days_str = f"{abs(r['days_left'])}d overdue"
        else:
            days_str = f"{r['days_left']}d"
        rows.append({
            "Clinic": r["clinic"],
            "Type": r["type"],
            "Identifier": r["identifier"],
            "State": r["state"],
            "Expires": r["expires"],
            "Days left": days_str,
            "Status": f"{STATUS_EMOJI[r['status']]} {r['status'].replace('_', ' ').title()}",
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


def page_alerts() -> None:
    render_header("Proactive compliance notifications")
    sidebar_org()

    order = {"critical": 0, "warning": 1, "info": 2}
    sorted_alerts = sorted(ALERTS, key=lambda a: order[a["severity"]])
    for a in sorted_alerts:
        icon = SEVERITY_EMOJI[a["severity"]]
        if a["severity"] == "critical":
            st.error(f"{icon} **{a['title']}** ({a['category'].upper()})  \n{a['detail']}")
        elif a["severity"] == "warning":
            st.warning(f"{icon} **{a['title']}** ({a['category'].upper()})  \n{a['detail']}")
        else:
            st.info(f"{icon} **{a['title']}** ({a['category'].upper()})  \n{a['detail']}")


def page_agent() -> None:
    render_header("Compliance Agent — pre-fill forms from your registry (human reviews & submits)")
    sidebar_org()

    st.caption(
        "VetComply doesn't just track licenses — it pre-fills the forms roll-up teams waste hours on."
    )

    form_options = {f["code"]: f["id"] for f in TARGET_FORMS}
    form_labels = list(form_options.keys())
    selected_code = st.selectbox("Target form", form_labels, index=0)
    form_id = form_options[selected_code]
    form = next(f for f in TARGET_FORMS if f["id"] == form_id)

    st.markdown(f"**{form['name']}** ({form['phase']})")
    st.caption(form["description"])
    st.caption(f"_{form['submit_note']}_")

    if not form["agent_capable"]:
        st.warning("Coming in v3 — state rules engine for 50 vet board portals.")
        return

    if st.button("✨ Generate with Compliance Agent", type="primary", use_container_width=True):
        progress = st.progress(0, text="Starting agent…")
        status = st.empty()
        for i, step in enumerate(AGENT_STEPS):
            status.markdown(f"⏳ {step}")
            progress.progress((i + 1) / len(AGENT_STEPS), text=step)
            time.sleep(0.55)
        status.markdown("✅ **Agent complete**")
        st.session_state["agent_result"] = form_id

    if st.session_state.get("agent_result") == form_id:
        job = AGENT_JOBS[form_id]
        st.success(f"**{job['title']}** — ready for review")
        df = pd.DataFrame(
            [
                {
                    "Field": f[0] + (" ⚠️ REVIEW" if f[3] else ""),
                    "Pre-filled value": f[1],
                    "Source": f[2],
                }
                for f in job["fields"]
            ]
        )
        st.dataframe(df, use_container_width=True, hide_index=True)
        st.markdown(
            "**Human-in-the-loop:** Compliance manager reviews, then submits via official portal."
        )
        st.button("Mark reviewed & assign submitter", disabled=True, help="Demo only")

    with st.expander("All target forms (roadmap)"):
        for f in TARGET_FORMS:
            cap = "✨ Agent-ready" if f["agent_capable"] else "📋 Roadmap"
            st.markdown(f"**{f['code']}** ({f['phase']}) — {cap}  \n{f['description']}")


def main() -> None:
    inject_css()

    pages = {
        "Overview": page_overview,
        "Locations": page_locations,
        "Acquisitions": page_acquisitions,
        "Licenses & DEA": page_licenses,
        "Compliance Agent": page_agent,
        "Alerts": page_alerts,
    }

    st.sidebar.markdown("## Navigation")
    choice = st.sidebar.radio("Go to", list(pages.keys()), label_visibility="collapsed")
    pages[choice]()


if __name__ == "__main__":
    main()
