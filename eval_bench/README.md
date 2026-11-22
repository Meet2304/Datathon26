# Find the Right Care evaluation bench

The current data and report cover the 15-facility Raipur pilot. The Databricks runner prepares the wider benchmark from the two silver tables and evaluates the §5 response format.

## Reproduce the pilot

From the project root, run `make pilot` (or `uv run python eval_bench/pilot.py`). Results go to `eval_bench/data/pilot/report/REPORT.md`, with per-query metrics, responses, and failure examples in JSONL.

## Prepare and score the wider bench

Place the Python modules together in a Databricks workspace folder and import `databricks_runner.py` as a notebook. Run `prepare(directory)` with a writable workspace or volume path. It uses Spark SELECTs. Alternatively, use the local read-only SQL Statement API exporter with `DATABRICKS_HOST`, `DATABRICKS_TOKEN` and `DATABRICKS_WAREHOUSE_ID` available in the environment.

```sh
cd eval_bench
python3 export.py --out data/silver
python3 build.py --facilities data/silver/facilities.jsonl --pins data/silver/pins.jsonl \
  --complete-inventory --out data/silver
```

Use `--include-log` on export when the query log exists. Supply that JSONL as `--log` to the pool builder to include method candidates. Use a frozen run for the pool and retain the candidate snapshot before tuning. Grade the packets using BENCH_DESIGN.md. Each judgment row needs `query_id`, `unique_id`, integer `grade` and `rationale`.

```sh
python3 grade.py --packets data/silver/judge_packets.jsonl --primary primary.jsonl \
  --audit audit.jsonl --resolutions resolutions.jsonl --out data/silver
python3 bench.py --queries data/silver/queries.jsonl --facilities data/silver/facilities.jsonl \
  --references data/silver/references.jsonl --out data/silver/report
```

Add `--log data/silver/method_log.jsonl` to score matching logged responses. The log adapter uses the most recent matching service, location and k. Supply a log scoped to the implementation version under test. In the notebook, use `evaluate(directory, find_care=find_care)` for a callable. With just `evaluate(directory)` it uses the log when present. An ambiguity response needs a truthy `clarification` marker in the adapter until the production schema specifies one.

For diagnostic reruns, copy `cases.jsonl` and `shadow_sources.jsonl` to the run directory. The optional `shadow` callback accepts a list of isolated source records and §5 keyword arguments. It must rebuild features from the supplied records and execute against that isolated inventory. The optional `weighted` callback takes the service's (wE, wD, wA) tuple and §5 request. Supply `weights` as a service-to-tuple mapping. If an adapter persists shadow records, use an `eval_` table in `workspace.hackathon`.

## Files to review

- `summary.jsonl` and `REPORT.md` contain overall and per-service metrics with intervals and sample counts.
- `per_query.jsonl`, `failures.jsonl`, and `responses.jsonl` support debugging by query and system.
- `label_monotonicity.jsonl` contains label rates, coverage, and inversions.
- `missing_method.jsonl` lists requests absent from a supplied log.
- `case_results.jsonl` and `stability.jsonl` appear when their adapters run.
