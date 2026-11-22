# Databricks notebook source
# MAGIC %md
# MAGIC # Find the Right Care: evaluation bench on the real silver data
# MAGIC
# MAGIC Runs `eval_bench` (BENCH_DESIGN.md) against `find_care` v5 on all ~10k facilities.
# MAGIC
# MAGIC Stages (widget `stage`):
# MAGIC 1. **prepare**: export facilities and PINs, sample the queries, run `find_care` on each query (not logged to `gold_query_log`), pool the candidates into blind judge packets.
# MAGIC 2. **grade**: LLM judges grade every packet with `ai_query`: a primary judge on all packets, a second judge on a blinded ~25% audit subset, and a third judge resolving any disagreement of two or more grades. None of them is the extractor, which is regex.
# MAGIC 3. **evaluate**: build the reference lists, score the method and baselines B0–B2, run the weight-stability check, and tune the ranking weights on the tuning split, reporting on the held-out split.
# MAGIC
# MAGIC Every output goes to `/Volumes/workspace/hackathon/eval_files/<run>` and to `eval_*` tables. Nothing this notebook doesn't own is changed.

# COMMAND ----------

dbutils.widgets.dropdown("stage", "prepare", ["prepare", "grade", "evaluate", "rescore", "all"], "Stage")
dbutils.widgets.text("run_name", "silver_v5", "Run folder")
dbutils.widgets.dropdown("rebuild", "no", ["yes", "no"], "Rebuild find_care tables")
dbutils.widgets.dropdown("run_tests", "no", ["yes", "no"], "find_care tests")
STAGE = dbutils.widgets.get("stage")
RUN_NAME = dbutils.widgets.get("run_name")

# COMMAND ----------

# MAGIC %run ./find_care_v5_lib

# COMMAND ----------

import json, sys, os, time, statistics, hashlib
from pathlib import Path
from collections import defaultdict, Counter

HERE = os.path.dirname(dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get())
sys.path.insert(0, "/Workspace" + HERE)
import bench, build, checks, grade  # noqa: E402

EVAL_SCHEMA = "workspace.hackathon"
spark.sql(f"CREATE VOLUME IF NOT EXISTS {EVAL_SCHEMA}.eval_files")
OUT = Path(f"/Volumes/workspace/hackathon/eval_files/{RUN_NAME}")
OUT.mkdir(parents=True, exist_ok=True)
EXIT = {"stage": STAGE, "run_dir": str(OUT)}
T0 = time.time()

def select(sql):
    return (row.asDict(recursive=True) for row in spark.sql(sql).toLocalIterator())

def method(service, location, k=5):
    return find_care(service, location, int(k), log=False)

FACILITY_SQL = f"""
  SELECT f.unique_id, f.clean_name AS name, b.address_city, f.clean_state AS address_stateOrRegion,
         f.clean_facility_type AS facility_type,
         f.clean_description AS description, f.clean_procedures AS procedure, f.clean_capabilities AS capability,
         f.clean_equipment AS equipment, f.clean_specialties AS specialties, f.clean_capacity AS capacity,
         CASE WHEN NOT coalesce(f.flag_coordinates_far_from_pincode, false)
               AND f.clean_latitude IS NOT NULL AND f.clean_longitude IS NOT NULL
              THEN f.clean_latitude ELSE p.latitude END AS latitude,
         CASE WHEN NOT coalesce(f.flag_coordinates_far_from_pincode, false)
               AND f.clean_latitude IS NOT NULL AND f.clean_longitude IS NOT NULL
              THEN f.clean_longitude ELSE p.longitude END AS longitude
  FROM {EVAL_SCHEMA}.silver_facilities f
  LEFT JOIN (SELECT unique_id, first(address_city, true) AS address_city FROM {EVAL_SCHEMA}.bronze_facilities GROUP BY unique_id) b
    ON b.unique_id = f.unique_id
  LEFT JOIN {EVAL_SCHEMA}.silver_pincode_directory p
    ON p.is_primary_state AND p.pincode = try_cast(f.clean_pincode AS BIGINT)
"""
PIN_SQL = f"SELECT * FROM {EVAL_SCHEMA}.silver_pincode_directory WHERE is_primary_state"

# COMMAND ----------

# MAGIC %md ## 1. Prepare: export, sample queries, run the method, pool judge packets

# COMMAND ----------

if STAGE in ("prepare", "all"):
    t = time.time()
    bench.write(OUT/"facilities.jsonl", select(FACILITY_SQL))
    bench.write(OUT/"pins.jsonl", select(PIN_SQL))
    facilities, pins = bench.read(OUT/"facilities.jsonl"), bench.read(OUT/"pins.jsonl")
    EXIT["export"] = {"facilities": len(facilities), "pins": len(pins), "s": round(time.time() - t, 1)}

    t = time.time()
    queries = build.build_queries(pins, facilities, complete=True)
    bench.write(OUT/"queries.jsonl", queries)
    EXIT["queries"] = {"n": len(queries), "by_split": dict(Counter(q["split"] for q in queries)),
                       "by_density": dict(Counter(q.get("density") for q in queries)),
                       "by_format": dict(Counter(q.get("location_format") for q in queries)),
                       "s": round(time.time() - t, 1)}

    t = time.time()
    log_rows = []
    for i, query in enumerate(queries):
        req = bench.request(query)
        resp = method(**req)
        log_rows.append({"query_id": query["query_id"], "ts": f"{i:05d}", "request_json": json.dumps(req),
                         "response_json": json.dumps(resp, ensure_ascii=False, default=str)})
    bench.write(OUT/"method_log.jsonl", log_rows)
    EXIT["method"] = {"n": len(log_rows), "s": round(time.time() - t, 1)}

    t = time.time()
    packets = list(build.pool(queries, facilities, log_rows))
    bench.write(OUT/"judge_packets.jsonl", packets)
    EXIT["packets"] = {"n": len(packets), "queries": len({p["query_id"] for p in packets}),
                       "by_service": dict(Counter(p["service"] for p in packets)), "s": round(time.time() - t, 1)}
    print(json.dumps(EXIT, indent=1))

# COMMAND ----------

# MAGIC %md ## 2. Grade: blind LLM judges via `ai_query`

# COMMAND ----------

PRIMARY_MODEL = "databricks-gpt-oss-120b"
AUDIT_MODEL = "databricks-qwen3-next-80b-a3b-instruct"
RESOLVE_MODEL = "databricks-llama-4-maverick"

SERVICE_DEF = {
    "dialysis": "on-site haemodialysis or peritoneal dialysis for patients (a dialysis unit, machines or stations at this facility)",
    "emergency_csection": "on-site emergency caesarean section (C-section). For grade 3 the record must link caesarean or delivery surgery with emergency obstetric readiness, such as a 24x7 emergency or labour service, an operating theatre, anaesthesia, a blood bank or a NICU",
    "nicu": "an on-site neonatal intensive care unit (NICU, Level II/III, or an SNCU) that cares for sick newborns",
    "cardiac_surgery": "on-site cardiac surgery such as CABG/bypass, valve replacement or open-heart surgery. Cardiology, a cath lab or angioplasty alone is a hint (grade 1), not cardiac surgery",
    "mri": "an on-site MRI scanner offering MRI scans at this facility",
    "trauma": "on-site trauma or accident emergency care (a trauma centre, casualty or emergency department treating injuries)",
    "burn_care": "on-site burn care (a burn unit, burn ward or burn ICU, or treatment of burn patients)",
    "oncology": "on-site cancer treatment (chemotherapy, radiotherapy or surgical oncology). Screening alone is a hint",
    "ent": "on-site ENT (ear, nose and throat / otolaryngology) consultation or surgery",
}
RUBRIC = """Grades:
3 = Clear on-site service with credible, service-specific suitability evidence (e.g. named unit, equipment, numbers, specialists, readiness).
2 = A positive on-site claim of the service, with suitability or readiness details left open.
1 = Only a plausible hint: a related specialty, an ambiguous equipment claim, or a general department.
0 = No support, a relevant negation, an unrelated mention (e.g. gastric bypass for cardiac surgery), or an explicitly off-site/referral service."""

def _field(v, cap=5000):
    if v is None:
        return "(none)"
    if isinstance(v, list):
        v = " | ".join(str(x) for x in v if x)
    v = str(v).strip() or "(none)"
    return v if len(v) <= cap else v[:cap] + " …[cut]"

def prompt(packet):
    r = packet["record"]
    return (f"You are grading a health-facility record for one medical service in India. Use ONLY the record text below, "
            f"not outside knowledge about the facility.\n\nService: {packet['service']} = {SERVICE_DEF[packet['service']]}.\n\n{RUBRIC}\n\n"
            f"Record\nname: {_field(r.get('name'), 300)}\nfacility type: {_field(r.get('facility_type'), 100)}\n"
            f"description: {_field(r.get('description'))}\nprocedure: {_field(r.get('procedure'))}\n"
            f"capability: {_field(r.get('capability'))}\nequipment: {_field(r.get('equipment'))}\n"
            f"specialties: {_field(r.get('specialties'), 2000)}\n\n"
            "Reply as JSON with an integer `grade` (0-3) and a one-sentence `rationale` naming the field and quoting the deciding text.")

SCHEMA_JSON = json.dumps({"type": "json_schema", "json_schema": {"name": "grade", "strict": True, "schema": {
    "type": "object", "properties": {"grade": {"type": "integer"}, "rationale": {"type": "string"}},
    "required": ["grade", "rationale"]}}})

def judge(model, source_table, out_table):
    spark.sql(f"""CREATE OR REPLACE TABLE {out_table} AS
        SELECT query_id, unique_id, '{model}' AS judge_model,
               ai_query('{model}', prompt, responseFormat => '{SCHEMA_JSON}', failOnError => false) AS r
        FROM {source_table}""")
    rows = []
    for row in spark.table(out_table).toLocalIterator():
        g, why = None, None
        try:
            obj = json.loads(row["r"]["result"])
            g, why = obj.get("grade"), obj.get("rationale")
        except Exception:
            pass
        rows.append({"query_id": row["query_id"], "unique_id": row["unique_id"], "judge_model": row["judge_model"],
                     "grade": g if isinstance(g, int) and 0 <= g <= 3 else None, "rationale": why,
                     "error": row["r"]["errorMessage"]})
    return rows

def judge_with_retry(model, ids_table, out_table, fallback_model=None):
    rows = {(r["query_id"], r["unique_id"]): r for r in judge(model, ids_table, out_table)}
    for attempt, m in ((1, model), (2, fallback_model or model)):
        bad = [k for k, r in rows.items() if r["grade"] is None or not r["rationale"]]
        if not bad:
            break
        spark.createDataFrame(bad, "query_id STRING, unique_id STRING").createOrReplaceTempView("_bad")
        spark.sql(f"CREATE OR REPLACE TABLE {out_table}_retry AS SELECT p.* FROM {ids_table} p JOIN _bad USING (query_id, unique_id)")
        for r in judge(m, f"{out_table}_retry", f"{out_table}_retry_out"):
            if r["grade"] is not None and r["rationale"]:
                rows[(r["query_id"], r["unique_id"])] = r
    return list(rows.values())

def audit_pick(qid, uid):
    return int(hashlib.sha256(f"audit|{qid}|{uid}".encode()).hexdigest(), 16) % 4 == 0

if STAGE in ("grade", "all"):
    t = time.time()
    packets = bench.read(OUT/"judge_packets.jsonl")
    pdf = [(p["query_id"], p["unique_id"], p["service"], prompt(p), audit_pick(p["query_id"], p["unique_id"])) for p in packets]
    spark.createDataFrame(pdf, "query_id STRING, unique_id STRING, service STRING, prompt STRING, audit BOOLEAN") \
         .write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{EVAL_SCHEMA}.eval_judge_packets")
    spark.sql(f"CREATE OR REPLACE TABLE {EVAL_SCHEMA}.eval_audit_packets AS SELECT * FROM {EVAL_SCHEMA}.eval_judge_packets WHERE audit")

    primary = judge_with_retry(PRIMARY_MODEL, f"{EVAL_SCHEMA}.eval_judge_packets", f"{EVAL_SCHEMA}.eval_judge_primary", RESOLVE_MODEL)
    EXIT["primary"] = {"n": len(primary), "missing": sum(r["grade"] is None for r in primary),
                       "fallback_judge": sum(r["judge_model"] != PRIMARY_MODEL for r in primary),
                       "grades": dict(Counter(r["grade"] for r in primary)), "s": round(time.time() - t, 1)}
    t = time.time()
    audit = judge_with_retry(AUDIT_MODEL, f"{EVAL_SCHEMA}.eval_audit_packets", f"{EVAL_SCHEMA}.eval_judge_audit")
    audit = [r for r in audit if r["grade"] is not None and r["rationale"]]
    EXIT["audit"] = {"n": len(audit), "grades": dict(Counter(r["grade"] for r in audit)), "s": round(time.time() - t, 1)}

    pmap = {(r["query_id"], r["unique_id"]): r for r in primary}
    disputed = [r for r in audit if pmap[(r["query_id"], r["unique_id"])]["grade"] is not None
                and abs(r["grade"] - pmap[(r["query_id"], r["unique_id"])]["grade"]) >= 2]
    resolutions = []
    if disputed:
        spark.createDataFrame([(r["query_id"], r["unique_id"]) for r in disputed], "query_id STRING, unique_id STRING") \
             .createOrReplaceTempView("_disputed")
        spark.sql(f"""CREATE OR REPLACE TABLE {EVAL_SCHEMA}.eval_dispute_packets AS
                      SELECT p.* FROM {EVAL_SCHEMA}.eval_judge_packets p JOIN _disputed USING (query_id, unique_id)""")
        third = {(r["query_id"], r["unique_id"]): r for r in
                 judge_with_retry(RESOLVE_MODEL, f"{EVAL_SCHEMA}.eval_dispute_packets", f"{EVAL_SCHEMA}.eval_judge_resolve")}
        amap = {(r["query_id"], r["unique_id"]): r for r in audit}
        for key_ in [(r["query_id"], r["unique_id"]) for r in disputed]:
            votes = [pmap[key_], amap[key_]] + ([third[key_]] if third.get(key_, {}).get("grade") is not None else [])
            final = int(statistics.median_low([v["grade"] for v in votes]))
            chosen = next(v for v in votes if v["grade"] == final)
            resolutions.append({"query_id": key_[0], "unique_id": key_[1], "grade": final,
                                "rationale": f"[median of {len(votes)} judges: {[v['grade'] for v in votes]}] {chosen['rationale']}",
                                "judge_model": "resolution"})
    EXIT["disputes"] = {"n": len(disputed), "resolved": len(resolutions)}
    for name, rows in (("primary", primary), ("audit", audit), ("resolutions", resolutions)):
        bench.write(OUT/f"{name}.jsonl", rows)
    print(json.dumps(EXIT, indent=1))

# COMMAND ----------

# MAGIC %md ## 3. Evaluate: references, metrics, weight stability, weight tuning

# COMMAND ----------

def refs_and_agreement():
    packets = bench.read(OUT/"judge_packets.jsonl")
    primary = [r for r in bench.read(OUT/"primary.jsonl") if r["grade"] is not None and r.get("rationale")]
    keep = {(r["query_id"], r["unique_id"]) for r in primary}
    packets = [p for p in packets if (p["query_id"], p["unique_id"]) in keep]
    audit = [r for r in bench.read(OUT/"audit.jsonl") if (r["query_id"], r["unique_id"]) in keep]
    refs, stats = grade.adjudicate(packets, primary, audit, bench.read(OUT/"resolutions.jsonl"))
    return refs, stats, len(packets)

def with_profile(service, wE=None, wD=None, wA=None, d_half=None):
    """Context: temporarily change one service's ranking profile."""
    class _P:
        def __enter__(self):
            self.old = PROFILE[service]
            tc, g, e, d, a, h, mx = self.old
            PROFILE[service] = (tc, g, e if wE is None else wE, d if wD is None else wD, a if wA is None else wA,
                                h if d_half is None else d_half, mx)
        def __exit__(self, *exc):
            PROFILE[service] = self.old
    return _P()

def weighted(weights, service, location, k=5):
    with with_profile(service, *weights):
        return method(service, location, k)

def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None

def ndcg_for(queries, grades, service, params):
    out = []
    with with_profile(service, *params):
        for q in queries:
            m, _, _ = bench.score(q, method(**bench.request(q)), grades.get(q["query_id"], []), {})
            out.append(m["ndcg@5"])
    return mean(out)

if STAGE == "rescore":
    # Re-run the (changed) method on the same queries; grade only facilities that no judge has seen yet.
    t = time.time()
    queries = bench.read(OUT/"queries.jsonl")
    facilities = {r["unique_id"]: r for r in bench.read(OUT/"facilities.jsonl")}
    if not (OUT/"method_log_v1.jsonl").exists():
        (OUT/"method_log_v1.jsonl").write_bytes((OUT/"method_log.jsonl").read_bytes())
    log_rows = []
    for i, query in enumerate(queries):
        req = bench.request(query)
        log_rows.append({"query_id": query["query_id"], "ts": f"{i:05d}", "request_json": json.dumps(req),
                         "response_json": json.dumps(method(**req), ensure_ascii=False, default=str)})
    bench.write(OUT/"method_log.jsonl", log_rows)
    packets = bench.read(OUT/"judge_packets.jsonl")
    seen = {(p["query_id"], p["unique_id"]) for p in packets}
    qmap = {q["query_id"]: q for q in queries}
    new = []
    for row in log_rows:
        q_ = qmap[row["query_id"]]
        if q_.get("clarification") or q_.get("expected_fallback") is True or "coordinates" not in q_:
            continue
        for item in bench.displayed(json.loads(row["response_json"])):
            k_ = (q_["query_id"], item["unique_id"])
            if k_ not in seen:
                seen.add(k_)
                rec = facilities[item["unique_id"]]
                new.append(dict(query_id=q_["query_id"], service=q_["service"], unique_id=item["unique_id"], record=rec,
                                distance_km=bench.road(q_["coordinates"], bench.point(rec)) if bench.point(rec) else None))
    EXIT["rescore"] = {"new_packets": len(new)}
    if new:
        spark.createDataFrame([(p["query_id"], p["unique_id"], p["service"], prompt(p), audit_pick(p["query_id"], p["unique_id"])) for p in new],
                              "query_id STRING, unique_id STRING, service STRING, prompt STRING, audit BOOLEAN") \
             .write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{EVAL_SCHEMA}.eval_judge_packets_new")
        spark.sql(f"CREATE OR REPLACE TABLE {EVAL_SCHEMA}.eval_audit_packets_new AS SELECT * FROM {EVAL_SCHEMA}.eval_judge_packets_new WHERE audit")
        prim_new = judge_with_retry(PRIMARY_MODEL, f"{EVAL_SCHEMA}.eval_judge_packets_new", f"{EVAL_SCHEMA}.eval_judge_primary_new", RESOLVE_MODEL)
        aud_new = [r for r in judge_with_retry(AUDIT_MODEL, f"{EVAL_SCHEMA}.eval_audit_packets_new", f"{EVAL_SCHEMA}.eval_judge_audit_new")
                   if r["grade"] is not None and r["rationale"]]
        pm = {(r["query_id"], r["unique_id"]): r for r in prim_new}
        res_new = []
        for r in aud_new:
            p_ = pm[(r["query_id"], r["unique_id"])]
            if p_["grade"] is not None and abs(p_["grade"] - r["grade"]) >= 2:
                final = min(p_["grade"], r["grade"]) + 1 if abs(p_["grade"] - r["grade"]) == 2 else int(statistics.median_low([p_["grade"], r["grade"]]))
                res_new.append({"query_id": r["query_id"], "unique_id": r["unique_id"], "grade": final, "judge_model": "resolution",
                                "rationale": f"[midpoint of 2 judges: {[p_['grade'], r['grade']]}] {r['rationale']}"})
        bench.write(OUT/"judge_packets.jsonl", packets + new)
        for name, rows in (("primary", prim_new), ("audit", aud_new), ("resolutions", res_new)):
            bench.write(OUT/f"{name}.jsonl", bench.read(OUT/f"{name}.jsonl") + rows)
        EXIT["rescore"].update(primary=dict(Counter(r["grade"] for r in prim_new)), audit=len(aud_new), disputes=len(res_new))
    EXIT["rescore"]["s"] = round(time.time() - t, 1)
    STAGE = "evaluate"

if STAGE in ("evaluate", "all"):
    t = time.time()
    refs, stats, n_packets = refs_and_agreement()
    bench.write(OUT/"references.jsonl", refs)
    bench.write(OUT/"agreement.jsonl", [stats])
    EXIT["agreement"] = stats
    queries = bench.read(OUT/"queries.jsonl")
    facilities = bench.read(OUT/"facilities.jsonl")
    log_rows = bench.read(OUT/"method_log.jsonl")
    summary = bench.run(queries, facilities, refs, OUT/"report", log=log_rows)
    EXIT["summary"] = [r for r in summary if r["service"] == "all"]
    EXIT["summary_by_service_ndcg"] = [r for r in summary if r["metric"] == "ndcg@5" and r["service"] != "all"]
    EXIT["failures"] = sum(1 for _ in open(OUT/"report"/"failures.jsonl"))
    EXIT["evaluate_s"] = round(time.time() - t, 1)

    # Weight stability (BENCH_DESIGN: 26 normalized 0.8/1.0/1.2 combinations).
    t = time.time()
    base_weights = {s: (p[2], p[3], p[4]) for s, p in PROFILE.items()}
    stab = list(checks.stability((q for q in queries if not q.get("clarification") and q["split"] in ("tuning", "heldout")),
                                 lambda w, **req: weighted(w, **req), base_weights))
    bench.write(OUT/"report"/"stability.jsonl", stab)
    EXIT["stability"] = {"n": len(stab), "mean_jaccard": mean([r["jaccard"] for r in stab]),
                         "identical_order": mean([float(r["identical_order"]) for r in stab]),
                         "changed_fallback": sum(r["changed_fallback"] for r in stab), "s": round(time.time() - t, 1)}

    # Tuning on the tuning split only (PLAN_V5 §7.2), reported on held-out.
    t = time.time()
    grades = defaultdict(list)
    for r in refs:
        grades[r["query_id"]].append(r)
    grid_w = [(e / 10, d / 10, (10 - e - d) / 10) for e in range(1, 9) for d in range(1, 9) if 1 <= 10 - e - d <= 8]
    tuning = []
    for service, prof in PROFILE.items():
        tq = [q for q in queries if q["service"] == service and q["split"] == "tuning" and not q.get("clarification") and q.get("expected_fallback") is not True]
        hq = [q for q in queries if q["service"] == service and q["split"] == "heldout" and not q.get("clarification") and q.get("expected_fallback") is not True]
        tq = [q for q in tq if grades.get(q["query_id"])]
        hq = [q for q in hq if grades.get(q["query_id"])]
        if not tq:
            continue
        default = (prof[2], prof[3], prof[4], prof[5])
        best, best_score = default, ndcg_for(tq, grades, service, default)
        base_tune = best_score
        for w in grid_w:
            for dh in sorted({prof[5] * 0.5, prof[5], prof[5] * 2}):
                s_ = ndcg_for(tq, grades, service, (*w, dh))
                if s_ is not None and best_score is not None and s_ > best_score + 1e-9:
                    best, best_score = (*w, dh), s_
        tuning.append({"service": service, "default": default, "tuned": best,
                       "tuning_ndcg_default": base_tune, "tuning_ndcg_tuned": best_score,
                       "heldout_ndcg_default": ndcg_for(hq, grades, service, default) if hq else None,
                       "heldout_ndcg_tuned": ndcg_for(hq, grades, service, best) if hq else None,
                       "n_tuning": len(tq), "n_heldout": len(hq)})
    bench.write(OUT/"report"/"tuning.jsonl", tuning)
    EXIT["tuning"] = tuning
    EXIT["tuning_s"] = round(time.time() - t, 1)
    print(json.dumps(EXIT, indent=1, default=str))

# COMMAND ----------

EXIT["total_s"] = round(time.time() - T0, 1)
dbutils.notebook.exit(json.dumps(EXIT, default=str)[:900000])
