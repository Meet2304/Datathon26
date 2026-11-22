"""Run the pipeline notebook (notebooks/find_care_v5.ipynb) on local Spark against the 15 pilot facilities.

No Databricks needed. Needs Java 17 (JAVA_HOME) and the `spark` dependency group: `uv sync --group spark`.

Builds a stand-in `silver_facilities` from experiments/llm_vs_regex/facilities_15.json with the column names the notebook
expects, plus a tiny PIN directory. Specialty codes are mapped from the pilot's raw (bronze) vocabulary to
silver-style codes with a small hand map: this is a local approximation, the real build uses silver's codes.

usage: JAVA_HOME=/opt/homebrew/opt/openjdk@17 uv run python scripts/run_local_pipeline.py [workdir]
Writes summary.json, pilot_responses.json, scores.json and bench/ into workdir (default: .local_spark/, gitignored).
Exits non-zero if a regression fixture or pilot check fails.
"""
import json, os, sys, shutil

from ftrc import ROOT, notebook_source
from ftrc.paths import EVAL_BENCH, PILOT_FACILITIES

WORK = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".local_spark"))
PILOT = str(PILOT_FACILITIES)
os.environ.setdefault("PYSPARK_PYTHON", sys.executable)          # Spark workers must use this venv's Python
os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)
shutil.rmtree(WORK, ignore_errors=True)
os.makedirs(WORK)

from pyspark.sql import SparkSession
spark = (SparkSession.builder.master("local[4]").appName("find_care_local")
         .config("spark.sql.warehouse.dir", os.path.join(WORK, "warehouse"))
         .config("spark.sql.ansi.enabled", "true")            # serverless runs with ANSI semantics
         .config("spark.sql.shuffle.partitions", "8")
         .config("spark.driver.extraJavaOptions", f"-Dderby.system.home=\"{WORK}\"")  # quoted: paths may contain spaces
         .getOrCreate())
spark.sparkContext.setLogLevel("ERROR")
spark.sql("CREATE DATABASE IF NOT EXISTS hackathon")

LOCAL_CODE_MAP = {  # pilot raw specialty → silver-style code(s); local approximation only
    "gynecologyAndObstetrics": ["obstetrics", "gynecology"], "obstetricsAndGynecology": ["obstetrics", "gynecology"],
    "maternalFetalMedicineOrPerinatology": ["maternalFetalMedicine"], "neonatologyPerinatalMedicine": ["neonatology"],
    "cardiacSurgery": ["cardiothoracicSurgery"], "pediatricCriticalCareMedicine": ["pediatricCriticalCare"],
    "intensiveCareUnit": ["criticalCareMedicine"], "nuclearMedicineAndMolecularImaging": ["nuclearMedicine"],
    "anesthesia": ["anesthesiology"],
}
nul = lambda v: v is None or (isinstance(v, str) and v.strip().lower() in ("", "null", "none"))
num = lambda v: None if nul(v) else float(v)
rows = []
for r in json.load(open(PILOT)):
    sp_raw = r.get("specialties") or []
    codes = sorted({c for s in sp_raw for c in LOCAL_CODE_MAP.get(s, [s])})
    clean = lambda f: [x for x in (r.get(f) or []) if x and x.strip()] or None
    n = {f: len(r.get(f) or []) for f in ("procedure", "equipment", "capability")}
    rows.append(dict(
        unique_id=r["unique_id"], clean_name=r["name"], clean_facility_type=r.get("facilityTypeId"),
        clean_operator_type=r.get("operatorTypeId"), clean_affiliations=sorted(set(r.get("affiliationTypeIds") or [])) or None,
        clean_number_doctors=num(r.get("numberDoctors")), clean_capacity=num(r.get("capacity")), clean_capacity_from_text=None,
        yearEstablished=None if nul(r.get("yearEstablished")) else str(r["yearEstablished"]),
        clean_specialties=codes or None, clean_procedures=clean("procedure"), clean_equipment=clean("equipment"),
        clean_capabilities=clean("capability"), clean_description=r.get("description"),
        flag_numberDoctors_implausible=False, flag_coordinates_far_from_pincode=False,
        flag_procedure_truncated_50=n["procedure"] >= 50, flag_equipment_truncated_50=n["equipment"] >= 50,
        flag_capability_truncated_50=n["capability"] >= 50,
        clean_pincode=r.get("address_zipOrPostcode"), clean_latitude=num(r.get("latitude")), clean_longitude=num(r.get("longitude")),
        clean_phone_numbers=None, clean_officialPhone=r.get("officialPhone"), clean_recency_of_page_update=r.get("recency_of_page_update"),
        clean_district="Raipur", clean_state="Chhattisgarh", address_city=r.get("address_city"),
        officialWebsite=None if nul(r.get("officialWebsite")) else r["officialWebsite"],
        description=r.get("description"), procedure=json.dumps(r.get("procedure") or []), equipment=json.dumps(r.get("equipment") or []),
        capability=json.dumps(r.get("capability") or []), specialties=json.dumps(sp_raw)))
schema = ("unique_id STRING, clean_name STRING, clean_facility_type STRING, clean_operator_type STRING, clean_affiliations ARRAY<STRING>, "
          "clean_number_doctors DOUBLE, clean_capacity DOUBLE, clean_capacity_from_text DOUBLE, yearEstablished STRING, "
          "clean_specialties ARRAY<STRING>, clean_procedures ARRAY<STRING>, clean_equipment ARRAY<STRING>, clean_capabilities ARRAY<STRING>, "
          "clean_description STRING, flag_numberDoctors_implausible BOOLEAN, flag_coordinates_far_from_pincode BOOLEAN, "
          "flag_procedure_truncated_50 BOOLEAN, flag_equipment_truncated_50 BOOLEAN, flag_capability_truncated_50 BOOLEAN, "
          "clean_pincode STRING, clean_latitude DOUBLE, clean_longitude DOUBLE, clean_phone_numbers ARRAY<STRING>, clean_officialPhone STRING, "
          "clean_recency_of_page_update STRING, clean_district STRING, clean_state STRING, address_city STRING, officialWebsite STRING, "
          "description STRING, procedure STRING, equipment STRING, capability STRING, specialties STRING")
cols = [c.split()[0] for c in schema.split(", ")]
spark.createDataFrame([tuple(r[c] for c in cols) for r in rows], schema).write.saveAsTable("hackathon.silver_facilities")
spark.createDataFrame([
    (492001, 21.23855, 81.64300, "RAIPUR", "CHHATTISGARH", True), (492013, 21.23784, 81.70542, "RAIPUR", "CHHATTISGARH", True),
    (492004, 21.25457, 81.65708, "RAIPUR", "CHHATTISGARH", True), (492099, 21.2564, 81.5795, "RAIPUR", "CHHATTISGARH", True),
    (824101, 24.75, 84.37, "AURANGABAD", "BIHAR", True), (431001, 19.88, 75.34, "AURANGABAD", "MAHARASHTRA", True),
], "pincode BIGINT, latitude DOUBLE, longitude DOUBLE, district STRING, statename STRING, is_primary_state BOOLEAN") \
    .write.saveAsTable("hackathon.silver_pincode_directory")
spark.createDataFrame([("gynecologyAndObstetrics", "obstetrics")], "raw STRING, code STRING").write.saveAsTable("hackathon.ref_specialty_mapping")

G = {"spark": spark, "SCHEMA_OVERRIDE": "hackathon", "__name__": "__main__",
     "LOCAL_WIDGETS": {"service": "dialysis", "location": "492001", "k": "5", "rebuild": "yes", "run_tests": "yes"}}
src = notebook_source()
exec(compile(src, "find_care_v5.ipynb", "exec"), G)
json.dump({k: G["SUMMARY"][k] for k in ("steps_s", "total_s", "adaptations", "fixtures", "pilot_checks", "labels")},
          open(os.path.join(WORK, "summary.json"), "w"), indent=1, default=str)
json.dump(G["PILOT"], open(os.path.join(WORK, "pilot_responses.json"), "w"), indent=1, ensure_ascii=False)
sc = G["spark"].table("hackathon.gold_service_scores").toPandas()
sc.drop(columns=["top_contributors"]).to_json(os.path.join(WORK, "scores.json"), orient="records", indent=1, default_handler=str)
print("\nwrote", os.path.join(WORK, "summary.json"))

# ---- score the 3 pilot queries with the eval bench (same §5 contract the Sol bench uses) ----
BENCH = str(EVAL_BENCH)
if os.path.isdir(BENCH):
    sys.path.insert(0, BENCH)
    import bench
    D = os.path.join(BENCH, "data", "pilot")
    ids = list(G["PILOT_IDS"].values())
    fc = lambda service, location, k: G["find_care"](service, location, k, restrict_ids=ids, log=False)
    bench.run(bench.read(os.path.join(D, "queries.jsonl")), bench.read(os.path.join(D, "facilities.jsonl")),
              bench.read(os.path.join(D, "references.jsonl")), os.path.join(WORK, "bench"), find_care=fc)
    print("bench report:", os.path.join(WORK, "bench"))

failed = [name for name, ok in G["SUMMARY"]["pilot_checks"].items() if not ok]
if failed:
    sys.exit(f"pilot checks failed: {failed}")
print("all regression fixtures and pilot checks passed")
