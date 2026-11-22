# Evaluation on the real data

Runs the [eval bench](../eval_bench/) against `find_care` v5 on all 10,077 facilities in Databricks. **Results: [EVAL_RESULTS.md](EVAL_RESULTS.md).**

| Path | What |
|---|---|
| [eval_run.py](eval_run.py) | Databricks notebook (source format). Stages: `prepare` → `grade` (LLM judges via `ai_query`) → `evaluate` (plus `rescore`, `all`) |
| [deploy_eval.py](deploy_eval.py) | Uploads `eval_run`, a library copy of `notebooks/find_care_v5.ipynb` and the `eval_bench` modules, runs one stage on serverless, downloads the outputs |
| `stage_*.json` | Exit values of the last run of each stage |
| `runs/silver_v5/` | Outputs of the reported run: queries, judge packets, grades (`primary`, `audit`, `resolutions`), references, method log, `report/` |
| `runs/silver_v5_run1/` | The same run before the small-town location fix (kept for comparison; see EVAL_RESULTS.md) |

Rerun from the repo root (needs `.env`, see `../.env.example`):

```bash
make eval-deploy STAGE=all
```

The LLM grades depend on model sampling, so a rerun of `grade` will differ slightly; `evaluate` on the committed grades is deterministic.
