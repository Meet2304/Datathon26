"""Upload notebooks/find_care_v5.ipynb to the Databricks workspace and run it once on serverless (Free Edition).

usage: uv run python scripts/deploy_pipeline.py [--token-file <file>] [--host https://<workspace>]
       [--no-run] [--rebuild yes|no] [--run-tests yes|no]
The host comes from --host or $DATABRICKS_HOST, the token from --token-file or $DATABRICKS_TOKEN (.env is read too).
Writes results/pipeline/run_summary.json (the notebook's exit value).
"""
import argparse, base64, json, sys, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from ftrc import NOTEBOOK, databricks_host, databricks_token
from ftrc.paths import RESULTS

OUT = RESULTS / "pipeline"
ap = argparse.ArgumentParser()
ap.add_argument("--host")
ap.add_argument("--token-file")
ap.add_argument("--no-run", action="store_true")
ap.add_argument("--rebuild", default="yes")
ap.add_argument("--run-tests", default="yes")
ap.add_argument("--folder", default="find_the_right_care")
a = ap.parse_args()
TOKEN = databricks_token(a.token_file)
HOST = databricks_host(a.host)

def call(method, path, body=None):
    req = Request(HOST + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                  headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=120) as r:
            return json.load(r)
    except HTTPError as e:
        raise SystemExit(f"{method} {path} → HTTP {e.code}: {e.read().decode()[:500]}")

me = call("GET", "/api/2.0/preview/scim/v2/Me")["userName"]
folder = f"/Users/{me}/{a.folder}"
path = f"{folder}/find_care_v5"
call("POST", "/api/2.0/workspace/mkdirs", {"path": folder})
src = NOTEBOOK.read_bytes()  # the .ipynb is imported as-is, so the workspace notebook matches the repo exactly
call("POST", "/api/2.0/workspace/import", {"path": path, "format": "JUPYTER",
                                           "content": base64.b64encode(src).decode(), "overwrite": True})
print("notebook:", path)
if a.no_run:
    sys.exit(0)

run = call("POST", "/api/2.1/jobs/runs/submit", {
    "run_name": "find_care_v5 build + tests",
    "tasks": [{"task_key": "build", "notebook_task": {"notebook_path": path, "source": "WORKSPACE",
               "base_parameters": {"rebuild": a.rebuild, "run_tests": a.run_tests}}}]})
rid = run["run_id"]
print("run id:", rid)
t0 = time.time()
while True:
    st = call("GET", f"/api/2.1/jobs/runs/get?run_id={rid}")
    life = st["state"]["life_cycle_state"]
    if life in ("TERMINATED", "SKIPPED", "INTERNAL_ERROR"):
        break
    print(f"  {life} {int(time.time() - t0)} s", flush=True)
    time.sleep(20)
print("result:", st["state"].get("result_state"), st["state"].get("state_message", "")[:300], f"{int(time.time() - t0)} s")
print("run page:", st.get("run_page_url"))
task_run = st["tasks"][0]["run_id"]
out = call("GET", f"/api/2.1/jobs/runs/get-output?run_id={task_run}")
if out.get("error"):
    print("ERROR:", out["error"][:2000])
    print(out.get("error_trace", "")[-4000:])
res = (out.get("notebook_output") or {}).get("result")
if res:
    summary = json.loads(res)
    summary["_wall_s"] = int(time.time() - t0)
    summary["_run_page_url"] = st.get("run_page_url")
    summary["_notebook_path"] = path
    OUT.mkdir(parents=True, exist_ok=True)
    json.dump(summary, open(OUT / "run_summary.json", "w"), indent=1, ensure_ascii=False)
    print("wrote", OUT / "run_summary.json")
