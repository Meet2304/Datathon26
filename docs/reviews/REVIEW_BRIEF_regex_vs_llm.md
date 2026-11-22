# Review brief: regex (algorithmic) vs LLM feature extraction, 15-facility pilot

You are one of three independent reviewers. The other two are different models, and you will not see their work. Your job is to judge **which extraction method produced better ratings and rankings, and why**, by checking the claims against the source text yourself. Don't just repeat the conclusions already written in the repo.

## Where everything is
Repo (local clone, branch `experiment/regex-arm`, read-only for you):
`/Users/meet/Meet/Projects_Ad Astra/Project_2_Databricks Datathon/Datathon26/`

In `experiments/llm_vs_regex/`:

| File | What |
|---|---|
| `README.md` | Experiment protocol: 3 queries (Q1 dialysis, Q2 emergency C-section, Q3 cardiac surgery), the grade scale and the decision rule |
| `facilities_15.json` | **The source text.** This is the ground truth for what each record says |
| `../../docs/FEATURES.md`, `../../docs/SCORING.md` | The planned method: features G1–G14 and S1–S12, Service Evidence E, labels, ranking formula |
| `score_features.py` | The shared scorer. Both arms go through it, so only extraction differs |
| **Regex arm:** `regex_extract.py`, `regex_features_extract.csv`, `regex_evidence_extract.csv` → `features_regex.csv`, `evidence_regex.csv`, `ranking_regex.csv`. `run_regex.py` and `regex_own_scorer/` hold a standalone variant | |
| **LLM arm:** `LLM_EXTRACT_BRIEF.md`, `llm_features_run{1,2}.csv`, `llm_evidence_run{1,2}.csv` → `features_llm_run{1,2}.csv`, `evidence_llm_run{1,2}.csv`, `ranking_llm_run{1,2}.csv`. Notes are in `llm_run{1,2}_notes.md` | |
| `compare_regex_vs_llm_run1.md`, `compare_llm_run1_vs_run2.md` | Automatic comparison output |
| `RESULTS_REGEX.md`, `RESULTS_LLM.md` | Each arm's own write-up. **These are claims for you to check**: the regex write-up concludes "LLM right 6, regex right 0" |

Optional extra context: `/Users/meet/Meet/Projects_Ad Astra/Project_2_Databricks Datathon/llm_vs_regex/archive_v4_grid_fill/` has an earlier, *holistic* LLM rating. There the LLM judged confidence, capability and tier directly, with no formula. You may use it to discuss whether holistic LLM judgment would rank differently, but it's not the main comparison.

**No human grades exist yet.** So you can't compute NDCG. Judge correctness against the record text.

## What to answer
1. **Disagreements.** For every cell where regex and LLM run 1 disagree, open the record in `facilities_15.json` and decide who is right: regex, LLM, or debatable. Do you agree with `RESULTS_REGEX.md`'s verdicts? Show the text you relied on.
2. **Shared blind spots.** The two methods agree on 517 of 525 cells, but agreement isn't correctness. Spot-check **at least 10 cells where both agree**, focusing on the ones that drive the top-5 rankings: direct claims, labels, `S1`, `S5`, `G7`, `G8`, `G5`. Report any that are both wrong.
3. **Is 98.5% agreement meaningful?** How many of the 525 cells are structured fields (G1, G2, G3, G14, G12 from affiliations) or trivially absent, where agreement is automatic? Recompute the agreement on the cells that actually needed reading the text.
4. **Ranking impact.** Which differences actually change the top 3, and does the change make the recommendation better for the patient in the README's story? Look especially at Suyash for Q3 and Vidya for Q1.
5. **Scorer and spec issues.** Problems that hurt **both** arms equally, such as no facility getting Strong for C-section because of the "same item" emergency rule, or how truncation is treated. Separate these from extraction-method issues.
6. **Cost and practicality.** Regex takes seconds for 10,000 facilities. The LLM takes about 21–26 s per facility. Given the disagreements, what would you actually do? Options: regex only, regex with the suggested fixes, LLM only, or a hybrid such as LLM checking borderline regex cells. Be concrete.
7. **Verdict.** Which method rated better on this pilot, how confident you are, and what would change your mind.

## Rules
- Read-only. Don't edit, commit or push anything in the repo.
- Cite evidence by facility name, field and a short verbatim quote.
- Write your review to:
  `/Users/meet/Meet/Projects_Ad Astra/Project_2_Databricks Datathon/reviews/review_<you>.md`, where `<you>` is `grok`, `opus` or `sol`.
  Start it with a **5-bullet plain-English summary** that a non-technical teammate can follow. Then give the detailed answers 1–7.
- Finish by replying with those 5 bullets plus your one-line verdict.
