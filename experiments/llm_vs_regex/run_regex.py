"""Deterministic (regex) flow for the LLM-vs-regex experiment, reading the silver tables.

Everything comes from Databricks: features and Depth from the docs/FEATURES.md SQL over
silver_facilities; completeness from silver columns; facility locations with the M8 fallback
(silver_pincode_directory); query points = PIN centres of 492001 / 492013 / 492004.
facilities_15.json is only used for the list of ids.

Features (G*, S*) and Depth D come from the SQL in docs/FEATURES.md §4.1–4.6, run on
Databricks for the 15 experiment facilities only (features are per-facility, so
filtering the input doesn't change them). Evidence E, labels, completeness C,
confidence and ranking implement docs/SCORING.md §2–§4 in Python, because those
tables aren't built in SQL yet.

Usage:  DATABRICKS_HOST=... DATABRICKS_TOKEN=... DATABRICKS_WAREHOUSE_ID=... python3 run_regex.py [out_dir]
Writes: features_regex.csv, evidence_regex.csv, ranking_regex.csv into out_dir (default: this folder)
"""
import csv, json, math, os, re, sys, time, urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
HOST = os.environ["DATABRICKS_HOST"].rstrip("/")
TOKEN = os.environ["DATABRICKS_TOKEN"]
WAREHOUSE = os.environ.get("DATABRICKS_WAREHOUSE_ID") or os.environ["DATABRICKS_WAREHOUSE"]
TODAY = date(2026, 11, 21)
OUTDIR = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else HERE

FAC = json.load(open(os.path.join(HERE, "facilities_15.json")))
IDS = [f["unique_id"] for f in FAC]
BY_ID = {f["unique_id"]: f for f in FAC}

# ---------------------------------------------------------------- Databricks
def _req(path, body=None):
    r = urllib.request.Request(HOST + path, data=json.dumps(body).encode() if body else None,
                               method="POST" if body else "GET",
                               headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r))

def sql(statement):
    r = _req("/api/2.0/sql/statements", {"statement": statement, "warehouse_id": WAREHOUSE,
                                         "wait_timeout": "50s", "row_limit": 100000})
    while r["status"]["state"] in ("PENDING", "RUNNING"):
        time.sleep(3)
        r = _req("/api/2.0/sql/statements/" + r["statement_id"])
    if r["status"]["state"] != "SUCCEEDED":
        sys.exit(f"SQL failed: {r['status']}")
    cols = [c["name"] for c in r["manifest"]["schema"]["columns"]]
    return [dict(zip(cols, v)) for v in r.get("result", {}).get("data_array", []) or []]

def features_sql_chain():
    """Turn the CREATE TABLE statements in FEATURES.md §4 into one CTE chain."""
    doc = open(os.path.join(ROOT, "docs", "FEATURES.md")).read()
    stmts = {}
    for block in re.findall(r"```sql\n(.*?)```", doc, re.S):
        for st in re.split(r";\s*\n", block):
            m = re.search(r"CREATE OR REPLACE TABLE workspace\.hackathon\.(\w+) AS\s*(.*)", st, re.S)
            if m:
                stmts[m.group(1)] = m.group(2).strip().rstrip(";")
    order = ["silver_facility_clean", "silver_claims", "ref_feature_terms", "ref_feature_context",
             "ref_feature_specialty", "silver_feature_hits", "gold_facility_features",
             "ref_service_weights", "gold_service_depth"]
    id_list = ",".join(f"'{i}'" for i in IDS)
    ctes = []
    for name in order:
        q = re.sub(r"--[^\n]*", "", stmts[name])
        q = q.replace("workspace.hackathon.silver_facilities", "SRC").replace("workspace.hackathon.", "")
        q = q.replace("SRC", f"(SELECT * FROM workspace.hackathon.silver_facilities WHERE unique_id IN ({id_list}))")
        ctes.append(f"{name} AS (\n{q}\n)")
    return "WITH " + ",\n".join(ctes) + "\n"

# ---------------------------------------------------------------- SCORING.md §3 service definitions
SERVICES = {
    "dialysis": dict(
        direct=r"dialys|\bcrrt\b",
        equip=r"dialysis (machines?|units?|stations?|chairs?|beds?)|ha?emodialysis machines?|ro (water )?plant",
        corrob_equip=r"dialysis (machines?|units?|stations?|chairs?|beds?)|ha?emodialysis machines?|ro (water )?plant|nephrologist",
        excl=None, codes={"nephrology"}, name_type="nephrology_dialysis",
        implied=[], checked=["nephro_code_or_nephrologist"]),
    "emergency_csection": dict(
        direct=r"caesarean|cesarean|c-section|\blscs\b", equip=None,
        corrob_equip=r"operation theat|operating theat|\bmodular ot|labou?r room|delivery room|anaesthe|anesthe|\bnicu\b",
        excl=None, codes={"obstetrics", "maternalFetalMedicine"},
        name_type="maternity", implied=["ot", "anaesthesia"], checked=["blood_bank"]),
    "cardiac_surgery": dict(
        direct=r"\bcabg\b|coronary (artery )?bypass|open[- ]heart|valve (replacement|repair)|cardiac surg|cardiothoracic surg",
        equip=None, corrob_equip=r"cath\s*lab|catheteri[sz]ation lab|\bcticu\b|\bcicu\b|heart[- ]lung",
        excl=r"gastric|bariatric|obesity|weight loss|roux",
        codes={"cardiothoracicSurgery"}, name_type="cardiac",
        implied=["ot", "anaesthesia", "icu_or_ccu"], checked=["blood_bank"]),
}
FIELD_W = {"procedure": 1.0, "equipment": 1.0, "capability": 0.9, "description": 0.6}
GENERIC = re.compile(r"departments? (include|such as)|specialit(y|ies) (include|such as)|services (include|such as)|including")
EMERGENCY = re.compile(r"24\s*x\s*7|24/7|24 hours|round the clock|emergenc")
QTY = re.compile(r"\d")

PROFILES = {  # SCORING §4.2
    "dialysis":           dict(wE=.30, wD=.10, wA=.60, d_half=15,  gate="Moderate"),
    "emergency_csection": dict(wE=.30, wD=.10, wA=.60, d_half=15,  gate="Moderate"),
    "cardiac_surgery":    dict(wE=.35, wD=.45, wA=.20, d_half=150, gate="Moderate"),
}
QUERIES = [("Q1", "dialysis", 492001), ("Q2", "emergency_csection", 492013), ("Q3", "cardiac_surgery", 492004)]
LABEL_ORDER = {"Strong": 0, "Moderate": 1, "Weak": 2, "Possible": 3, "No evidence": 4, "Not offered": 5}

def specificity(text):
    if QTY.search(text):
        return 1.2
    if GENERIC.search(text) or text.count(",") >= 3:
        return 0.6
    return 1.0

def evidence(uid, svc, claims, feat, clean):
    d = SERVICES[svc]
    spec = set(clean["specialties"])
    pos, neg, equip_only = [], [], []
    for c in claims:
        lc = c["lc"]
        excluded = d["excl"] and re.search(d["excl"], lc)
        tested = re.sub(d["equip"], " ", lc) if d["equip"] else lc
        if re.search(d["direct"], tested) and not excluded:
            (neg if c["is_negated"] else pos).append(c)
        elif d["equip"] and re.search(d["equip"], lc) and not c["is_negated"] and c["field"] in ("procedure", "equipment"):
            equip_only.append(c)

    used_equip_as_claim = False
    if not pos and equip_only:             # §3.2 step 4: equipment-only phrase counts at ×0.8
        pos, used_equip_as_claim = equip_only, True

    # §3.2 step 6: dedup by normalised item text, keep highest field weight
    groups = {}
    for c in pos:
        w = FIELD_W[c["field"]] * specificity(c["text"]) * (0.8 if used_equip_as_claim else 1.0)
        if c["norm_item"] not in groups or w > groups[c["norm_item"]]["w"]:
            groups[c["norm_item"]] = dict(c, w=w)
    kept = sorted(groups.values(), key=lambda x: -x["w"])
    w_best = kept[0]["w"] if kept else 0.0

    has_code = bool(spec & d["codes"])
    all_text = " ".join(c["lc"] for c in claims)
    has_equip = bool(re.search(d["corrob_equip"], all_text))
    corro = []
    if has_code: corro.append("specialty code")
    if has_equip and not used_equip_as_claim: corro.append("service-specific equipment")
    if len(kept) >= 2: corro.append("second distinct claim")

    found = lambda f: feat.get((uid, f), {}).get("status") == "found"
    in_text = {
        "nephro_code_or_nephrologist": has_code or "nephrologist" in all_text,
        "ot": found("ot"), "anaesthesia": found("anaesthesia"), "blood_bank": found("blood_bank"),
        "icu_or_ccu": found("icu") or found("ccu"),
    }
    # SCORING §3.1: implied prerequisites are met by a positive direct claim; checked ones need text
    pre_ok = {p: in_text[p] or bool(kept) for p in d["implied"]}
    pre_ok.update({p: in_text[p] for p in d["checked"]})
    defined = d["implied"] + d["checked"]
    # FEATURES M7: in a truncated record, an unfound prerequisite is unknown → counts half
    trunc = clean["truncated"]
    met_score = sum(1.0 if pre_ok[p] else (0.5 if trunc else 0.0) for p in defined)
    missing = [p + (" (list cut off)" if trunc else "") for p in d["checked"] + d["implied"] if not pre_ok[p]]

    pts_direct = 40 * min(w_best, 1.0)
    pts_corro = 10 * min(len(corro), 3)
    pts_pre = 20 * met_score / len(defined)
    pts_spec = 10 if any(QTY.search(k["text"]) for k in kept) else 0
    E = round(pts_direct + pts_corro + pts_pre + pts_spec, 1)

    # §3.4 labels, first match wins
    caveats = []
    struct_claim = any(k["field"] in ("procedure", "equipment") for k in kept)
    if svc == "dialysis":
        strong_rule = has_equip or clean["name_type"] == d["name_type"]
        rule_txt = "no dialysis equipment or kidney-centre name"
    elif svc == "emergency_csection":
        strong_rule = any(EMERGENCY.search(k["item_lc"]) for k in kept)
        rule_txt = "emergency readiness not confirmed"
    else:
        beds = clean["beds"]
        strong_rule = has_equip and not (beds is not None and beds < 30)
        rule_txt = "no cath lab / CTICU / heart-lung machine" if not has_equip else "facility has < 30 beds"

    if neg and not pos:
        label = "Not offered"
    elif not kept:
        label = "Possible" if (has_code or has_equip) else "No evidence"
    elif neg:
        label, caveats = "Weak", ["record has conflicting statements"]
    elif E >= 70 and struct_claim and strong_rule:
        label = "Strong"
    elif E >= 45:
        label = "Moderate"
        if E >= 70:
            caveats.append(rule_txt if struct_claim else "claim only in capability/description")
    else:
        label = "Weak"
    if svc == "emergency_csection" and kept and not strong_rule:
        caveats.append("emergency readiness not confirmed")

    primary = kept[0] if kept else (neg[0] if neg else None)
    gate = LABEL_ORDER[label] <= LABEL_ORDER["Moderate"]
    return dict(E=E, label=label, gate=gate, caveats=sorted(set(caveats)),
                pts=f"direct {pts_direct:.0f} + corrob {pts_corro} ({', '.join(corro) or '-'}) + prereq {pts_pre:.0f} + spec {pts_spec}",
                prereq_missing=missing, n_claims=len(kept), n_negated=len(neg),
                primary_field=primary["field"] if primary else "", primary_quote=primary["text"] if primary else "")

def haversine_km(lat1, lon1, lat2, lon2):
    r = math.radians
    a = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))

def completeness(f, feat):
    """SCORING §2, from silver columns (f = one row of the silver info query)."""
    pts, missing = 0, []
    pts += {"exact": 25, "approximate": 15}.get(f["location_quality"], 0)
    if f["location_quality"] != "exact": missing.append("exact location")
    if f["official_phone"] or int(f["n_phones"] or 0) > 0: pts += 10
    else: missing.append("contact")
    if f["n_doctors"] is not None: pts += 10
    else: missing.append("doctors")
    if f["capacity"] or f["capacity_text"] or feat.get((f["unique_id"], "beds"), {}).get("status") == "found": pts += 10
    else: missing.append("beds")
    for k, label in (("np", "procedure"), ("ne", "equipment"), ("nc", "capability")):
        if int(f[k]) > 0: pts += 10
        else: missing.append(label)
    if f["year_established"] is not None: pts += 5
    else: missing.append("year established")
    try:
        d = date.fromisoformat(str(f["last_updated"])[:10])
        pts += 10 if (TODAY - d).days <= 730 else 5
    except Exception:
        missing.append("page date")
    band = "rich" if pts >= 70 else "partial" if pts >= 40 else "sparse"
    return pts, band, missing

def confidence(label, band, coverage, location_quality="exact"):
    """SCORING §4.7."""
    if band == "sparse" or coverage < 0.4 or (location_quality != "exact" and label != "Strong"):
        return "Low"
    if label == "Strong" and band == "rich" and coverage >= 0.6:
        return "High"
    return "Medium"

# ---------------------------------------------------------------- run
def main():
    chain = features_sql_chain()
    print("1/3 features …", flush=True)
    feats = sql(chain + "SELECT unique_id, feature, value, status, qty, to_json(evidence) AS evidence FROM gold_facility_features")
    print("2/3 depth …", flush=True)
    depth = sql(chain + "SELECT unique_id, service, depth_D, feature_coverage FROM gold_service_depth "
                        "WHERE service IN ('dialysis','emergency_csection','cardiac_surgery')")
    print("3/3 claims …", flush=True)
    claims = sql(chain + "SELECT c.unique_id, c.field, c.text, c.lc, c.item_lc, c.norm_item, c.is_negated FROM silver_claims c")
    clean = sql(chain + "SELECT unique_id, to_json(specialties_arr) AS spec, name_type, capacity, truncated FROM silver_facility_clean")
    info = sql(chain + """SELECT f.unique_id, f.name, f.official_phone, size(f.phone_numbers) AS n_phones, f.n_doctors,
        f.capacity, f.capacity_text, coalesce(size(f.procedure_arr), 0) AS np, coalesce(size(f.equipment_arr), 0) AS ne,
        coalesce(size(f.capability_arr), 0) AS nc, f.year_established, f.last_updated,
        coalesce(f.lat_raw, p.latitude) AS lat, CASE WHEN f.lat_raw IS NOT NULL THEN f.lon_raw ELSE p.longitude END AS lon,
        CASE WHEN f.lat_raw IS NOT NULL AND f.lon_raw IS NOT NULL THEN 'exact'
             WHEN p.latitude IS NOT NULL THEN 'approximate' ELSE 'unknown' END AS location_quality
      FROM silver_facility_clean f
      LEFT JOIN workspace.hackathon.silver_pincode_directory p ON p.pincode = f.pincode AND p.is_primary_state""")
    qpts = {int(r["pincode"]): (float(r["latitude"]), float(r["longitude"])) for r in sql(
        "SELECT pincode, latitude, longitude FROM workspace.hackathon.silver_pincode_directory "
        "WHERE is_primary_state AND pincode IN (492001, 492013, 492004)")}
    INFO = {r["unique_id"]: r for r in info}
    NAME = {u: (INFO[u]["name"] or BY_ID[u]["name"]) for u in IDS}

    feat = {(r["unique_id"], r["feature"]): r for r in feats}
    claims_by = {}
    for c in claims:
        c["is_negated"] = c["is_negated"] in (True, "true")
        claims_by.setdefault(c["unique_id"], []).append(c)
    clean_by = {}
    for r in clean:
        beds = r["capacity"] and int(r["capacity"])
        if beds is None and feat.get((r["unique_id"], "beds"), {}).get("qty"):
            beds = float(feat[(r["unique_id"], "beds")]["qty"])
        clean_by[r["unique_id"]] = dict(specialties=json.loads(r["spec"]) if r["spec"] else [],
                                        name_type=r["name_type"], beds=beds,
                                        truncated=r["truncated"] in (True, "true"))
    depth_by = {(r["unique_id"], r["service"]): r for r in depth}

    # features_regex.csv
    with open(os.path.join(OUTDIR, "features_regex.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["unique_id", "name", "feature", "value", "status", "qty", "quote", "field"])
        for r in sorted(feats, key=lambda r: (NAME[r["unique_id"]], r["feature"])):
            ev = json.loads(r["evidence"]) if r["evidence"] else []
            w.writerow([r["unique_id"], NAME[r["unique_id"]], r["feature"],
                        "" if r["value"] is None else round(float(r["value"]), 3), r["status"], r["qty"] or "",
                        ev[0]["text"] if ev else "", ev[0]["field"] if ev else ""])

    # evidence + ranking
    ev_rows, rank_rows = [], []
    for qid, svc, qpin in QUERIES:
        qlat, qlon = qpts[qpin]
        p = PROFILES[svc]
        scored = []
        for uid in IDS:
            f = INFO[uid]
            e = evidence(uid, svc, claims_by.get(uid, []), feat, clean_by[uid])
            dd = depth_by[(uid, svc)]
            D, cov = float(dd["depth_D"]), float(dd["feature_coverage"])
            road = 1.4 * haversine_km(qlat, qlon, float(f["lat"]), float(f["lon"]))
            A = 100 * 0.5 ** (road / p["d_half"])
            score = p["wE"] * e["E"] + p["wD"] * D + p["wA"] * A
            C, band, missing = completeness(f, feat)
            conf = confidence(e["label"], band, cov, f["location_quality"])
            ev_rows.append([qid, svc, uid, NAME[uid], e["E"], e["label"], e["pts"], "; ".join(e["caveats"]),
                            ", ".join(e["prereq_missing"]), e["n_claims"], e["n_negated"],
                            e["primary_field"], e["primary_quote"]])
            scored.append(dict(uid=uid, name=NAME[uid], score=score, e=e, D=D, A=A, cov=cov, road=road,
                               C=C, band=band, conf=conf))
        # Gate-passing facilities first, by score (SCORING §4.3). Below them, facilities failing the
        # gate are ordered by label first (Possible > No evidence > Not offered: matches what the UI
        # would show), then score. Ties: label, distance, id.
        scored.sort(key=lambda s: (not s["e"]["gate"],
                                   0 if s["e"]["gate"] else LABEL_ORDER[s["e"]["label"]],
                                   -s["score"], LABEL_ORDER[s["e"]["label"]], s["road"], s["uid"]))
        for i, s in enumerate(scored, 1):
            rank_rows.append([qid, i, s["uid"], s["name"], round(s["score"], 2), s["e"]["label"],
                              s["e"]["gate"], s["e"]["E"], round(s["D"], 1), round(s["A"], 1),
                              round(s["road"], 1), s["C"], s["band"], round(s["cov"], 2), s["conf"],
                              "; ".join(s["e"]["caveats"])])

    with open(os.path.join(OUTDIR, "evidence_regex.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["query_id", "service", "unique_id", "name", "E", "label", "E_breakdown", "caveats",
                    "prereq_missing", "n_claims", "n_negated", "primary_field", "primary_quote"])
        w.writerows(ev_rows)
    with open(os.path.join(OUTDIR, "ranking_regex.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["query_id", "rank", "unique_id", "name", "rank_score", "label", "passes_gate", "E", "D", "A",
                    "road_km", "completeness_C", "completeness_band", "feature_coverage", "confidence", "caveats"])
        w.writerows(rank_rows)
    print(f"wrote features_regex.csv ({len(feats)} rows), evidence_regex.csv ({len(ev_rows)}), ranking_regex.csv ({len(rank_rows)})")

if __name__ == "__main__":
    main()
