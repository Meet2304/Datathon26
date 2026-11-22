"""Deploy the Find the Right Care app to Databricks Apps (Free Edition) with the Databricks SDK.

usage: python deploy_app.py [--name find-the-right-care] [--warehouse <id>] [--host https://<workspace>]
(--host / --warehouse default to $DATABRICKS_HOST / $DATABRICKS_WAREHOUSE_ID)
Builds nothing: run `npm run build` in frontend/ first (it writes static/).
Steps: upload app.py, find_care_core.py, requirements.txt, app.yaml and static/ to the workspace → create the app (with the
SQL warehouse as a CAN_USE resource) if it doesn't exist → deploy → print the URL and the service principal to grant.
"""
import argparse
import os
import sys

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.apps import App, AppDeployment, AppResource, AppResourceSqlWarehouse, AppResourceSqlWarehouseSqlWarehousePermission
from databricks.sdk.service.workspace import ImportFormat

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--name", default="find-the-right-care")
ap.add_argument("--warehouse", default=os.environ.get("DATABRICKS_WAREHOUSE_ID"))
ap.add_argument("--host", default=os.environ.get("DATABRICKS_HOST"))
a = ap.parse_args()
if not a.host or not a.warehouse:
    sys.exit("set --host/--warehouse or $DATABRICKS_HOST/$DATABRICKS_WAREHOUSE_ID (see ../.env.example)")

w = WorkspaceClient(host=a.host, auth_type=os.environ.get("DATABRICKS_AUTH_TYPE", "external-browser"))
me = w.current_user.me().user_name
dest = f"/Workspace/Users/{me}/find_the_right_care/app_src"

files = ["app.py", "find_care_core.py", "requirements.txt", "app.yaml"]
for root, _, fs in os.walk(os.path.join(HERE, "static")):
    for f in fs:
        files.append(os.path.relpath(os.path.join(root, f), HERE))
if not any(f.startswith("static/index.html") for f in files):
    sys.exit("static/index.html missing: run `npm run build` in frontend/ first")

w.workspace.mkdirs(dest)
for rel in files:
    target = f"{dest}/{rel}"
    w.workspace.mkdirs(os.path.dirname(target))
    with open(os.path.join(HERE, rel), "rb") as fh:
        w.workspace.upload(target, fh, format=ImportFormat.AUTO, overwrite=True)
print(f"uploaded {len(files)} files to {dest}")

existing = {x.name for x in w.apps.list()}
if a.name not in existing:
    print("creating app (starts its compute; a few minutes)…", flush=True)
    w.apps.create_and_wait(App(
        name=a.name,
        description="Find the Right Care: evidence-based facility recommendations (CMU Datathon Fall 2026)",
        resources=[AppResource(name="sql-warehouse", sql_warehouse=AppResourceSqlWarehouse(
            id=a.warehouse, permission=AppResourceSqlWarehouseSqlWarehousePermission.CAN_USE))]))
app = w.apps.get(a.name)
if str(app.compute_status.state).endswith("STOPPED"):
    print("starting compute…", flush=True)
    w.apps.start_and_wait(a.name)
print("deploying…", flush=True)
dep = w.apps.deploy_and_wait(a.name, AppDeployment(source_code_path=dest))
app = w.apps.get(a.name)
print("deployment:", dep.status.state, (dep.status.message or "")[:300])
print("url:", app.url)
print("service principal (grant it SELECT on workspace.hackathon):", app.service_principal_client_id, app.service_principal_name)
