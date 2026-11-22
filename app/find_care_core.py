"""find_care for the demo app: the notebook's query-time logic (notebooks/find_care_v5.ipynb §11), plus four app-layer additions.

What the method decides (E, labels, D, confidence, gate, weights, radius schedule, fallback) is unchanged: it is read from
gold_service_scores, which the notebook builds. The app adds:

  1. not_recommended  every facility near the user that was considered but left out, each with a plain reason
                      (ranked lower, thin evidence, hint only, says it does not offer it, facility type doesn't fit)
  2. plausibility     a deterministic rule on the facility NAME: an eye, dental, AYUSH (homoeopathy, ayurveda...),
                      skin/cosmetic, physiotherapy, psychiatric or veterinary facility, or a diagnostic lab (except for
                      MRI), is not recommended for the 9 core services even when its text claims them. Such records
                      usually mix in another facility's text (e.g. an eye hospital "with a 10-bed NICU").
  3. record checks    silver data-quality flags become plain-language warnings. Two mixed-record flags cap confidence
                      at Low, and four weaker flags cap it at Medium. They never change the score or the order.
  4. location         city aliases (Bangalore → Bengaluru), letters-only city matching, "that's a state, pick a
                      district", and "did you mean…?" suggestions for typos.

These additions are not part of the evaluated numbers in evaluation/EVAL_RESULTS.md.
"""
from __future__ import annotations

import difflib
import json
import math
import re

import numpy as np
import pandas as pd

SERVICES = ["dialysis", "emergency_csection", "nicu", "cardiac_surgery", "mri", "trauma", "burn_care", "oncology", "ent"]
SERVICE_PHRASE = {"dialysis": "dialysis", "emergency_csection": "emergency C-section", "nicu": "newborn intensive care (NICU)",
                  "cardiac_surgery": "cardiac surgery", "mri": "MRI", "trauma": "trauma care", "burn_care": "burn care",
                  "oncology": "cancer care", "ent": "ENT care"}
SERVICE_NAMES = {"dialysis": "Dialysis", "emergency_csection": "Emergency C-section", "nicu": "NICU (newborn intensive care)",
                 "cardiac_surgery": "Cardiac surgery", "mri": "MRI scan", "trauma": "Trauma care", "burn_care": "Burn care",
                 "oncology": "Cancer care", "ent": "Ear, nose & throat"}
SERVICE_HINT = {"dialysis": "Kidney failure, regular sessions", "emergency_csection": "High-risk or emergency delivery",
                "nicu": "Newborn needing intensive care", "cardiac_surgery": "Bypass, valve or heart surgery",
                "mri": "MRI imaging", "trauma": "Accidents and serious injuries", "burn_care": "Serious burns (beta)",
                "oncology": "Chemotherapy, radiotherapy", "ent": "Ear, nose and throat problems"}
# service: (time_critical, gate_min_label, wE, wD, wA, d_half_km, max_radius_km): identical to find_care_v5.PROFILE
PROFILE = {
    "emergency_csection": (True,  "Moderate", .35, .20, .45, 20, 100),
    "nicu":               (True,  "Moderate", .35, .15, .50, 25, 200),
    "trauma":             (True,  "Moderate", .30, .15, .55, 15, 100),
    "dialysis":           (False, "Moderate", .30, .10, .60, 15, 150),
    "burn_care":          (False, "Moderate", .35, .25, .40, 40, 400),
    "mri":                (False, "Weak",     .40, .10, .50, 50, 300),
    "cardiac_surgery":    (False, "Moderate", .35, .45, .20, 150, 500),
    "oncology":           (False, "Moderate", .35, .45, .20, 150, 500),
    "ent":                (False, "Weak",     .40, .30, .30, 40, 150),
}
RADIUS_STEPS = [25, 50, 100, 250]
LABEL_RANK = {"Strong": 0, "Moderate": 1, "Weak": 2, "Possible": 3, "No evidence": 4, "Not offered": 5}
HOW_RANKED_LEAD = {
    "dialysis": "Dialysis is needed several times a week, so we show the closest facilities whose own records say they provide dialysis",
    "emergency_csection": "For emergency delivery we show the closest facilities whose records say they perform caesareans",
    "nicu": "For a newborn needing intensive care we show the closest facilities whose records describe a NICU",
    "trauma": "For injuries every minute counts, so we show the closest facilities whose records describe trauma or accident care",
    "cardiac_surgery": "For heart surgery we prioritise equipment and experience over distance, because it's often worth travelling",
    "oncology": "For cancer treatment we prioritise treatment capability (radiotherapy, chemotherapy) over distance",
    "mri": "For an MRI scan we show nearby facilities whose records list an MRI",
    "burn_care": "For burns we look for a documented burn unit, which is worth some extra travel",
    "ent": "For ear, nose and throat care, which is widely available, we balance distance, evidence and the number of doctors",
}


def how_ranked(service):
    tc, gate, wE, wD, wA, dh, mx = PROFILE[service]
    parts = sorted([(wA, "closeness"), (wE, "how clearly the record documents it"), (wD, "equipment and capability")], reverse=True)
    weights = ", ".join(f"{int(round(w * 100))}% {n}" for w, n in parts)
    return f"{HOW_RANKED_LEAD[service]}, ranked {weights}, searching up to {mx} km."


# ------------------------------------------------------------------ 2. plausibility (facility type vs service) ----------
# A name pattern, a plain label, and the core services such a facility can plausibly offer. AYUSH rules apply even to
# "medical college" names; the others are skipped when the name also says it's a general or multi-speciality hospital.
TYPE_RULES = [
    ("ayush", r"homo?eo|homoeopath|ayurved|unani|siddha|naturopath", "an AYUSH (homoeopathy / ayurveda) facility", set(), False),
    ("veterinary", r"\bveterinar|\bpet clinic|\banimal hospital", "a veterinary clinic", set(), False),
    ("eye", r"\beye\b|netra|nethra|nayan|ophthalm|\bvision\b|retina|lasik", "an eye hospital", set(), True),
    ("dental", r"dental|dentist|\bteeth\b|orthodont", "a dental clinic", set(), True),
    ("skin", r"\bskin\b|dermat|cosmetic|\bhair\b|aesthetic", "a skin / cosmetic clinic", set(), True),
    ("physio", r"physiother|\brehab", "a physiotherapy / rehab centre", set(), True),
    ("psych", r"psychiatr|de-?addiction|\bmental\b|nasha", "a mental-health / de-addiction centre", set(), True),
    ("diagnostic", r"diagnostic|patholog|\bimaging\b|\bscans?\b|\blabs?\b|laborator", "a diagnostic centre", {"mri"}, True),
]
GENERAL_RX = re.compile(r"multi\s*-?\s*special|super\s*-?\s*special|general hospital|medical college|institute of medical|"
                        r"medical sciences|civil hospital|district hospital|\baiims\b|medical cent", re.I)
_TYPE_RX = [(k, re.compile(p, re.I), lbl, ok, gen) for k, p, lbl, ok, gen in TYPE_RULES]


def implausible_reason(name, service):
    n = str(name or "")
    general = bool(GENERAL_RX.search(n))
    for key, rx_, label, ok, skip_if_general in _TYPE_RX:
        if rx_.search(n) and not (skip_if_general and general):
            if service in ok:
                return None
            return (f"Its name suggests {label}, which is unlikely to provide {SERVICE_PHRASE[service]}. "
                    "Records like this often mix up two facilities.")
    return None


# ------------------------------------------------------------------ 3. record checks (silver flags) ----------------------
# column → (plain warning, severity). Severity 2 caps confidence at Low; 1 caps it at Medium. Never changes rank.
# Not used: dq web_name_mismatch_suspect (24% of records) and websites_many_unrelated_sources (fires mostly on large,
# well-known hospitals that appear in many directories, e.g. CARE Raipur): too common to be a trust signal.
RECORD_CHECKS = {
    "flag_capability_mentions_other_facility": ("Its capabilities mention another facility by name, so the record may mix two facilities", 2),
    "flag_description_other_state": ("Its description names a different state from its address", 2),
    "flag_description_boilerplate": ("Its description looks like template text, not facility-specific", 1),
    "flag_address_stateOrRegion_pin_mismatch": ("Its stated state doesn't match its PIN code", 1),
    "implausible_capacity": ("Its bed or doctor numbers look implausible", 1),
    "flag_specialties_type_mismatch": ("Its listed specialties don't fit its facility type", 1),
}
CONF_ORDER = ["Low", "Medium", "High"]


def apply_record_checks(confidence, checks):
    cap = "High"
    for _, sev in checks:
        cap = min(cap, "Low" if sev >= 2 else "Medium", key=CONF_ORDER.index)
    return min(confidence, cap, key=CONF_ORDER.index)


# ------------------------------------------------------------------ helpers --------------------------------------------
def _norm(s):
    s = re.sub(r"[^a-z0-9 ]", " ", str(s).lower())
    s = re.sub(r"\b(district|dist|city|nagar nigam)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _key(s):
    return re.sub(r"[^a-z]", "", str(s).lower())


def _title(s):
    return " ".join(w.capitalize() for w in str(s).lower().split())


def _haversine(lat, lon, lats, lons):
    la1, lo1, la2, lo2 = map(np.radians, (lat, lon, lats, lons))
    h = np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(h, 0, 1)))


def _jl(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return []
    if isinstance(v, str):
        return json.loads(v) if v else []
    return list(v)


def _ref_url(u):
    u = str(u).strip()
    return u if re.match(r"https?://", u) else "https://" + u


# ------------------------------------------------------------------ 4. location -----------------------------------------
def resolve_location(text, geo):
    """→ (resolved dict | None, clarification dict | None, error str | None). Same rules as the notebook, plus aliases,
    letters-only city keys, state-only input and typo suggestions."""
    pins, cities, aliases = geo["pins"], geo["cities"], geo["aliases"]
    t = (text or "").strip()
    m = re.fullmatch(r"(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)", t)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None, None, "Those coordinates are out of range."
        return {"lat": lat, "lon": lon, "method": "latlon", "label": f"{lat:.4f}, {lon:.4f}"}, None, None
    if re.fullmatch(r"\d{6}", t.replace(" ", "")):
        pin = t.replace(" ", "")
        row = pins[pins["pin"] == float(pin)]
        r = None if row.empty else row.iloc[0]
        if r is not None and bool(r["coord_outlier"]) and not pd.isna(r["lat_pre"]):
            return {"lat": float(r["lat_pre"]), "lon": float(r["lon_pre"]), "method": "pin",
                    "label": f"PIN {pin} ({_title(r['district'])}, {_title(r['state'])}; approximate, centre of PIN area {pin[:3]}xxx)"}, None, None
        if r is None or pd.isna(r["lat"]):
            return None, None, f"PIN code {pin} is not in the PIN directory. Try a nearby PIN, the district or the city."
        return {"lat": float(r["lat"]), "lon": float(r["lon"]), "method": "pin",
                "label": f"PIN {pin} ({_title(r['district'])}, {_title(r['state'])})"}, None, None
    if re.fullmatch(r"\d+", t.replace(" ", "")):
        return None, None, "A PIN code has 6 digits. Check the number, or type a city or district."

    name, state = (t.split(",", 1) + [""])[:2] if "," in t else (t, "")
    name_n, state_n = _norm(name), _norm(state)
    if not name_n:
        return None, None, "Type a PIN code, city, district or 'lat, lon'."
    canonical = aliases.get(_key(name))          # Bangalore → Bengaluru, Gurgaon → Gurugram …
    name_k = _key(canonical or name)
    d = pins[pins["district_n"] == name_n]
    c_all = cities[cities["city_k"] == name_k]
    if state_n:
        d = d[d["state_n"].str.contains(state_n, regex=False)]
        c_all = c_all[c_all["state_n"].str.contains(state_n, regex=False)]
    c = c_all[c_all["exact"].astype(bool)]
    cc = c[c["state_n"] != ""].groupby("state_n").size()
    city_states = set(cc[(cc >= 2) & (cc >= 0.05 * cc.sum())].index) if len(cc) else set()
    states = sorted(set(d.loc[d["state_n"] != "", "state_n"]) | city_states)
    shown = _title(canonical or name)
    if not states:
        small = c_all[c_all["state_n"] != ""]
        small_states = sorted(set(small["state_n"]))
        if len(small_states) == 1:
            n_ = len(small)
            return {"lat": float(small["lat"].median()), "lon": float(small["lon"].median()), "method": "city",
                    "label": f"{shown}, {_title(small_states[0])} (approximate: centre of {n_} listed "
                             f"facilit{'y' if n_ == 1 else 'ies'} in this town)"}, None, None
        if len(small_states) > 1:
            return None, {"message": f"'{shown}' exists in more than one state. Which one do you mean?",
                          "options": [{"label": f"{shown}, {_title(s)}", "state": _title(s), "kind": "city"} for s in small_states]}, None
        # a whole state → ask for a district in it
        st_rows = pins[pins["state_n"] == name_n]
        if len(st_rows):
            top = (cities[cities["state_n"] == name_n].groupby("city").size().sort_values(ascending=False).head(8).index.tolist()
                   or sorted(set(st_rows["district"].dropna()))[:8])
            return None, {"message": f"{_title(name)} is a whole state. Which city or district is the patient in?",
                          "options": [{"label": f"{_title(x)}, {_title(name)}", "state": _title(name), "kind": "city"} for x in top]}, None
        # typo → suggestions
        vocab = geo["vocab"]
        close = difflib.get_close_matches(name_n, list(vocab), n=4, cutoff=0.78)
        if close:
            return None, {"message": f"We couldn't find '{t}'. Did you mean one of these?",
                          "options": [{"label": vocab[x], "state": vocab[x].split(", ")[-1], "kind": "suggestion"} for x in close]}, None
        return None, None, f"We couldn't find '{t}'. Try a 6-digit PIN code, a district name, a city name, or 'lat, lon'."
    if len(states) > 1:
        return None, {"message": f"'{shown}' exists in more than one state. Which one do you mean?",
                      "options": [{"label": f"{shown}, {_title(s)}", "state": _title(s),
                                   "kind": "city" if s in city_states else "district"} for s in states]}, None
    st = states[0]
    cs, ds = c[c["state_n"] == st], d[(d["state_n"] == st) & d["lat"].notna()]
    if len(cs) >= 3:
        return {"lat": float(cs["lat"].median()), "lon": float(cs["lon"].median()), "method": "city",
                "label": f"{shown} city, {_title(st)} (centre of {len(cs)} listed facilities)"}, None, None
    if len(ds):
        return {"lat": float(ds["lat"].median()), "lon": float(ds["lon"].median()), "method": "district",
                "label": f"{shown} district, {_title(st)} (centre of {len(ds)} PIN area{'s' if len(ds) != 1 else ''})"}, None, None
    if cs.empty:
        return None, None, f"We found '{t}' but have no reliable coordinates for it. Try a 6-digit PIN code or 'lat, lon'."
    return {"lat": float(cs["lat"].median()), "lon": float(cs["lon"].median()), "method": "city",
            "label": f"{shown} city, {_title(st)}"}, None, None


# ------------------------------------------------------------------ results ---------------------------------------------
def _result(r, rank, checks_by_id):
    caveats = list(_jl(r["caveats"]))
    checks = checks_by_id.get(r["unique_id"], [])
    unc = float(r["pin_radius_km"]) if r["location_quality"] != "exact" else 0.0
    if r["location_quality"] != "exact":
        caveats.append(f"Location is approximate (centre of the PIN area), so the distance may be off by about {unc:.0f} km")
    if r["completeness_band"] == "sparse":
        caveats.append("Limited information. Call to confirm before travelling.")
    caveats += [txt for txt, _ in checks]
    return {
        "rank": rank, "unique_id": r["unique_id"], "name": r["name"], "facility_type": r["facility_type"],
        "distance_km": round(float(r["road_km"]), 1), "distance_uncertainty_km": round(unc, 1),
        "evidence_label": r["evidence_label"],
        "confidence": apply_record_checks(r["confidence"], checks),
        "rank_score": round(float(r["score"]), 1), "E": round(float(r["E"]), 1), "D": round(float(r["D"]), 1),
        "A": round(float(r["A"]), 1),
        "why": _jl(r["why_json"]),
        "caveats": caveats,
        "not_reported": list(_jl(r["missing_fields"])) + list(_jl(r["prerequisites_missing"])),
        "contact": {"official_phone": r["official_phone"] if isinstance(r["official_phone"], str) else None,
                    "references": [_ref_url(u) for u in _jl(r["references"])][:3]},
        # app-only fields (stripped before logging)
        "lat": float(r["lat"]), "lon": float(r["lon"]),
        "record_checks": [txt for txt, _ in checks],
        "place": ", ".join(_title(x) for x in (r["city"], r["state"]) if isinstance(x, str) and x),
    }


def _brief(r, reason, kind):
    why = _jl(r["why_json"])
    return {"unique_id": r["unique_id"], "name": r["name"], "distance_km": round(float(r["road_km"]), 1),
            "evidence_label": r["evidence_label"], "reason": reason, "kind": kind,
            "rank_score": round(float(r["score"]), 1) if not pd.isna(r["score"]) else None,
            "quote": why[0] if why else None, "lat": float(r["lat"]), "lon": float(r["lon"])}


def find_care(service, location, k, scores, geo, checks_by_id):
    """PLAN_V5 §5 response + app fields `not_recommended` and per-result `lat`/`lon`/`record_checks`/`place`."""
    service = (service or "").strip()
    k = max(1, min(int(k), 20))
    resp = {"query": {"service": service, "location_input": location, "resolved_location": None, "radius_km_used": None},
            "how_ranked": None, "results": [], "extra_rows": None, "fallback": None, "not_recommended": None}
    if service not in PROFILE:
        resp["error"] = f"Unknown service '{service}'."
        return resp
    loc, clar, err = resolve_location(location, geo)
    if clar:
        resp["clarification"] = clar
        return resp
    if err:
        resp["error"] = err
        return resp
    tc, gate_min, wE, wD, wA, d_half, max_r = PROFILE[service]
    resp["query"]["resolved_location"] = loc
    resp["how_ranked"] = how_ranked(service)

    df = scores.copy()
    df["road_km"] = 1.4 * _haversine(loc["lat"], loc["lon"], df["lat"].to_numpy(float), df["lon"].to_numpy(float))
    unc = np.where(df["location_quality"] != "exact", df["pin_radius_km"].astype(float), 0.0)
    df["A"] = 100 * np.power(0.5, (df["road_km"] + unc) / d_half)
    df["score"] = wE * df["E"] + wD * df["D"] + wA * df["A"]
    df["lrank"] = df["evidence_label"].map(LABEL_RANK)
    order, asc = ["score", "lrank", "road_km", "unique_id"], [False, True, True, True]
    near = df[df["road_km"] <= max_r]
    implaus = near["name"].map(lambda n: implausible_reason(n, service))
    df["implausible"] = None
    df.loc[near.index, "implausible"] = implaus
    ok_type = df["implausible"].isna()
    gate_all = df[df["passes_gate"] & ~df["not_offered"]]
    gate = gate_all[ok_type.loc[gate_all.index]]

    used = max_r
    for r_ in [s for s in RADIUS_STEPS if s < max_r] + [max_r]:
        if (gate["road_km"] <= r_).sum() >= k:
            used = r_
            break
    resp["query"]["radius_km_used"] = used
    top = gate[gate["road_km"] <= used].sort_values(order, ascending=asc).head(k)
    resp["results"] = [_result(r, i, checks_by_id) for i, (_, r) in enumerate(top.iterrows(), 1)]
    shown_ids = set(top["unique_id"])

    extra = {}
    if not (top["evidence_label"] == "Strong").any():
        strong = gate[(gate["evidence_label"] == "Strong") & (gate["road_km"] <= max_r) & ~gate["unique_id"].isin(shown_ids)]
        if len(strong):
            s = strong.sort_values(order, ascending=asc).iloc[0]
            extra["stronger_evidence"] = {"message": f"Stronger documented evidence, {s['road_km']:.0f} km away",
                                          "result": _result(s, None, checks_by_id)}
            shown_ids.add(s["unique_id"])
    if not tc and len(top) < k:
        poss = df[(df["evidence_label"] == "Possible") & (df["road_km"] <= max_r) & ok_type].sort_values(order, ascending=asc).head(k - len(top))
        if len(poss):
            extra["unconfirmed_options"] = {
                "message": "Unconfirmed options: these records only hint at this service (a specialty or equipment), with no direct claim. Call first.",
                "results": [_result(r, None, checks_by_id) for _, r in poss.iterrows()]}
            shown_ids |= set(poss["unique_id"])
    resp["extra_rows"] = extra or None

    if not resp["results"]:
        msg = (f"No facility with good evidence for {SERVICE_PHRASE[service]} within {max_r} km of {loc['label']}. "
               "Call before travelling.")
        if len(gate):
            n = gate.sort_values("road_km").iloc[0]
            msg += f" The nearest facility whose record documents it is {n['name']}, about {n['road_km']:.0f} km away (road estimate)."
        resp["fallback"] = msg

    # ---- 1. considered but not recommended (within the radius searched; the whole max radius if nothing was found)
    look = used if resp["results"] else max_r
    pool = df[(df["road_km"] <= look) & ~df["unique_id"].isin(shown_ids)]
    groups = []
    kth = float(top["score"].iloc[-1]) if len(top) else None

    def add(kind, title, rows, reason_fn, limit=6):
        rows = rows.sort_values("road_km")
        if len(rows):
            groups.append({"kind": kind, "title": title, "count": int(len(rows)),
                           "items": [_brief(r, reason_fn(r), kind) for _, r in rows.head(limit).iterrows()]})

    lower = pool[pool["passes_gate"] & ~pool["not_offered"] & pool["implausible"].isna()]
    add("ranked_lower", "Good evidence, but ranked below the top options", lower,
        lambda r: (f"Match {r['score']:.0f} out of 100, below the last place on your list ({kth:.0f})."
                   if kth is not None else f"Match {r['score']:.0f} out of 100.")
        + f" Proof {r['E']:.0f}, support {r['D']:.0f}, closeness {r['A']:.0f}.")
    claims = pool["evidence_label"].isin(["Strong", "Moderate", "Weak", "Possible"])
    add("facility_type", "Facility type doesn't fit this service", pool[pool["implausible"].notna() & claims],
        lambda r: r["implausible"])
    weak = pool[(pool["evidence_label"] == "Weak") & ~pool["passes_gate"] & pool["implausible"].isna()]
    add("thin_evidence", "Evidence too thin" + (" for an urgent need" if tc else ""), weak,
        lambda r: f"Its record mentions {SERVICE_PHRASE[service]} only in passing, which isn't enough proof to recommend it.")
    hint = pool[(pool["evidence_label"] == "Possible") & pool["implausible"].isna()]
    add("hint_only", "Only a hint (specialty or equipment), no direct claim", hint,
        lambda r: "It lists a related specialty or equipment, but never says it provides "
                  f"{SERVICE_PHRASE[service]}." + (" We don't suggest these for emergencies." if tc else ""))
    add("not_offered", "Record says it does not offer this", pool[pool["not_offered"]],
        lambda r: f"Its own record says {SERVICE_PHRASE[service]} is not available there.")
    resp["not_recommended"] = {
        "radius_km": look, "groups": groups,
        "no_mention_count": int(((df["road_km"] <= look) & (df["evidence_label"] == "No evidence")).sum()),
        "considered_count": int((df["road_km"] <= look).sum()),
    }
    return resp


def loggable(resp):
    """The §5 response as the eval bench expects it: app-only fields removed."""
    out = json.loads(json.dumps(resp, default=str))
    out.pop("not_recommended", None)

    def strip(r):
        for f in ("lat", "lon", "record_checks", "place"):
            r.pop(f, None)
    for r in out.get("results") or []:
        strip(r)
    ex = out.get("extra_rows") or {}
    if ex.get("stronger_evidence"):
        strip(ex["stronger_evidence"]["result"])
    for r in (ex.get("unconfirmed_options") or {}).get("results", []):
        strip(r)
    return out


# ------------------------------------------------------------------ specialty fallback (103 listed specialties) ----------
def specialty_label(code):
    words = re.sub(r"([a-z])([A-Z])", r"\1 \2", str(code)).replace("And ", "and ").split()
    s = " ".join(words)
    return s[:1].upper() + s[1:].lower() if s else s


def find_by_specialty(code, location, k, directory, geo, checks_by_id):
    """Facilities whose listed specialties include `code`, nearest first. Evidence is the specialty list only, so every
    result is labelled 'Listed specialty' with Low confidence: call to confirm."""
    k = max(1, min(int(k), 20))
    label = specialty_label(code)
    resp = {"query": {"service": f"specialty:{code}", "service_name": label, "location_input": location,
                      "resolved_location": None, "radius_km_used": None},
            "how_ranked": None, "results": [], "extra_rows": None, "fallback": None, "not_recommended": None,
            "specialty_mode": True}
    loc, clar, err = resolve_location(location, geo)
    if clar:
        resp["clarification"] = clar
        return resp
    if err:
        resp["error"] = err
        return resp
    resp["query"]["resolved_location"] = loc
    resp["how_ranked"] = (f"{label} is not one of the 9 services we check in depth, so we list the nearest facilities whose "
                          "records include it as a specialty, nearest first. A listed specialty is a weak signal: "
                          "always call to confirm.")
    has = directory[directory["specialties"].map(lambda xs: code in xs)].copy()
    has["road_km"] = 1.4 * _haversine(loc["lat"], loc["lon"], has["lat"].to_numpy(float), has["lon"].to_numpy(float))
    max_r = 300
    used = max_r
    for r_ in [s for s in RADIUS_STEPS if s < max_r] + [max_r]:
        if (has["road_km"] <= r_).sum() >= k:
            used = r_
            break
    resp["query"]["radius_km_used"] = used
    top = has[has["road_km"] <= used].sort_values(["road_km", "unique_id"]).head(k)
    for i, (_, r) in enumerate(top.iterrows(), 1):
        checks = checks_by_id.get(r["unique_id"], [])
        unc = float(r["pin_radius_km"]) if r["location_quality"] != "exact" else 0.0
        caveats = ["Based only on the facility's list of specialties. It doesn't say which treatments it offers."]
        if r["location_quality"] != "exact":
            caveats.append(f"Location is approximate (centre of the PIN area), so the distance may be off by about {unc:.0f} km")
        caveats += [t for t, _ in checks]
        resp["results"].append({
            "rank": i, "unique_id": r["unique_id"], "name": r["name"], "facility_type": r["facility_type"],
            "distance_km": round(float(r["road_km"]), 1), "distance_uncertainty_km": round(unc, 1),
            "evidence_label": "Listed specialty", "confidence": "Low", "rank_score": None, "E": None, "D": None, "A": None,
            "why": [{"field": "specialties", "quote": code}], "caveats": caveats, "not_reported": [],
            "contact": {"official_phone": r["phone"] if isinstance(r["phone"], str) else None,
                        "references": [_ref_url(r["website"])] if isinstance(r["website"], str) and r["website"] else []},
            "lat": float(r["lat"]), "lon": float(r["lon"]), "record_checks": [t for t, _ in checks],
            "place": ", ".join(_title(x) for x in (r["city"], r["state"]) if isinstance(x, str) and x)})
    if not resp["results"]:
        resp["fallback"] = f"No facility lists {label} within {max_r} km of {loc['label']}."
    return resp
