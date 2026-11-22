# Datathon26

CMU Datathon Fall 2026 (Databricks): find the best facilities for a medical service and location in India, from the Virtue Foundation dataset.

## Where things are

| Path | What |
|---|---|
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | **Start here.** The deterministic method, with pipeline and label flowcharts |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature catalogue, missing-data rules (M1–M8), Depth weights, all pipeline SQL |
| [docs/SCORING.md](docs/SCORING.md) | Evidence, completeness, ranking per service, confidence, evaluation design |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Bronze and silver tables (`workspace.hackathon.*`) |
| [sql/01_profiling.sql](sql/01_profiling.sql) | Data-quality profiling queries |
| [experiments/llm_vs_regex/](experiments/llm_vs_regex/) | LLM vs regex pilot (15 Raipur facilities × 3 queries): both arms, shared scorer, comparison ([RESULTS_REGEX.md](experiments/llm_vs_regex/RESULTS_REGEX.md), [RESULTS_LLM.md](experiments/llm_vs_regex/RESULTS_LLM.md)) |
| [evaluation-context-handoff.md](evaluation-context-handoff.md) | Meet's context handoff for the evaluation design (plan v4) |

Pipeline input: the team's silver tables (`workspace.hackathon.silver_facilities`, `silver_pincode_directory`). Scripts read the Databricks token from `$DATABRICKS_TOKEN`; never commit it.
