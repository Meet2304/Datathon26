"""Turn an extraction (llm_features_*.csv + llm_evidence_*.csv) into the README outputs.

Applies FEATURES.md (feature values, D) and SCORING.md (E, labels, C, A, rank_score)
exactly, so both experiment arms are scored by one formula. Only the extraction differs.

usage: python3 -I score_features.py <folder> <features_in.csv> <evidence_in.csv> <tag>
  writes features_<tag>.csv, evidence_<tag>.csv, ranking_<tag>.csv, quotecheck_<tag>.txt
"""
import csv, json, math, os, re, sys

D_FOLDER, F_IN, E_IN, TAG = sys.argv[1:5]
P = lambda f: os.path.join(D_FOLDER, f)
REF_YEAR = 2026
REF_DATE = (2026, 11, 21)

recs = {r["unique_id"]: r for r in json.load(open(P("facilities_15.json")))}
nul = lambda v: v is None or (isinstance(v, str) and v.strip().lower() in ("", "null", "none"))
num = lambda v: None if nul(v) else float(v)
items = lambda r, f: [x for x in (r.get(f) or []) if x and x.strip()]

# ---- facility-level helpers (FEATURES §2, §4.1) ----------------------------------------
def fac_info(r):
    has_text = bool(items(r, "procedure") or items(r, "equipment") or items(r, "capability")
                    or (r.get("description") or "").strip())
    truncated = max(len(r.get(f) or []) for f in ("procedure", "equipment", "capability")) >= 50   # M7
    n = r["name"].lower()
    for rx, t in [("kidney|dialysis|nephro|renal", "nephrology_dialysis"),
                  ("maternity|prasuti|mother|women.?s hospital|birthing", "maternity"),
                  ("cancer|onco", "oncology"), ("heart|cardiac|cardio", "cardiac"),
                  ("trauma|accident", "trauma"), ("eye|netra|nethra|nayan|ophthal|vision", "eye"),
                  ("dental|dentist|teeth|smile|orthodont", "dental"),
                  (r"diagnostic|imaging|scan|patholog|\blab", "diagnostic")]:
        if re.search(rx, n):
            return has_text, truncated, t
    return has_text, truncated, None

# ---- quote check -------------------------------------------------------------------------
def quote_ok(uid, field, q):
    q = (q or "").strip()
    if not q:
        return True
    r = recs[uid]
    if field == "description":
        return q in (r.get("description") or "")
    return any(q in (x or "") for x in (r.get(field) or []))

qc_total, qc_bad = 0, []
def check(uid, field, q, where):
    global qc_total
    if (q or "").strip():
        qc_total += 1
        if not quote_ok(uid, field, q):
            qc_bad.append(f"{where} | {recs[uid]['name']} | {field} | {q[:90]}")

# ---- load extraction ---------------------------------------------------------------------
raw = {}
for row in csv.DictReader(open(P(F_IN))):
    raw[(row["unique_id"], row["feature"].strip())] = row
    if row["status"].strip() in ("found", "negated"):
        check(row["unique_id"], row["field"].strip(), row["quote"], f"feature:{row['feature']}")
ev = {}
for row in csv.DictReader(open(P(E_IN))):
    ev[(row["unique_id"], row["service"].strip())] = row
    for f, q in (("direct_field", "direct_quote"), ("second_field", "second_quote"),
                 ("negated_field", "negated_quote"), ("service_equipment_field", "service_equipment_quote")):
        check(row["unique_id"], row[f].strip(), row[q], f"evidence:{row['service']}:{q}")
    for part in filter(None, [p.strip() for p in (row.get("prereq_quotes") or "").split("||")]):
        m = re.match(r'^[^:]+:\s*"(.*)"\s*\((\w+)\)\s*$', part, re.S)
        if m:
            check(row["unique_id"], m.group(2), m.group(1), f"evidence:{row['service']}:prereq")

STRENGTH = {"equipment": 1.0, "procedure": 1.0, "capability": 0.9, "description": 0.6, "specialties": 0.3}
QTY = {"icu": (1, 200, 20), "ot": (1, 60, 10), "dialysis_unit": (1, 100, 20), "nicu": (1, 150, 20),
       "mri": (0.2, 7, 3), "ct": (1, 640, 128)}

def text_feature(uid, feat):
    """FEATURES §4.5 text_feats: returns value, status, quote, field, qty."""
    r = recs[uid]; has_text, truncated, _ = fac_info(r)
    x = raw.get((uid, feat), {})
    st = (x.get("status") or "not_mentioned").strip()
    field, quote = (x.get("field") or "").strip(), (x.get("quote") or "").strip()
    if st == "found":
        s = STRENGTH.get(field, 0.6)
        q = num(x.get("qty"))
        if feat in QTY:
            lo, hi, ref = QTY[feat]
            if q is not None and lo <= q <= hi:
                scale = min(1, q / ref) if feat == "mri" else min(1, math.log(1 + q) / math.log(1 + ref))
                return s * (0.6 + 0.4 * scale), "found", quote, field, q
            return s * 0.6, "found", quote, field, None
        return s, "found", quote, field, None
    # negated or not mentioned (M6: negation never counts as positive)
    if not has_text:
        return None, "unknown", quote, field, None
    if truncated:
        return None, "truncated", quote, field, None           # M7
    return 0.0, "not_mentioned", quote, field, None

def logscale(v, ref):
    return None if v is None else min(1, math.log(1 + v) / math.log(1 + ref))

def facility_features(uid):
    r = recs[uid]; has_text, truncated, _ = fac_info(r)
    out = {}
    ft = (r.get("facilityTypeId") or "").strip()
    out["G1_facility_type"] = ({"hospital": 1.0, "nursing_home": 0.7, "clinic": 0.4, "doctor": 0.2}.get(ft),
                               "found" if ft else "unknown", "", "facilityTypeId", None)
    nd = num(r.get("numberDoctors"))
    out["G2_doctors"] = (logscale(nd, 100), "found" if nd is not None else "unknown", "", "numberDoctors", nd)
    cap = num(r.get("capacity"))
    bt = raw.get((uid, "beds_text"), {})
    btq = num(bt.get("qty")) if (bt.get("status") or "").strip() == "found" else None
    btq = btq if btq is not None and 5 <= btq <= 5000 else None
    beds = cap if cap is not None else btq
    out["G3_beds"] = (logscale(beds, 1000), "found" if beds is not None else "unknown",
                      "" if cap is not None else (bt.get("quote") or "").strip(),
                      "capacity" if cap is not None else (bt.get("field") or "").strip(), beds)
    for gid, f in (("G4_icu", "icu"), ("G5_emergency_24x7", "emergency_24x7"), ("G6_ambulance", "ambulance"),
                   ("G7_ot", "ot"), ("G8_blood_bank", "blood_bank"), ("G9_anaesthesia", "anaesthesia"),
                   ("G11_lab_accreditation", "lab_accreditation")):
        out[gid] = text_feature(uid, f)
    jci, nabh = text_feature(uid, "acc_jci"), text_feature(uid, "acc_nabh")
    if jci[1] == "found":
        out["G10_accreditation"] = (1.0, "found", jci[2], jci[3], None)
    elif nabh[1] == "found":
        out["G10_accreditation"] = (0.8, "found", nabh[2], nabh[3], None)
    else:
        out["G10_accreditation"] = (None if (not has_text or truncated) else 0.0,
                                    "unknown" if not has_text else "truncated" if truncated else "not_mentioned", "", "", None)
    tt = text_feature(uid, "teaching_text")
    aff = r.get("affiliationTypeIds") or []
    name_hit = re.search("medical college|institute of medical sciences|aiims", r["name"].lower())
    if "academic" in aff or tt[1] == "found" or name_hit:
        src = ("affiliationTypeIds", "academic") if "academic" in aff else ((tt[3], tt[2]) if tt[1] == "found" else ("name", r["name"]))
        out["G12_teaching"] = (1.0, "found", src[1] if src[0] not in ("affiliationTypeIds", "name") else "", src[0], None)
    else:
        out["G12_teaching"] = (0.0 if (aff or has_text) else None, "not_mentioned" if (aff or has_text) else "unknown", "", "", None)
    diag = [f for f in ("xray", "usg", "ct", "mri", "pet", "mammography") if text_feature(uid, f)[1] == "found"]
    out["G13_diagnostic_breadth"] = ((len(diag) / 6) if has_text else None, "found" if diag else ("not_mentioned" if has_text else "unknown"),
                                     ", ".join(diag), "derived", len(diag))
    y = num(r.get("yearEstablished"))
    out["G14_years_operating"] = (logscale(max(0, REF_YEAR - y), 100) if y is not None else None,
                                  "found" if y is not None else "unknown", "", "yearEstablished",
                                  (REF_YEAR - y) if y is not None else None)
    for sid, f in (("S1_dialysis_unit", "dialysis_unit"), ("S2_labour_room", "labour_room"), ("S3_nicu", "nicu"),
                   ("S4_neonatal_support", "neonatal_support"), ("S5_cath_lab", "cath_lab"), ("S6_ccu", "ccu"),
                   ("S7_mri", "mri"), ("S8_ct", "ct"), ("S9_pet", "pet"), ("S10_radiotherapy", "radiotherapy"),
                   ("S11_chemotherapy", "chemotherapy"), ("S12_audiometry", "audiometry")):
        out[sid] = text_feature(uid, f)
    return out

# ---- D (FEATURES §3.3 / §4.6) --------------------------------------------------------------
WD = {"dialysis": {"S1_dialysis_unit": .35, "G4_icu": .15, "G10_accreditation": .10, "G2_doctors": .10,
                   "G3_beds": .10, "G1_facility_type": .20},
      "emergency_csection": {"S2_labour_room": .10, "S3_nicu": .10, "G5_emergency_24x7": .20, "G7_ot": .20,
                             "G8_blood_bank": .20, "G10_accreditation": .10, "G3_beds": .10},
      "cardiac_surgery": {"S5_cath_lab": .30, "S6_ccu": .20, "G7_ot": .10, "G8_blood_bank": .05,
                          "G10_accreditation": .15, "G12_teaching": .10, "G3_beds": .10}}
def depth(feats, svc):
    w = WD[svc]; tot = sum(w.values())
    D = 100 * sum(wt * (0.5 if feats[f][0] is None else feats[f][0]) for f, wt in w.items()) / tot
    cov = sum(wt for f, wt in w.items() if feats[f][0] is not None) / tot
    return D, cov

# ---- C (SCORING §2) ------------------------------------------------------------------------
def completeness(uid, feats):
    r = recs[uid]; pts = 0; missing = []
    if not nul(r.get("latitude")) and not nul(r.get("longitude")): pts += 25
    elif not nul(r.get("address_zipOrPostcode")): pts += 15; missing.append("exact location")
    else: missing.append("location")
    if not nul(r.get("officialPhone")): pts += 10
    else: missing.append("phone")
    if not nul(r.get("numberDoctors")): pts += 10
    else: missing.append("number of doctors")
    if feats["G3_beds"][4] is not None: pts += 10
    else: missing.append("beds")
    for f in ("procedure", "equipment", "capability"):
        if items(r, f): pts += 10
        else: missing.append(f)
    if not nul(r.get("yearEstablished")): pts += 5
    else: missing.append("year established")
    rec = r.get("recency_of_page_update")
    if nul(rec): missing.append("page update date")
    else:
        y, m, d = (int(x) for x in rec[:10].split("-"))
        pts += 10 if (REF_DATE[0] - y) * 12 + (REF_DATE[1] - m) <= 24 else 5
    band = "rich" if pts >= 70 else "partial" if pts >= 40 else "sparse"
    return pts, band, missing

# ---- E and label (SCORING §3.3 / §3.4) -----------------------------------------------------
FIELD_W = {"procedure": 1.0, "equipment": 1.0, "capability": 0.9, "description": 0.6}
SPEC_W = {"quantity": 1.2, "standard": 1.0, "generic": 0.6}
PREREQ = {"dialysis": ([], ["nephrology"]),
          "emergency_csection": (["ot", "anaesthesia"], ["blood_bank"]),
          "cardiac_surgery": (["ot", "anaesthesia", "icu_ccu"], ["blood_bank"])}
yes = lambda v: (v or "").strip().lower() == "yes"

def evidence(uid, svc, beds):
    r = recs[uid]; _, truncated, name_type = fac_info(r)
    e = ev.get((uid, svc), {})
    direct, neg = yes(e.get("direct_claim")), yes(e.get("negated_claim"))
    eq_only, spec = yes(e.get("equipment_only")), (e.get("specificity") or "standard").strip().lower()
    dfield = (e.get("direct_field") or "").strip()
    code = (e.get("specialty_code") or "").strip()
    found = {p.strip() for p in (e.get("prereq_found") or "").split(";") if p.strip()}
    if svc == "dialysis" and code in ("nephrology", "pediatricNephrology"):
        found.add("nephrology")
    caveats = []
    implied, checked = PREREQ[svc]
    met = 0.0; missing = []
    for p in implied + checked:
        if (direct and p in implied) or p in found:
            met += 1
        elif truncated:
            met += 0.5; missing.append(f"{p} (not reported, list cut off)")
        else:
            missing.append(p)
    prereq_pts = 20 * met / len(implied + checked)
    corr = (10 if code else 0) + (10 if yes(e.get("service_equipment")) and not eq_only else 0) \
           + (10 if yes(e.get("second_claim")) else 0)
    corr = min(30, corr)
    if direct:
        w = FIELD_W.get(dfield, 0.6) * SPEC_W.get(spec, 1.0) * (0.8 if eq_only else 1.0)
        E = 40 * min(w, 1) + corr + prereq_pts + (10 if spec == "quantity" else 0)
    else:
        E = min(50, corr + prereq_pts)
    # label, first match wins
    if neg and not direct:
        label = "Not offered"
    elif not direct:
        # Possible needs an actual signal in the text, not just half-credit for a truncated list
        label = "Possible" if (code or yes(e.get("service_equipment")) or found) else "None"
    elif neg:
        label = "Weak"; caveats.append("conflicting statements")
    else:
        if svc == "dialysis":
            rule = yes(e.get("service_equipment")) or name_type == "nephrology_dialysis"
            why = "no dialysis equipment and not a dialysis centre"
        elif svc == "emergency_csection":
            rule = yes(e.get("emergency_same_item"))
            why = "emergency readiness not confirmed"
        else:
            rule = yes(e.get("service_equipment")) and not (beds is not None and beds < 30)
            why = "no cath lab / CTICU / heart-lung machine" if not yes(e.get("service_equipment")) else "fewer than 30 beds"
        if E >= 70 and dfield in ("procedure", "equipment") and rule:
            label = "Strong"
        elif E >= 45:
            label = "Moderate"
            if E >= 70 and not rule: caveats.append(why)
            elif E >= 70: caveats.append("direct claim not in procedure/equipment")
        else:
            label = "Weak"
        if svc == "emergency_csection" and not rule and "emergency readiness not confirmed" not in caveats:
            caveats.append("emergency readiness not confirmed")
    return dict(E=round(E, 1), label=label, caveats=caveats, prereq_missing=missing,
                direct=direct, negated=neg, e=e)

# ---- ranking (SCORING §4.1 / §4.2 / §4.7) --------------------------------------------------
PROFILE = {"Q1": ("dialysis", .30, .10, .60, 15), "Q2": ("emergency_csection", .30, .10, .60, 15),
           "Q3": ("cardiac_surgery", .35, .45, .20, 150)}
KM = {"Q1": "km_q1", "Q2": "km_q2", "Q3": "km_q3"}
LORDER = {"Strong": 0, "Moderate": 1, "Weak": 2, "Possible": 3, "None": 4, "Not offered": 5}

feat_rows, ev_rows, rank_rows = [], [], []
cache = {}
for uid, r in recs.items():
    feats = facility_features(uid)
    C, band, missing = completeness(uid, feats)
    cache[uid] = (feats, C, band, missing)
    for fid, (v, st, q, fld, qty) in feats.items():
        feat_rows.append(dict(unique_id=uid, feature=fid, value="" if v is None else round(v, 4),
                              status=st, quote=q, field=fld))
    for svc in ("dialysis", "emergency_csection", "cardiac_surgery"):
        x = evidence(uid, svc, feats["G3_beds"][4])
        e = x["e"]
        feat_rows.append(dict(unique_id=uid, feature=f"EV_{svc}_direct_claim", value=1 if x["direct"] else 0,
                              status="found" if x["direct"] else "not_mentioned",
                              quote=(e.get("direct_quote") or "").strip(), field=(e.get("direct_field") or "").strip()))
        feat_rows.append(dict(unique_id=uid, feature=f"EV_{svc}_negated", value=1 if x["negated"] else 0,
                              status="found" if x["negated"] else "not_mentioned",
                              quote=(e.get("negated_quote") or "").strip(), field=(e.get("negated_field") or "").strip()))
        feat_rows.append(dict(unique_id=uid, feature=f"EV_{svc}_label", value=round(x["E"] / 100, 4),
                              status=x["label"], quote=(e.get("direct_quote") or "").strip(),
                              field=(e.get("direct_field") or "").strip()))
        D, cov = depth(feats, svc)
        conf = ("Low" if band == "sparse" or cov < 0.4 else
                "High" if x["label"] == "Strong" and band == "rich" and cov >= 0.6 else "Medium")
        ev_rows.append(dict(unique_id=uid, name=r["name"], service=svc, E=x["E"], label=x["label"],
                            llm_label=(e.get("llm_label") or "").strip(), D=round(D, 1), feature_coverage=round(cov, 2),
                            C=C, completeness_band=band, confidence=conf, caveats="; ".join(x["caveats"]),
                            prerequisites_missing="; ".join(x["prereq_missing"]), not_reported="; ".join(missing),
                            direct_field=(e.get("direct_field") or "").strip(), direct_quote=(e.get("direct_quote") or "").strip()))

evx = {(row["unique_id"], row["service"]): row for row in ev_rows}
for q, (svc, wE, wD, wA, dh) in PROFILE.items():
    rows = []
    for uid, r in recs.items():
        x = evx[(uid, svc)]
        km = float(r[KM[q]]); road = 1.4 * km
        A = 100 * 0.5 ** (road / dh)
        score = wE * x["E"] + wD * x["D"] + wA * A
        gate = x["label"] in ("Strong", "Moderate")
        rows.append((not gate, x["label"] == "Not offered", -score, LORDER[x["label"]], km, uid,
                     dict(query_id=q, unique_id=uid, rank_score=round(score, 2), label=x["label"], E=x["E"],
                          D=x["D"], A=round(A, 1), name=r["name"], passes_gate=gate, confidence=x["confidence"], km=km)))
    rows.sort(key=lambda t: t[:6])
    for i, t in enumerate(rows, 1):
        rank_rows.append({"query_id": q, "rank": i, **{k: v for k, v in t[6].items() if k != "query_id"}})

def write(fn, rows):
    with open(P(fn), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
write(f"features_{TAG}.csv", feat_rows)
write(f"evidence_{TAG}.csv", ev_rows)
write(f"ranking_{TAG}.csv", rank_rows)
with open(P(f"quotecheck_{TAG}.txt"), "w") as fh:
    fh.write(f"quotes checked: {qc_total}\nquotes failed: {len(qc_bad)}\n" + "\n".join(qc_bad) + "\n")
print(f"{TAG}: features {len(feat_rows)} rows, evidence {len(ev_rows)}, ranking {len(rank_rows)}; "
      f"quotes {qc_total} checked, {len(qc_bad)} failed")
