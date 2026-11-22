"""Upload the eval notebook, a library copy of find_care_v5, and eval_bench modules; run one stage on serverless.

usage: uv run python evaluation/deploy_eval.py [--token-file <file>] [--host https://<workspace>]
       --stage prepare|grade|evaluate|rescore|all [--run-name silver_v5] [--no-upload]
Host and token default to $DATABRICKS_HOST / $DATABRICKS_TOKEN (.env is read too).
Writes evaluation/stage_<stage>.json (the notebook's exit value) and downloads the run folder's small files.
"""
import argparse, base64, json, os, sys, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import quote

from ftrc import ROOT, databricks_host, databricks_token, notebook_source

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--host")
ap.add_argument("--token-file")
ap.add_argument("--stage", required=True)
ap.add_argument("--run-name", default="silver_v5")
ap.add_argument("--no-upload", action="store_true")
ap.add_argument("--download", default="queries.jsonl,method_log.jsonl,judge_packets.jsonl,primary.jsonl,audit.jsonl,resolutions.jsonl,references.jsonl,agreement.jsonl,"
                "report/REPORT.md,report/summary.jsonl,report/per_query.jsonl,report/failures.jsonl,report/label_monotonicity.jsonl,report/missing_method.jsonl,report/stability.jsonl,report/tuning.jsonl,report/responses.jsonl")
a = ap.parse_args()
TOKEN = databricks_token(a.token_file)
HOST = databricks_host(a.host)


def call(method, path, body=None, raw=False):
    req = Request(HOST + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                  headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=300) as r:
            return r.read() if raw else json.load(r)
    except HTTPError as e:
        if raw and e.code == 404:
            return None
        raise SystemExit(f"{method} {path} → HTTP {e.code}: {e.read().decode()[:500]}")


def upload(path, content, notebook):
    body = {"path": path, "content": base64.b64encode(content).decode(), "overwrite": True}
    body.update({"format": "SOURCE", "language": "PYTHON"} if notebook else {"format": "AUTO"})
    call("POST", "/api/2.0/workspace/import", body)


me = call("GET", "/api/2.0/preview/scim/v2/Me")["userName"]
folder = f"/Users/{me}/find_the_right_care/eval"
if not a.no_upload:
    call("POST", "/api/2.0/workspace/mkdirs", {"path": folder})
    lib = notebook_source()  # notebooks/find_care_v5.ipynb as Databricks SOURCE text
    exit_line = '    dbutils.notebook.exit(json.dumps(_lite, default=str)[:900000])  # noqa: F821'
    search_cell = 'resp = find_care(W["service"], W["location"], int(W["k"]))\nshow(resp)'
    assert exit_line in lib and search_cell in lib, "find_care_v5.ipynb changed shape; update deploy_eval.py"
    lib = lib.replace(exit_line, "    pass  # exit disabled: library copy used by eval_run via %run")
    lib = lib.replace(search_cell, "pass  # interactive search cell disabled in the library copy")
    upload(f"{folder}/find_care_v5_lib", lib.encode(), True)
    upload(f"{folder}/eval_run", open(os.path.join(HERE, "eval_run.py"), "rb").read(), True)
    for mod in ("bench", "build", "checks", "grade", "export"):
        upload(f"{folder}/{mod}.py", open(os.path.join(ROOT, "eval_bench", f"{mod}.py"), "rb").read(), False)
    print("uploaded to", folder)

run = call("POST", "/api/2.1/jobs/runs/submit", {
    "run_name": f"find_care eval: {a.stage}",
    "tasks": [{"task_key": "eval", "notebook_task": {"notebook_path": f"{folder}/eval_run", "source": "WORKSPACE",
               "base_parameters": {"stage": a.stage, "run_name": a.run_name, "rebuild": "no", "run_tests": "no"}}}]})
rid = run["run_id"]
print("run id:", rid, flush=True)
t0 = time.time()
while True:
    st = call("GET", f"/api/2.1/jobs/runs/get?run_id={rid}")
    life = st["state"]["life_cycle_state"]
    if life in ("TERMINATED", "SKIPPED", "INTERNAL_ERROR"):
        break
    print(f"  {life} {int(time.time() - t0)} s", flush=True)
    time.sleep(30)
print("result:", st["state"].get("result_state"), st["state"].get("state_message", "")[:300], f"{int(time.time() - t0)} s")
print("run page:", st.get("run_page_url"))
out = call("GET", f"/api/2.1/jobs/runs/get-output?run_id={st['tasks'][0]['run_id']}")
if out.get("error"):
    print("ERROR:", out["error"][:2000])
    print(out.get("error_trace", "")[-4000:])
value = (out.get("notebook_output") or {}).get("result")
if value:
    open(os.path.join(HERE, f"stage_{a.stage}.json"), "w").write(value)
    print("wrote", f"stage_{a.stage}.json")
local = os.path.join(HERE, "runs", a.run_name)
for rel in a.download.split(","):
    data = call("GET", "/api/2.0/fs/files" + quote(f"/Volumes/workspace/hackathon/eval_files/{a.run_name}/{rel}"), raw=True)
    if data is not None:
        os.makedirs(os.path.dirname(os.path.join(local, rel)), exist_ok=True)
        open(os.path.join(local, rel), "wb").write(data)
print("downloaded to", local)
sys.exit(0 if st["state"].get("result_state") == "SUCCESS" else 1)
