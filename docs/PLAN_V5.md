# Plan v5: fixes from the LLM-vs-regex pilot, and the build spec

> Status: **v5, 2026-11-21.** This file **overrides** [FEATURES.md](FEATURES.md) and [SCORING.md](SCORING.md) (both v4) where they conflict. Everything not mentioned here stays as written there. [METHODOLOGY.md](METHODOLOGY.md) is the plain-English summary.
>
> Sources: three independent reviews (Grok 4.7, Claude Opus 5.5, GPT-6.2 Sol) of the 15-facility Raipur pilot (branches `experiment/llm-vs-regex`, `experiment/regex-arm`). All three reached the same verdict: the LLM read slightly better, but **every LLM win has a cheap regex fix**. They recommended **patched regex for all ~10k facilities, plus an optional LLM second reader on borderline cells**. Several **spec problems hurt both methods equally** and matter more than which extractor is used.

---

## 0. What the pilot actually showed (corrected numbers)

| Claim in v4 | Corrected |
|---|---|
| 517/525 values agree (98.5%) | **516/525.** About 70% of cells are structured fields or blank in both arms, so they can't disagree. On cells that needed reading the text, agreement is **92–94%** (93/101 where either arm found something) |
| LLM right 6, debatable 2, regex right 0 | All three reviewers confirmed there were **no clear regex wins**. Opus found **one more score-changing disagreement**: the regex counted MMI's "largest dialysis centre" twice, because the description repeats a list item (MMI #3 → #5 for dialysis) |
| Top-3 changes | Two changes affected patients. **Q3:** the regex missed Suyash's "Performs cardiac bypass surgery" (it should be #1; the regex rated it Possible). **Q1:** the regex missed Vidya's "dialysis services with 10 units" (it should be #2). Q2 was identical |

---

## 1. Extraction fixes (regex), changes X1–X7

Each fix comes with **regression fixtures** (§6). Patterns use Spark/Java regex and are applied to lower-cased clause text.

| # | What | Old | New | Fixture (must pass) |
|---|---|---|---|---|
| **X1** | Cardiac surgery direct terms (SCORING §3.1) | `\bcabg\b\|coronary (artery )?bypass\|open[- ]heart\|valve (replacement\|repair)\|cardiac surg\|cardiothoracic surg` | Add `(cardiac\|heart) bypass`, and plain `bypass surgery` when the **same item** matches `cardi\|heart\|coronary\|cabg\|cath` **or** the facility has the `cardiothoracicSurgery` or `cardiology` code. The exclusion `gastric\|bariatric\|obesity\|weight loss\|roux` (same clause) still applies | ✓ "Performs cardiac bypass surgery in the Cardiac Cath Lab" · ✓ "Heart bypass surgery is performed" · ✗ "Laparoscopic gastric bypass surgery" |
| **X2** | Dialysis equipment and quantity (FEATURES S1 `rx` + `num_rx`; SCORING dialysis `equip_rx`) | adjacent phrase only, `dialysis (machines?\|units?…)` | Also `dialys[^.;]{0,40}?\b(\d+)\s*(units?\|machines?\|beds?\|stations?\|chairs?)\b` and the reverse `\b(\d+)\s*(bedded\s*)?(units?\|machines?\|beds?\|stations?\|chairs?)\b[^.;]{0,30}?dialys`. Put the **same pattern into SCORING's `equip_rx`**, so it also earns the equipment corroboration point | ✓ "24-hour dialysis services with 10 units" → S1 found, qty 10 · ✗ "60,000 dialysis sessions" (no unit word) |
| **X3** | Negation (FEATURES §4.2) | phrase list | Add a `non-` prefix: `\bnon[- ]?(nabh\|jci\|nabl\|accredited\|functional\|operational)`. Treat `(non-functional)` or `(non functional)` after an item as negated | ✓ "Non-NABH accreditation" → G10 not found · ✓ "Bronchoscopy room (non-functional)" → negated |
| **X4** | G5 `emergency_24x7` (FEATURES §4.3) | `24x7\|24/7\|24 hours\|round the clock\|emergency (department\|services\|care\|ward)\|casualty` | **Count** `emergency (and [a-z]+ )?(department\|services?\|care\|ward\|unit\|room)`, `casualty`, `accident (and\|&) emergency`, `trauma (care\|centre\|center)`. **Count** `24\s*x\s*7\|24/7\|24 hours\|round[- ]the[- ]clock` **only if the same clause** also matches `emergenc\|casualty\|trauma\|labou?r\|deliver`. **Never count** clauses where 24×7 sits next to `pharmacy\|nursing\|opd\|lab\|laborator\|diagnostic\|ambulance\|chemist\|canteen` | ✓ "Offers 24/7 emergency care" · ✓ "Offers emergency and elective services" · ✗ "24x7 nursing" · ✗ "24x7 Pharmacy" · ✗ "Open 24 hours" |
| **X5** | S6 `ccu` (FEATURES §4.3) | `\bccu\b\|\biccu\b\|cardiac (care\|intensive)` | `\bccu\b\|\biccu\b\|coronary care\|cardiac (intensive\|critical) care\|\bcicu\b\|\bcticu\b`. Drop plain `cardiac care`. If the same clause **expands** ICCU to a non-coronary name (`intensive critical care unit`), it counts as **G4 ICU, not S6** | ✗ "Heart Institute for cardiac care" · ✗ "Intensive Critical Care Unit (ICCU)" → G4 only · ✓ "10-bed ICCU" |
| **X6** | Deduplicate at **clause** level (SCORING §3.2 step 6) | grouped by whole-item `norm_item` | Group claims by **normalised clause text**, with `regexp_replace(lower(clause),'[^a-z0-9]','')`. A clause that is a substring of an already-kept clause of the same facility is a duplicate. "Second distinct claim" (corroboration) needs a **different** normalised clause | ✓ MMI "largest dialysis centre" in the description plus the same clause in capability → counted once |
| **X7** | Specialty-tag hits as weak presence | — | No change in weights. Add `cardiology` as a **supporting** code for cardiac surgery (it raises nothing alone; it lets X1's plain "bypass surgery" count) | — |

**Not adopted:**
- "Dialysis facilit(y|ies)" as S1 equipment. Kanha's "Dialysis facilities" stays a **direct service claim** (it already matches `dialys`), not equipment. The reviewers split on this.
- Changing the meaning of bare "24x7" for wards. X4 covers this.

---

## 2. Scoring and spec fixes (they affect both extractors), changes R1–R6

| # | Problem found | Fix |
|---|---|---|
| **R1** | **No facility can be Strong for emergency C-section.** The "emergency readiness in the **same item**" rule failed on all 4 claimants, including Devi ("Offers 24/7 emergency care" in a separate item) | New Strong rule for `emergency_csection`: a positive direct claim **and** G5 found at facility level (X4 version, from a text hit, not only the specialty tag) **and** one of: S2 labour room · G7 OT · an `obstetrics` or `maternalFetalMedicine` code · `name_type = maternity`. If G5 is missing, the cell is at most Moderate, with the caveat "emergency readiness not confirmed" |
| **R2** | **A description-only claim can never be Strong**, even when specific. Vidya ("dialysis services with 10 units", a kidney centre) is stuck at Moderate | Row 4 of SCORING §3.4 now reads: a direct claim in `procedure`/`equipment` **or** (a `description`/`capability` claim with specificity = quantity **and** the matching specialist `name_type`, e.g. `nephrology_dialysis` for dialysis). Everything else is unchanged |
| **R3** | **Truncation half-credit inflates Depth.** AIIMS, with no dialysis text, gets a higher dialysis D than Shri Krishna, which lists dialysis | In D, a `truncated` **service-specific** feature (S1–S12) counts **0.5 only if the facility has a direct claim or a specialty code for that service**; otherwise it counts **0**. General features (G*) keep 0.5. Coverage still counts truncated as unknown |
| **R4** | **For C-section, distance alone decides.** A 2-doctor heart and IVF clinic (SMC) outranks a maternity hospital (Devi) | Add feature **G16 `obstetric_focus`**: `name_type = maternity` → 1.0 · `obstetrics`/`maternalFetalMedicine` code → 0.6 · else 0. C-section D weights become: labour_room .10 · nicu .10 · emergency_24x7 .15 · ot .15 · blood_bank .15 · accreditation .05 · beds .10 · **obstetric_focus .20** (sum 1.0). The C-section profile becomes **wE .35 · wD .20 · wA .45 · d_half 20 km** *(tune with the eval bench, §7)* |
| **R5** | Tiwari passes the emergency gate on "Open 24 hours", although its description gives afternoon clinic hours | Fixed by X4. Also add `opd timings?\|clinic hours?\|\d{1,2}\s*(am\|pm)\s*(to\|-)\s*\d{1,2}\s*(am\|pm)` as a **conflict note**: if both a G5 hit and a timings clause exist, keep G5 but add the caveat "record also lists clinic hours: call to confirm emergency cover" |
| **R6** | Inconsistent radii: FEATURES §4.8 `ref_service_profile` (75/100/… km) vs SCORING §4.2 (100/150/… km) | **SCORING §4.2 is authoritative**, with R4's C-section change. Rebuild `ref_service_profile` from it |

---

## 3. Optional LLM second reader (phase 2, off by default)

Use the LLM **only** on borderline cells, and send it **clauses, not whole records**. Use `ai_query` on Databricks if Free Edition allows it, otherwise skip this phase.
- **Triggers** (a cell is sent if any one holds):
  - a specialty code with no direct claim;
  - a service word within 40 characters of a number;
  - a hit from an at-risk pattern (`24x7`, `bypass`, `iccu`, `non-`, `facilit`);
  - a cell that is about to enter the top-k of a query.
- **Contract:** the LLM may only flip a cell between found and not found, and only by returning a **verbatim clause** from the input, which is checked as a substring. Every flip is logged in `gold_llm_adjudications(unique_id, service_or_feature, before, after, clause, model, ts)`. Ranking reads the adjudicated value if present.
- **Budget:** about 5% of cells, roughly 3 serial hours at the pilot's speed. Never block the main pipeline on it.

---

## 4. Build spec (Databricks Free Edition)

**Inputs (team-owned, never modify):**
- `workspace.hackathon.silver_facilities` (10,077 rows; `clean_*` and `flag_*`)
- `workspace.hackathon.silver_pincode_directory` (use `is_primary_state`)
- `workspace.hackathon.ref_specialty_mapping`
- `bronze_*` tables: read-only

**Outputs:** tables in `workspace.hackathon`. Before creating a table, check whether it already exists. **If someone else created it, don't overwrite it; write `<name>_v5` instead.**

| Step | Object | Spec |
|---|---|---|
| 1 | `silver_facility_clean`, `silver_facility_location` | FEATURES v4 §4.1 (M1, M7, M8, name_type) |
| 2 | `silver_claims` | FEATURES §4.2, plus X3 negation and the **clause-level dedup key** (X6) |
| 3 | `ref_feature_terms`, `ref_feature_context`, `ref_feature_specialty`, `ref_service_direct` | FEATURES §4.3 and SCORING §3.1, with X1, X2, X4, X5, X7 applied |
| 4 | `silver_feature_hits`, `gold_facility_features` | FEATURES §4.4–4.5, plus G16 (R4) and the R3 truncation rule |
| 5 | `gold_service_depth` | FEATURES §4.6 with v5 weights (R4) |
| 6 | `gold_facility_completeness` | SCORING §2 |
| 7 | `gold_service_evidence` | SCORING §3.2–3.4 with X6, R1 and R2. Columns as in SCORING §6, plus `strong_rule_met`, `strong_rule_missing` |
| 8 | `gold_service_scores` | FEATURES §4.7 |
| 9 | `ref_service_profile` | SCORING §4.2, plus R4 and R6 |
| 10 | `find_care(service, location, k)` | Query time. See §5 |

**Location input** (SCORING §4.3 step 1). Accept:
- a 6-digit **PIN** (looked up in `silver_pincode_directory`);
- a **district** (centroid of its PINs);
- a **city** (median of that city's facilities);
- **"lat,lon"**.

If a name matches more than one state, return a disambiguation list instead of results. Radius schedule: 25 → 50 → 100 → 250 km → the service maximum, stopping when k results pass the gate.

**Regression fixtures** (§6) run as the notebook's **first cell after the reference tables**. The build stops if any fixture fails.

---

## 5. Output contract (what `find_care` returns)

This contract is shared with the evaluation bench (§7). **Don't change it without updating both.**

**Request:** `{service, location, k=5}`. `service` is one of `dialysis, emergency_csection, nicu, cardiac_surgery, mri, trauma, burn_care, oncology, ent`.

**Response:**

```
query:      service, location_input, resolved_location {lat, lon, method: pin|district|city|latlon, label}, radius_km_used
how_ranked: one plain sentence (SCORING §4.5)
results:    [ {
  rank, unique_id, name, facility_type,
  distance_km (road est. = 1.4 × straight line), distance_uncertainty_km (PIN radius if approximate, else 0),
  evidence_label (Strong|Moderate|Weak|Possible), confidence (High|Medium|Low),
  rank_score, E, D, A,
  why:            [ {field, quote} ]   -- verbatim, 1–4 items; first = primary claim
  caveats:        [ text ]             -- conflicting, readiness not confirmed, list cut off, approximate location…
  not_reported:   [ text ]             -- missing fields + unmet *checked* prerequisites
  contact:        official_phone, references: [url] (max 3; facility references, not quote sources)
} ]
extra_rows: optional "Stronger documented evidence, X km away" · optional "Unconfirmed options" (Possible; never for time-critical)
fallback:   message when nothing passes the gate within the max radius (care desert)
```

Persist every response to `gold_query_log(query_id, ts, request_json, response_json)` so the evaluation bench can score it.

**What the user sees**, rendered from the response:

```
1. Hospitales CARE, Raipur          ~4 km (road est.) · Dialysis: STRONG · Confidence: High
   Why:  ✓ Virtue Foundation record, procedure: "Dialysis treatment is provided using 25 dialysis machines."
         ✓ Virtue Foundation record, specialties: nephrology
   Not reported: ? number of doctors
   Score: Evidence 90 · Capability 88 · Access 83     Call to confirm: +91 …
```

Confidence and capability are shown as words, never as percentages.

---

## 6. Regression fixtures (from the pilot, must pass)

Store them as `ref_regression_fixtures(case_id, text, field, target, expected)` and assert them in the notebook.

| case | text (field) | target | expected |
|---|---|---|---|
| F1 | "Performs cardiac bypass surgery in the Cardiac Cath Lab" (procedure) | cardiac direct | found |
| F2 | "Laparoscopic gastric bypass surgery" (procedure) | cardiac direct | not found |
| F3 | "24-hour dialysis services with 10 units" (description) | S1 | found, qty 10 |
| F4 | "Non-NABH accreditation" (capability) | G10 | not found |
| F5 | "24x7 nursing" (capability) | G5 | not found |
| F6 | "24x7 Pharmacy" (capability) | G5 | not found |
| F7 | "Offers 24/7 emergency care" (capability) | G5 | found |
| F8 | "Offers emergency and elective services" (capability) | G5 | found |
| F9 | "Heart Institute for cardiac care" (description) | S6 | not found |
| F10 | "Intensive Critical Care Unit (ICCU)" (capability) | S6 / G4 | S6 not found, G4 found |
| F11 | "Dialysis not available" (capability) | dialysis direct | negated |
| F12 | the same dialysis clause in both description and capability | dialysis second_claim | no (deduplicated) |

**End-to-end pilot fixture:** run `find_care` for the three README queries over the 15 pilot facilities only. The expected top 3 are:
- **Q1:** CARE, Vidya and Shri Krishna, in any order.
- **Q3:** Suyash and CARE in the top 2.
- **Q2:** Devi and Kanwar in the top 3, with at least one C-section result Strong.

---

## 7. Evaluation (replaces SCORING §7's run order; the experiments E1–E9 stay)

1. **Synthetic evaluation bench** (built separately, from the real silver data). Query → ranked-list pairs with graded relevance. It scores `gold_query_log` responses using:
   - NDCG@5 and Kendall τ;
   - Strong precision;
   - time-critical safety (no Possible results);
   - quote validity;
   - metamorphic checks (moving the user moves the results; a negated claim drops the facility; the same input gives the same output).
2. **Tune R4's C-section weights and every *(tune)* value on the bench's tuning split only**, and report on its held-out split.
3. **Human grades** on a held-out city (about 50 facilities): two blind graders, then the README decision rule (LLM second reader worth it if NDCG@5 improves by at least 0.10 on 2 of 3 queries, with zero bad quotes).

---

## 8. Changelog

| v | Change |
|---|---|
| v4 | Silver-table input, M8, standardised specialty codes |
| **v5** | X1–X7 regex fixes · R1 C-section Strong rule · R2 description + quantity + specialist Strong · R3 truncation half-credit only with service evidence · R4 G16 obstetric_focus + C-section weights · R5 clinic-hours caveat · R6 one source of truth for radii · optional LLM second reader · output contract · regression fixtures · corrected pilot numbers |
