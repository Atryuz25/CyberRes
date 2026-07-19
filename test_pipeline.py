"""Full pipeline smoke test - run from CyberRes root."""
import sys
sys.path.insert(0, 'src')

from data_loader import make_synthetic_dataset, prepare_features
from calendar_features import assign_calendar_phase, add_calendar_features, inject_legitimate_bursts
from temporal_features import add_temporal_features
from model import HybridAnomalyDetector
from evaluate import per_category_metrics, calendar_ablation, fpr_recall_tradeoff
from mitre_rag import attribute, attribution_accuracy
from soar import ResponseOrchestrator, TIER0_WHITELIST
from latency import measure_pipeline_latency
from knowledge_graph import MITREKnowledgeGraph
from rag_engine import RAGEngine
from graph import build_graph
from bft_consensus import BFTConsensusLayer
import numpy as np

print("=== PIPELINE SMOKE TEST ===")

# --- Data loading ---
train_df, test_df = make_synthetic_dataset()
X_train_n, X_train_f, X_test, y_test, cat_test = prepare_features(train_df, test_df)
print(f"[A] X_train_n: {X_train_n.shape}, X_test: {X_test.shape}")

# --- Temporal features ---
X_train_n = add_temporal_features(X_train_n)
X_test    = add_temporal_features(X_test)
print(f"[C] After temporal: X_train_n {X_train_n.shape}, X_test {X_test.shape}")

# --- Baseline model ---
baseline = HybridAnomalyDetector()
baseline.fit(X_train_n.values)
y_pred_base = baseline.predict(X_test.values)
bm = per_category_metrics(y_test, y_pred_base, cat_test.values)
print(f"[A] Baseline  FPR={bm['overall']['fpr']:.4f} Recall={bm['overall']['recall']:.4f}")

# --- Calendar conditioning ---
burst_cols = ["sbytes", "dbytes", "spkts", "dpkts", "sload", "dload", "rate"]
tr_phase   = assign_calendar_phase(len(X_train_n))
te_phase   = assign_calendar_phase(len(X_test), seed=99)
X_tr_burst = inject_legitimate_bursts(X_train_n.reset_index(drop=True), tr_phase, burst_cols)
X_tr_cal   = add_calendar_features(X_tr_burst, tr_phase)
X_te_cal   = add_calendar_features(X_test, te_phase)
print(f"[B] Calendar train: {X_tr_cal.shape}, test: {X_te_cal.shape}")

cal_model = HybridAnomalyDetector()
cal_model.fit(X_tr_cal.values)
y_pred_cal = cal_model.predict(X_te_cal.values)
cm = per_category_metrics(y_test, y_pred_cal, cat_test.values)
print(f"[B] Cal-cond  FPR={cm['overall']['fpr']:.4f} Recall={cm['overall']['recall']:.4f}")

# --- Ablation ---
norm_mask = y_test == 0
X_norm = X_test[norm_mask].reset_index(drop=True)
bph = assign_calendar_phase(len(X_norm), seed=123)
bph[:] = "exam_period"
X_burst_cal = add_calendar_features(inject_legitimate_bursts(X_norm, bph, burst_cols), bph).values
X_burst_raw = inject_legitimate_bursts(X_norm, bph, burst_cols).values
print(f"[B] burst_cal shape: {X_burst_cal.shape}, burst_raw: {X_burst_raw.shape}")

ablation = calendar_ablation(cal_model, baseline, X_burst_cal, X_burst_raw)
print(f"[B] Ablation: baseline_fpr={ablation['baseline_fpr']:.4f} cal_fpr={ablation['cal_fpr']:.4f} reduction={ablation['relative_fpr_reduction']:.4f}")

# --- BFT + SOAR ---
scores     = cal_model.score(X_te_cal.values)
entity_ids = [f"10.0.{(i//256)%256}.{i%256}" for i in range(len(scores))]
flagged_idx = list(np.where(y_pred_cal == 1)[0])
print(f"[E] Flagged entities: {len(flagged_idx)}")

bft  = BFTConsensusLayer(cal_model, tier0_whitelist=TIER0_WHITELIST)
orch = ResponseOrchestrator()
for idx in flagged_idx[:3]:
    eid = entity_ids[idx]
    cr  = bft.vote(eid, X_te_cal.values[idx:idx+1])
    rec = orch.handle(eid, float(scores[idx]), "T1071", cr)
    print(f"  [E] {eid}: consensus={cr.consensus} decision={rec['decision']}")

# --- Graph ---
from networkx.readwrite import json_graph
ag     = build_graph(entity_ids, scores, cat_test.values.tolist(), top_n=20)
g_data = json_graph.node_link_data(ag.G)  # FIX: use ag.G not ag
# NetworkX >=3.4 uses "edges" key, normalize to "links"
links  = g_data.get("links", g_data.get("edges", []))
print(f"[D] Graph: {len(g_data['nodes'])} nodes, {len(links)} links (keys: {list(g_data.keys())})")

# --- MITRE KG ---
kg = MITREKnowledgeGraph()
chain = kg.get_attack_chain("DoS")
print(f"[F] MITRE chain for DoS: {chain['technique_id']} [{chain['tactic']}] pos {chain['kill_chain_position']}")

# --- RAG ---
rag = RAGEngine()
r = rag.query("ransomware lateral movement", top_k=2)
print(f"[G] RAG returned {len(r)} docs: {[d['id'] for d in r]}")

# --- FPR-Recall tradeoff ---
tradeoff = fpr_recall_tradeoff(cal_model, X_te_cal.values, y_test)
print(f"[H] FPR-Recall curve: {len(tradeoff)} points")
for pt in tradeoff:
    print(f"    thresh_mult={pt['threshold_multiplier']} fpr={pt['fpr']} recall={pt['recall']}")

# --- Chain integrity ---
valid = orch.audit_log.verify_chain()
print(f"[H] Audit chain valid: {valid}")

print("\n=== ALL TESTS PASSED ===")
