# LLM vs regex: results (pilot, 15 Raipur facilities × 3 queries)

**Status (2026-11-21):** regex and LLM arms compared. **Human grades not done yet**, so NDCG@5 and τ vs human and the README decision rule can't be applied.

## Method
- **Same input:** `facilities_15.json` (identical to the file on Meet's branch).
- **Same scorer:** both arms scored with Meet's `score_features.py` (from `origin/experiment/llm-vs-regex`). Re-scoring LLM run 1 here reproduces Meet's committed `ranking_llm_run1.csv` exactly.
- **Regex extraction:** `regex_extract.py` exports the regex arm (the docs/FEATURES.md SQL run on Databricks, plus the docs/SCORING.md service patterns) in the LLM arm's CSV format.
- **LLM extraction:** Meet's run 1 (Claude Opus 5.5, two runs; run 1 vs run 2 differ on 1 of 390 cells).
- Comparison: Meet's `compare.py` → `compare_regex_vs_llm_run1.md`.

## Files (regex arm)
| File | What |
|---|---|
| `regex_extract.py` | Exports the regex extraction in the LLM arm's format → `regex_features_extract.csv`, `regex_evidence_extract.csv` |
| `features_regex.csv`, `evidence_regex.csv`, `ranking_regex.csv`, `quotecheck_regex.txt` | Regex arm scored with the shared `score_features.py` (the files `compare.py` uses) |
| `compare_regex_vs_llm_run1.md` | `compare.py` output, regex vs LLM run 1 |
| `run_regex.py` | Standalone regex flow with its own scorer (docs/SCORING.md in Python). Outputs in `regex_own_scorer/`; top 3 per query match the shared-scorer ranking |

Reproduce (needs Databricks access):
```
DATABRICKS_TOKEN=… python3 regex_extract.py .
python3 -I score_features.py . regex_features_extract.csv regex_evidence_extract.csv regex
python3 -I compare.py . regex llm_run1            # add human_agreed.csv once graded
DATABRICKS_TOKEN=… python3 run_regex.py regex_own_scorer   # optional, own scorer
```

## Headline numbers
| | Result |
|---|---|
| Feature + evidence cells that agree | **517 / 525 (98.5%)** |
| Evidence labels that agree | 44 / 45 |
| Quote check (verbatim substring) | regex 173/173 · LLM 175/175 |
| Ranking agreement (Kendall τ) | Q1 0.905 · Q2 1.000 · Q3 0.905 |
| Top-3 overlap | Q1 2/3 · Q2 3/3 · Q3 2/3 |
| Time | regex: seconds for all 10k facilities · LLM: ~21–26 s per facility (≈ 60–70 h serial for 10k) |

## Every disagreement, judged against the record text
| Facility | Feature | Regex | LLM | Who's right |
|---|---|---|---|---|
| Suyash Hospital | cardiac surgery direct claim | missed | "Performs cardiac bypass surgery in the Cardiac Cath Lab" | **LLM** (regex needs "coronary bypass" / "cardiac surg") |
| Vidya Hospital & Kidney Centre | dialysis_unit | missed | "dialysis services with 10 units" | **LLM** (regex needs "dialysis units" adjacent) |
| Kanwar Nursing Home | NABH accreditation | found "Non-NABH accreditation" | negated | **LLM** (regex false positive) |
| Tiwari Nursing Home | 24×7 emergency | found "24x7 nursing" | not mentioned | **LLM** (nursing ≠ emergency) |
| SMC Heart Institute | CCU | found "…Heart Institute for cardiac care" | not mentioned | **LLM** (cardiac care ≠ CCU) |
| Gayatri Hospital | 24×7 emergency | missed | "Offers emergency and elective services" | **LLM** (probably) |
| Suyash Hospital | CCU | found "Intensive Critical Care Unit (ICCU)" | not mentioned | Debatable (ICCU usually = coronary; the text expands it as critical care) |
| Kanha Children Hospital | dialysis_unit | not mentioned | "Dialysis facilities" | Debatable ("facilities" is vague) |

**Score: LLM right 6, debatable 2, regex right 0.**

## Effect on rankings
- **Q2 (emergency C-section):** identical.
- **Q1 (dialysis):** LLM moves **Vidya Hospital & Kidney Centre** into #2 (it found "10 units"); regex has MMI Narayana #3 instead.
- **Q3 (cardiac surgery):** LLM ranks **Suyash Hospital #1 (Strong)**; regex rates it Possible (#4) because it missed the bypass claim.

## Reading
- The two methods agree on 98.5% of cells, and where they disagree the LLM is usually right.
- Every regex error has a cheap, specific fix (below). The LLM costs ~10,000× more time per facility.
- Directional only: 15 facilities, 3 queries, no human grades yet.

## Cheap regex fixes suggested by the disagreements
1. Cardiac direct: add `(cardiac|heart) bypass`, bare `bypass surgery` with a cardiac word in the same item.
2. Dialysis units: allow `dialysis … \d+ (units|machines|beds)` within the same clause; add "dialysis facilit(y|ies)" if the team accepts it.
3. Negation: treat `non-` before a term as negated (`non-nabh`).
4. 24×7 emergency: require "emergency/casualty" in the clause; "24 hours" / "24x7" alone shouldn't count. Accept `emergency (and \w+ )?services`.
5. CCU: drop `cardiac care`; keep `\bccu\b`, `coronary care`, `cardiac intensive`. Treat ICCU per its expansion if given.
