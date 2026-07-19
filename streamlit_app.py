"""
streamlit_app.py
AI-Driven Cyber Resilience SOC Dashboard — Streamlit edition.

Strict black-and-white theme as per checklist item I.
All panels pull from FastAPI REST endpoints — zero hardcoded/mock data.

Run:
    streamlit run streamlit_app.py
(FastAPI must be running at http://localhost:8000 first)
"""

import time
import requests
import streamlit as st
import pandas as pd
import numpy as np
import networkx as nx
import plotly.graph_objects as go

# ── Page config ──────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="ET // Cyber Command",
    page_icon="🛡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Strict black-and-white custom CSS
st.markdown("""
<style>
/* Import monospace font */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap');

/* Full black background */
html, body, [data-testid="stAppViewContainer"], [data-testid="stApp"] {
    background-color: #000000 !important;
    color: #ffffff !important;
    font-family: 'Inter', sans-serif !important;
}

/* Sidebar */
[data-testid="stSidebar"] {
    background-color: #0a0a0a !important;
    border-right: 1px solid #1a1a1a !important;
}
[data-testid="stSidebar"] * { color: #d0d0d0 !important; }
[data-testid="stSidebar"] .stRadio label { color: #888 !important; }

/* Cards and sections */
[data-testid="stMetric"] {
    background: #0f0f0f !important;
    border: 1px solid #1e1e1e !important;
    border-radius: 6px !important;
    padding: 12px !important;
}
[data-testid="stMetricValue"] { color: #ffffff !important; font-family: 'JetBrains Mono', monospace !important; }
[data-testid="stMetricLabel"] { color: #666 !important; }
[data-testid="stMetricDelta"] { color: #888 !important; }

/* Headers */
h1, h2, h3 { color: #ffffff !important; font-family: 'Inter', sans-serif !important; }
h1 { font-size: 18px !important; letter-spacing: 0.05em !important; text-transform: uppercase; }
h2 { font-size: 15px !important; }

/* Dataframes / tables */
[data-testid="stDataFrame"] { background: #0a0a0a !important; border: 1px solid #1e1e1e !important; }
.dataframe { background: #000 !important; color: #ccc !important; }
.dataframe th { background: #111 !important; color: #888 !important; border-bottom: 1px solid #222 !important; }
.dataframe td { border-bottom: 1px solid #1a1a1a !important; }

/* Buttons */
.stButton button {
    background: #1a1a1a !important;
    color: #ffffff !important;
    border: 1px solid #333 !important;
    border-radius: 4px !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 12px !important;
    transition: border-color 0.2s;
}
.stButton button:hover { border-color: #ffffff !important; }
.stButton button[kind="primary"] { background: #ffffff !important; color: #000000 !important; }

/* Text inputs */
.stTextInput input, .stNumberInput input {
    background: #0a0a0a !important;
    color: #ffffff !important;
    border: 1px solid #222 !important;
    border-radius: 4px !important;
    font-family: 'JetBrains Mono', monospace !important;
}

/* Tabs */
[data-baseweb="tab-list"] { background: #000 !important; border-bottom: 1px solid #1e1e1e !important; }
[data-baseweb="tab"] { color: #555 !important; }
[aria-selected="true"] { color: #fff !important; border-bottom-color: #fff !important; }

/* Divider */
hr { border-color: #1a1a1a !important; }

/* Badges / pills via markdown */
.badge-red   { background:#1a0000; color:#ff4444; padding:2px 8px; border-radius:3px; font-size:11px; }
.badge-white { background:#1a1a1a; color:#ffffff; padding:2px 8px; border-radius:3px; font-size:11px; }
.badge-gray  { background:#111;    color:#888888; padding:2px 8px; border-radius:3px; font-size:11px; }

/* Spinner */
[data-testid="stSpinner"] { color: #fff !important; }

/* Alerts */
[data-testid="stAlert"] { background: #0a0a0a !important; border: 1px solid #1e1e1e !important; color: #aaa !important; }

/* Selectbox */
[data-baseweb="select"] { background: #0a0a0a !important; border-color: #222 !important; }
</style>
""", unsafe_allow_html=True)

API_BASE = "http://localhost:8000"

# ── API helpers ───────────────────────────────────────────────────────────────

@st.cache_data(ttl=30)
def api_get(endpoint: str):
    """GET request to FastAPI backend. Returns dict or None on failure."""
    try:
        r = requests.get(f"{API_BASE}{endpoint}", timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        st.error(f"Backend unreachable: {e}")
    return None


def api_post(endpoint: str, payload: dict):
    """POST request to FastAPI backend."""
    try:
        r = requests.post(f"{API_BASE}{endpoint}", json=payload, timeout=10)
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


def badge(text: str, kind: str = "gray") -> str:
    return f'<span class="badge-{kind}">{text}</span>'


def decision_kind(d: str) -> str:
    if not d:
        return "gray"
    dl = d.upper()
    if "AUTO_CONTAIN" in dl:
        return "red"
    if "ESCALATE" in dl:
        return "white"
    return "gray"


# ── Sidebar ───────────────────────────────────────────────────────────────────

with st.sidebar:
    st.markdown("## 🛡 ET // Cyber Command")
    st.markdown("**AI-Driven Cyber Resilience**")
    st.markdown("---")

    # Pipeline status
    status_data = api_get("/api/status")
    if status_data and status_data.get("status") == "ready":
        st.success("● PIPELINE READY")
    else:
        st.warning("⏳ INITIALIZING...")
        st.info("Pipeline trains on startup (~60s). Refresh when ready.")
        st.stop()

    st.markdown("---")
    page = st.radio(
        "Navigation",
        ["Overview & Metrics", "FPR-Recall Tradeoff", "BFT Vote Log",
         "Lateral Movement Graph", "Audit Log", "Threat Intel RAG"],
        label_visibility="collapsed",
    )
    st.markdown("---")

    metrics_data = api_get("/api/metrics")
    if metrics_data:
        st.markdown(f"**FPR:** `{metrics_data.get('fpr', 0)*100:.2f}%`")
        st.markdown(f"**Recall:** `{metrics_data.get('recall', 0)*100:.2f}%`")
        st.markdown(f"**Samples:** `{metrics_data.get('n_samples', 0):,}`")
        st.markdown(f"**Latency:** `{metrics_data.get('latency_ms', 0):.0f} ms`")

    if st.button("🔄 Refresh All Data"):
        st.cache_data.clear()
        st.rerun()


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE: Overview & Metrics
# ═══════════════════════════════════════════════════════════════════════════════

if page == "Overview & Metrics":
    st.markdown("# OVERVIEW / DETECTION METRICS")
    st.markdown("---")

    d = api_get("/api/metrics")
    if not d:
        st.error("Could not load metrics."); st.stop()

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("False Positive Rate", f"{d['fpr']*100:.2f}%",
              delta=f"{d['fpr_delta']*100:+.2f}% vs baseline", delta_color="inverse")
    c2.metric("Recall (Detection Rate)", f"{d['recall']*100:.2f}%",
              delta=f"{d['recall_delta']*100:+.2f}% vs baseline")
    c3.metric("Burst FPR Reduction", f"{d['burst_fpr_red']:.1f}%",
              delta="calendar-conditioned")
    c4.metric("End-to-End Latency", f"{d['latency_ms']:.0f} ms",
              delta=f"vs {d['ibm_mtti']}d IBM MTTI", delta_color="off")

    st.markdown("---")
    st.markdown("### Flagged Entities · Human-in-the-Loop Gate")

    entities_data = api_get("/api/entities")
    if entities_data:
        rows = entities_data.get("entities", [])
        df_rows = []
        for e in rows:
            votes = e.get("votes", [])
            vote_str = " / ".join(
                f"{'🔴' if (v.get('flagged') if isinstance(v, dict) else v) else '🟢'}"
                for v in votes
            )
            df_rows.append({
                "Entity ID": e["id"],
                "Risk Score": f"{e['risk_score']:.4f}",
                "Category": e["category"],
                "Votes A/B/C": vote_str,
                "Consensus": e.get("consensus", "—"),
                "Decision": e.get("decision", "—"),
                "Tier-0": "⚠ TIER-0" if e.get("tier0") else "",
            })
        df = pd.DataFrame(df_rows)
        st.dataframe(df, use_container_width=True, hide_index=True)

        st.markdown("### Human Override")
        col_eid, col_act, col_btn = st.columns([3, 2, 1])
        with col_eid:
            entity_sel = st.selectbox("Select Entity", [r["id"] for r in rows], key="override_sel")
        with col_act:
            action_sel = st.selectbox("Action", ["ESCALATE", "DISMISS", "AUTO_CONTAIN"], key="override_act")
        with col_btn:
            st.markdown("<br>", unsafe_allow_html=True)
            if st.button("Apply Override", type="primary"):
                result = api_post("/api/override", {"entity_id": entity_sel, "action": action_sel})
                if result:
                    st.success(f"Override applied: {entity_sel} → {action_sel}")
                    st.cache_data.clear()
                else:
                    st.error("Override failed.")


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE: FPR-Recall Tradeoff
# ═══════════════════════════════════════════════════════════════════════════════

elif page == "FPR-Recall Tradeoff":
    st.markdown("# FPR-RECALL TRADEOFF CURVE")
    st.markdown("---")

    d = api_get("/api/fpr_recall")
    if not d:
        st.error("Could not load FPR-Recall data."); st.stop()

    curve = d.get("tradeoff_curve", [])
    ablation = d.get("ablation", {})

    # Plotly chart — strict B&W
    fig = go.Figure()

    # Diagonal reference
    fig.add_trace(go.Scatter(
        x=[0, 1], y=[0, 1], mode="lines",
        line=dict(color="#333333", width=1, dash="dash"),
        name="Random Classifier", showlegend=True
    ))

    fprs = [pt["fpr"] for pt in curve]
    recalls = [pt["recall"] for pt in curve]
    mults = [pt["threshold_multiplier"] for pt in curve]

    fig.add_trace(go.Scatter(
        x=fprs, y=recalls, mode="lines+markers+text",
        line=dict(color="#ffffff", width=2.5),
        marker=dict(color="#ffffff", size=8, line=dict(color="#000", width=2)),
        text=[f"×{m}" for m in mults],
        textposition="top right",
        textfont=dict(color="#888888", size=10, family="JetBrains Mono"),
        name="Calendar-Conditioned Model",
    ))

    fig.update_layout(
        paper_bgcolor="#000000", plot_bgcolor="#000000",
        font=dict(color="#888888", family="JetBrains Mono"),
        xaxis=dict(title="False Positive Rate", range=[0, 1],
                   gridcolor="#1a1a1a", zerolinecolor="#333",
                   tickfont=dict(color="#555")),
        yaxis=dict(title="Recall (Detection Rate)", range=[0, 1.05],
                   gridcolor="#1a1a1a", zerolinecolor="#333",
                   tickfont=dict(color="#555")),
        legend=dict(bgcolor="#0a0a0a", bordercolor="#222"),
        title=dict(text="FPR-Recall Operating Points (threshold multipliers)", font=dict(size=14, color="#666")),
        margin=dict(l=60, r=20, t=60, b=60),
        height=420,
    )
    st.plotly_chart(fig, use_container_width=True)

    # Operating point table
    st.markdown("### Operating Point Table")
    df_curve = pd.DataFrame([{
        "Threshold ×": pt["threshold_multiplier"],
        "FPR": f"{pt['fpr']*100:.2f}%",
        "Recall": f"{pt['recall']*100:.2f}%",
        "Precision": f"{pt['precision']*100:.2f}%",
        "Calibrated Threshold": pt["threshold"],
        "Current": "★ Default" if pt["threshold_multiplier"] == 1.0 else "",
    } for pt in curve])
    st.dataframe(df_curve, use_container_width=True, hide_index=True)

    # Ablation study
    st.markdown("---")
    st.markdown("### Calendar Conditioning Ablation Study")
    st.markdown("""
    Both inputs are **identical legitimate high-volume traffic** (exam-period bursts).
    All labels = Normal. The calendar-naive model misflag them as attacks (false positives).
    Calendar conditioning suppresses this.
    """)
    a1, a2, a3 = st.columns(3)
    a1.metric("Baseline FPR (no calendar)", f"{ablation.get('baseline_fpr', 0)*100:.2f}%",
              help="Calendar-naive model FPR on legitimate burst traffic")
    a2.metric("Calendar-Conditioned FPR", f"{ablation.get('cal_fpr', 0)*100:.2f}%",
              delta=f"{(ablation.get('cal_fpr',0)-ablation.get('baseline_fpr',0))*100:+.2f}%", delta_color="inverse")
    a3.metric("Relative FPR Reduction", f"{ablation.get('relative_fpr_reduction', 0)*100:.2f}%",
              help="(baseline_fpr - cal_fpr) / baseline_fpr")
    st.caption(f"n_samples = {ablation.get('n_samples', '?')} legitimate burst records (exam_period phase)")


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE: BFT Vote Log
# ═══════════════════════════════════════════════════════════════════════════════

elif page == "BFT Vote Log":
    st.markdown("# BFT CONSENSUS VOTE LOG")
    st.markdown("---")
    st.markdown("""
    **3-Agent Byzantine Fault Tolerance gate** — auto-containment only fires on **2/3 quorum**.
    - Agent A: standard calibrated threshold
    - Agent B: conservative threshold (+0.02)
    - Agent C: Isolation Forest-only score (independent signal)
    """)

    d = api_get("/api/bft_log")
    if not d:
        st.error("Could not load BFT log."); st.stop()

    bft_log = d.get("bft_log", [])
    st.markdown(f"**{len(bft_log)} consensus decisions recorded**")

    rows = []
    for e in bft_log:
        rows.append({
            "Entity ID": e.get("entity_id", "?"),
            "A Flagged": "🔴 YES" if e.get("vote_A", {}).get("flagged") else "🟢 NO",
            "A Score": f"{e.get('vote_A', {}).get('score', 0):.4f}",
            "B Flagged": "🔴 YES" if e.get("vote_B", {}).get("flagged") else "🟢 NO",
            "B Score": f"{e.get('vote_B', {}).get('score', 0):.4f}",
            "C Flagged": "🔴 YES" if e.get("vote_C", {}).get("flagged") else "🟢 NO",
            "C Score (IF-only)": f"{e.get('vote_C', {}).get('score', 0):.4f}",
            "Vote Count": f"{e.get('vote_count', 0)}/3",
            "Consensus": e.get("consensus", "?"),
            "Recommended": e.get("recommended_decision", "?"),
        })

    df = pd.DataFrame(rows)
    st.dataframe(df, use_container_width=True, hide_index=True)

    # Summary donut (B&W)
    if bft_log:
        from collections import Counter
        counts = Counter(e.get("consensus", "?") for e in bft_log)
        fig2 = go.Figure(go.Pie(
            labels=list(counts.keys()),
            values=list(counts.values()),
            hole=0.6,
            marker=dict(colors=["#ffffff", "#555555", "#222222"]),
            textfont=dict(color="#000"),
        ))
        fig2.update_layout(
            paper_bgcolor="#000", plot_bgcolor="#000",
            font=dict(color="#888", family="JetBrains Mono"),
            title="Consensus Distribution", height=280,
            margin=dict(l=0, r=0, t=40, b=0),
            showlegend=True,
            legend=dict(bgcolor="#000", bordercolor="#222", font=dict(color="#888")),
        )
        col_chart, col_info = st.columns([1, 2])
        with col_chart:
            st.plotly_chart(fig2, use_container_width=True)
        with col_info:
            st.markdown("### Quorum Rule")
            st.markdown("""
            | Vote Count | Consensus | SOAR Action |
            |---|---|---|
            | 3/3 or 2/3 | **FLAGGED** | AUTO_CONTAIN |
            | 1/3 | DISPUTED | ESCALATE → Human |
            | 0/3 | CLEARED | MONITOR only |
            | Tier-0 | TIER0_OVERRIDE | ESCALATE_ONLY |
            """)


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE: Lateral Movement Graph
# ═══════════════════════════════════════════════════════════════════════════════

elif page == "Lateral Movement Graph":
    st.markdown("# LATERAL MOVEMENT ATTACK GRAPH")
    st.markdown("---")

    d = api_get("/api/graph")
    if not d:
        st.error("Could not load graph data."); st.stop()

    nodes = d.get("nodes", [])
    links = d.get("links", d.get("edges", []))

    st.markdown(f"**{len(nodes)} entities** · **{len(links)} communication edges** (top-100 by risk score)")

    if not nodes:
        st.warning("Graph is empty — no high-risk entities found.")
        st.stop()

    # Reconstruct NetworkX graph for layout
    G = nx.DiGraph()
    for n in nodes:
        G.add_node(n["id"], **n)
    for e in links:
        src = e.get("source", e.get("from", ""))
        dst = e.get("target", e.get("to", ""))
        if src and dst:
            G.add_edge(src, dst, weight=e.get("weight", 1.0))

    pos = nx.spring_layout(G, seed=42, k=2.0)

    # Build Plotly scatter graph — B&W
    edge_x, edge_y = [], []
    for src, dst in G.edges():
        x0, y0 = pos.get(src, (0, 0))
        x1, y1 = pos.get(dst, (0, 0))
        edge_x += [x0, x1, None]
        edge_y += [y0, y1, None]

    node_x = [pos[n][0] for n in G.nodes()]
    node_y = [pos[n][1] for n in G.nodes()]
    node_data = [G.nodes[n] for n in G.nodes()]
    node_text = [f"{n}<br>Score: {G.nodes[n].get('risk_score', 0):.3f}<br>{G.nodes[n].get('attack_cat', '')}" for n in G.nodes()]
    node_color = ["#ff3333" if nd.get("is_tier0") else "#ffffff" for nd in node_data]
    node_size = [max(6, int(nd.get("risk_score", 0) * 20)) for nd in node_data]

    fig3 = go.Figure()
    fig3.add_trace(go.Scatter(
        x=edge_x, y=edge_y, mode="lines",
        line=dict(width=0.8, color="#222222"),
        hoverinfo="none", showlegend=False,
    ))
    fig3.add_trace(go.Scatter(
        x=node_x, y=node_y, mode="markers+text",
        marker=dict(size=node_size, color=node_color,
                    line=dict(color="#333", width=1)),
        text=list(G.nodes()),
        textposition="top center",
        textfont=dict(color="#555555", size=8, family="JetBrains Mono"),
        hovertext=node_text,
        hoverinfo="text",
        showlegend=False,
    ))
    fig3.update_layout(
        paper_bgcolor="#000000", plot_bgcolor="#000000",
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        height=520,
        margin=dict(l=0, r=0, t=10, b=0),
    )
    st.plotly_chart(fig3, use_container_width=True)

    # Top-risk table
    st.markdown("### Highest Risk Entities")
    sorted_nodes = sorted(node_data, key=lambda n: n.get("risk_score", 0), reverse=True)
    df_nodes = pd.DataFrame([{
        "Entity ID": n.get("id", "?"),
        "Risk Score": f"{n.get('risk_score', 0):.4f}",
        "Attack Category": n.get("attack_cat", "?"),
        "Tier-0": "⚠ YES" if n.get("is_tier0") else "No",
    } for n in sorted_nodes[:20]])
    st.dataframe(df_nodes, use_container_width=True, hide_index=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE: Audit Log
# ═══════════════════════════════════════════════════════════════════════════════

elif page == "Audit Log":
    st.markdown("# SHA-256 HASH-CHAINED AUDIT LOG")
    st.markdown("---")
    st.markdown("""
    Every SOAR decision is appended to an **immutable hash chain** (SHA-256).
    `entry_hash = SHA256(prev_hash + json.dumps(event))`.
    Tampering with any record breaks the chain.
    """)

    d = api_get("/api/audit")
    if not d:
        st.error("Could not load audit log."); st.stop()

    logs = d.get("audit_logs", [])
    st.markdown(f"**{len(logs)} log entries** · Chain integrity: `verify_chain()` runs on server startup")

    rows = []
    for log in logs:
        ts = log.get("timestamp", 0)
        ts_str = pd.Timestamp(ts, unit="s").strftime("%Y-%m-%d %H:%M:%S") if ts else "—"
        rows.append({
            "Timestamp (UTC)": ts_str,
            "Entity ID": log.get("entity_id", "?"),
            "MITRE Technique": log.get("mitre_technique") or "—",
            "Playbook": log.get("playbook_name") or "—",
            "Decision": log.get("decision", "?"),
            "Steps Run": log.get("automation_coverage", "?"),
            "SHA-256 (first 24)": (log.get("entry_hash") or "")[:24] + "…",
            "Override": "YES" if log.get("override_applied") else "",
        })

    df = pd.DataFrame(rows)
    st.dataframe(df, use_container_width=True, hide_index=True)

    # Decision distribution
    if logs:
        from collections import Counter
        dec_counts = Counter(log.get("decision", "?") for log in logs)
        st.markdown("### Decision Distribution")
        fig4 = go.Figure(go.Bar(
            x=list(dec_counts.keys()),
            y=list(dec_counts.values()),
            marker_color=["#ffffff" if k == "AUTO_CONTAIN" else "#555" for k in dec_counts.keys()],
            text=list(dec_counts.values()),
            textposition="outside",
            textfont=dict(color="#888"),
        ))
        fig4.update_layout(
            paper_bgcolor="#000", plot_bgcolor="#000",
            xaxis=dict(tickfont=dict(color="#888", family="JetBrains Mono")),
            yaxis=dict(gridcolor="#111", tickfont=dict(color="#555")),
            height=280,
            margin=dict(l=40, r=20, t=20, b=40),
            font=dict(family="JetBrains Mono"),
        )
        st.plotly_chart(fig4, use_container_width=True)

    # RAG evidence panel for selected record
    st.markdown("### RAG Evidence Drill-Down")
    if logs:
        sel_idx = st.selectbox("Select log entry", range(len(logs)),
                               format_func=lambda i: f"[{i}] {logs[i].get('entity_id','?')} — {logs[i].get('decision','?')}")
        sel = logs[sel_idx]
        rag_ev = sel.get("rag_evidence")
        top_feat = sel.get("top_anomaly_features")
        c_rag, c_feat = st.columns(2)
        with c_rag:
            st.markdown("**RAG Evidence**")
            if rag_ev:
                st.json(rag_ev)
            else:
                st.caption("No RAG evidence in this record (older format).")
        with c_feat:
            st.markdown("**Top Anomaly Features**")
            if top_feat:
                st.json(top_feat)
            else:
                st.caption("No feature attribution in this record.")


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE: Threat Intel RAG
# ═══════════════════════════════════════════════════════════════════════════════

elif page == "Threat Intel RAG":
    st.markdown("# THREAT INTELLIGENCE RAG ENGINE")
    st.markdown("---")
    st.markdown("""
    **TF-IDF retrieval** over a curated local corpus of:
    - MITRE ATT&CK technique descriptions (8 techniques)
    - Representative CVE summaries (2021–2024, Indian CNI–relevant)
    - CERT-In advisory summaries (AIIMS 2022, CBSE 2024, Govt 2023, etc.)
    """)

    col_q, col_filter = st.columns([3, 1])
    with col_q:
        query = st.text_input("Query", placeholder="ransomware lateral movement healthcare",
                              key="rag_query_input")
    with col_filter:
        doc_type_filter = st.selectbox("Doc type", ["All", "mitre_technique", "cve", "cert_advisory"])

    col_k, col_btn = st.columns([1, 3])
    with col_k:
        top_k = st.number_input("Top-K results", min_value=1, max_value=10, value=3)
    with col_btn:
        st.markdown("<br>", unsafe_allow_html=True)
        search = st.button("🔍 Query RAG", type="primary")

    if search and query.strip():
        payload = {
            "query": query,
            "top_k": int(top_k),
            "doc_type": None if doc_type_filter == "All" else doc_type_filter,
        }
        with st.spinner("Retrieving..."):
            result = api_post("/api/rag", payload)

        if result:
            docs = result.get("results", [])
            stats = result.get("corpus_stats", {})
            st.caption(f"Corpus: {stats.get('total_documents', '?')} docs · Vocabulary: {stats.get('vocabulary_size', '?')} terms")

            if docs:
                for doc in docs:
                    kind_map = {"mitre_technique": "red", "cve": "white", "cert_advisory": "gray"}
                    kind = kind_map.get(doc["type"], "gray")
                    st.markdown(f"""
---
**`{doc['id']}`** &nbsp; {badge(doc['type'], kind)} &nbsp; Relevance: `{doc['score']:.4f}`

**{doc['title']}**

{doc['snippet']}
""", unsafe_allow_html=True)
            else:
                st.warning("No relevant documents found for this query.")
        else:
            st.error("RAG query failed — is FastAPI running?")

    # Quick reference
    with st.expander("Example Queries"):
        examples = [
            "active scanning port scan reconnaissance",
            "log4shell exploit rce initial access",
            "AIIMS ransomware healthcare india",
            "DNS tunneling C2 beaconing",
            "lateral movement SMB worm propagation",
            "exam season CBSE CERT-In education",
        ]
        for ex in examples:
            if st.button(ex, key=f"ex_{ex}"):
                st.session_state["rag_query_input"] = ex
                st.rerun()
