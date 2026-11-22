"""Find the Right Care: demo app (FastAPI + a static React/shadcn front end), for Databricks Apps on Free Edition.

Reads the tables built by notebooks/find_care_v5.ipynb (and sql/03_silver_facilities_v2.sql) through the SQL warehouse,
keeps them in memory, and answers searches with find_care_core. Each core-service search is appended to
gold_query_log in the PLAN_V5 §5 format (app-only fields removed). Logging failures never break a search.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import threading
import time
import uuid

import pandas as pd
from databricks import sql
from databricks.sdk.core import Config
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import find_care_core as core

SCHEMA = os.environ.get("FTRC_SCHEMA", "workspace.hackathon")
WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID", "809c9110ea0b7af6")
LOG_TABLE = os.environ.get("FTRC_LOG_TABLE", f"{SCHEMA}.gold_query_log")
HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")

cfg = Config()


def query(q: str) -> pd.DataFrame:
    with sql.connect(server_hostname=cfg.host.replace("https://", "").rstrip("/"),
                     http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
                     credentials_provider=lambda: cfg.authenticate) as conn:
        with conn.cursor() as cur:
            cur.execute(q)
            return cur.fetchall_arrow().to_pandas()


def execute(q: str, params: dict) -> None:
    with sql.connect(server_hostname=cfg.host.replace("https://", "").rstrip("/"),
                     http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
                     credentials_provider=lambda: cfg.authenticate) as conn:
        with conn.cursor() as cur:
            cur.execute(q, params)


# ------------------------------------------------------------------ data (loaded once, kept in memory) -----------------
SCORE_SQL = f"""
SELECT unique_id, service, name, facility_type, E, evidence_label, D, completeness_band, passes_gate, not_offered,
       confidence, why_json, to_json(caveats) AS caveats, to_json(prerequisites_missing) AS prerequisites_missing,
       to_json(missing_fields) AS missing_fields, lat, lon, location_quality, pin_radius_km, official_phone,
       to_json(`references`) AS refs, city, state
FROM {SCHEMA}.gold_service_scores WHERE lat IS NOT NULL AND lon IS NOT NULL"""

PINS_SQL = f"""
WITH pp AS (SELECT try_cast(pincode AS DOUBLE) AS pin, try_cast(latitude AS DOUBLE) AS lat_dir, try_cast(longitude AS DOUBLE) AS lon_dir,
                   district, statename AS state, CAST(floor(try_cast(pincode AS DOUBLE) / 1000) AS BIGINT) AS pre
            FROM {SCHEMA}.silver_pincode_directory WHERE coalesce(is_primary_state, false)),
pm AS (SELECT pre, percentile_approx(lat_dir, 0.5) AS lat_pre, percentile_approx(lon_dir, 0.5) AS lon_pre
       FROM pp WHERE lat_dir IS NOT NULL AND lon_dir IS NOT NULL GROUP BY pre),
pd AS (SELECT pp.*, pm.lat_pre, pm.lon_pre,
         2 * 6371 * asin(sqrt(pow(sin(radians(pp.lat_dir - pm.lat_pre) / 2), 2)
           + cos(radians(pp.lat_dir)) * cos(radians(pm.lat_pre)) * pow(sin(radians(pp.lon_dir - pm.lon_pre) / 2), 2))) AS km
       FROM pp LEFT JOIN pm ON pm.pre = pp.pre)
SELECT pin, district, state, lat_pre, lon_pre, coalesce(km > 300, false) AS coord_outlier,
       CASE WHEN coalesce(km <= 300, true) THEN lat_dir END AS lat, CASE WHEN coalesce(km <= 300, true) THEN lon_dir END AS lon
FROM pd"""

CITIES_SQL = f"""
SELECT v.clean_city AS city, v.clean_state AS state, l.lat, l.lon, l.location_quality = 'exact' AS exact
FROM {SCHEMA}.silver_facilities_v2 v JOIN {SCHEMA}.silver_facility_location l USING (unique_id)
WHERE v.city_search_ok AND l.lat IS NOT NULL AND l.lon IS NOT NULL"""

CHECKS_SQL = f"""
SELECT f.unique_id,
  coalesce(f.flag_capability_mentions_other_facility, false) AS flag_capability_mentions_other_facility,
  coalesce(f.flag_description_other_state, false) AS flag_description_other_state,
  coalesce(f.flag_description_boilerplate, false) AS flag_description_boilerplate,
  coalesce(f.flag_address_stateOrRegion_pin_mismatch, false) AS flag_address_stateOrRegion_pin_mismatch,
  coalesce(f.flag_capacity_implausible OR f.flag_capacity_vs_facility_type OR f.flag_numberDoctors_exceeds_capacity, false) AS implausible_capacity,
  coalesce(f.flag_specialties_type_mismatch, false) AS flag_specialties_type_mismatch
FROM {SCHEMA}.silver_facilities f
LEFT JOIN (SELECT unique_id, max(websites_many_unrelated_sources) AS websites_many_unrelated_sources
           FROM {SCHEMA}.dq_facilities_identity_contact GROUP BY unique_id) d USING (unique_id)"""

DIRECTORY_SQL = f"""
SELECT v.unique_id, v.clean_name AS name, v.clean_facility_type AS facility_type, to_json(v.clean_specialties) AS specialties,
       v.clean_officialPhone AS phone, v.clean_website AS website, v.clean_city AS city, v.clean_state AS state,
       l.lat, l.lon, l.location_quality, l.pin_radius_km
FROM {SCHEMA}.silver_facilities_v2 v JOIN {SCHEMA}.silver_facility_location l USING (unique_id)
WHERE l.lat IS NOT NULL AND l.lon IS NOT NULL"""

COVERAGE_SQL = f"""
SELECT service, evidence_label AS label, count(*) AS n, count_if(passes_gate) AS gate
FROM {SCHEMA}.gold_service_scores GROUP BY ALL"""

STATE: dict = {"ready": False, "error": None, "loaded_at": None}
LOCK = threading.Lock()


def load():
    t0 = time.time()
    try:
        scores = query(SCORE_SQL)
        scores = scores.rename(columns={"refs": "references"})
        by_service = {s: g.reset_index(drop=True) for s, g in scores.groupby("service")}
        pins = query(PINS_SQL)
        cities = query(CITIES_SQL)
        aliases_df = query(f"SELECT alias_key, canonical_city FROM {SCHEMA}.ref_city_alias")
        for df_, col in ((pins, "district"), (pins, "state"), (cities, "state")):
            df_[col + "_n"] = df_[col].fillna("").map(core._norm)
        cities["city_k"] = cities["city"].fillna("").map(core._key)
        vocab = {}
        for _, r in pins.drop_duplicates(["district_n", "state_n"]).iterrows():
            if r["district_n"]:
                vocab.setdefault(r["district_n"], f"{core._title(r['district'])}, {core._title(r['state'])}")
        for _, r in cities.drop_duplicates(["city", "state_n"]).iterrows():
            n = core._norm(r["city"])
            if n:
                vocab.setdefault(n, f"{r['city']}, {core._title(r['state'])}")
        chk = query(CHECKS_SQL)
        checks = {}
        for _, r in chk.iterrows():
            hits = [core.RECORD_CHECKS[c] for c in core.RECORD_CHECKS if bool(r[c])]
            if hits:
                checks[r["unique_id"]] = hits
        directory = query(DIRECTORY_SQL)
        directory["specialties"] = directory["specialties"].map(lambda s: set(json.loads(s)) if isinstance(s, str) else set())
        spec_counts = {}
        for xs in directory["specialties"]:
            for x in xs:
                spec_counts[x] = spec_counts.get(x, 0) + 1
        cov = query(COVERAGE_SQL)
        with LOCK:
            STATE.update(scores=by_service, geo={"pins": pins, "cities": cities, "aliases": dict(zip(aliases_df.alias_key, aliases_df.canonical_city)),
                                                 "vocab": vocab},
                         checks=checks, directory=directory, spec_counts=spec_counts, coverage=cov,
                         n_facilities=int(directory["unique_id"].nunique()), ready=True, error=None,
                         loaded_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                         load_s=round(time.time() - t0, 1))
    except Exception as ex:  # surfaced by /api/health and the UI; retried (e.g. warehouse still starting, grants pending)
        STATE.update(ready=False, error=f"{type(ex).__name__}: {str(ex)[:400]}")
        threading.Timer(20, load).start()


def ensure_ready():
    if not STATE["ready"]:
        raise HTTPException(503, STATE["error"] or "Loading facility data, try again in a few seconds.")


def log_query(request: dict, resp: dict):
    if os.environ.get("FTRC_LOG", "1") != "1":
        return
    try:
        execute(f"INSERT INTO {LOG_TABLE} (query_id, ts, request_json, response_json) "
                "VALUES (:qid, current_timestamp(), :req, :resp)",
                {"qid": str(uuid.uuid4()), "req": json.dumps(request, ensure_ascii=False),
                 "resp": json.dumps(core.loggable(resp), ensure_ascii=False)})
    except Exception as ex:
        print("log failed:", str(ex)[:200], flush=True)


# ------------------------------------------------------------------ API -------------------------------------------------
app = FastAPI(title="Find the Right Care")


@app.on_event("startup")
def _startup():
    threading.Thread(target=load, daemon=True).start()


@app.get("/api/health")
def health():
    return {k: STATE.get(k) for k in ("ready", "error", "loaded_at", "load_s", "n_facilities")}


@app.get("/api/meta")
def meta():
    ensure_ready()
    services = []
    for s in core.SERVICES:
        tc, gate, wE, wD, wA, dh, mx = core.PROFILE[s]
        services.append({"id": s, "name": core.SERVICE_NAMES[s], "hint": core.SERVICE_HINT[s], "time_critical": tc,
                         "gate_min_label": gate, "weights": {"evidence": wE, "capability": wD, "closeness": wA},
                         "half_distance_km": dh, "max_radius_km": mx, "how_ranked": core.how_ranked(s)})
    core_codes = {"nephrology", "obstetrics", "neonatology", "cardiothoracicSurgery", "radiology", "emergencyMedicine",
                  "oncology", "medicalOncology", "otolaryngology", "burnCare", "plasticSurgery"}
    specs = sorted(({"code": c, "name": core.specialty_label(c), "facilities": n}
                    for c, n in STATE["spec_counts"].items() if c not in core_codes), key=lambda x: x["name"])
    return {"services": services, "specialties": specs, "n_facilities": STATE["n_facilities"], "loaded_at": STATE["loaded_at"]}


@app.get("/api/search")
def search(service: str, location: str, k: int = 5):
    ensure_ready()
    t0 = time.time()
    if service.startswith("specialty:"):
        resp = core.find_by_specialty(service.split(":", 1)[1], location, k, STATE["directory"], STATE["geo"], STATE["checks"])
    else:
        if service not in STATE["scores"]:
            raise HTTPException(400, f"Unknown service '{service}'")
        resp = core.find_care(service, location, k, STATE["scores"][service], STATE["geo"], STATE["checks"])
        threading.Thread(target=log_query, args=({"service": service, "location": location, "k": k}, resp), daemon=True).start()
    resp["elapsed_ms"] = int((time.time() - t0) * 1000)
    return json.loads(json.dumps(resp, default=lambda o: o.item() if hasattr(o, "item") else str(o)))


@app.get("/api/coverage")
def coverage():
    ensure_ready()
    cov = STATE["coverage"]
    out = []
    for s in core.SERVICES:
        g = cov[cov["service"] == s]
        cnt = {r["label"]: int(r["n"]) for _, r in g.iterrows()}
        out.append({"service": s, "name": core.SERVICE_NAMES[s], "strong": cnt.get("Strong", 0), "moderate": cnt.get("Moderate", 0),
                    "weak": cnt.get("Weak", 0), "possible": cnt.get("Possible", 0), "not_offered": cnt.get("Not offered", 0),
                    "recommendable": int(g["gate"].sum())})
    return {"services": out, "n_facilities": STATE["n_facilities"]}


if os.path.isdir(STATIC):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = os.path.join(STATIC, path)
        if path and os.path.isfile(f):
            return FileResponse(f)
        return FileResponse(os.path.join(STATIC, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("DATABRICKS_APP_PORT", 8000)))
