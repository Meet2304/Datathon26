"""Compare two scored arms (e.g. llm_run1 vs llm_run2, or regex vs llm), and each vs human grades if present.

usage: python3 -I compare.py <folder> <tagA> <tagB> [human_agreed.csv]
"""
import csv, itertools, math, os, sys
D, A, B = sys.argv[1:4]; H = sys.argv[4] if len(sys.argv) > 4 else None
P = lambda f: os.path.join(D, f)
rd = lambda f: list(csv.DictReader(open(P(f))))
fa, fb = ({(r["unique_id"], r["feature"]): r for r in rd(f"features_{t}.csv")} for t in (A, B))
ra, rb = rd(f"ranking_{A}.csv"), rd(f"ranking_{B}.csv")
ea, eb = ({(r["unique_id"], r["service"]): r for r in rd(f"evidence_{t}.csv")} for t in (A, B))

print(f"## {A} vs {B}\n\n### Feature agreement (found vs not found)\n")
print("| feature | agree | disagreements |\n|---|---|---|")
feats = sorted({k[1] for k in fa} - {k for k in []}, key=lambda f: (f[0], int(''.join(c for c in f.split('_')[0][1:] if c.isdigit()) or 0) if f[0] in 'GS' else 99, f))
for f in feats:
    keys = [k for k in fa if k[1] == f]
    if f.endswith("_label"):
        dis = [k for k in keys if fa[k]["status"] != fb[k]["status"]]
    else:
        dis = [k for k in keys if (fa[k]["status"] == "found") != (fb[k]["status"] == "found")]
    names = {r["unique_id"]: r["name"] for r in ra}
    print(f"| {f} | {len(keys)-len(dis)}/{len(keys)} | " + "; ".join(
        f"{names[k[0]][:28]} ({fa[k]['status']} vs {fb[k]['status']})" for k in dis) + " |")

print("\n### Evidence\n\n| service | label agree | mean abs E diff | mean abs D diff |\n|---|---|---|---|")
for s in ("dialysis", "emergency_csection", "cardiac_surgery"):
    ks = [k for k in ea if k[1] == s]
    la = sum(ea[k]["label"] == eb[k]["label"] for k in ks)
    de = sum(abs(float(ea[k]["E"]) - float(eb[k]["E"])) for k in ks) / len(ks)
    dd = sum(abs(float(ea[k]["D"]) - float(eb[k]["D"])) for k in ks) / len(ks)
    print(f"| {s} | {la}/{len(ks)} | {de:.1f} | {dd:.1f} |")

def tau(x, y):
    c = d = 0
    for i, j in itertools.combinations(list(x), 2):
        s = (x[i] - x[j]) * (y[i] - y[j]); c += s > 0; d += s < 0
    n = len(x); return (c - d) / (n * (n - 1) / 2)
def ndcg5(order, grade):
    dcg = sum((2 ** grade.get(u, 0) - 1) / math.log2(i + 2) for i, u in enumerate(order[:5]))
    ideal = sorted(grade.values(), reverse=True)[:5]
    idcg = sum((2 ** g - 1) / math.log2(i + 2) for i, g in enumerate(ideal))
    return dcg / idcg if idcg else float("nan")
human = {}
if H and os.path.exists(P(H)):
    for r in rd(H): human.setdefault(r["query_id"], {})[r["unique_id"]] = (int(r["grade"]), float(r["rank"]))

print(f"\n### Ranking\n\n| query | Kendall τ {A} vs {B} | top-3 overlap | top-3 {A} | top-3 {B} |" +
      (" NDCG@5 A | NDCG@5 B | τ vs human A | τ vs human B |" if human else "") + "\n|---|---|---|---|---|" + ("---|---|---|---|" if human else ""))
for q in ("Q1", "Q2", "Q3"):
    xa = {r["unique_id"]: int(r["rank"]) for r in ra if r["query_id"] == q}
    xb = {r["unique_id"]: int(r["rank"]) for r in rb if r["query_id"] == q}
    na = {r["unique_id"]: r["name"] for r in ra}
    ta = [u for u, _ in sorted(xa.items(), key=lambda t: t[1])]; tb = [u for u, _ in sorted(xb.items(), key=lambda t: t[1])]
    line = f"| {q} | {tau(xa, xb):.3f} | {len(set(ta[:3]) & set(tb[:3]))}/3 | " + ", ".join(na[u][:22] for u in ta[:3]) + " | " + ", ".join(na[u][:22] for u in tb[:3]) + " |"
    if human and q in human:
        g = {u: v[0] for u, v in human[q].items()}; hr = {u: v[1] for u, v in human[q].items()}
        line += f" {ndcg5(ta, g):.3f} | {ndcg5(tb, g):.3f} | {tau(xa, hr):.3f} | {tau(xb, hr):.3f} |"
    print(line)
