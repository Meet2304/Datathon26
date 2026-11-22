# Brief: LLM feature extraction for the LLM-vs-regex experiment

Folder: `experiments/llm_vs_regex/`

Read these first, in this order:
1. `README.md`: the experiment protocol.
2. [`FEATURES.md`](../../docs/FEATURES.md) §2–3: the feature catalogue G1–G14 and S1–S12, plus missing-value rules M1–M7.
3. [`SCORING.md`](../../docs/SCORING.md) §3: the Service Evidence `E` definitions, prerequisites and labels.

Your input is `facilities_15.json`, which holds 15 facilities. You are the **LLM arm**. The regex arm finds features with the keyword patterns in those docs. You find the **same features by reading the text and judging what it means**, so you should catch paraphrases a regex would miss (for example "Bypass Surgery", "delivery by operation", "renal replacement therapy") and reject false hits a regex would make (for example "gastric bypass", "ICU" inside "PICU" when the question is adult ICU, or "OT" meaning occupational therapy).

A script turns your extraction into 0–1 values, E and D, and the ranking, using exactly the formulas in the docs. **Do not compute values, E, D or ranks yourself.** Report what the text supports.

## Hard rules
1. **Use only the record text in `facilities_15.json`.** Do not use what you know about any hospital. AIIMS Raipur is the canary: its record describes a 10-bed NRC unit, and that is all you may score.
2. **Every `found` needs a verbatim quote.** It must be an exact substring of one item in the named field (`procedure`, `equipment`, `capability`, `specialties`) or of `description`. Keep quotes short: the shortest span that carries the claim, ideally under 200 characters.
3. **Before you write the final files, run a script that checks every quote.** A quote passes if, after `strip()`, it is a case-sensitive substring of an item in the named field for that facility. **Record how many quotes failed this first check before you fixed them.** That number is the experiment's hallucination metric, so report it honestly. Then fix or drop the failures so the final files have 0.
4. **Databricks is read-only and optional.** You may confirm that the 15 `unique_id`s exist in the source table. Do not create, alter or drop anything, and do not use extra columns as input.
5. Work independently. Do not open any other run's `llm_*_run*` files.
6. Negation is semantic. "Not available", "referred to", "outsourced", "under construction", "planned", "coming soon" and "(non-functional)" mean the facility does **not** have it now. Such a mention is `negated` and never `found`.

## Output 1: `llm_features_run{N}.csv` (feature presence)
Columns: `unique_id,feature,status,field,quote,qty,note`
- Write one row per facility × feature, so 15 × 25 = **375 rows**.
- Use only `found` or `not_mentioned` (plus `negated` where it applies). The script applies the `unknown` and `truncated` rules (M3, M7) itself.
- If a feature is found in several fields, give the **strongest** one. Strength order: equipment = procedure > capability > description > specialties tag. A specialties tag counts only for the features FEATURES §4.3 maps to a tag: `emergency_24x7`←emergencyMedicine, `anaesthesia`←anesthesia or anesthesiology, `icu`←criticalCareMedicine, `nicu`←neonatologyPerinatalMedicine, `radiotherapy`←radiationOncology, `chemotherapy`←medicalOncology, `pet`←nuclearMedicineAndMolecularImaging.
- `qty`: a number stated in the text for the quantity features, otherwise blank. The quantities are: ICU beds, OT count, dialysis machines or beds, NICU beds, MRI tesla, CT slices, and total hospital beds (for `beds_text` only). Leave it blank if the number is something else, such as sessions per year or a patient count.

The features, one row each:

| feature | Meaning (judge semantically) |
|---|---|
| `beds_text` | A **total** hospital bed count stated in the text. Ward, ICU or NICU bed counts don't count. Put the number in `qty`. Fill this in even when the `capacity` column is set |
| `icu` | An intensive care unit of any kind (ICU, MICU, SICU, critical care) |
| `emergency_24x7` | 24×7 emergency, casualty or round-the-clock emergency care |
| `ambulance` | Ambulance service |
| `ot` | Operating or operation theatre, modular OT |
| `blood_bank` | Blood bank, blood storage or blood centre on site |
| `anaesthesia` | Anaesthesia service or anaesthesiologists |
| `acc_jci` | JCI accreditation |
| `acc_nabh` | NABH accreditation of the hospital (not only of its lab) |
| `lab_accreditation` | NABL lab accreditation |
| `teaching_text` | The text says it is a medical college, teaching hospital or institute of medical sciences |
| `xray` | X-ray or radiography |
| `usg` | Ultrasound, sonography or USG |
| `ct` | CT scanner |
| `mri` | MRI scanner |
| `pet` | PET or PET-CT |
| `mammography` | Mammography |
| `dialysis_unit` | S1. **Dialysis infrastructure**: machines, units, stations, chairs, beds, a dialysis centre or wing, an RO plant. The bare service word "dialysis" is not enough here; that goes into evidence |
| `labour_room` | S2. Labour room, delivery room or labour ward |
| `nicu` | S3. NICU, neonatal intensive care or SNCU |
| `neonatal_support` | S4. Ventilator, CPAP, warmer, incubator or phototherapy **for newborns**. It needs a neonatal context in the same item |
| `cath_lab` | S5. Cardiac catheterisation lab |
| `ccu` | S6. CCU, ICCU, cardiac care or cardiac intensive care unit |
| `radiotherapy` | S10. Radiotherapy, LINAC or brachytherapy |
| `chemotherapy` | S11. Chemotherapy |
| `audiometry` | S12. Audiometry, BERA, tympanometry or cochlear |

You don't extract the structured features (G1 facility type, G2 doctors, G3 capacity, G12 affiliations, G14 year). The script reads them from the columns.

## Output 2: `llm_evidence_run{N}.csv` (Service Evidence inputs, SCORING §3)
Write one row per facility × service, for the services `dialysis`, `emergency_csection` and `cardiac_surgery`. That's **45 rows**.

Columns:
`unique_id,service,direct_claim,direct_field,direct_quote,specificity,equipment_only,second_claim,second_field,second_quote,negated_claim,negated_field,negated_quote,specialty_code,service_equipment,service_equipment_field,service_equipment_quote,emergency_same_item,prereq_found,prereq_quotes,llm_label,note`

| Column | How to fill it |
|---|---|
| `direct_claim` | `yes` if the text, in any wording, says **this facility itself provides the service**. Dialysis means haemodialysis or peritoneal dialysis or CRRT. C-section means caesarean, LSCS, or "operative delivery" when it clearly means caesarean; "obstetric surgeries" on its own is **not** direct, so put it in `note`. Cardiac surgery means CABG, bypass surgery on the heart, open-heart surgery, valve repair or replacement, or cardiac or cardiothoracic surgery. Angioplasty and PCI are **not** cardiac surgery. Gastric or bariatric bypass is excluded. A specialties tag alone is never a direct claim. Otherwise `no` |
| `direct_field`, `direct_quote` | The strongest direct claim, preferring procedure or equipment, then capability, then description |
| `specificity` | `quantity` if that claim has a number or concrete detail ("10 machines", "2,000 surgeries", "20-bed unit"). `generic` if it is just one entry in a list of departments or services. Otherwise `standard` |
| `equipment_only` | `yes` if the facility's **only** mention of the service is an equipment phrase ("Dialysis unit with 12 machines"). SCORING §3.2 step 4 |
| `second_claim` (+ field, quote) | `yes` if there is a second **distinct** direct claim, meaning different text, not the description repeating a list item |
| `negated_claim` (+ field, quote) | `yes` if the text says the service is **not** offered now (see rule 6) |
| `specialty_code` | The exact matching code if present, otherwise blank. Dialysis: `nephrology`, `pediatricNephrology`. C-section: `gynecologyAndObstetrics`, `obstetricsAndMaternityCare`, `maternalFetalMedicineOrPerinatology`. Cardiac: `cardiacSurgery`, `cardiothoracicSurgery` |
| `service_equipment` (+ field, quote) | `yes` if service-specific equipment or resources are present. Dialysis: dialysis machines, units or stations, RO plant, or a nephrologist. C-section: operating theatre, labour room, anaesthesia or NICU. Cardiac: cath lab, CTICU or CICU, or a heart-lung machine |
| `emergency_same_item` | C-section only: `yes` if the **same item** as the direct claim also states emergency or 24×7 readiness. Otherwise `no`. Use `na` for the other services |
| `prereq_found` | Semicolon-separated list of the prerequisites **found in the text**, from SCORING §3.1. Dialysis: `nephrology` (the code or a nephrologist). C-section: `ot;anaesthesia;blood_bank`. Cardiac: `ot;anaesthesia;icu_ccu;blood_bank`. List only what the text shows. The script credits implied prerequisites for direct claims |
| `prereq_quotes` | `name: "quote" (field)` for each prerequisite found, separated by ` \|\| ` |
| `llm_label` | Your own reading (Strong / Moderate / Weak / Possible / Not offered / None), for comparison only. The script computes the official label |
| `note` | Anything a reviewer should check, such as paraphrases a regex would miss, false hits you rejected, a truncated list, or templated text |

## Output 3: `llm_run{N}_notes.md`
Record:
- the model ID, the start and end time, and the time per facility;
- the **first-pass quote failures (n / total)** and the final quote failures (must be 0);
- any decisions you found ambiguous;
- a list of the **paraphrases or false hits** where you think a keyword regex would differ from you. The experiment relies on this list, so be specific: give the facility, the feature or service, and the text.

Write CSVs with Python's `csv` module. Finish with a short reply giving the number of direct claims for each service, the first-pass quote failures, and anything that failed.
