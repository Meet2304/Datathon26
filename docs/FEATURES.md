# Facility Features — Design

> **v5:** [PLAN_V5.md](PLAN_V5.md) overrides this document where they differ.

> Status: **draft v4** (2026-11-21). **Input is now the team's silver tables** (`silver_facilities`, `silver_pincode_directory`). Assumes clean input: every value is valid or missing, never wrong (§2). v3 adds clause-level negation, truncation (M7), neonatal context, equipment-only dialysis terms, name-based specialist type, and trauma / burn-care weights. Weights and thresholds marked *(tune)* are starting points to be tuned on the test-query set.
> Related: [SCORING.md](SCORING.md) (Evidence `E`, Completeness `C`, ranking formula, confidence) · [DATA_DICTIONARY.md](DATA_DICTIONARY.md)

## 0. Where this fits

[SCORING.md §4](SCORING.md) ranks with:

```
rank_score = wE·E + wD·D + wA·A
```

- **E** (service evidence) and **C** (record completeness, used for confidence only) are defined in SCORING.md.
- **A** (access) = `100 × 0.5^(distance_km / d_half)`, computed at query time.
- **D** (capability depth) is **this document**. D is a weighted sum of facility features, with different weights for each service.

```
D(f, s) = 100 × Σ_i  wD[s][i] · feature_i(f)        (Σ_i wD[s][i] = 1;  unknown feature → 0.5)
```

`f` = facility, `s` = service, `i` = feature.

---

## 1. Profiling facts that shaped the design

From **`silver_facilities` (10,077 facilities)**, re-profiled 2026-11-22. Rows marked *(bronze)* were measured on the raw table (10,088 rows) and not re-measured. Keyword counts are regex-based and approximate.

| Fact | Implication |
|---|---|
| 55.8% hospital, 37.5% clinic, 4.9% dentist (`clean_facility_type`) | Facility type is a strong base feature |
| `clean_number_doctors` usable for 34.9% (112 flagged implausible → unknown, M8); median **2**, p95 ≈ 98 | Log-scale it; missing means unknown, not 0 |
| `clean_capacity` is filled for 24.8%; median 100 beds | Fill gaps with `clean_capacity_from_text`, then "N beds" parsed from text. Combined, beds are known for 2,690 facilities (26.7%) |
| `clean_area` is filled for 1.2% | Dropped |
| Facilities average **11 specialty codes** each in silver (bronze showed ~28, inflated by duplicates); `cardiology` is tagged on 3,024 but a cath lab appears in the text of only 476 | A specialty tag alone is weak evidence (strength 0.3) |
| Quantities in text *(bronze)*: beds 1,856 · ICU beds 350 · MRI tesla 235 · CT slices 213 · OT count 175 · dialysis units 83 · NICU beds 58 | Quantity features exist, but they're sparse |
| Numbers parsed from free text can be misread (ICU "13,177", dialysis "60,000" = sessions per year, not machines) | Every **text-parsed** quantity needs a plausible range; values outside it are discarded. Structured columns are taken as-is |
| Silver removed placeholder lines ("No equipment details provided…": 491 → 37) but **kept real negations** ("not available" 43, "outsourced" 44, "referred to" 20, "under construction" 23) | Treat empty as missing; a negated claim is a real statement of absence, so it never counts as positive |
| **Lists are cut off at 50 items**: 2,078 facilities (20.6%) have a `flag_*_truncated_50` on procedures, equipment or capabilities | For these, "not mentioned" may just mean "cut off" → **unknown**, not 0 (M7) |
| 1,492 facilities (14.8%) have coordinates > 50 km from their own PIN (`flag_coordinates_far_from_pincode`) | Use the PIN centroid, location `approximate` (M8) |
| Negation goes beyond "not available": "outsourced", "referred to", "under construction", "upcoming" (+342 clauses). "In collaboration with" is **not** a negation | Clause-level negation with an extended phrase list (§4.2) |
| `ventilator`/`cpap` appears at 447 facilities, but only 179 in a neonatal context *(bronze)* | NICU equipment needs a neonatal context word in the same item (§4.3) |
| "Dialysis" often appears only as equipment ("dialysis machines", 82 facilities have nothing else) *(bronze)* | Service terms (→ E) and equipment terms (→ D) are separate lists, so one phrase isn't counted twice |
| 5,330 facility items appear word for word in more than one field (description repeats structured fields) *(bronze)* | Deduplicate claims by normalised text before counting corroboration (SCORING §3.2) |

---

## 2. Data assumption and missing-value rules

**Assumption:** the input is already cleaned. Every value is either **valid** or **missing** (NULL, `''`, or an empty array). There are no wrong values, merged records or misplaced locations to detect, so this pipeline only has to handle **missing**, never **wrong**.

| Rule | Behaviour |
|---|---|
| **M1. Empty = missing** | `''`, whitespace-only strings and empty arrays are turned into NULL in §4.1. |
| **M2. Missing structured value = unknown** | If `numberDoctors`, `capacity`, `yearEstablished` etc. is NULL, the feature is NULL (status `unknown`) and is filled with **0.5** in D. It is **never** treated as 0. |
| **M3. Absence needs text** | A text feature is 0 (`not_mentioned`) only if the facility has at least one non-empty text field. If all text fields are missing, it's `unknown`. |
| **M4. Missing lowers confidence** | Feature coverage (§6) counts only known features, so missing data reduces confidence automatically. |
| **M5. Location fallback** | If latitude/longitude are missing, use the PIN centroid and mark the location `approximate`. If both are missing, the location is `unknown` and the facility can't be ranked by distance. |
| **M6. Negation is data, not error** | "Dialysis not available", "MRI (outsourced)", "cath lab under construction" are valid statements that the service isn't offered **here, now**. Detected per clause (§4.2). Excluded from positive features; E uses them for the "Not offered" label (SCORING §3.4). |
| **M8. Silver flags that mean "don't trust this value"** | Two `silver_facilities` flags are treated as **missing**: `flag_coordinates_far_from_pincode` (coordinates > 50 km from the facility's own PIN; 1,492 facilities) → use the PIN centroid, location `approximate`; `flag_numberDoctors_implausible` (112 facilities) → doctors unknown. All other `flag_*` columns are ignored. (Team decision, 2026-11-21.) |
| **M7. Truncated lists** | If any of a facility's `procedure` / `equipment` / `capability` lists has 50 items, it was cut off. A text feature that isn't found is then `truncated` (NULL → 0.5 in D), not `not_mentioned` (0). |

Values are trusted as given, so structured columns get **no** sanity bounds. Bounds remain only on numbers parsed out of free text (§4.3 `qty_min`/`qty_max`), because a regex can grab the wrong number from a correct sentence.

---

## 3. Feature catalogue

Every feature is normalised to **0–1**, or **NULL = unknown**.

**Field strength** (how directly a field makes a claim): `equipment` 1.0 · `procedure` 1.0 · `capability` 0.9 · `description` 0.6 · `specialties` tag 0.3.

### 3.1 General features (all services)

| ID | Feature | Kind | Logic |
|---|---|---|---|
| G1 | `facility_type` | structured | hospital 1.0 · nursing_home 0.7 · clinic 0.4 · doctor 0.2 · dentist/pharmacy → only eligible for dental services · other → NULL |
| G2 | `doctors` | structured | `least(1, ln(1+n)/ln(101))` |
| G3 | `beds` | structured + text | `coalesce(clean_capacity, clean_capacity_from_text, parsed total beds)`; `least(1, ln(1+b)/ln(1001))`. Parsed beds must fall in 5–5,000 |
| G4 | `icu` | presence + qty | ICU / intensive care; qty = ICU beds (1–200), ref 20 |
| G5 | `emergency_24x7` | presence | 24x7 / round the clock / emergency dept / casualty, or tag `emergencyMedicine` |
| G6 | `ambulance` | presence | ambulance |
| G7 | `ot` | presence + qty | operation theatre / modular OT; qty = OT count (1–60), ref 10 |
| G8 | `blood_bank` | presence | blood bank / blood storage / blood centre |
| G9 | `anaesthesia` | presence | anaesthesia, or tag `anesthesiology` |
| G10 | `accreditation` | presence | JCI 1.0 · NABH 0.8 (take the max) |
| G11 | `lab_accreditation` | presence | NABL |
| G12 | `teaching` | structured + text | `affiliationTypeIds` has `academic`, or the name or text matches medical college / institute of medical sciences / AIIMS |
| G13 | `diagnostic_breadth` | derived | (# of X-ray, USG, CT, MRI, PET, mammography present) / 6 |
| G14 | `years_operating` | structured | `2026 − yearEstablished`; `least(1, ln(1+y)/ln(101))` |

**Access attributes.** These are filters and badges, not part of D:

| ID | Attribute | Logic |
|---|---|---|
| X1 | `is_public` | `operatorTypeId` = public/government, or `affiliationTypeIds` has government |
| X2 | `pmjay` | text mentions Ayushman Bharat / PM-JAY (679 facilities) |

### 3.2 Service-specific features

| ID | Feature | Kind | Terms (regex, lower-cased) | Qty: range, reference |
|---|---|---|---|---|
| S1 | `dialysis_unit` | presence + qty | equipment only: `dialysis (machines?\|units?\|stations?\|chairs?\|beds?\|cent(re\|er)\|wing)\|ha?emodialysis machines?\|ro (water )?plant` (the service word itself goes to E) | dialysis beds/machines (1–100), ref 20 |
| S2 | `labour_room` | presence | `labou?r room\|delivery room\|labou?r ward` | — |
| S3 | `nicu` | presence + qty | `\bnicu\b\|neonatal intensive\|\bsncu\b` | NICU beds (1–150), ref 20 |
| S4 | `neonatal_support` | presence + context | `ventilator\|cpap\|warmer\|incubator\|phototherapy`, **only if the same item matches** `neonat\|newborn\|infant\|nicu\|sncu\|baby\|paediatric\|pediatric` | — |
| S5 | `cath_lab` | presence | `cath\s*lab\|catheteri[sz]ation lab` | — |
| S6 | `ccu` | presence | `\bccu\b\|\biccu\b\|cardiac (care\|intensive)` | — |
| S7 | `mri` | presence + qty | `\bmri\b\|magnetic resonance` | tesla (0.2–7), ref 3 (linear) |
| S8 | `ct` | presence + qty | `ct scan\|\bct\b\|computed tomograph` | slices (1–640), ref 128 |
| S9 | `pet` | presence | `pet[- ]?ct\|pet scan` | — |
| S10 | `radiotherapy` | presence | `radiotherap\|radiation (therapy\|oncology)\|linac\|linear accelerator\|brachytherap` | — |
| S11 | `chemotherapy` | presence | `chemotherap` | — |
| S12 | `audiometry` | presence | `audiometr\|cochlear\|\bbera\b\|tympanometr` | — |

Evidence terms such as caesarean, angioplasty, CABG, trauma and burns belong to **E** (SCORING.md §3.1), not D. Exclusion patterns (gastric bypass, eye/dental trauma) also live in E.

**Specialist type from name** (G15, used by SCORING §3.4 for the Strong rule, not by D): `lower(name)` matched in this order: `kidney|dialysis|nephro|renal` → nephrology_dialysis · `maternity|prasuti|mother|women.?s hospital|birthing` → maternity · `cancer|onco` → oncology · `heart|cardiac|cardio` → cardiac · `trauma|accident` → trauma · `eye|netra|nethra|nayan|ophthal|vision` → eye · `dental|dentist|teeth|smile|orthodont` → dental · `diagnostic|imaging|scan|patholog|\blab` → diagnostic · else NULL. Used **positively only** (a dialysis centre qualifies for Strong dialysis), never to penalise.

### 3.3 Depth weights `wD[s][i]` *(tune)*

Each column sums to 1. Cardiac leans on equipment and accreditation; ENT leans on number of doctors.

| Feature | Dialysis | Emerg. C-section | NICU | Cardiac | MRI | Oncology | ENT | Trauma | Burn care (beta) |
|---|---|---|---|---|---|---|---|---|---|
| S1 dialysis_unit | .35 | | | | | | | | |
| S2 labour_room | | .10 | | | | | | | |
| S3 nicu | | .10 | .25 | | | | | | |
| S4 neonatal_support | | | .20 | | | | | | |
| S5 cath_lab | | | | .30 | | | | | |
| S6 ccu | | | | .20 | | | | | |
| S7 mri | | | | | .45 | | | | |
| S8 ct | | | | | | | | .20 | |
| S9 pet | | | | | | .15 | | | |
| S10 radiotherapy | | | | | | .30 | | | |
| S11 chemotherapy | | | | | | .20 | | | |
| S12 audiometry | | | | | | | .25 | | |
| G4 icu | .15 | | | | | | | .10 | .25 |
| G5 emergency_24x7 | | .20 | .15 | | .20 | | | .20 | |
| G6 ambulance | | | | | | | | .10 | |
| G7 ot | | .20 | | .10 | | | .15 | .15 | .20 |
| G8 blood_bank | | .20 | | .05 | | | | .15 | .15 |
| G10 accreditation | .10 | .10 | .15 | .15 | .20 | .10 | .15 | | .10 |
| G11 lab_accreditation | | | | | .15 | | | | |
| G12 teaching | | | .10 | .10 | | .15 | | | .15 |
| G1 facility_type | .20 | | | | | | | | |
| G2 doctors | .10 | | | | | | .35 | | |
| G3 beds | .10 | .10 | .15 | .10 | | .10 | .10 | .10 | .15 |

Generic infrastructure (ICU, OT, blood bank, 24×7, ambulance) raises D but **never** qualifies a result for Strong evidence (SCORING §3.4).

Ranking weights (wE / wD / wA, d_half, radius) for all nine services are in SCORING.md §4.2.

---

## 4. Computation logic (Databricks SQL)

Tables flow `bronze → silver → gold`. All live in `workspace.hackathon`.

### 4.1 `silver_facility_clean`: a thin view over the team's silver table *(offline)*

The team's `workspace.hackathon.silver_facilities` (10,077 rows, one per `unique_id`) already parses lists, removes placeholder items, de-duplicates and standardises values. This step only renames columns, turns empty arrays into NULL (M1), applies M8, and adds `has_text`, `truncated` and `name_type`.

```sql
CREATE OR REPLACE TABLE workspace.hackathon.silver_facility_clean AS
SELECT
  unique_id,
  clean_name                                               AS name,
  nullif(clean_facility_type, '')                          AS facility_type,
  nullif(clean_operator_type, '')                          AS operator_type,
  clean_affiliations                                       AS affiliations,
  -- M8: a flagged doctor count is unknown
  CASE WHEN NOT coalesce(flag_numberDoctors_implausible, false) THEN clean_number_doctors END AS n_doctors,
  clean_capacity                                           AS capacity,
  clean_capacity_from_text                                 AS capacity_text,
  try_cast(yearEstablished AS INT)                         AS year_established,
  -- M1: empty array → NULL
  CASE WHEN size(clean_specialties)  > 0 THEN clean_specialties  END AS specialties_arr,
  CASE WHEN size(clean_procedures)   > 0 THEN clean_procedures   END AS procedure_arr,
  CASE WHEN size(clean_equipment)    > 0 THEN clean_equipment    END AS equipment_arr,
  CASE WHEN size(clean_capabilities) > 0 THEN clean_capabilities END AS capability_arr,
  nullif(trim(clean_description), '')                      AS description_ok,
  -- M3: does the facility have any text at all?
  coalesce(size(clean_procedures), 0) > 0 OR coalesce(size(clean_equipment), 0) > 0
    OR coalesce(size(clean_capabilities), 0) > 0 OR nullif(trim(clean_description), '') IS NOT NULL AS has_text,
  -- M7: was any list cut off at 50 items?
  coalesce(flag_procedure_truncated_50, false) OR coalesce(flag_equipment_truncated_50, false)
    OR coalesce(flag_capability_truncated_50, false)       AS truncated,
  -- G15: specialist type from name (positive use only)
  CASE WHEN lower(clean_name) rlike 'kidney|dialysis|nephro|renal'                    THEN 'nephrology_dialysis'
       WHEN lower(clean_name) rlike 'maternity|prasuti|mother|women.?s hospital|birthing' THEN 'maternity'
       WHEN lower(clean_name) rlike 'cancer|onco'                                      THEN 'oncology'
       WHEN lower(clean_name) rlike 'heart|cardiac|cardio'                             THEN 'cardiac'
       WHEN lower(clean_name) rlike 'trauma|accident'                                  THEN 'trauma'
       WHEN lower(clean_name) rlike 'eye|netra|nethra|nayan|ophthal|vision'            THEN 'eye'
       WHEN lower(clean_name) rlike 'dental|dentist|teeth|smile|orthodont'             THEN 'dental'
       WHEN lower(clean_name) rlike 'diagnostic|imaging|scan|patholog|\\blab'         THEN 'diagnostic'
  END                                                      AS name_type,
  try_cast(clean_pincode AS BIGINT)                        AS pincode,
  -- M8: coordinates > 50 km from the facility's own PIN are treated as missing
  CASE WHEN NOT coalesce(flag_coordinates_far_from_pincode, false) THEN clean_latitude  END AS lat_raw,
  CASE WHEN NOT coalesce(flag_coordinates_far_from_pincode, false) THEN clean_longitude END AS lon_raw,
  clean_phone_numbers                                      AS phone_numbers,
  clean_officialPhone                                      AS official_phone,
  clean_recency_of_page_update                             AS last_updated,
  clean_district                                           AS district,
  clean_state                                              AS state
FROM workspace.hackathon.silver_facilities;
```

Then resolve the facility location once (M5, M8), using the team's `silver_pincode_directory` (one row per PIN where `is_primary_state`):

```sql
CREATE OR REPLACE TABLE workspace.hackathon.silver_facility_location AS
SELECT f.unique_id,
  coalesce(f.lat_raw, p.latitude)                                                    AS lat,
  CASE WHEN f.lat_raw IS NOT NULL THEN f.lon_raw ELSE p.longitude END                AS lon,
  CASE WHEN f.lat_raw IS NOT NULL AND f.lon_raw IS NOT NULL THEN 'exact'
       WHEN p.latitude IS NOT NULL THEN 'approximate'      -- PIN centroid
       ELSE 'unknown' END                                                            AS location_quality
FROM workspace.hackathon.silver_facility_clean f
LEFT JOIN workspace.hackathon.silver_pincode_directory p
  ON p.pincode = f.pincode AND p.is_primary_state;
```

### 4.2 `silver_claims`: one row per clause *(offline)*

Each list item (and the description) is split into **clauses** on `;`, `. ` and `, but / however / except`. Negation is checked **within the clause**, so "MRI available; CT outsourced" negates only CT. The full item text is kept for context checks (§4.3), and a normalised key is kept for deduplication (SCORING §3.2).

```sql
CREATE OR REPLACE TABLE workspace.hackathon.silver_claims AS
WITH u AS (
  SELECT unique_id, 'procedure' AS field, pos, c FROM workspace.hackathon.silver_facility_clean
    LATERAL VIEW posexplode(procedure_arr) t AS pos, c
  UNION ALL SELECT unique_id, 'equipment', pos, c FROM workspace.hackathon.silver_facility_clean
    LATERAL VIEW posexplode(equipment_arr) t AS pos, c
  UNION ALL SELECT unique_id, 'capability', pos, c FROM workspace.hackathon.silver_facility_clean
    LATERAL VIEW posexplode(capability_arr) t AS pos, c
  UNION ALL SELECT unique_id, 'description', 0, description_ok FROM workspace.hackathon.silver_facility_clean
    WHERE description_ok IS NOT NULL),
cl AS (
  SELECT unique_id, field, pos, c AS item, cpos, trim(clause) AS clause
  FROM u LATERAL VIEW posexplode(split(c, ';|\\.\\s|,\\s*(?=but |however|except)')) t AS cpos, clause)
SELECT unique_id, field, pos, cpos,
  clause                                           AS text,
  lower(clause)                                    AS lc,
  lower(item)                                      AS item_lc,
  regexp_replace(lower(item), '[^a-z0-9]', '')     AS norm_item,          -- dedup key
  lower(clause) rlike concat(
    '^\\s*(no|not|none)\\b',
    '|\\bnot (available|provided|mentioned|specified|listed|offered)\\b',
    '|\\bno (explicit|specific|information|details|data)\\b',
    '|referr?ed (to|out)|refers? (patients )?to',
    '|outsourc|under construction',
    '|will be (installed|started|available)|coming soon|upcoming',
    '|proposed|(is|are) planned|planned to')        AS is_negated
FROM cl
WHERE clause <> '';
```

Checked on the live data: the extended phrases add 342 negated clauses. "In collaboration with" / "tie-up with" were tested and **rejected**: they describe real programmes, not absence.

### 4.3 `ref_feature_terms`: the keyword dictionary *(offline config)*

One row per text-derived feature. `kind` is `presence` or `presence_qty`. `not_rx` stops a qty from being read off the wrong sentence (e.g. "10-bed NICU" must not become total beds).

```sql
CREATE OR REPLACE TABLE workspace.hackathon.ref_feature_terms AS
SELECT * FROM VALUES
 -- feature,          kind,           rx,                                                                     num_rx,                                                                  not_rx,                            qty_min, qty_max, qty_ref
 ('beds',            'qty_only',     '\\d+\\s*-?\\s*(bedded|beds?)\\b',                                     '(\\d+)\\s*-?\\s*(?:bedded|beds?)\\b',                                  'icu|nicu|picu|dialys|ward|private|semi', 5, 5000, 1000),
 ('icu',             'presence_qty', '\\bicu\\b|intensive care',                                            '(\\d+)\\s*-?\\s*(?:bedded|beds?)?\\s*(?:icu|intensive)',               NULL, 1, 200, 20),
 ('emergency_24x7',  'presence',     '24\\s*x\\s*7|24/7|24 hours|round the clock|emergency (department|services|care|ward)|casualty', NULL, NULL, NULL, NULL, NULL),
 ('ambulance',       'presence',     'ambulance',                                                           NULL, NULL, NULL, NULL, NULL),
 ('ot',              'presence_qty', 'operation theat|operating theat|\\bmodular ot|\\bots?\\b',            '(\\d+)\\s*(?:modular\\s*)?(?:operation|operating|ots?\\b)',            NULL, 1, 60, 10),
 ('blood_bank',      'presence',     'blood bank|blood storage|blood centre',                               NULL, NULL, NULL, NULL, NULL),
 ('anaesthesia',     'presence',     'anaesthe|anesthe',                                                    NULL, NULL, NULL, NULL, NULL),
 ('acc_jci',         'presence',     '\\bjci\\b|joint commission',                                          NULL, NULL, NULL, NULL, NULL),
 ('acc_nabh',        'presence',     '\\bnabh\\b',                                                          NULL, NULL, NULL, NULL, NULL),
 ('lab_accreditation','presence',    '\\bnabl\\b',                                                          NULL, NULL, NULL, NULL, NULL),
 ('pmjay',           'presence',     'ayushman|pm-?jay',                                                    NULL, NULL, NULL, NULL, NULL),
 ('teaching_text',   'presence',     'medical college|institute of medical sciences|\\baiims\\b|teaching hospital', NULL, NULL, NULL, NULL, NULL),
 ('xray',            'presence',     'x-?ray|radiograph',                                                   NULL, NULL, NULL, NULL, NULL),
 ('usg',             'presence',     'ultrasound|ultrasonograph|\\busg\\b|sonograph',                       NULL, NULL, NULL, NULL, NULL),
 ('mammography',     'presence',     'mammogra',                                                            NULL, NULL, NULL, NULL, NULL),
 ('dialysis_unit',   'presence_qty', 'dialysis (machines?|units?|stations?|chairs?|beds?|cent(re|er)|wing)|ha?emodialysis machines?|ro (water )?plant', '(\\d+)\\s*-?\\s*(?:bedded\\s*|beds?\\s*)?(?:dialysis|haemodialysis|hemodialysis)', NULL, 1, 100, 20),
 ('labour_room',     'presence',     'labou?r room|delivery room|labou?r ward',                             NULL, NULL, NULL, NULL, NULL),
 ('nicu',            'presence_qty', '\\bnicu\\b|neonatal intensive|\\bsncu\\b',                            '(\\d+)\\s*-?\\s*(?:bedded|beds?)?\\s*(?:nicu|neonatal|sncu)',          NULL, 1, 150, 20),
 ('neonatal_support','presence',     'ventilator|cpap|warmer|incubator|phototherapy',                       NULL, NULL, NULL, NULL, NULL),
 ('cath_lab',        'presence',     'cath\\s*lab|catheteri[sz]ation lab',                                  NULL, NULL, NULL, NULL, NULL),
 ('ccu',             'presence',     '\\bccu\\b|\\biccu\\b|cardiac (care|intensive)',                       NULL, NULL, NULL, NULL, NULL),
 ('mri',             'presence_qty', '\\bmri\\b|magnetic resonance',                                        '(\\d(?:\\.\\d)?)\\s*-?\\s*t(?:esla)?\\b',                              NULL, 0.2, 7, 3),
 ('ct',              'presence_qty', 'ct scan|\\bct\\b|computed tomograph',                                 '(\\d+)\\s*-?\\s*slice',                                                NULL, 1, 640, 128),
 ('pet',             'presence',     'pet[- ]?ct|pet scan',                                                 NULL, NULL, NULL, NULL, NULL),
 ('radiotherapy',    'presence',     'radiotherap|radiation (therapy|oncology)|linac|linear accelerator|brachytherap', NULL, NULL, NULL, NULL, NULL),
 ('chemotherapy',    'presence',     'chemotherap',                                                         NULL, NULL, NULL, NULL, NULL),
 ('audiometry',      'presence',     'audiometr|cochlear|\\bbera\\b|tympanometr',                           NULL, NULL, NULL, NULL, NULL)
AS t(feature, kind, rx, num_rx, not_rx, qty_min, qty_max, qty_ref);

-- Context: the feature only counts if the same ITEM also matches ctx_rx
CREATE OR REPLACE TABLE workspace.hackathon.ref_feature_context AS
SELECT * FROM VALUES
 ('neonatal_support', 'neonat|newborn|infant|nicu|sncu|baby|paediatric|pediatric')
AS t(feature, ctx_rx);

-- Specialty tags that also count as weak (0.3) presence (silver's standardised codes)
CREATE OR REPLACE TABLE workspace.hackathon.ref_feature_specialty AS
SELECT * FROM VALUES
 ('emergency_24x7','emergencyMedicine'), ('anaesthesia','anesthesiology'),
 ('icu','criticalCareMedicine'), ('nicu','neonatology'), ('radiotherapy','radiationOncology'),
 ('chemotherapy','medicalOncology'), ('pet','nuclearMedicine'), ('audiometry','audiology')
AS t(feature, specialty);
```

### 4.4 `silver_feature_hits`: claims × terms *(offline)*

```sql
CREATE OR REPLACE TABLE workspace.hackathon.silver_feature_hits AS
SELECT c.unique_id, t.feature, c.field, c.pos, c.text,
  CASE c.field WHEN 'equipment' THEN 1.0 WHEN 'procedure' THEN 1.0
               WHEN 'capability' THEN 0.9 ELSE 0.6 END                          AS strength,
  -- text-parsed quantity, only if inside the plausible range (§2)
  CASE WHEN t.num_rx IS NOT NULL AND (t.not_rx IS NULL OR NOT c.lc rlike t.not_rx) THEN
    CASE WHEN try_cast(nullif(regexp_extract(c.lc, t.num_rx, 1),'') AS DOUBLE) BETWEEN t.qty_min AND t.qty_max
         THEN try_cast(nullif(regexp_extract(c.lc, t.num_rx, 1),'') AS DOUBLE) END
  END                                                                            AS qty
FROM workspace.hackathon.silver_claims c
JOIN workspace.hackathon.ref_feature_terms t ON c.lc rlike t.rx
LEFT JOIN workspace.hackathon.ref_feature_context x ON x.feature = t.feature
WHERE NOT c.is_negated                                   -- M6
  AND (x.ctx_rx IS NULL OR c.item_lc rlike x.ctx_rx)     -- context word in the same item

UNION ALL                                                -- weak specialty-tag hits
SELECT e.unique_id, m.feature, 'specialties', NULL, e.s, 0.3, NULL
FROM (SELECT unique_id, explode(specialties_arr) AS s
      FROM workspace.hackathon.silver_facility_clean) e
JOIN workspace.hackathon.ref_feature_specialty m ON m.specialty = e.s;
```

### 4.5 `gold_facility_features`: long format, one row per facility × feature *(offline)*

Long format makes D a simple join with the weight table, and keeps each feature's evidence attached for the "why" panel.

```sql
CREATE OR REPLACE TABLE workspace.hackathon.gold_facility_features AS
WITH agg AS (                                -- best hit per facility × feature
  SELECT unique_id, feature,
         max(strength) AS s, max(qty) AS q,
         slice(array_sort(collect_list(named_struct('strength', strength, 'field', field, 'text', text)),
               (a, b) -> CASE WHEN a.strength > b.strength THEN -1 WHEN a.strength < b.strength THEN 1 ELSE 0 END), 1, 3)
           AS evidence
  FROM workspace.hackathon.silver_feature_hits GROUP BY unique_id, feature),

text_feats AS (                              -- every facility × every text feature (M3)
  SELECT f.unique_id, t.feature,
    CASE
      WHEN a.s IS NULL AND NOT f.has_text THEN NULL                             -- unknown
      WHEN a.s IS NULL AND f.truncated     THEN NULL                            -- M7: list cut off
      WHEN a.s IS NULL                     THEN 0.0                             -- not_mentioned
      WHEN t.kind = 'presence'             THEN a.s
      WHEN t.kind = 'presence_qty' AND a.q IS NOT NULL
           THEN a.s * (0.6 + 0.4 * CASE WHEN t.feature = 'mri' THEN least(1, a.q / t.qty_ref)
                                        ELSE least(1, ln(1 + a.q) / ln(1 + t.qty_ref)) END)
      WHEN t.kind = 'presence_qty'         THEN a.s * 0.6
      WHEN t.kind = 'qty_only'             THEN NULL                            -- handled in G3
    END AS value,
    CASE WHEN a.s IS NOT NULL THEN 'found'
         WHEN NOT f.has_text THEN 'unknown'
         WHEN f.truncated    THEN 'truncated'
         ELSE 'not_mentioned' END                                                AS status,
    a.q AS qty, a.evidence
  FROM workspace.hackathon.silver_facility_clean f
  CROSS JOIN workspace.hackathon.ref_feature_terms t
  LEFT JOIN agg a ON a.unique_id = f.unique_id AND a.feature = t.feature
  WHERE t.kind <> 'qty_only'),

wide AS (                                    -- helpers for derived/structured features
  SELECT f.*,
    max(CASE WHEN tf.feature = 'acc_jci'  AND tf.status = 'found' THEN 1 END) OVER w  AS has_jci,
    max(CASE WHEN tf.feature = 'acc_nabh' AND tf.status = 'found' THEN 1 END) OVER w  AS has_nabh,
    max(CASE WHEN tf.feature = 'teaching_text' AND tf.status = 'found' THEN 1 END) OVER w AS teach_txt,
    sum(CASE WHEN tf.feature IN ('xray','usg','ct','mri','pet','mammography') AND tf.status = 'found'
             THEN 1 ELSE 0 END) OVER w                                                AS n_diag,
    row_number() OVER (PARTITION BY f.unique_id ORDER BY tf.feature)                  AS rn
  FROM workspace.hackathon.silver_facility_clean f
  JOIN text_feats tf ON tf.unique_id = f.unique_id
  WINDOW w AS (PARTITION BY f.unique_id)),

beds_txt AS (SELECT unique_id, max(qty) AS beds_parsed FROM workspace.hackathon.silver_feature_hits
             WHERE feature = 'beds' GROUP BY unique_id),

structured AS (
  SELECT w.unique_id, x.feature, x.value, x.status, x.qty, CAST(NULL AS ARRAY<STRUCT<strength:DOUBLE, field:STRING, text:STRING>>) AS evidence
  FROM wide w
  LEFT JOIN beds_txt b ON b.unique_id = w.unique_id
  LATERAL VIEW inline(array(
    -- G1
    named_struct('feature','facility_type',
      'value', CASE w.facility_type WHEN 'hospital' THEN 1.0 WHEN 'nursing_home' THEN 0.7
                 WHEN 'clinic' THEN 0.4 WHEN 'doctor' THEN 0.2 END,
      'status', CASE WHEN w.facility_type IS NULL THEN 'unknown' ELSE 'found' END, 'qty', CAST(NULL AS DOUBLE)),
    -- G2
    named_struct('feature','doctors',
      'value', CASE WHEN w.n_doctors IS NOT NULL THEN least(1, ln(1 + w.n_doctors) / ln(101)) END,  -- least() skips NULLs, so guard it
      'status', CASE WHEN w.n_doctors IS NOT NULL THEN 'found' ELSE 'unknown' END,
      'qty', CAST(w.n_doctors AS DOUBLE)),
    -- G3
    named_struct('feature','beds',
      'value', CASE WHEN coalesce(w.capacity, w.capacity_text, b.beds_parsed) IS NOT NULL
                    THEN least(1, ln(1 + coalesce(w.capacity, w.capacity_text, b.beds_parsed)) / ln(1001)) END,
      'status', CASE WHEN coalesce(w.capacity, w.capacity_text, b.beds_parsed) IS NOT NULL THEN 'found' ELSE 'unknown' END,
      'qty', CAST(coalesce(w.capacity, w.capacity_text, b.beds_parsed) AS DOUBLE)),
    -- G10
    named_struct('feature','accreditation',
      'value', CASE WHEN w.has_jci = 1 THEN 1.0 WHEN w.has_nabh = 1 THEN 0.8
                    WHEN w.has_text AND NOT w.truncated THEN 0.0 END,
      'status', CASE WHEN w.has_jci = 1 OR w.has_nabh = 1 THEN 'found'
                     WHEN NOT w.has_text THEN 'unknown' WHEN w.truncated THEN 'truncated'
                     ELSE 'not_mentioned' END, 'qty', CAST(NULL AS DOUBLE)),
    -- G12
    named_struct('feature','teaching',
      'value', CASE WHEN array_contains(w.affiliations, 'academic') OR w.teach_txt = 1
                      OR lower(w.name) rlike 'medical college|institute of medical sciences|aiims' THEN 1.0
                    WHEN w.affiliations IS NOT NULL OR w.has_text THEN 0.0 END,
      'status', 'derived', 'qty', CAST(NULL AS DOUBLE)),
    -- G13
    named_struct('feature','diagnostic_breadth',
      'value', CASE WHEN w.has_text THEN w.n_diag / 6.0 END,
      'status', 'derived', 'qty', CAST(w.n_diag AS DOUBLE)),
    -- G14
    named_struct('feature','years_operating',
      'value', CASE WHEN w.year_established IS NOT NULL
                    THEN least(1, ln(1 + greatest(0, 2026 - w.year_established)) / ln(101)) END,
      'status', CASE WHEN w.year_established IS NOT NULL THEN 'found' ELSE 'unknown' END,
      'qty', CAST(2026 - w.year_established AS DOUBLE)),
    -- X1
    named_struct('feature','is_public',
      'value', CASE WHEN w.operator_type IN ('public','government') OR array_contains(w.affiliations, 'government') THEN 1.0
                    WHEN w.operator_type IS NOT NULL THEN 0.0 END,
      'status', 'derived', 'qty', CAST(NULL AS DOUBLE))
  )) x
  WHERE w.rn = 1)

SELECT unique_id, feature, value, status, qty, evidence FROM text_feats
WHERE feature NOT IN ('acc_jci','acc_nabh','teaching_text')        -- folded into G10 / G12
UNION ALL
SELECT unique_id, feature, value, status, qty, evidence FROM structured;
```

Status values: `found`, `not_mentioned` (text exists but doesn't mention it → 0), `unknown` (data missing → 0.5 in D), `truncated` (list cut off at 50, M7 → 0.5 in D), `derived`. The UI shows `unknown` as *"not reported"*.

### 4.6 `ref_service_weights` + `gold_service_depth`: D per facility × service *(offline)*

```sql
CREATE OR REPLACE TABLE workspace.hackathon.ref_service_weights AS
SELECT * FROM VALUES
 ('dialysis','dialysis_unit',.35), ('dialysis','icu',.15), ('dialysis','accreditation',.10),
 ('dialysis','doctors',.10), ('dialysis','beds',.10), ('dialysis','facility_type',.20),
 ('emergency_csection','labour_room',.10), ('emergency_csection','nicu',.10), ('emergency_csection','emergency_24x7',.20),
 ('emergency_csection','ot',.20), ('emergency_csection','blood_bank',.20), ('emergency_csection','accreditation',.10),
 ('emergency_csection','beds',.10),
 ('nicu','nicu',.25), ('nicu','neonatal_support',.20), ('nicu','emergency_24x7',.15), ('nicu','accreditation',.15),
 ('nicu','teaching',.10), ('nicu','beds',.15),
 ('cardiac_surgery','cath_lab',.30), ('cardiac_surgery','ccu',.20), ('cardiac_surgery','ot',.10),
 ('cardiac_surgery','blood_bank',.05), ('cardiac_surgery','accreditation',.15), ('cardiac_surgery','teaching',.10),
 ('cardiac_surgery','beds',.10),
 ('mri','mri',.45), ('mri','emergency_24x7',.20), ('mri','lab_accreditation',.15), ('mri','accreditation',.20),
 ('oncology','radiotherapy',.30), ('oncology','chemotherapy',.20), ('oncology','pet',.15),
 ('oncology','accreditation',.10), ('oncology','teaching',.15), ('oncology','beds',.10),
 ('ent','doctors',.35), ('ent','audiometry',.25), ('ent','ot',.15), ('ent','accreditation',.15), ('ent','beds',.10),
 ('trauma','ct',.20), ('trauma','emergency_24x7',.20), ('trauma','ot',.15), ('trauma','blood_bank',.15),
 ('trauma','ambulance',.10), ('trauma','icu',.10), ('trauma','beds',.10),
 ('burn_care','icu',.25), ('burn_care','ot',.20), ('burn_care','blood_bank',.15), ('burn_care','beds',.15),
 ('burn_care','accreditation',.10), ('burn_care','teaching',.15)
AS t(service, feature, weight);
-- Keep in sync with §3.3.

CREATE OR REPLACE TABLE workspace.hackathon.gold_service_depth AS
SELECT ff.unique_id, w.service,
  100 * sum(w.weight * coalesce(ff.value, 0.5)) / sum(w.weight)                    AS depth_D,
  sum(CASE WHEN ff.value IS NOT NULL THEN w.weight ELSE 0 END) / sum(w.weight)    AS feature_coverage,
  -- top contributors for the "why" panel
  slice(array_sort(collect_list(named_struct(
      'contrib', w.weight * coalesce(ff.value, 0.5), 'feature', ff.feature, 'status', ff.status,
      'qty', ff.qty, 'evidence', ff.evidence)),
    (a, b) -> CASE WHEN a.contrib > b.contrib THEN -1 WHEN a.contrib < b.contrib THEN 1 ELSE 0 END), 1, 4)
                                                                                   AS top_contributors,
  filter(collect_list(CASE WHEN ff.value IS NULL THEN ff.feature END), x -> x IS NOT NULL) AS unknown_features
FROM workspace.hackathon.ref_service_weights w
JOIN workspace.hackathon.gold_facility_features ff ON ff.feature = w.feature
GROUP BY ff.unique_id, w.service;
```

### 4.7 `gold_service_scores`: everything that doesn't depend on the query *(offline)*

```sql
CREATE OR REPLACE TABLE workspace.hackathon.gold_service_scores AS
SELECT d.unique_id, d.service,
  e.evidence_score            AS E,          -- SCORING §3
  e.evidence_label,
  d.depth_D                   AS D,
  c.completeness_score        AS C,          -- SCORING §2 (confidence only)
  c.completeness_band,
  e.evidence_label IN ('Strong','Moderate') AND size(e.prerequisites_missing) = 0 AS passes_gate,
  e.evidence_label = 'Not offered'                                               AS not_offered,
  d.feature_coverage, d.top_contributors, d.unknown_features,
  e.supporting_claims, e.prerequisites_missing, c.missing_fields,
  l.lat, l.lon, l.location_quality
FROM workspace.hackathon.gold_service_depth d
JOIN workspace.hackathon.gold_service_evidence e USING (unique_id, service)
JOIN workspace.hackathon.gold_facility_completeness c USING (unique_id)
JOIN workspace.hackathon.silver_facility_location l USING (unique_id);
```

The gate condition is simplified; use each service's minimum bar from SCORING §4.2. `prerequisites_missing` lists only **checked** prerequisites that weren't found; implied ones are met by a direct claim (SCORING §3.1).

### 4.8 `find_care`: query time

```sql
CREATE OR REPLACE TABLE workspace.hackathon.ref_service_profile AS
SELECT * FROM VALUES
 -- service,            wE,  wD,  wA,  d_half_km, max_radius_km
 ('emergency_csection', .30, .10, .60,  15,  75),
 ('nicu',               .35, .15, .50,  25, 100),
 ('dialysis',           .30, .10, .60,  15,  75),
 ('burn_care',          .35, .25, .40,  40, 200),
 ('mri',                .40, .10, .50,  50, 200),
 ('cardiac_surgery',    .35, .45, .20, 150, 500),
 ('oncology',           .35, .45, .20, 150, 500),
 ('ent',                .40, .30, .30,  40, 150)
AS t(service, wE, wD, wA, d_half_km, max_radius_km);

CREATE OR REPLACE FUNCTION workspace.hackathon.find_care(p_service STRING, p_pincode BIGINT, k INT)
RETURNS TABLE (unique_id STRING, rank INT, rank_score DOUBLE, distance_km DOUBLE,
               E DOUBLE, D DOUBLE, A DOUBLE, confidence STRING, passes_gate BOOLEAN,
               location_quality STRING, top_contributors STRING, missing_fields STRING)
RETURN
WITH q AS (SELECT latitude AS lat, longitude AS lon FROM workspace.hackathon.silver_pincode_directory
           WHERE pincode = p_pincode AND is_primary_state),
     p AS (SELECT * FROM workspace.hackathon.ref_service_profile WHERE service = p_service),
     c AS (
  SELECT s.*, p.wE, p.wD, p.wA,
    2 * 6371 * asin(sqrt(pow(sin(radians(s.lat - q.lat) / 2), 2)
      + cos(radians(q.lat)) * cos(radians(s.lat)) * pow(sin(radians(s.lon - q.lon) / 2), 2))) AS dist,
    p.d_half_km, p.max_radius_km
  FROM workspace.hackathon.gold_service_scores s CROSS JOIN q CROSS JOIN p
  WHERE s.service = p_service AND s.lat IS NOT NULL AND NOT s.not_offered),
     r AS (
  SELECT c.*, 100 * pow(0.5, dist / d_half_km) AS A_
  FROM c WHERE dist <= max_radius_km),
     ranked AS (
  SELECT r.*,
    wE * E + wD * D + wA * A_                                                        AS score,
    CASE WHEN completeness_band = 'sparse' OR feature_coverage < 0.4
              OR (location_quality <> 'exact' AND evidence_label <> 'Strong')        THEN 'Low'
         WHEN evidence_label = 'Strong' AND completeness_band = 'rich'
              AND feature_coverage >= 0.6                                            THEN 'High'
         ELSE 'Medium' END                                                           AS conf,
    row_number() OVER (ORDER BY passes_gate DESC, wE * E + wD * D + wA * A_ DESC)    AS rn
  FROM r)
SELECT unique_id, CAST(rn AS INT), score, dist, E, D, A_, conf, passes_gate, location_quality,
       to_json(top_contributors), to_json(missing_fields)
FROM ranked WHERE rn <= k;
```

Gate-passing facilities rank first. Facilities that fail the gate follow as "partial options" (SCORING §4.2); "Not offered" facilities are excluded. If none pass, the app shows the fallback message (SCORING §4.5).

---

## 5. Offline vs query time

| Step | When | Re-run when… | Output |
|---|---|---|---|
| Thin view over the team's silver table (4.1) | **Offline, once** | silver data changes | `silver_facility_clean`, `silver_facility_location` |
| PIN geo table (team-built) | **Offline, once** | never (static directory) | `silver_pincode_directory` |
| Explode claims, flag negation (4.2) | **Offline, once** | data changes | `silver_claims` |
| Keyword / specialty dictionaries (4.3) | **Offline config** | P2 edits terms | `ref_feature_terms`, `ref_feature_specialty` |
| Feature hits + feature values (4.4–4.5) | **Offline, once** | data or dictionary changes | `silver_feature_hits`, `gold_facility_features` |
| Completeness score C | **Offline, once** | data changes | `gold_facility_completeness` |
| Evidence score E, gate, prerequisites | **Offline, once** | data or service definitions change | `gold_service_evidence` |
| Depth D per service (4.6) | **Offline, cheap** (≈ 80k rows) | **weights** change; seconds to rebuild | `gold_service_depth` |
| Join E + D + C + location (4.7) | **Offline, cheap** | any of the above | `gold_service_scores` |
| NFHS care-desert table | **Offline, once** | — | `gold_care_desert` |
| **Resolve user location** (PIN / city → lat/lon) | **Query time** (lookup into precomputed geo table) | — | — |
| **Distance + Access A** | **Query time** | — | — |
| **Radius filter, final score, ranking, top-k** | **Query time** | — | — |
| **Confidence label** | **Query time** (precomputed parts + location quality + distance) | — | — |
| **Reasons / citations text** | **Query time** (assembled from stored `top_contributors`, `supporting_claims`, `missing_fields`) | — | — |
| Optional user filters (PM-JAY, public only) and a "closer ↔ more capable" slider | **Query time** (changes `wA` / `wD` only) | — | — |

**Rule of thumb:** anything that depends only on the facility (and the service) is precomputed. Anything that depends on **where the user is** or **what they choose** is computed per query. Query time is one filtered scan of ~10k rows per service, so it's fast on the Free Edition starter warehouse.

---

## 6. Confidence

```
feature_coverage = Σ_i wD[s][i] · [feature_i known]          (offline, per facility × service)

confidence =
  Low     if completeness_band = sparse  OR  feature_coverage < 0.4
          OR (location_quality ≠ exact AND evidence_label ≠ Strong)
  High    if evidence_label = Strong AND completeness_band = rich AND feature_coverage ≥ 0.6
  Medium  otherwise
```

Missing values (M2) lower `feature_coverage`. An approximate location (M5) lowers confidence for anything that isn't strongly evidenced. Same rule as SCORING §4.7, where `completeness_band` is defined.

---

## 7. Validation run (2026-11-21, v3 rules, bronze table)

§4.1–4.6 were run end-to-end, read-only, against the live bronze table.

**Feature status counts (sample):**

| Feature | found | not_mentioned | truncated (M7) | unknown (no text) |
|---|---|---|---|---|
| accreditation | 1,310 | 7,233 | 1,454 | 80 |
| cath_lab | 489 | 7,756 | 1,763 | 80 |
| dialysis_unit (equipment only) | 471 | 7,703 | 1,834 | 80 |
| neonatal_support (with context) | 190 | 7,825 | 1,993 | 80 |

Structured features (no truncation effect): doctors found 3,628 · beds 2,678 · years_operating 4,781 · facility_type 10,010.

**Depth D by service:**

| Service | Median D | Max D | Avg feature coverage |
|---|---|---|---|
| Burn care (beta) | 8.1 | 93.5 | 0.79 |
| Cardiac surgery | 5.0 | 94.8 | 0.79 |
| Dialysis | 30.0 | 91.7 | 0.75 |
| Emergency C-section | 23.0 | 93.0 | 0.80 |
| ENT | 22.5 | 96.0 | 0.61 |
| MRI | 18.0 | 98.5 | 0.85 |
| NICU | 21.0 | 85.2 | 0.77 |
| Oncology | 5.0 | 99.2 | 0.79 |
| Trauma | 23.0 | 97.7 | 0.81 |

Coverage fell from v2 (0.70–0.99) because 21% of facilities have a truncated list, so a missing feature there is now `truncated` (unknown) rather than 0. ENT is lowest because it leans on `doctors` (64% missing). D is **not** gated: facilities without the service still get a (low) D. The E label (SCORING §3.4) is what removes them.

**Bugs caught by validation runs:**
- Spark's `least(1, NULL)` returns `1` (it skips NULLs), so missing doctors/beds/years scored as maximum. Fixed with `CASE WHEN x IS NOT NULL` guards in §4.5.
- `LATERAL VIEW … JOIN` is not valid Spark SQL. The specialty-tag hits use a subquery instead.

### 7.1 v4 run on the silver tables (2026-11-21)

§4.1–4.6 run end-to-end on `silver_facilities` (10,077 facilities, read-only test).

- **Location (M5, M8):** exact 8,460 · approximate (PIN centroid) 1,527 · unknown 90.
- **Doctors:** found 3,516 (112 flagged facilities treated as unknown, M8). **Beds:** found 2,690 (adds `clean_capacity_from_text`).
- **NICU** found 1,514 (was 712): silver's standardised `neonatology` tag (1,303 facilities) now maps to the weak (0.3) tag hit. Text-only NICU evidence is unchanged.
- **Audiometry** found 304 (adds the `audiology` tag).
- Depth D medians: burn 7.5 · cardiac 5.0 · dialysis 30.0 · C-section 17.0 · ENT 22.5 · MRI 16.0 · NICU 19.5 · oncology 5.0 · trauma 18.5. Coverage 0.61–0.85, as in v3.

## 8. Open questions

- Is the 50-item cap the only truncation, or are text fields also cut? (M7 assumes lists only.)
- Name-based specialist type (G15) is a regex on names; spot-check ~30 before relying on it for Strong.

- `beds` parsing takes the max "N beds" sentence. Check on ~20 records that this picks the hospital total and not one ward.
- Word-number quantities ("Twenty-bed NICU") are missed. Is it worth a small word→number map?
- The `\bct\b` and `\bot\b` patterns overmatch. Review a sample of hits before freezing the dictionary.
- Should `doctors` count for more than ENT? Tune it on the test queries.
