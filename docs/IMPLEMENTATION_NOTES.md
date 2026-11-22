# Implementation notes: v5 pipeline and `find_care`

> **Paths.** These notes were written when the code lived in an `implementation/` folder. In this repo the notebook is [`notebooks/find_care_v5.ipynb`](../notebooks/find_care_v5.ipynb), the scripts are in [`scripts/`](../scripts/), run outputs are in [`results/pipeline/`](../results/pipeline/) and the SQL is in [`sql/`](../sql/). The file table below uses the new paths.

> **§5 contract changes (for the eval-bench thread).** Every change is an **addition**. No field was renamed or removed.
> 1. **`clarification`** `{message, options: [{label, state, kind}]}` is returned when a place name matches more than one state. `results` is then `[]` and `fallback` is `null`, which is what the bench's ambiguity metric expects.
> 2. **`error`** (string) is returned for an unknown service, an unknown PIN or an unknown place. `results` is `[]` and `fallback` is `null`.
> 3. **`extra_rows`** is `null` or an object with two optional keys:
>    - `stronger_evidence: {message, result}`
>    - `unconfirmed_options: {message, results: [...]}`
>
>    Rows in `extra_rows` have `rank: null`. The bench's `nested_results` walker already finds them.
> 4. **`fallback`** is `null` when there are results, otherwise a message string. When a documented facility exists beyond the maximum radius, the message also names the nearest one and its distance.
> 5. **Request shape and logging.** `request_json` is `{service, location, k}`, the bench's key. The `query_id` and `ts` appear only in `gold_query_log` columns, so the same request gives a byte-identical `response_json`.
>
> 6. **No other contract change since the Databricks run.** The new "record may include text from another facility" caveat (adaptation 24) is one more string in the existing `caveats` list.
>
> **Note for the bench:** `gold_query_log` now has 75 rows, but only 14 distinct requests. Each of the 5 build runs appended the 14 smoke queries again, plus a few extra rows. Deduplicate by `request_json` and keep the latest `ts`.

## Status

**The notebook runs end to end on Databricks Free Edition serverless.**

- **Notebook:** `/Users/<your-user>/find_the_right_care/find_care_v5`
- **Last run:** 2026-11-22. Result SUCCESS, 203 s wall clock (175 s inside the notebook).
- **Run page:** https://dbc-4b4617c5-f718.cloud.databricks.com/?o=7474644416958437#job/783879305561410/run/735992604006458

What the last run showed:
- All 12 regression fixtures pass, using the real silver codes.
- All 4 pilot checks pass.
- All 14 smoke queries run, at 1.2–2.3 s each.
- 0 quotes fail the verbatim check across 90,693 facility × service cells.
- `find_care_sql` is created and callable.
- The full `run_summary.json` (the notebook's exit value) is in [`results/pipeline/`](../results/pipeline/run_summary.json).

**How it got there.** The Databricks connector in this session runs SQL only, so it can't upload or run notebooks. I signed in with OAuth instead, through the Databricks Python SDK's `external-browser` flow, and ran the deploy script (now `scripts/deploy_pipeline.py`). That script uploads the notebook and submits it as a one-off serverless job.

It took 5 runs. Runs 2–5 fixed problems that only showed up on the real data; see adaptations 20–25. The SQL connector was used for profiling and spot checks.

**To rerun:**
- **In the workspace:** open the notebook, set the widgets and *Run all*. Use `rebuild = no` to query only.
- **From a laptop:** `uv run python scripts/deploy_pipeline.py --token-file <file>` (or set `DATABRICKS_HOST` / `DATABRICKS_TOKEN` in `.env`).

## Files

| File | What |
|---|---|
| [`notebooks/find_care_v5.ipynb`](../notebooks/find_care_v5.ipynb) | The pipeline notebook (single source of truth). Run all builds the tables. The widgets are service, location, k, rebuild and run_tests. The **Your search** cell renders the results as HTML cards. |
| [`scripts/deploy_pipeline.py`](../scripts/deploy_pipeline.py) | Uploads the notebook and runs it as a serverless job (REST API, standard library only). |
| [`results/pipeline/run_summary.json`](../results/pipeline/run_summary.json) | Output of the last Databricks run: profiling adaptations, fixtures, pilot, smoke tests, label counts, timings, environment checks. `run_summary.run5.json` is the run before it. |
| [`scripts/run_local_pipeline.py`](../scripts/run_local_pipeline.py) | Runs the notebook on local Spark over the 15 pilot records, then scores the 3 pilot queries with `eval_bench/bench.py`. |
| [`results/pipeline/local_pilot_responses.json`](../results/pipeline/local_pilot_responses.json) | The local §5 responses for Q1–Q3. These are restricted to the 15 pilot facilities and not logged. |

## Tables created (in `workspace.hackathon`)

**None of these names existed before this thread.** Each one was created by the notebook and is tagged `TBLPROPERTIES ftrc.owner = find_care_v5`. No `_v5` fallback names were needed.

In build order:

`silver_facility_clean` · `silver_facility_location` · `silver_claims` · `ref_feature_terms` · `ref_feature_context` · `ref_feature_specialty` · `ref_service_direct` · `ref_service_weights` · `ref_service_profile` · `silver_feature_hits` · `gold_facility_features` · `gold_facility_completeness` · `gold_service_evidence` · `gold_service_depth` · `gold_service_scores` · `ref_regression_fixtures` · `gold_query_log` (append-only).

It also creates the SQL table function `workspace.hackathon.find_care_sql(service, location, k)`. Its location input is a PIN or `lat,lon` only. Example:

```sql
SELECT * FROM workspace.hackathon.find_care_sql('dialysis', '492001', 5)
```

**Second silver dataset (2026-11-22):** `silver_facilities_v2` and `ref_city_alias` were built by [`sql/03_silver_facilities_v2.sql`](../sql/03_silver_facilities_v2.sql) through the SQL connector. `silver_facilities_v2` is every silver column plus a normalized `clean_city` and its flags. `find_care_v5` does **not** read it yet: it still uses the raw `bronze_facilities.address_city` (adaptation 20). The rules and counts are in the header of the SQL file.

**Not persisted:** `ev_raw` and the `fx_*` names are session temp views. They appear in the notebook's own `SHOW TABLES` output only.

**Inputs:** read only. The notebook reads:
- `silver_facilities`;
- `silver_pincode_directory`;
- `bronze_pincode_directory`, for the PIN radius;
- `bronze_facilities`, for city names (adaptation 20).

Nothing was dropped.

**Safety rule, enforced in code (cell 0.1):**
- If a table name exists **without** the ownership tag, the notebook writes `<name>_v5` instead.
- If both names are taken by someone else, the notebook stops.

## Input contract on the real `silver_facilities`

The real table has 10,077 facilities and 113 columns. The notebook resolves column names at run time and prints each substitution as `ADAPT:`.

| Logical field | Plan assumes | Real silver | Handling |
|---|---|---|---|
| raw text for quote checks | `description`, `procedure`, `equipment`, `capability`, `specialties` | not in silver. Only `clean_*` exists. | Quotes are checked against `clean_*`. 26 procedure items aren't byte-identical in the JSON form, because of escaping; quotes are re-checked against the decoded list. |
| official website | `clean_officialWebsite` | `clean_website` | used |
| websites list | `clean_websites` | absent | treated as missing |
| city | `address_city` | absent | read from `bronze_facilities.address_city` (adaptation 20) |
| truncation | `flag_*_truncated_50` | present | used as-is |
| specialty codes | `obstetrics`, `cardiothoracicSurgery`, `cardiology`, `neonatology`, `nephrology` … | all present | facility counts: `obstetrics` 4,537 · `cardiology` 3,024 · `nephrology` 2,229 · `neonatology` 1,303 · `cardiothoracicSurgery` 771 |

`silver_pincode_directory` has the columns `pincode`, `statename`, `latitude`, `longitude`, `district`, `districts`, `n_post_offices`, `n_coord_points` and `is_primary_state`. Only rows with `is_primary_state` are used.

## Adaptations to the plan

### Method decisions where the documents were silent, ambiguous or in conflict

1. **Build order: evidence (§4 step 7) is built before Depth (step 5).** R3 needs to know whether a facility has a direct claim or a specialty code *for the service being scored*, and only the evidence step knows that. Nothing else changes.
2. **X2 in E.** The equipment phrase *removed before the direct test* (SCORING §3.2 step 4) stays the old adjacent phrase, e.g. "dialysis machines". The X2 quantity patterns go into the **corroboration equipment** pattern and S1 only. If X2 were also stripped, Vidya's "dialysis services with 10 units" would lose its direct claim, and R2 assumes it keeps it.
3. **X2 reverse pattern** allows a hyphen: `\d+\s*-?\s*(bedded\s*)?…`, so "10-bedded dialysis" matches.
4. **X4 block list** uses word boundaries and plurals: `\b(pharmacy|nursing|opd|lab|laborator(y|ies)|diagnostics?|ambulances?|chemists?|canteen)\b`. With a plain substring, `lab` would block "24x7 **lab**our room". X4 terms are stored as two rows with `clause_ctx_rx` and `clause_block_rx`.
5. **X5 and G4.** "intensive critical care" was added to the G4 `icu` pattern so that F10 holds ("G4 found"). The old pattern `intensive care` doesn't match it.
6. **R5 clinic hours.** The time pattern accepts minutes, e.g. "10:00 am to 1:00 pm". The caveat is shown only for the time-critical services (C-section, NICU, trauma), where emergency cover matters.
7. **"Quantity" specificity (×1.2, +10 points)** now needs a number attached to a count or size word: beds, units, machines, stations, chairs, slices, T or tesla, OT, rooms, ventilators, cots, or "N dialysis". The teammate's script counted any digit, so "24-hour", "24x7" and "60,000 sessions" earned the bonus.
8. **Equipment corroboration** is read from non-negated clauses only. The teammate's script also counted negated ones, e.g. "MRI outsourced".
9. **NICU.** SNCU and "Level II/III" count as corroboration (SCORING calls them "supporting"). The Strong rule still needs S4 neonatal equipment in a neonatal context.
10. **R1 evidence in `why`.** For a C-section result, the emergency-readiness quote is shown second, so the user can see why the result is Strong.
11. **Gate.** The minimum label per service follows SCORING §4.2. FEATURES §4.7's simplified `size(prerequisites_missing) = 0` is not used.
12. **"Possible"** needs a specialty code or service equipment. Otherwise the internal label is `No evidence`, which is never shown. Not offered is never ranked.
13. **Specialty quote.** `why` quotes the **raw** specialties item, e.g. `gynecologyAndObstetrics`, rather than silver's standardised code. The bench checks quotes as substrings of the raw field, and the code itself may not appear there. An exact match is preferred.
14. **Nephrology code.** `pediatricNephrology` does **not** count as the nephrology code. SCORING lists `nephrology` only; the teammate's script also counted it.
15. **Distance.**
    - `distance_km` = 1.4 × great-circle distance.
    - For approximate (PIN-centre) facilities, Access A uses `distance_km + PIN radius` (SCORING §4.1).
    - The PIN radius is the 90th percentile of post-office distances from the PIN centre, from bronze, clipped to 1–30 km. It defaults to 5 km. It is also returned as `distance_uncertainty_km`.
    - Radius steps (25 → 50 → 100 → 250 → max) are applied to `distance_km`.
16. **Location resolution.**
    - Order: `lat,lon` → 6-digit PIN → name, with an optional `", State"` suffix.
    - A name matching districts or cities in more than one state returns `clarification`.
    - A state counts for a *city* only if it holds ≥ 2 facilities and ≥ 5% of that city's facilities. This stops one stray record from making every city ambiguous.
    - Within one state, a city with ≥ 3 facilities uses the median of those facilities; otherwise the district centroid is used.
    - **Small-town fallback (added after the eval bench run).**
      - *Problem:* if neither rule above matches, 4 of the bench's 72 ranking requests ("Tiuni", "Palsana", "Ramgarh Bhullar", "Kayamkulam") returned an error.
      - *Fallback:* the name is now matched against **any** located facility with that city name, including PIN-centre locations.
      - One state → resolve to the median of those facilities, labelled "approximate". Several states → `clarification`.
      - *Verified:* 12/12 fixtures, 4/4 pilot checks, 14/14 smoke queries unchanged. See `evaluation/EVAL_RESULTS.md`.
17. **Confidence** is precomputed in `gold_service_scores`, because every input to it is facility-level.
18. **Ties** are broken by rank score, then label, then distance, then ID.
19. **Truncated records** get the caveat "Some lists … were cut off at 50 items". Unmet checked prerequisites show "(not reported, list cut off)" in `not_reported`.

### Adaptations forced by the real data (runs 2–5)

20. **City names come from bronze.** Silver has no city column. Without one, "Guwahati" returned *We couldn't find*: the city isn't a district name, since its district is Kamrup Metropolitan.
    - The clean view now LEFT JOINs `max(address_city)` from `bronze_facilities`, grouped by `unique_id`. Bronze has 11 duplicate IDs.
    - City resolution then works as SCORING §4.3 describes: the median of that city's facilities with exact locations.
21. **District centre uses the median, not the mean.** Patna's 68 PIN points include stray ones, one at latitude 20.3. The mean landed about 35 km from the city, so every C-section result read "~38 km".
22. **PIN coordinate guard.** In the team's `silver_pincode_directory`, 19 of the 25 Aurangabad (Bihar) PIN points sit in Aurangabad, Maharashtra, about 1,000 km away. This looks like geocoding by district name. As a result, "Aurangabad, Bihar" returned Maharashtra hospitals.
    - **The rule:** a PIN point more than **300 km** from the median of its 3-digit PIN prefix is treated as an outlier. That flags 206 of 19,586 points.
    - **Facility locations:** an approximate location at an outlier PIN becomes `unknown`.
    - **District centres:** outlier PINs are excluded.
    - **A typed outlier PIN** resolves to its prefix's median and is labelled approximate.
    - **The input table is not modified.**
    - **Why 300 km:** at 150 km the guard also flagged real far-flung PINs, such as Car Nicobar at 277 km from the 744 median.
    - **Result:** "Aurangabad, Bihar" now centres at about 24.9 N, 84.4 E and correctly returns the fallback.
23. **`find_care_sql` radius step.** Databricks rejected `min(CASE WHEN n >= k …)`, with the error UNSUPPORTED_SUBQUERY_EXPRESSION_CATEGORY: an aggregate in a correlated predicate that mixes the outer parameter `k` with local columns. It is rewritten as `ORDER BY … LIMIT 1` with the same semantics: the smallest step with ≥ k results, else the largest step. `split(...)[1]` became `get(split(...), 1)` for ANSI. The SQL output matches the Python `find_care` for dialysis at 492001.
24. **Record-contamination caveat.** Silver flags some records as possibly containing another facility's text:
    - `flag_capability_mentions_other_facility`;
    - `flag_description_other_state`.

    The plan has no rule for these flags; it assumes clean data, with no trust multiplier. They now add one caveat: *"This record may include text from another facility (…). Call to confirm."* They **do not** change the score, label or rank.
25. **Website reference** comes from `clean_website` (see the input contract above).

## Regression fixtures (PLAN_V5 §6)

**On Databricks: 12/12 pass in every run.** The fixtures go through the same SQL (claims → hits → features) and the same Python evidence function as the full build. The notebook stops if any fixture fails. No fixture contradicted the record text, so no pattern was bent to pass.

| Case | Result | Case | Result |
|---|---|---|---|
| F1 cardiac bypass → direct | PASS | F7 "24/7 emergency care" → G5 | PASS |
| F2 gastric bypass → not direct | PASS | F8 "emergency and elective services" → G5 | PASS |
| F3 "…with 10 units" → S1, qty 10 | PASS | F9 "cardiac care" → not S6 | PASS |
| F4 Non-NABH → not G10 | PASS | F10 ICCU expanded → G4, not S6 | PASS |
| F5 / F6 24x7 nursing / pharmacy → not G5 | PASS | F11 "Dialysis not available" → negated | PASS |
| | | F12 duplicated clause → one claim | PASS |

## End-to-end pilot (15 Raipur facilities, README queries)

**On Databricks, with the real silver rows and codes: all 4 checks pass.** The rankings match the local run.

| Query | Top results (label/confidence, score) | Check |
|---|---|---|
| Q1 dialysis | 1. CARE (Strong/High 86.0) · 2. Vidya (Strong/High 80.4) · 3. Shri Krishna (Moderate/Medium 79.1) · 4. Suyash 76.4 · 5. MMI 75.8 | ✓ top 3 = {CARE, Vidya, Shri Krishna} |
| Q2 C-section | 1. **SMC** (Moderate/Medium 69.9) · 2. Kanwar (Strong/High 67.9) · 3. Devi (Strong/High 64.5) · 4. Tiwari (Moderate 59.2) | ✓ Devi and Kanwar in top 3 · ✓ Strong present |
| Q3 cardiac | 1. Suyash (Strong/High 85.9) · 2. CARE (Strong/Medium 78.8) · 3. MMI (Moderate/Low 70.3) · 4. SMC 57.3 | ✓ Suyash and CARE in top 2 |

**Eval bench on the same 3 queries** (`eval_bench/bench.py`, pilot references, k = 5, local run; the rankings are identical on Databricks):

| System | NDCG@5 | Kendall τ-b | Quote validity | No Possible on time-critical |
|---|---|---|---|---|
| **method (v5)** | **0.917** (dialysis 0.976 · C-section 0.794 · cardiac 0.979) | 0.696 | 1.000 | 1.000 |
| B0 keyword, nearest | 0.806 | 0.605 | 1.000 | 1.000 |
| B1 keyword count | 0.838 (C-section **0.872**) | 0.616 | 1.000 | 1.000 |
| B2 largest nearby | 0.725 | 0.438 | 0.467 | 0.000 |

These are 3 in-sample queries whose references were model-judged, so they are directional only.

## Smoke tests (Databricks, final run, all logged to `gold_query_log`)

| # | Service | Location | Case | Resolved as | Outcome (top 3) | Time |
|---|---|---|---|---|---|---|
| 1 | dialysis | 492001 | urban PIN, recurring | PIN 492001 (Raipur, Chhattisgarh), radius 25 km | 1. Hospitales CARE, Raipur ~3.8 km · STRONG/High · 2. Shri Krishna Hospital ~3.6 km · MODERATE/Medium · 3. Vidya Hospital and Kidney Centre ~4.0 km · STRONG/High | 1.65 s |
| 2 | emergency_csection | Patna | city, time-critical | Patna city, Bihar (centre of 129 listed facilities), radius 25 km | 1. Shrinivas Hospital ~0.8 km · STRONG/High · 2. Medizone Hospitals ~0.7 km · STRONG/High · 3. Ruban Memorial Hospital ~6.0 km · STRONG/High | 1.41 s |
| 3 | nicu | 110001 | metro PIN, time-critical | PIN 110001 (New Delhi, Delhi), radius 25 km | 1. Aravind Eye Hospital ~5.2 km · MODERATE/Low · 2. Triton Hospital ~10.3 km · MODERATE/Medium · 3. Orchid Hospital ~18.2 km · STRONG/High | 1.93 s |
| 4 | trauma | Barmer | rural district, time-critical | Barmer district, Rajasthan (centre of 28 PIN areas), radius 100 km | 1. Jeevan Jeewana Hospital ~98.8 km · STRONG/High | 2.07 s |
| 5 | cardiac_surgery | Chennai | city, travel-worthy | Chennai city, Tamil Nadu (centre of 272 listed facilities), radius 25 km | 1. MGM Healthcare ~3.0 km · STRONG/High · 2. Medway Heart Institute ~0.1 km · STRONG/High · 3. Gleneagles Clinic, Adyar, Chennai ~7.6 km · STRONG/Medium | 1.5 s |
| 6 | mri | Jalandhar | city, non-critical | Jalandhar city, Punjab (centre of 69 listed facilities), radius 50 km | 1. NHS Hospital ~3.6 km · STRONG/High · 2. SGL Super Speciality Charitable Hospital ~3.9 km · STRONG/High · 3. Shrimann Superspeciality Hospital ~8.0 km · STRONG/High | 1.96 s |
| 7 | oncology | Guwahati | north-east city | Guwahati city, Assam (centre of 45 listed facilities), radius 25 km | 1. Govt. Homoeo Medical College Hospital (Guwahati, Nowgong, Jorhat) ~0.9 km · STRONG/High · 2. Hayat Hospital ~5.1 km · STRONG/High · 3. Dr. Bhubaneswar Borooah Cancer Institute (BBCI), Guwahati, Assam ~3.9 km · STRONG/High | 2.62 s |
| 8 | ent | 26.85,80.95 | lat,lon (Lucknow) | 26.8500, 80.9500, radius 25 km | 1. Charak Hospital ~11.5 km · MODERATE/Medium · 2. Charak Hospital And Research Centre ~11.5 km · MODERATE/Medium · 3. Tender Palm Super Specialty Hospital ~10.9 km · MODERATE/Medium (+ stronger-evidence row) | 2.67 s |
| 9 | burn_care | Bhopal | beta service | Bhopal city, Madhya Pradesh (centre of 74 listed facilities), radius 400 km | 1. Tender Care Hospital ~2.5 km · MODERATE/Medium · 2. Narmada Apna Hospital, Hoshangabad ~90.1 km · MODERATE/Medium · 3. C. R. Gardi Hospital ~236.1 km · MODERATE/Medium (+ unconfirmed options) | 2.61 s |
| 10 | dialysis | Dantewada | rural district (tribal Chhattisgarh) | Dantewada district, Chhattisgarh (centre of 5 PIN areas), radius 150 km | **fallback**; nearest documented: Apollo Hospitals - Kakinada, about 308 km away (road estimate) | 1.93 s |
| 11 | trauma | 744301 | care-desert candidate (Car Nicobar PIN) | PIN 744301 (Nicobars, Andaman And Nicobar Islands), radius 100 km | **fallback**; nearest documented: Supreme Speciality Hospitals, about 1958 km away (road estimate) | 1.52 s |
| 12 | emergency_csection | Aurangabad | ambiguous city (Maharashtra / Bihar) | — | **clarification**: Aurangabad, Bihar / Aurangabad, Maharashtra | 1.78 s |
| 13 | nicu | Bilaspur | ambiguous city (Chhattisgarh / Himachal) | — | **clarification**: Bilaspur, Chhattisgarh / Bilaspur, Himachal Pradesh | 2.32 s |
| 14 | emergency_csection | Aurangabad, Bihar | disambiguated | Aurangabad district, Bihar (centre of 6 PIN areas), radius 100 km | **fallback**; nearest documented: Sanjeevan Sparsh Hospital, about 136 km away (road estimate) | 1.52 s |

What these show:
- **Location kinds:** PIN, district, city and `lat,lon` all resolve.
- **Ambiguity:** both ambiguous names return `clarification`, and the state suffix resolves them.
- **Care deserts:** three queries get a fallback naming the nearest documented facility (Dantewada dialysis, Car Nicobar trauma, Aurangabad (Bihar) C-section). Barmer trauma has one result, at 99 km.
- **Extra rows:** the ENT query shows the `stronger_evidence` row, and the burn-care query shows `unconfirmed_options`.

Full rendered text for every query is in `run_summary.json` → `smoke`.

## Label and tier counts per service (all 10,077 facilities)

| Service | Strong | Moderate | Weak | Possible | Not offered | No evidence | Pass gate | High | Medium | Low | Median D | Avg coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| burn_care | 3 | 66 | 11 | 116 | 0 | 9881 | 69 | 3 | 48 | 18 | 7.5 | 0.79 |
| cardiac_surgery | 153 | 331 | 17 | 640 | 0 | 8936 | 484 | 121 | 208 | 155 | 5.0 | 0.78 |
| dialysis | 280 | 677 | 74 | 1390 | 2 | 7654 | 957 | 239 | 549 | 169 | 30.0 | 0.75 |
| emergency_csection | 179 | 257 | 4 | 4846 | 2 | 4789 | 436 | 137 | 239 | 60 | 17.0 | 0.82 |
| ent | 93 | 1382 | 95 | 1412 | 0 | 7095 | 1570 | 54 | 1068 | 448 | 22.5 | 0.61 |
| mri | 612 | 262 | 66 | 2426 | 7 | 6704 | 940 | 505 | 378 | 57 | 0.0 | 0.85 |
| nicu | 81 | 585 | 30 | 880 | 1 | 8500 | 666 | 71 | 474 | 121 | 12.0 | 0.77 |
| oncology | 204 | 1193 | 182 | 920 | 2 | 7576 | 1397 | 170 | 822 | 405 | 5.0 | 0.79 |
| trauma | 200 | 717 | 31 | 2528 | 3 | 6598 | 917 | 175 | 559 | 183 | 12.9 | 0.8 |

How to read the table:
- **"Pass gate"** counts facilities eligible to appear as a ranked result. Its split by confidence is High / Medium / Low.
- **"No evidence"** is internal and never shown.
- **The high Possible count for C-section** (4,846) comes from the `obstetrics` code on 4,537 facilities. Possible results never appear for time-critical queries; they go only into `unconfirmed_options`.
- **Burn care** has only 3 Strong facilities nationally, so it stays labelled beta.

## Runtime (serverless, final run)

The full build plus all tests took **175 s inside the notebook**, or 203 s wall clock including job start-up. Runs 3–5 took 161–175 s. The first run was 256 s, which included a cold start.

| Step | s |
|---|---|
| silver_facility_clean | 4.0 |
| silver_facility_location | 4.0 |
| silver_claims (405,759 clauses) | 5.6 |
| reference tables | 15.0 |
| silver_feature_hits | 26.2 |
| gold_facility_features | 6.5 |
| gold_facility_completeness | 3.1 |
| gold_service_evidence (mapInPandas, 90,693 cells) | 11.5 |
| gold_service_depth | 5.6 |
| gold_service_scores | 4.3 |

The rest of the time goes to fixtures, the pilot, 14 smoke queries, label counts and environment checks.

**Query time:** 1.2–2.3 s per `find_care` call. Most of that is the first `toPandas` of a service's scores and the log write. The SQL function returns in about 1 s on the warehouse.

## Challenge brief, official output format, and `ai_query`

- **No challenge brief or official output format was found** anywhere in the workspace.
  - The only volume, `workspace.hackathon.reference_files`, holds `specialty_mapping.json` alone.
  - No path under `/Workspace/Shared` matched brief, readme, challenge, format, submission or rubric.
  - The local project folders have nothing either.

  PLAN_V5 §5 therefore stays the contract, and nothing needed aligning.
- **`ai_query`** is available on this Free Edition workspace. The function is registered, and a test call to `databricks-meta-llama-3-3-70b-instruct` returned "OK".
- **The LLM second reader (PLAN_V5 §3) stays off.** Nothing in the pipeline calls an LLM.

## Open issues

1. **C-section ranking.** SMC, a heart and IVF clinic whose C-section claim is only Moderate, still ranks #1 on distance in the pilot, above two Strong maternity facilities. R4's weights don't prevent this, which is why the method's C-section NDCG is 0.794 against B1's 0.872. The weights are marked *tune* and should be tuned on the bench's tuning split.
2. **Contaminated records rank high.** These are data issues: the method quotes the record faithfully.
   - **Aravind Eye Hospital, New Delhi** ranks **#1 for NICU at 110001**. It is Moderate with Low confidence, on the record's own text "10-bed Neonatal Intensive Care Unit (NICU)". Silver flags this record for mentioning another facility, naming another state and a specialty mismatch, so it now carries the contamination caveat (adaptation 24). Confidence doesn't enter the rank score (SCORING §2), so it still ranks first.
   - **"Govt. Homoeo Medical College Hospital (Guwahati, Nowgong, Jorhat)"** ranks #1 for oncology in Guwahati. It is Strong/High, citing "Performs high-dose-rate brachytherapy using cobalt-60". Silver doesn't flag it, so it carries no caveat.

   **Decision for the team:** should silver's contamination flags, or a name-type mismatch (G15 `eye`, homoeopathy), lower the label or confidence? Changing that is a method change, so I left it out.
3. **R3 and AIIMS.** R3 doesn't lower AIIMS's dialysis Depth when AIIMS carries a nephrology code: its truncated S1 still counts 0.5. This only affects ranking among Possible results.
4. **Pattern gaps and overmatches, unchanged from the spec:**
   - "C section" without a hyphen isn't a C-section direct term.
   - `\bct\b` and `\bot\b` overmatch.
   - The X2 reverse pattern can read "100 beds, ICU and dialysis" as 100 dialysis units.
5. **PIN guard limits.**
   - The 300 km prefix rule won't catch a wrong point that lies within 300 km of its prefix median.
   - A typed outlier PIN is placed at its prefix's centre, which may be tens of km off. The label says "approximate".
   - The PIN directory should be fixed upstream. It is team-owned, so I didn't touch it.
6. **Facility names with addresses.** Some silver names include the full address, e.g. "Healing Touch … 1 B Golden Avenue Phase 2 Jalandhar City". They are shown as-is.
7. **Log duplicates.** See the note for the bench at the top.
