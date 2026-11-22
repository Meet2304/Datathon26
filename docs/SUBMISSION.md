# Find the Right Care: CMU Datathon Fall 2026 submission

**What it is:** a Databricks App. A health worker picks the **care needed** and enters **where the patient is**. The app returns the best nearby facilities and answers two questions for each one:
- **why this facility?** It quotes the facility's own words.
- **how did you decide?** It shows the score arithmetic and the weights.

It also says how sure it is, and lists **every nearby facility it considered but did not recommend, with the reason.**

| | |
|---|---|
| Live app (Databricks Apps, Free Edition) | https://find-the-right-care-7474644416958437.aws.databricksapps.com (workspace login required; screenshots in [`app/screenshots/`](../app/screenshots/)) |
| Pipeline notebook | `/Users/<your-user>/find_the_right_care/find_care_v5` (source: [`notebooks/find_care_v5.ipynb`](../notebooks/find_care_v5.ipynb)) |
| App source | [`app/`](../app/) (its `README.md` explains how to run and deploy it) |
| Evaluation | [`evaluation/EVAL_RESULTS.md`](../evaluation/EVAL_RESULTS.md) (bench design: [`eval_bench/BENCH_DESIGN.md`](../eval_bench/BENCH_DESIGN.md)) |
| Method docs | [`METHODOLOGY.md`](METHODOLOGY.md) (overview), [`PLAN_V5.md`](PLAN_V5.md), [`FEATURES.md`](FEATURES.md), [`SCORING.md`](SCORING.md) |
| Build notes | [`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md), [`sql/03_silver_facilities_v2.sql`](../sql/03_silver_facilities_v2.sql) |

## Requirements checklist (from the challenge brief)

| Requirement | How we meet it | Evidence |
|---|---|---|
| Runs on Databricks Free Edition | Delta tables, a serverless job, a SQL warehouse and a Databricks App, all on the Free Edition workspace | The full rebuild of 10,077 facilities takes 175 s on serverless; each search takes 10–100 ms in the app |
| Uses the provided dataset | Virtue Foundation facilities and the India Post PIN directory | Read-only inputs; every derived table is in `workspace.hackathon` |
| Clear non-technical workflow | 3 steps: choose the care → say where → compare and call. Plain-language labels, a map, example searches, "use my location", "did you mean…?" | [`app/screenshots/`](../app/screenshots/) |
| Cite the facility text for every claim, score and ranking | Each result quotes the record verbatim and names the field it came from | 0 non-verbatim quotes across 90,693 facility × service results. Quote validity 100% on the bench, against 38% for the "biggest hospital" baseline |
| Communicate uncertainty | Evidence label, confidence level, "check before you go" warnings, "not in the record", and a fallback when nothing qualifies | Strong label precision 122/122; no unconfirmed facility shown for an urgent need (0% for B2); correct fallback 5/5 |
| WHY this facility? | Quotes + label + score breakdown (evidence / capability / closeness), plus **why the others were left out** | The "Considered but not recommended" panel on every search |
| HOW did you decide? | A one-line rule per service, the weights table, and visible arithmetic, e.g. 0.30×90 + 0.10×88 + 0.60×84 = **86.2** for CARE Raipur, dialysis | The "How it works" page; `SCORING.md` |

## Judging criteria (cmudsc.com/datathon-fall2026)

### Exploration: "uncover novel datasets and provide insightful analysis"
We measured how far each field can be trusted before using it.

- **The records are web-extracted claims, not facts.**
  - 2,078 of 10,077 records have a procedure, equipment or capability list cut off at 50 items.
  - 1,492 have coordinates far from their own PIN; 705 are more than 200 km away.
  - 64% have no doctor count, and 73% have no bed count.
- **Records merge or contradict each other.**
  - 6 capability lists name another facility, and 25 descriptions name another state.
  - 451 descriptions are template text.
  - An *eye hospital* claims a "10-bed Neonatal Intensive Care Unit", and a *homoeopathy college* claims "high-dose-rate brachytherapy".
- **The PIN directory has errors.**
  - 206 of 19,586 PIN points lie more than 300 km from their PIN area.
  - For example, 19 of the 25 PINs in Aurangabad, *Bihar* are geocoded to Aurangabad, *Maharashtra*.
- **City names are inconsistent.** 1,643 raw spellings become 1,531 cities after cleaning. 466 records use legacy names (Bangalore, Gurgaon…), and 35 values are junk (dates, numbers, pasted lists).
- **Coverage is very uneven.** Only 3 facilities in India have strong evidence for burn care, against 612 for MRI (Coverage page). Some districts have no documented option nearby:
  - dialysis near Dantewada: the nearest is 308 km away;
  - trauma near Car Nicobar: the nearest is 1,958 km away.

### Modeling: "find meaningful data relationships"
- **Evidence model (E → label).** Regex claim extraction over clause-split text. It handles negation ("dialysis not available"), look-alikes ("gastric bypass" is not cardiac surgery) and duplicate claims. Equipment and emergency-cover corroboration is required for a *Strong* label. Facility-type plausibility and silver's mixed-record flags guard against contaminated records.
- **Capability model (D).** Service-specific weighted prerequisites: for example a dialysis unit, ICU and accreditation for dialysis, or a cath lab and CCU for cardiac surgery. Missing data lowers *confidence*, never *rank*.
- **Location model (A).** Road ≈ 1.4 × great-circle distance. The closeness score halves every service-specific half-distance: 15 km for dialysis and trauma, 150 km for cardiac surgery and oncology. Approximate (PIN-centre) locations carry an uncertainty radius. The search widens 25 → 50 → 100 → 250 km until it finds enough options.
- **Validated, not just asserted.** 83 test searches and 1,422 blind-graded records, scored by three LLM judges via `ai_query` (agreement κ 0.82), compared against 3 baselines. Weight changes of ±20% leave 97% of results the same. Tuned weights didn't generalise to the held-out queries, so we kept the defaults.

| Measure (both splits) | **Ours** | Most mentions (B1) | Biggest nearby (B2) |
|---|---|---|---|
| #1 result is a real on-site claim | **100%** | 93% | 41% |
| Median distance to the #1 result | **61 km** | 116 km | 114 km |
| Useful options within 25 km, per search | **1.13** | 0.65 | 0.22 |
| NDCG@5, held-out (ignores distance) | 0.777 | **0.836** | 0.407 |

B1 ranks higher on NDCG because that metric rewards well-documented hospitals far away. We trade a little ranking score for options that are closer and safer, and we win on the two most urgent services: C-section 0.592 vs 0.382, and NICU 0.976 vs 0.952.

### Impact: "propose actionable and impactful policies"
1. **For health workers and NGOs, today:** use the app as a referral aid. Call the top option first, and use the "not recommended" list to avoid wasted trips to facilities that only *mention* a service.
2. **For district planners:** the Coverage page and the care-desert fallbacks show where documented capacity is missing. Target outreach and verification there first: burn care nationally, and dialysis in southern Chhattisgarh.
3. **For the Virtue Foundation (data fixes, ranked by measured size):**
   - stop cutting lists at 50 items (affects 2,078 records);
   - re-geocode the PIN directory (206 misplaced points);
   - validate coordinates against the PIN (1,492 records);
   - add a normalized city field (466 legacy names; our `silver_facilities_v2` is a ready template);
   - split merged records (the mixed-record flags).
4. **Verification loop:** each search is logged to `gold_query_log`. Facilities that appear often in results but have Low confidence are the best-value targets for a phone verification campaign.

## Known limits (stated in the app and the video)
- **What a grade means:** grades measure what a record *supports*, not whether the service is available today. The app always says "call ahead".
- **Who graded:** LLM judges, not people. A human grading pass on about 50 facilities is still to do.
- **Sample size:** about 4 test searches per service per split, so per-service intervals are wide.
- **Not evaluated:** the app-layer additions (the facility-type rule, record-check warnings, the not-recommended panel, the 93 extra specialties) aren't in the evaluated numbers, which come from the notebook pipeline.

## Video script (about 5 min)
| Time | Show | Say |
|---|---|---|
| 0:00 | Title | A health worker in rural Bihar needs dialysis for a patient. Where should they go, and why should they trust the answer? |
| 0:25 | Exploration slide, data issues | 10,000 web-extracted records: lists cut at 50, wrong PIN locations, merged records. An eye hospital "with a NICU". |
| 1:15 | App: dialysis at 492001 | The three steps. Result #1 with its quote, labels and score breakdown (86.2 worked out by hand). |
| 2:15 | "Considered but not recommended" | Eye and diagnostic centres left out with reasons; "hint only" records; facilities ranked lower, with their scores. |
| 2:45 | "Aurangabad", then "Aurangabad, Bihar"; Car Nicobar trauma | Asks which state is meant; honest fallback in a care desert. |
| 3:15 | How it works page | The method in 5 steps; the weights table; the evaluation table. |
| 4:00 | Coverage page + policies | Burn care has 3 strong facilities nationally; the four policy recommendations. |
| 4:40 | Limits | Record-supported, not verified; always call ahead; human grading is next. |

## Submission checklist (form: https://forms.gle/jSauvMcZqT1pyqaN7, due Sun 22 Nov, 12:30 PM)
- [ ] **Code:** this repository (originally a zip of `implementation/`, `evaluation/`, `eval_bench/` and `docs/`).
- [ ] **Analysis:** this file plus `evaluation/EVAL_RESULTS.md`, exported to PDF if the form needs a file.
- [ ] **Video:** recorded from the script above, with a screen recording of the live app.
- [ ] Share the app with the judges' accounts if they will have workspace access. Otherwise the video and screenshots are the demo.
