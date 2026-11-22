"""Export the regex arm's EXTRACTION in the same format as the LLM arm
(llm_features_run*.csv / llm_evidence_run*.csv, see Meet's LLM_EXTRACT_BRIEF.md),
so both arms can be scored by the same score_features.py.

Usage:  DATABRICKS_TOKEN=... python3 regex_extract.py <out_dir>
Writes: <out_dir>/regex_features_extract.csv, <out_dir>/regex_evidence_extract.csv
"""
import csv, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_regex as R   # reuses the SQL chain (docs/FEATURES.md) and the service definitions

OUT = sys.argv[1]
# LLM-arm feature names → regex feature names (gold_facility_features / silver_feature_hits)
FEATS = ["beds_text", "icu", "emergency_24x7", "ambulance", "ot", "blood_bank", "anaesthesia", "acc_jci",
         "acc_nabh", "lab_accreditation", "teaching_text", "xray", "usg", "ct", "mri", "pet", "mammography",
         "dialysis_unit", "labour_room", "nicu", "neonatal_support", "cath_lab", "ccu", "radiotherapy",
         "chemotherapy", "audiometry"]
RX_NAME = {"beds_text": "beds"}
STRENGTH = {"equipment": 1.0, "procedure": 1.0, "capability": 0.9, "description": 0.6, "specialties": 0.3}
SPEC = {1.2: "quantity", 1.0: "standard", 0.6: "generic"}


def main():
    chain = R.features_sql_chain()
    print("1/3 feature hits …", flush=True)
    hits = R.sql(chain + "SELECT unique_id, feature, field, text, strength, qty FROM silver_feature_hits")
    print("2/3 claims …", flush=True)
    claims = R.sql(chain + "SELECT unique_id, field, text, lc, item_lc, norm_item, is_negated FROM silver_claims")
    print("3/3 facility info …", flush=True)
    clean = R.sql(chain + "SELECT unique_id, to_json(specialties_arr) AS spec, name_type, capacity, truncated "
                          "FROM silver_facility_clean")

    best = {}   # (uid, feature) -> strongest hit, max qty
    for h in hits:
        k = (h["unique_id"], h["feature"])
        s = float(h["strength"])
        q = float(h["qty"]) if h["qty"] is not None else None
        cur = best.get(k)
        if cur is None or s > cur["s"]:
            best[k] = dict(s=s, field=h["field"], text=h["text"], qty=q if q is not None else (cur or {}).get("qty"))
        elif q is not None and (cur["qty"] is None or q > cur["qty"]):
            cur["qty"] = q

    claims_by = {}
    for c in claims:
        c["is_negated"] = c["is_negated"] in (True, "true")
        claims_by.setdefault(c["unique_id"], []).append(c)
    clean_by = {r["unique_id"]: dict(specialties=json.loads(r["spec"]) if r["spec"] else [],
                                     name_type=r["name_type"],
                                     beds=int(r["capacity"]) if r["capacity"] else None) for r in clean}

    # ---------------- features
    with open(os.path.join(OUT, "regex_features_extract.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["unique_id", "feature", "status", "field", "quote", "qty", "note"])
        for uid in R.IDS:
            for f in FEATS:
                b = best.get((uid, RX_NAME.get(f, f)))
                if f == "beds_text":
                    ok = b is not None and b["qty"] is not None
                    w.writerow([uid, f, "found" if ok else "not_mentioned", b["field"] if ok else "",
                                b["text"] if ok else "", int(b["qty"]) if ok else "", "regex"])
                elif b:
                    w.writerow([uid, f, "found", b["field"], b["text"], "" if b["qty"] is None else b["qty"], "regex"])
                else:
                    w.writerow([uid, f, "not_mentioned", "", "", "", "regex"])

    # ---------------- evidence
    def feat_quote(uid, f):
        b = best.get((uid, f))
        return (b["field"], b["text"]) if b else None

    with open(os.path.join(OUT, "regex_evidence_extract.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["unique_id", "service", "direct_claim", "direct_field", "direct_quote", "specificity",
                    "equipment_only", "second_claim", "second_field", "second_quote", "negated_claim",
                    "negated_field", "negated_quote", "specialty_code", "service_equipment",
                    "service_equipment_field", "service_equipment_quote", "emergency_same_item",
                    "prereq_found", "prereq_quotes", "llm_label", "note"])
        for uid in R.IDS:
            cl = claims_by.get(uid, [])
            info = clean_by[uid]
            for svc, d in R.SERVICES.items():
                pos, neg, eq_only = [], [], []
                for c in cl:
                    lc = c["lc"]
                    excluded = d["excl"] and re.search(d["excl"], lc)
                    tested = re.sub(d["equip"], " ", lc) if d["equip"] else lc
                    if re.search(d["direct"], tested) and not excluded:
                        (neg if c["is_negated"] else pos).append(c)
                    elif d["equip"] and re.search(d["equip"], lc) and not c["is_negated"] \
                            and c["field"] in ("procedure", "equipment"):
                        eq_only.append(c)
                used_eq = False
                if not pos and eq_only:
                    pos, used_eq = eq_only, True
                groups = {}
                for c in pos:
                    wt = R.FIELD_W[c["field"]] * R.specificity(c["text"])
                    if c["norm_item"] not in groups or wt > groups[c["norm_item"]]["w"]:
                        groups[c["norm_item"]] = dict(c, w=wt)
                kept = sorted(groups.values(), key=lambda x: (-R.FIELD_W[x["field"]], -x["w"]))
                code = next((s for s in info["specialties"] if s in d["codes"]), "")
                eq_clause = next((c for c in cl if re.search(d["corrob_equip"], c["lc"]) and not c["is_negated"]), None)

                prereq = []
                if svc == "dialysis":
                    nep = next((c for c in cl if "nephrologist" in c["lc"]), None)
                    if code:
                        prereq.append(("nephrology", "specialties", code))
                    elif nep:
                        prereq.append(("nephrology", nep["field"], nep["text"]))
                else:
                    names = ["ot", "anaesthesia", "blood_bank"] if svc == "emergency_csection" \
                        else ["ot", "anaesthesia", "icu_ccu", "blood_bank"]
                    for p in names:
                        q = feat_quote(uid, "icu") or feat_quote(uid, "ccu") if p == "icu_ccu" else feat_quote(uid, p)
                        if q:
                            prereq.append((p, q[0], q[1]))

                emerg = "na"
                if svc == "emergency_csection":
                    emerg = "yes" if any(R.EMERGENCY.search(k["item_lc"]) for k in kept) else "no"
                first, second = (kept + [None, None])[:2]
                w.writerow([
                    uid, svc,
                    "yes" if kept else "no",
                    first["field"] if first else "", first["text"] if first else "",
                    SPEC[R.specificity(first["text"])] if first else "",
                    "yes" if used_eq else "no",
                    "yes" if second else "no", second["field"] if second else "", second["text"] if second else "",
                    "yes" if neg else "no", neg[0]["field"] if neg else "", neg[0]["text"] if neg else "",
                    code,
                    "yes" if eq_clause else "no", eq_clause["field"] if eq_clause else "",
                    eq_clause["text"] if eq_clause else "",
                    emerg,
                    ";".join(p[0] for p in prereq),
                    " || ".join(f'{p[0]}: "{p[2]}" ({p[1]})' for p in prereq),
                    "", "regex"])
    print("wrote regex_features_extract.csv, regex_evidence_extract.csv")


if __name__ == "__main__":
    main()
