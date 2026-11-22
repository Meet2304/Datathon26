# LLM arm: status and how to reproduce

**Status (2026-11-21):** LLM arm done (2 runs). Regex arm and human grades not done yet.

## Pipeline
1. **Extraction (LLM).** Claude Opus 5.5 (`claude-opus-5-5`) followed [LLM_EXTRACT_BRIEF.md](LLM_EXTRACT_BRIEF.md) twice, in independent runs. Each run reads only `facilities_15.json` and reports, with a verbatim quote, which text features and evidence it finds. Outputs: `llm_features_run{1,2}.csv` and `llm_evidence_run{1,2}.csv`. Notes, including timing, ambiguous calls and expected regex differences: `llm_run{1,2}_notes.md`. Temperature could not be set to 0 in this harness.
2. **Scoring (shared by both arms).** [score_features.py](score_features.py) applies [FEATURES.md](../../docs/FEATURES.md) and [SCORING.md](../../docs/SCORING.md) to compute feature values, D, E, labels, C, A, `rank_score` and confidence:
   ```
   python3 -I score_features.py . llm_features_run1.csv llm_evidence_run1.csv llm_run1
   ```
   It writes `features_<tag>.csv`, `evidence_<tag>.csv`, `ranking_<tag>.csv` and `quotecheck_<tag>.txt`. `features_llm.csv` and `ranking_llm.csv` are copies of run 1.
3. **Comparison.** [compare.py](compare.py) compares two arms:
   ```
   python3 -I compare.py . regex llm human_agreed.csv
   ```
   It reports feature agreement, label agreement, Kendall τ and top-3 overlap, plus NDCG@5 and τ against the human grades when that file is present.

## LLM run-to-run consistency ([compare_llm_run1_vs_run2.md](compare_llm_run1_vs_run2.md))
- Quotes: 175 and 173 checked, 0 failed on first pass in either run.
- Features: run 1 and run 2 disagree on 1 of 390 facility × feature cells (Vidya ICU). Labels agree on 44 of 45.
- Rankings: same top 3 for every query. Kendall τ is 0.98, 1.00 and 0.94 for Q1, Q2 and Q3.
- Cost: about 21–26 s per facility.

## Next
1. Human rankers grade blind (`human_A.csv`, `human_B.csv`, `human_agreed.csv`). Don't open `ranking_*` or `evidence_*` before you finish.
2. Build the regex arm: `features_regex.csv` and `ranking_regex.csv`, scored with the same `score_features.py`.
3. Run `compare.py` and apply the README decision rule.
