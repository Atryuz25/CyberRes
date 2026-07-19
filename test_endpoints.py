"""Poll FastAPI status endpoint until pipeline is ready, then test all endpoints."""
import time
import urllib.request
import json

print("Polling /api/status ...")
ready = False
for i in range(25):
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/api/status", timeout=3) as r:
            d = json.loads(r.read())
            st = d.get("status", "?")
            print(f"  [{i}] status={st}")
            if st == "ready":
                print("PIPELINE READY")
                ready = True
                break
    except Exception as e:
        print(f"  [{i}] not ready: {e}")
    time.sleep(6)

if not ready:
    print("TIMEOUT - pipeline did not become ready")
    exit(1)

# Test all endpoints
def get_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:8000{path}", timeout=10) as r:
        return json.loads(r.read())

def post_json(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"http://127.0.0.1:8000{path}", data=data,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

print("\n=== ENDPOINT TESTS ===")

# /api/metrics
m = get_json("/api/metrics")
print(f"[/api/metrics] fpr={m['fpr']:.4f} recall={m['recall']:.4f} n_samples={m['n_samples']}")

# /api/entities
e = get_json("/api/entities")
ents = e.get("entities", [])
print(f"[/api/entities] {len(ents)} flagged entities")
if ents:
    first = ents[0]
    print(f"  Sample: id={first['id']} score={first['risk_score']:.4f} votes={first.get('votes')}")

# /api/graph
g = get_json("/api/graph")
nodes = g.get("nodes", [])
links = g.get("links", g.get("edges", []))
print(f"[/api/graph] {len(nodes)} nodes, {len(links)} links  keys={list(g.keys())}")

# /api/audit
a = get_json("/api/audit")
logs = a.get("audit_logs", [])
print(f"[/api/audit] {len(logs)} audit records")
if logs:
    first_log = logs[0]
    has_hash = "entry_hash" in first_log
    print(f"  entry_hash present: {has_hash} | decision={first_log.get('decision')}")

# /api/bft_log
bft = get_json("/api/bft_log")
bft_entries = bft.get("bft_log", [])
print(f"[/api/bft_log] {len(bft_entries)} BFT records")
if bft_entries:
    b = bft_entries[0]
    print(f"  Sample: entity={b.get('entity_id')} consensus={b.get('consensus')} vote_A={b.get('vote_A')}")

# /api/fpr_recall
fpr = get_json("/api/fpr_recall")
curve = fpr.get("tradeoff_curve", [])
print(f"[/api/fpr_recall] {len(curve)} operating points")
for pt in curve:
    print(f"  x{pt['threshold_multiplier']} -> fpr={pt['fpr']:.4f} recall={pt['recall']:.4f}")

# /api/rag (POST)
rag = post_json("/api/rag", {"query": "ransomware lateral movement healthcare", "top_k": 2})
rag_results = rag.get("results", [])
print(f"[/api/rag] {len(rag_results)} results")
for r in rag_results:
    print(f"  {r['id']} [{r['type']}] score={r['score']:.4f}")

print("\n=== ALL ENDPOINTS OK ===")
