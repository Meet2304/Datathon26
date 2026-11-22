# Find the Right Care: demo app

A Databricks App for non-technical users: community health workers, NGO coordinators and district planners. The workflow has three steps:
1. **Choose the care needed**: 9 core services, plus 93 other listed specialties.
2. **Say where the patient is**: a PIN code, city, district, `lat, lon`, or "use my location".
3. **Compare options and call ahead.**

Every recommendation shows:
- the facility's own words, quoted verbatim;
- an evidence label and a confidence level;
- the score arithmetic;
- warnings and items "not in the record";
- a phone number and website.

Every search also shows **which nearby facilities were considered but not recommended, and why.**

- **Front end:** React + shadcn/ui (dashboard-01 layout, Nova / Geist, light mode), Leaflet + OpenStreetMap, and Recharts. Source is in `frontend/`; the build output goes to `static/`.
- **Back end:** FastAPI (`app.py`).
  - At start-up it loads the tables built by [`../notebooks/find_care_v5.ipynb`](../notebooks/find_care_v5.ipynb) and [`../sql/03_silver_facilities_v2.sql`](../sql/03_silver_facilities_v2.sql) from the SQL warehouse, which takes about 7–12 s.
  - Each search then runs in memory in 10–100 ms.
  - Core-service searches are appended to `workspace.hackathon.gold_query_log` in the PLAN_V5 §5 format. App-only fields are stripped first, so the eval bench contract is unchanged.
- **Search logic:** `find_care_core.py` ports the notebook's `find_care`, plus the app-layer additions below.

## Run

From the repo root (Python dependencies come from the `app` group in `pyproject.toml`; `requirements.txt` here mirrors it for the Databricks Apps runtime). Set `DATABRICKS_HOST` and `DATABRICKS_WAREHOUSE_ID` in `../.env` or your shell first.

```sh
make app-build     # cd frontend && npm ci && npm run build  → writes static/ (Node 20+)
make app-run       # local, http://localhost:8000, signs in through the browser
make app-deploy    # upload + create/deploy the Databricks App
```

`static/` is committed, so `make app-deploy` works without Node.

The app's service principal needs:
- `USE CATALOG` on `workspace` and `USE SCHEMA` + `SELECT` on `workspace.hackathon`;
- `MODIFY` on `gold_query_log`, for logging.

The SQL warehouse is declared as an app resource with `CAN_USE`, so that permission is granted automatically on deploy.

## What the app adds to the evaluated method

E, the labels, D, confidence, the gate, the weights, the radius schedule and the fallback are **unchanged**: they are read from `gold_service_scores`. The additions below are **not** included in the numbers in `evaluation/EVAL_RESULTS.md`.

| Addition | Why | Effect |
|---|---|---|
| **Considered but not recommended** | "Why this facility?" also needs "why not that one?" | Every facility within the searched radius that mentions the service but wasn't shown is listed under one of five reasons: ranked lower (with its score against the cut-off score), facility type doesn't fit, evidence too thin for the service's minimum label, hint only, or says it doesn't offer the service. The panel also counts the facilities that never mention the service. |
| **Facility-type plausibility** (team idea 2) | Mixed-up records rank high otherwise. Aravind *Eye* Hospital was #1 for NICU in Delhi because its record contains "10-bed Neonatal Intensive Care Unit". | A deterministic regex on the facility name finds eye, dental, AYUSH (homoeopathy, ayurveda…), skin/cosmetic, physiotherapy, mental-health and veterinary facilities, and diagnostic centres (allowed for MRI only). These are not recommended for the 9 core services and are listed with the reason. Names that also say "multi-speciality", "medical college", etc. are exempt, except AYUSH names. |
| **Record checks** (team idea 3) | Silver already flags contradictory records | The flags become plain-language warnings on each result. Two mixed-record flags cap confidence at Low: the capabilities name another facility, or the description names another state. Four weaker flags cap it at Medium: template description, state ≠ PIN, implausible beds or doctors, specialties don't fit the facility type. **The score and the order never change.** |
| **More specialties** (team idea 1) | The 9 core services don't cover everything people ask for | "Something else?" offers the other 93 specialty codes found in silver. Results are the nearest facilities listing that specialty, always labelled "Listed specialty" with Low confidence and a "call to confirm" banner. |
| **Location input** (team idea 4) | Users type what they know | The app accepts a PIN, city, district, `lat, lon`, "name, state" or "use my location". It also resolves city aliases (Bangalore → Bengaluru), uses `silver_facilities_v2.clean_city`, matches city names letters-only ("Dehra Dun"), offers districts when a state is typed ("Bihar"), and suggests corrections for typos ("Patnaa" → Patna). |

**Team-proposed flags I didn't use, and why:**
- `web_name_mismatch_suspect` (the domain-mismatch flag): it fires on 24% of all records.
- `websites_many_unrelated_sources` (the high-source-fanout flag): it fires mostly on large, well-known hospitals listed in many directories, e.g. CARE Raipur.

Neither one separates trustworthy records from untrustworthy ones.
