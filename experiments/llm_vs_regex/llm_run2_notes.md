# LLM extraction — run 2 notes

## Run facts
- **Model:** `claude-opus-5-5` (Claude Opus 5.5), running as a Claude Code sub-agent. No temperature control is available in this harness, so treat it as the default sampling temperature, not temperature 0.
- **Start:** 2026-11-21 18:54:38 EST (brief opened). **CSVs written:** 18:59:47 EST. **Notes finished:** 19:00:38 EST.
- **Time per facility:** about 5 min 10 s of wall clock for 15 facilities, so **≈ 21 s per facility** (reading the docs, reading all 15 records, judging, writing data, checking quotes). Reading the docs takes a fixed share of that, so the marginal cost per facility is lower.
- **Input:** `facilities_15.json` only. No web, no Databricks query, no outside knowledge. I did not open any other run's files or `archive_v4_grid_fill/`.
- **Method:** I printed each record in full (all list items, indexed) and judged every feature and service by hand. The judgments were typed into a Python data file, which a script wrote out with `csv`. No values, E, D or ranks were computed.

## Quote check
- **First-pass quote failures: 0 / 173.** (173 = 98 feature quotes for `found`/`negated` + 75 evidence quotes: direct, second, service-equipment and prerequisite quotes.)
- **Final quote failures: 0 / 173.** I re-checked by reading the written CSVs back, not only the source data.
- Check rule: `quote.strip()` must be a case-sensitive substring of one item of the named field (for `description`, of the description string).
- **Negative control:** I changed the case of one quote and added a word to another. The checker flagged all 3 affected quotes (one quote is used twice), so a pass of 0 is a real result and not a checker that can't fail.

## Deviations from the brief
1. **26 features, not 25.** The brief's feature table lists 26 rows (`beds_text` … `audiometry`), yet it says "25" and "375 rows". I wrote all 26, giving **390 rows** in `llm_features_run2.csv`. If the script expects 25, the extra row is probably `beds_text` or `acc_jci`. Drop it; nothing else changes.
2. **`negated`** is used once: Kanwar `acc_nabh`.

## Ambiguous decisions (consistent rules I applied)
- **24×7 emergency needs the word "emergency" (or casualty).** "Open 24 Hrs" (CARE), "Open 24 hours" and "24x7 nursing" (Tiwari), and "24-hour dialysis services" (Vidya) were **not** counted. "Provides emergency services" (Kanwar) and "Offers emergency and elective services" (Gayatri) **were** counted, as an emergency service. FEATURES G5 accepts an emergency department.
- **Specialty tags must match the FEATURES §4.3 code exactly.** CARE has the tag `neonatology`, not `neonatologyPerinatalMedicine`, so its `nicu` is `not_mentioned`.
- **Conflicting total-bed counts:** I took the strongest field, then the value that matches the capacity column or is the most recent. CARE 400 (equipment) vs 215 (capability; = capacity). Sanjeevani 120 vs 171 vs 250+, all capability; took 120 (= capacity). SMC 150 (2023 expansion; = capacity) vs 50 and 55. Each conflict is noted in the row.
- **Dialysis infrastructure without the usual nouns.** Kanha "Dialysis facilities" (equipment field) and MMI "largest dialysis centre" (capability) count as S1 `dialysis_unit`. They are each facility's only dialysis mention, so the evidence rows say `equipment_only=yes` and `service_equipment=no`, which avoids counting one phrase twice. Vidya's "dialysis services with 10 units" counts as both the direct claim and service equipment (qty 10), because the same item carries both.
- **"Department of Nephrology" / "Offers nephrology" / "Nephrology consultation services"** are not counted as a *nephrologist* for `service_equipment`. The nephrology *prerequisite* is met by the specialty code wherever the code is present.
- **Prerequisites from specialty tags.** `anaesthesia` (anesthesia/anesthesiology) and `icu_ccu` (criticalCareMedicine) are listed when the only evidence is the tag. Each is quoted with field `specialties`, so the script can discount them.
- **Kanha ICU qty left blank.** "ICU with 24x7 Intensivist" has no count. "30-bed PICU" is a paediatric unit, so I did not use it as the ICU bed count.
- **Vidya "intensive renal care facilities"** counts as `icu` (description). This is borderline; another reader could reasonably say `not_mentioned`.
- **AIIMS (canary):** scored strictly from the record: 10 beds, OT ("operation theatres"), medical college, the Radiation Oncology department counted as radiotherapy (capability), and tags. **No dialysis, C-section or cardiac surgery claim** is made in the text. Several AIIMS capability items describe a different institution (Raipur Institute of Medical Sciences, RIMS). I did not use them as evidence for anything except as background for the teaching flag, whose quote "Medical college and hospital" names no institution.
- **SMC cardiac specificity.** The direct claim (procedure "Performs cardiothoracic surgery") is `standard`. The **quantity** sits in the second claim ("Has performed over 2,000 cardiac surgeries", capability). SCORING §3.3 gives the +10 bonus if *any* kept claim has a quantity, so the script should credit it. That will not happen if it reads only `specificity`.
- **My `llm_label` convention:** `Possible` = no direct claim but a service code or service equipment exists. `None` = only generic infrastructure or nothing at all.

## Where a keyword regex will likely differ from me (paraphrases / false hits)

### Paraphrases a regex would miss (I say found)
| Facility | Feature / service | Text |
|---|---|---|
| MMI Narayana | cardiac_surgery direct | procedure "Heart bypass surgery is performed" (no "coronary", no "cardiac surg") |
| Suyash | cardiac_surgery direct | procedure "Performs cardiac bypass surgery in the Cardiac Cath Lab"; "Cardiac catheterization with Cathlab and bypass surgery" |
| SMC Heart Institute | cardiac_surgery (extra direct) | procedure "Bypass Surgery" (bare). The regex still catches "Cardiothoracic Surgery" in the same record |
| Vidya | dialysis_unit qty 10 | description "offers 24-hour dialysis services with 10 units" (S1 regex needs "dialysis units"; the qty regex needs digits before "dialysis") |
| Kanha | dialysis_unit | equipment "Dialysis facilities" ("facilities" not in the S1 pattern) |
| Vidya | icu | description "intensive renal care facilities" ("intensive care" is split by "renal") |
| Gayatri | emergency_24x7 | capability "Offers emergency and elective services" (no "emergency services" adjacency). Also "Round-the-clock" is hyphenated |
| CARE | beds_text qty | equipment "Total bed capacity of 400+ beds including 125 ICU beds and 200 recovery beds." Total = 400. A max-"N beds" regex on this item is blocked by `not_rx` (icu); on capability it would take 215 |

### False hits a regex would make (I say not found / negated)
| Facility | Feature / service | Text | Regex behaviour |
|---|---|---|---|
| Kanwar | acc_nabh | capability "Non-NABH accreditation" | `\bnabh\b` hits. The negation pattern `^\s*(no\|not\|none)\b` does not fire on "Non-" → false positive |
| Suyash | ccu | equipment "Intensive Critical Care Unit (ICCU)" | `\biccu\b` hits, but the text expands ICCU as a *critical* care unit, not cardiac |
| SMC | ccu | capability "Provides cardiac care and IVF services"; "Operates a Heart Institute for cardiac care" | `cardiac (care\|intensive)` hits. This is a cardiology service, not a CCU |
| Tiwari | emergency_24x7 | capability "Open 24 hours", "24x7 nursing" | `24 hours` / `24\s*x\s*7` hit. No emergency care stated |
| Devi | emergency_24x7 | description "open 24 hours" | regex hit is harmless here, because "Offers 24/7 emergency care" is also present |
| MMI | cardiac_surgery exclusion | procedure "Bariatric surgery offered at NH MMI Hospital…" | correctly excluded by both methods if the clause logic works |
| Sanjeevani | cardiac_surgery | "Cardiac viability testing", "thoracic … cancers" | regex does not hit (good). Listed as a check |
| SMC, MMI, Suyash | cardiac_surgery | "Coronary Angioplasty", "Coronary angioplasty is performed", "Angiography and angioplasty" | not cardiac surgery (both methods) |
| Suyash | emergency_csection | procedure "Performs obstetric and gynecologic surgeries" | not direct per the brief. Regex does not hit either |
| CARE | neonatal_support | equipment "46 ventilators" | no neonatal context: both methods reject it (Kanha "Neonatal incubators" accepted by both) |
| AIIMS | pet | capability "Nuclear Medicine department" | not PET (regex does not hit) |
| SMC | ct | procedure "CT Angiogram" | I count it as found (CT is needed for a CT angiogram); regex `\bct\b` also hits. Same answer, different reason |
| Vasudev | dialysis (all) | "Apollo Dialysis Clinic" is only in the **name** | the text has no claim. Only G15 name-type should use it |

### Other things a reviewer should check
- **CARE, MMI, Suyash and Sanjeevani** hit the 50-item cap, so their `not_mentioned` rows will become `truncated` in the script (M7).
- **Kanha** is a children's hospital that lists a cath lab and dialysis facilities. Both are real text claims and were kept, but the evidence is paediatric.
- **MMI** has no cath lab, OT, ICU or blood bank in its text, even though it claims the "largest cardiology and cardiac surgery programme". Its cardiac label depends on implied prerequisites.
