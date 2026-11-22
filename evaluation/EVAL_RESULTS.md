# Evaluation results: `find_care` v5 on the real silver data

The eval bench (`eval_bench/`, design in `BENCH_DESIGN.md`) was run end to end on Databricks against all 10,077 facilities in `silver_facilities`. It compares `find_care` v5 with three baselines:
- **B0:** keyword match, nearest first;
- **B1:** keyword mention count, then distance;
- **B2:** largest bed count nearby.

Notebook: `/Users/<you>/find_the_right_care/eval/eval_run`. Outputs: `/Volumes/workspace/hackathon/eval_files/silver_v5`, mirrored locally in `evaluation/runs/silver_v5/`.

## How it was run

| Step | What happened |
|---|---|
| Queries | 83 requests sampled by the bench: 72 ranking requests (9 services × dense and sparse × tuning and held-out state splits × 2), 6 ambiguous-city probes and 5 verified empty-coverage probes. Formats: 25 PIN, 16 city, 16 district, 26 lat,lon. |
| Pooling | Up to 8 candidates from each baseline, the method's own results, and 3 random nearby facilities, giving **1,422 judge packets**. Packets are blind: they carry no system, score or rank. |
| Grading | LLM judges via `ai_query`, using only the record text and the 0–3 rubric in BENCH_DESIGN.md.<br>• Primary: `gpt-oss-120b`, on all packets.<br>• Audit: `qwen3-next-80b`, on a hash-chosen 25% (357 packets).<br>• Disputes: 23 disagreements of 2 or more grades went to `llama-4-maverick`, with the median taken.<br>The extractor is regex, so no judge shares a model with it. |
| Judge agreement | Exact 66%; **quadratic-weighted κ 0.82**. |
| Run time | Prepare 33 s · grading 6.5 min · scoring and stability 1 min. |

## Headline numbers (after the small-town location fix, below)

| Metric | Split | **method** | B0 | B1 | B2 |
|---|---|---|---|---|---|
| NDCG@5 | held-out | **0.777** [0.72, 0.83] | 0.653 | **0.836** | 0.407 |
| NDCG@5 | tuning | **0.810** | 0.699 | 0.824 | 0.361 |
| Kendall τ-b | held-out | 0.368 | 0.241 | 0.446 | −0.145 |
| Top-1 result is a real on-site claim (grade ≥ 2) | both | **100%** | 88% | 93% | 41% |
| Results in the top 5 with grade ≥ 2 | both | **97.3%** | 91.2% | 97.1% | 36.9% |
| Median distance of the #1 result | both | **61 km** | 56 km | 116 km | 114 km |
| Useful results within 25 km, per query | both | **1.13** | 1.13 | 0.65 | 0.22 |
| Precision of Strong (grade ≥ 2) | both | **100%**: 122 of 122 Strong results, 82% graded 3 | n/a | n/a | n/a |
| Moderate results graded below 2 | both | 8 of 170 (5%) | | | |
| Precision of Moderate | held-out | 96.7% | 91.4% | 96.6% | 89.3% |
| No "Possible" result on time-critical queries | both | **100%** | 100% | 100% | 0% |
| Quote validity (verbatim in the named field) | both | **100%** | 100% | 100% | 38% |
| Correct fallback on empty-coverage probes | diagnostic | **5/5** | n/a | n/a | n/a |
| Weight stability (26 ±20% weight perturbations) | both | Jaccard 0.97, same order 72%, 0 fallback flips | | | |

**Per-service held-out NDCG@5 (method vs B1):**

| Service | Method | B1 |
|---|---|---|
| NICU | **0.976** | 0.952 |
| Emergency C-section | **0.592** | 0.382 |
| Trauma | 0.628 | 0.626 |
| MRI | 0.885 | 1.000 |
| Oncology | 0.851 | 0.927 |
| Cardiac surgery | 0.802 | 0.909 |
| ENT | 0.814 | 0.916 |
| Dialysis | 0.773 | 0.913 |
| Burn care | 0.672 | 0.897 |

## What the numbers mean

1. **The method is the safest and most trustworthy system.**
   - Its #1 result is always a facility whose own record claims the service.
   - Every Strong label held up under blind grading.
   - It never shows a hint-only ("Possible") facility for a time-critical need.
   - Every quote it shows is verbatim.
   - B2, the "big hospital nearby" heuristic people often default to, fails all of these.
2. **B1 wins on NDCG because the bench's reference ignores distance.** The bench sorts the reference by grade, then by distance, so a grade-3 facility 140 km away outranks a grade-2 facility 5 km away. B1 sorts by how often the record mentions the service, which tracks the grade, and it doesn't care about distance. Its #1 result is a median **116 km** away, against the method's **61 km**, and it finds about half as many useful facilities within 25 km. The method trades some grade-3 share (68% vs 71% of the top 5) for being close. That is the design intent for dialysis (thrice weekly) and the time-critical services. When presenting, show NDCG next to the distance and safety rows, not alone.
3. **C-section and NICU, the two most time-critical services, are where the method beats every baseline.** The pilot's worry that the heart/IVF clinic outranks maternity hospitals (R4) does not carry over to the real data.
4. **The method returns fewer results (4.07 vs 4.26 per query).** Its gate drops Weak and Possible records, and the missing slots cost NDCG. That is deliberate.

## Fixes the bench drove

- **Small towns failed to resolve (fixed in `notebooks/find_care_v5.ipynb`).**
  - *Before:* 4 of 72 ranking requests ("Tiuni", "Palsana", "Ramgarh Bhullar", "Kayamkulam") returned *"We couldn't find…"*. The city lookup only used cities with at least 2 facilities and exact coordinates.
  - *Fix:* it now falls back to any located facility in a town of that name. One state → resolve, labelled approximate. Several states → ask which one.
  - *Result:* NDCG@5 rose from 0.764 to 0.777 (held-out) and from 0.730 to 0.810 (tuning). The ambiguity probes went from 0/6 to 3/6.
  - The 3 remaining "misses" (Delhi, Rudrapur, Bhiwandi) are bench artefacts. The bench calls a city ambiguous if any single stray record puts it in a second state, while the method needs at least 2 facilities and 5% of the city's records. The method's answer is the right one.
- **Weight tuning (PLAN_V5 §7.2): keep the current weights.**
  - A grid search over (wE, wD, wA) and d_half on the tuning split improved tuning NDCG for 8 of 9 services.
  - Those gains held on held-out for only 3 services (oncology +0.025, cardiac +0.018, trauma +0.012) and reversed for 5 (C-section −0.038, ENT −0.031, burn −0.029, NICU −0.019, dialysis −0.016).
  - With 4 tuning queries per service this is noise, so no change. See `report/tuning.jsonl`.

## Known limits (say these out loud)

- **Judges are LLMs, not people.** Agreement is good (κ 0.82), but the primary judge is slightly lenient: it sometimes gives grade 2 for a specialty code alone. The PLAN_V5 §7.3 human grading (two blind graders on about 50 facilities of one held-out city) is still to do.
- **Pooling favours participating systems.** Every method result was judged (coverage 1.0), but a good facility that no system returned can't count.
- **About 4 queries per service per split**, so per-service intervals are wide. The pooled intervals in the table are bootstrap 95% CIs over queries.
- **What the measures establish.** Grades measure *what the record supports*, not real-world availability. Distances are 1.4 × straight-line.
- **Contaminated records can still rank #1.** Examples: an eye hospital listed for NICU, and a homoeopathy college listed for oncology. Silver flags these records, and `find_care` shows a caveat but doesn't demote them. This is a team decision.
- **Not run:**
  - The bench's shadow / metamorphic cases. They need a feature rebuild from patched records.
  - The LLM-second-reader decision rule, which depends on the human grades.

## Reproduce

```sh
python3 evaluation/deploy_eval.py --token-file <tok> --stage prepare   # export, sample, method, packets
python3 evaluation/deploy_eval.py --token-file <tok> --stage grade --no-upload
python3 evaluation/deploy_eval.py --token-file <tok> --stage evaluate --no-upload
python3 evaluation/deploy_eval.py --token-file <tok> --stage rescore     # after a method change: re-run, grade only new pairs, re-score
```

`runs/silver_v5_run1/` keeps the scores from before the location fix.
