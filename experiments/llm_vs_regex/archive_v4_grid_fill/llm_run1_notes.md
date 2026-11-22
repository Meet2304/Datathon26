# LLM semantic fill: run 1 notes

- **Model:** `claude-opus-5-5` (Claude Opus 5.5), running as a sub-agent in Claude Code. Judgment was done in a single pass with no temperature control available. I wrote the values by hand and used a script only to format them into CSV and to check the quotes.
- **Start:** 2026-11-21 18:44 EST. **End:** 2026-11-21 18:49 EST.
- **Inputs used:** `facilities_15.json` only. For scale definitions I also read `README.md` and §2 and §4 to §6 of `../output/evaluation-context-handoff.md`. I computed no formulas: no noisy-OR, no shrinkage and no weights.
- **Outputs:** `llm_grid_run1.csv` (45 rows) and `llm_ranking_run1.csv` (45 rows). The build and check script is kept outside the project folder, in the session scratchpad (`build_run1.py`).

## Quote check
- **103 quotes checked (primary plus supporting), 0 failed.**
- How it was checked: after `strip()`, a quote must be a case-sensitive substring of the `description` string, or of at least one item in the named list field (`procedure`, `equipment`, `capability` or `specialties`) of that facility.
- 11 cells have no quote (tier None with no relevant text at all).

## Databricks check (read-only, SELECT only)
- Source table: `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities`.
- **IDs:** all 15 `unique_id`s are present, each as exactly 1 row with `organization_type = 'facility'`. The names match the JSON.
- **Spot-check of 3 facilities** (AIIMS Raipur, Vidya Hospital and Kidney Centre, Vasudev / Apollo Dialysis): `description` text and length match (120 / 261 / 1169 characters). The list lengths for specialties / procedure / equipment / capability match exactly: AIIMS 50/14/11/50, Vidya 41/1/0/9, Vasudev 21/0/0/1. Capacity and numberDoctors also match. **No mismatches found.**
- Nothing was created, altered or dropped, and no extra columns were used for inference.

## Decisions on ambiguous cases
- **Lists capped at 50 items** (CARE, MMI, Suyash, Sanjeevani, AIIMS, and Gayatri specialties). I treated a missing mention in a capped list as weaker evidence of absence. For example, CARE's C-section cell is Possible with offers 0.50 rather than near zero. I never treated the cap itself as evidence.
- **Children's hospital claiming dialysis (Kanha):** "Dialysis facilities" appears in both equipment and capability. That is a positive claim, but the patient is an adult father, so I set offers 0.30 and tier Weak. R is Medium-low (0.52) because the record has internal problems: it claims a 90-bed NICU against a capacity of 45 beds, and a Philips Azurion cath lab, which suggests merged or inflated text. Its cath lab did not count toward adult cardiac surgery.
- **AIIMS (the canary):** I scored only what the record says. The description is a 10-bed NRC unit. The capability list mixes in a different institution (Raipur Institute of Medical Sciences: Lord Buddha Education Society, "Established in 2008", RIMS chairman), and two equipment items are marked "(non-functional)". R is 0.55 (Medium). It has a .edu.in website, a valid year and a recent update, but the record is clearly merged. Nothing in the text claims dialysis, C-section or cardiac surgery, so all three cells are Possible at most (nephrology department, obstetrics within robotic surgery, cardiology tag), and it ranks low on every query. Its fame was not used.
- **Name contains "Dialysis" with no text (Vasudev / Apollo Dialysis Clinic):** the name is not one of the allowed quote fields, so the primary quote is the `nephrology` specialty code and the name hint is described in the caveats. I set offers 0.30 and tier Possible (hidden), and gave it Q1 grade 1. R is 0.40 (Low): the description is pure boilerplate, there are no lists, and there is no year or recency.
- **Name contains "Kidney" (Vidya):** this is not name-only, because the description specifically says "24-hour dialysis services with 10 units" in a "50-bed renal care facility". I set offers 0.80 and tier Strong (the matching specialist type plus a stated unit count), with a caveat that the page was last updated in 2011 and the claim appears only in the description. That staleness kept offers at 0.80 rather than 0.9 or more.
- **MMI dialysis:** "largest dialysis centre in Central India" appears only in the description and capability (marketing wording) and never in procedure or equipment. I graded it Moderate with offers 0.72, while still giving it human-scale grade 3 because the claim is explicit in a large nephrology hospital.
- **Shri Krishna dialysis:** "Dialysis" is a bare procedure item, corroborated by the description and capability ("Nephrology, Dialysis & Urology"), with no unit detail. I graded it Moderate. The record also says it "Primarily provides dental and maxillofacial surgical services", which may mean it was merged with a dental clinic of the same name, so R is 0.62.
- **Emergency readiness for C-section Strong:** Devi has "Offers 24/7 emergency care" and "Open 24x7". Kanwar has "Provides emergency services" plus an ICU, which is generic rather than obstetric-specific, but I judged it enough given an obstetrics-only nursing home with explicit C-section and high-risk delivery items. SMC (no 24/7 text) and Tiwari ("Open 24 hours" contradicted by posted clinic timings) are Moderate.
- **"Obstetric surgeries" without the word C-section (Suyash), and an OB department plus 24 h (CARE):** I kept these Possible (indirect) with offers 0.50. They are not direct claims, but on the human scale they get grade 2 ("probably").
- **SMC cardiac:** explicit "Bypass Surgery" and "over 2,000 cardiac surgeries" give Strong. The caveats cover inconsistent bed counts (150 / 55 / 50), 2 named doctors, and a heart-transplant claim that looks inflated for its size.
- **Mamta cardiac:** a `cardiacSurgery` specialty code is the only direct signal, and its own "Specializes in" line leaves out cardiac. I graded it Weak with offers 0.18.
- **Templated department list:** "Cardiology, ENT, Neurosurgery, Urology, Gynaecology, Orthopaedics, Ophthalmology, Plastic Surgery, Gastroenterology, Nephrology, Surgical Oncology, General Surgery" appears in both Devi (a women and child hospital) and MMI. In Devi I treated it as templated, giving no real support for nephrology or cardiology, and it lowered R.
- **Off-service matches:** I treated Sanjeevani's `cardiothoracicSurgery`, `nephrology` and `gynecologyAndObstetrics` codes as cancer-context noise (offers ≤ 0.08). "Cardiac viability testing" is diagnostic, not surgery.
- **Location:** I had no PIN-centroid data, so I judged only whether the address, PIN and coordinates agree. All facilities are inside Raipur with PINs 4920xx.
  - AIIMS and Sanjeevani have a GPS item in their text that matches the coordinates, so they are High at 1 km.
  - Devi and Vasudev are Medium at 4 km: PIN 492013 (the Raipura area of Q2) sits with coordinates about 10 km west of the Q2 point, which is possible but loose.
  - Gayatri has one stray item placing a "Gayatri Hospital" in Kharsia (496661). I treated that as a namesake mix-up, which lowered R, and kept location High because the address, PIN and coordinates agree.
- **R deliberately ignores size.** For example, MMI's 182 versus 54 doctors and CARE's 215 versus 400+ beds counted only as internal inconsistencies.
- **Ranking:** grade comes first, then distance within the same grade, with distance weighted more for Q2. In Q2, Devi (grade 3, 9.9 km) ranks above SMC (grade 2, 4.1 km), because confirmed 24/7 emergency obstetric readiness outweighs about 8 road km inside the city. Grade-0 facilities are ordered with any faint hint first, then by distance.

## Tier counts
| Service | Strong | Moderate | Weak | Possible | None | Excluded |
|---|---|---|---|---|---|---|
| dialysis | 3 (CARE, Suyash, Vidya) | 2 (MMI, Shri Krishna) | 1 (Kanha) | 6 | 3 | 0 |
| emergency_csection | 2 (Devi, Kanwar) | 2 (SMC, Tiwari) | 0 | 8 | 3 | 0 |
| cardiac_surgery | 4 (MMI, CARE, SMC, Suyash) | 0 | 1 (Mamta) | 6 | 4 | 0 |

No cell is Excluded: no record explicitly denies any of the three services.
