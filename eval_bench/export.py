"""Read-only Spark or Databricks SQL Statement API export."""
import argparse
import json
import os
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from bench import DATA, write

SCHEMA = "workspace.hackathon"
QUERIES = {
    "pins": f"SELECT * FROM {SCHEMA}.silver_pincode_directory WHERE is_primary_state",
    "facilities": f"""
          SELECT f.unique_id, f.clean_name AS name,
                 f.address_city, f.clean_state AS address_stateOrRegion,
                 f.description, f.procedure, f.capability, f.equipment, f.specialties,
                 f.clean_capacity AS capacity,
                 CASE WHEN NOT coalesce(f.flag_coordinates_far_from_pincode, false)
                       AND f.clean_latitude IS NOT NULL AND f.clean_longitude IS NOT NULL
                      THEN f.clean_latitude ELSE p.latitude END AS latitude,
                 CASE WHEN NOT coalesce(f.flag_coordinates_far_from_pincode, false)
                       AND f.clean_latitude IS NOT NULL AND f.clean_longitude IS NOT NULL
                      THEN f.clean_longitude ELSE p.longitude END AS longitude
          FROM {SCHEMA}.silver_facilities f
          LEFT JOIN {SCHEMA}.silver_pincode_directory p
            ON p.is_primary_state AND p.pincode = try_cast(f.clean_pincode AS BIGINT)
    """,
    "method_log": f"SELECT query_id, ts, request_json, response_json FROM {SCHEMA}.gold_query_log",
}


def export(select, out, include_log=False):
    out.mkdir(parents=True, exist_ok=True)
    for name, sql in QUERIES.items():
        if name == "method_log" and not include_log:
            continue
        pending = out/f"{name}.partial"
        write(pending, select(sql))
        pending.replace(out/f"{name}.jsonl")


def sql_api(host, token, warehouse):
    def call(path, body=None):
        req = Request(host.rstrip("/") + path, data=json.dumps(body).encode() if body else None,
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urlopen(req, timeout=60) as res:
                return json.load(res)
        except HTTPError as exc:
            raise RuntimeError(f"Databricks SQL request failed with HTTP {exc.code}") from None

    def select(sql):
        # Page by key to stay under the inline API result limit.
        key = "unique_id" if "silver_facilities" in sql else "pincode" if "silver_pincode_directory" in sql else None
        last = None
        while True:
            query = sql
            if key:
                where = "" if last is None else f"WHERE {key} > '{str(last).replace(chr(39), chr(39)*2)}'"
                query = f"SELECT * FROM ({sql}) source {where} ORDER BY {key} LIMIT 500"
            endpoint = "/api/2.0/sql/statements"
            result = call(endpoint, {"warehouse_id": warehouse, "statement": query, "wait_timeout": "20s"})
            while result["status"]["state"] in ("PENDING", "RUNNING"):
                time.sleep(2)
                result = call(f"{endpoint}/{result['statement_id']}")
            if result["status"]["state"] != "SUCCEEDED":
                raise RuntimeError(result["status"])
            manifest = result["manifest"]
            if manifest.get("truncated"):
                raise RuntimeError("SQL export was truncated")
            columns = [c["name"] for c in manifest["schema"]["columns"]]
            chunk, n = result.get("result", {}), 0
            while True:
                for row in chunk.get("data_array", []):
                    record = dict(zip(columns, row))
                    if key:
                        last = record[key]
                    if record.get("is_primary_state") in ("true", "false"):
                        record["is_primary_state"] = record["is_primary_state"] == "true"
                    yield record
                    n += 1
                if not chunk.get("next_chunk_internal_link"):
                    break
                chunk = call(chunk["next_chunk_internal_link"])
            if not key or n < 500:
                break
    return select


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DATA)
    parser.add_argument("--include-log", action="store_true")
    for name in ("host", "token", "warehouse"):
        parser.add_argument(f"--{name}-file", type=Path)
    args = parser.parse_args()
    credentials = [getattr(args, name+"_file").read_text().strip() if getattr(args, name+"_file")
                   else os.environ[env] for name, env in (("host", "DATABRICKS_HOST"),
                   ("token", "DATABRICKS_TOKEN"), ("warehouse", "DATABRICKS_WAREHOUSE_ID"))]
    export(sql_api(*credentials), args.out, args.include_log)
