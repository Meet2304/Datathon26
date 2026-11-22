# Service Evidence: Implementation Plan (v2)

Companion to `data-model-normalized.md` (what the tables are) and `validation-report.md` (what the real data showed). This file defines **how** to build the service-evidence layer.

- **v1** (2026-11-21): first draft.
- **v2** (2026-11-21): updated with all 12 prioritised edits from `validation-report.md`, plus three changes of our own (section 0.2). Every number marked *(V#)* comes from that report. Weights and thresholds are still starting points until the labelled-sample check (Step 9) passes.

---

## 0. What changed from v1 and why

### 0.1 Changes driven by the validation report

| # | Area | v1 | v2 | Evidence |
|---|---|---|---|---|
| 1 | Row count | 10,000 facilities | `SELECT DISTINCT *` gives **9,989**. Assert `unique_id` is unique. Keep `cluster_id`. Normalise PINs. Treat the string `"null"` as NULL | V1, V2 |
| 2 | Facility type | Assumed a usable type column | 9 rules applied in order, mostly on the **name** (`facilityTypeId` only has hospital/clinic/dentist/doctor/pharmacy). Beds ≥ 50 promotes a facility to hospital | V3, V13 |
| 3 | Size caps | Unspecified | Beds 1–5,000. Doctors 1–2,000. **Doctors = 1 with beds ≥ 50 → NULL**. Doctors > 200 at a clinic or diagnostic centre → NULL. Year 1700–2026 | V4 |
| 4 | `specialties` | Searched with regex | **Exact match on camelCase codes** (table in 3.0). The regexes never matched them | V2, V6 |
| 5 | List cut-off | Not known | Every list stops at **50 items**. For a facility at the cap, missing evidence means "possibly cut off", not "absent" | V2 |
| 6 | Service regexes | Draft | Trauma narrowed to trauma-specific terms ("emergency care" moved to supporting). Cardiac surgery excludes gastric bypass. NICU/MRI direct terms extended. NICU/dialysis infrastructure widened | V6, V11 |
| 7 | Negations | 9 patterns | Added outsourced / "will be installed" / "not functional" and similar. "In collaboration with" deliberately left out | V7 |
| 8 | Field weights | 1.0 / 1.0 / 0.8 / 0.5 / 0.4 | **0.85 / 0.85 / 0.7 / 0.45 / 0.3**. A second item in the same field counts at half weight. Description counts **only when no structured field matched** | V8, V14 |
| 9 | Supporting-only cells | Weak tier (50–87% of cells) | New **Possible** tier: `0.15 × noisy-OR`, capped at 0.2. Hidden by default (see 0.2) | V8 |
| 10 | Strong rule | Infrastructure share ≥ 0.5, or the service has no infrastructure terms | **At least 1 infrastructure term**, or a per-service rule (MRI: term in equipment or a scanner/Tesla phrase), or a matching specialist type | V8 |
| 11 | Source score `src` | `min(Σ tier weights, 1)`: 53% of facilities hit 1.0 | Best tier's weight + a small bonus for distinct domains. Portal/aggregator URLs count only when the URL path contains the facility's name. Category pages drop to tier 5 | V5 |
| 12 | Merge rule | Any 2 of {PIN, state, name, kitchen-sink} | Location signals move to **`LOCATION_CONFLICT`**. `POSSIBLE_MERGE` is built from content: off-type claims, text naming another facility, templated text | V9, V10 |
| 13 | KITCHEN_SINK | Claim count above p95 for the type | A specialist type with **≥ 2 off-type claims** (plus 2 clinic and small-hospital rules), about 20–40 records | V9 |
| 14 | Templated text | Not handled | New `TEMPLATED_TEXT`: an item of ≥ 40 characters appearing word for word at ≥ 5 unrelated facilities gets × 0.5 | V13 |
| 15 | State mismatch | Compare state names directly (305 hits, mostly cities) | Only when the stated value is a real state name: **32** hits. Otherwise treat the field as a city or district hint | V10 |
| 16 | Recency | Weight 0.10 | Weight **0.05**. 65% of rows have no date. Future dates → NULL | V10 |
| 17 | Formula | Compare (a) multiplicative vs (b) shrinkage | **Adopt (b)**, shrinkage × `cap_factor` | V12 |
| 18 | Base rates | Unknown | dialysis 0.106 · C-section 0.044 · NICU 0.072 · cardiac 0.095 · MRI 0.095 · trauma ≈ 0.15 (re-measure after the regex fix) | V8, V12 |

### 0.2 Our own changes (beyond the report)

| # | Change | Why |
|---|---|---|
| A | **Location is removed from R completely** and enters only through `loc_factor` at serving time | The report found location counted twice. Splitting it out makes R purely about content and source trust, and keeps location about the query |
| B | **Possible (supporting-only) cells are stored, hidden by default, and shown as "Unconfirmed" when fewer than k better results exist within range** | In sparse regions (rural Bihar) an honest "unconfirmed nearby option" beats showing nothing. The label keeps it from looking like a recommendation |
| C | **Tiers are judged on labelled precision, not on how they split** (dropping the report's "aim for 30–50% Strong") | The share of Strong is whatever the data says. What matters is that Strong is reliably right |
| D | **Burn care added as a 7th service (draft, not yet validated)** | It's named in the challenge. The report found only one structured signal for it (the `burnAndTraumaPlasticSurgery` code) |
| E | **A "strong-evidence slot" at serving time** | Ranking is by score, but if no Strong facility makes the top k while one exists within range, it is added and labelled. This replaces ranking strictly by tier first |

---

## 1. Decisions

**D1: Combining R with confidence (adopted).** R pulls the evidence back toward the service's base rate:
```
conf_adj(f,s) = base_rate_s + R(f) × (conf_raw(f,s) − base_rate_s)
```
R contains no location terms (0.2 A).

**D2: Capability (adopted).** `capability = 0.4 × cap_size + 0.6 × cap_infra`.
- `cap_size`: beds first (`min(log1p(beds)/log1p(500), 1)`). If beds are missing, use doctors when doctors > 1. If both are unknown, use **0.5**.
- `cap_infra`: weighted share of the service's infrastructure terms that were found. Generic `ICU` counts at weight 0.5.
- At serving time, `cap_factor = 0.5 + 0.5 × capability`.

**D3: Merged records vs location conflicts (adopted).**
- `LOCATION_CONFLICT` covers PIN vs coordinates and namesake/branch mix-ups. It feeds location confidence only.
- `POSSIBLE_MERGE` is raised when **(i) KITCHEN_SINK** or **(ii) the text names another facility**, or when **(iii) TEMPLATED_TEXT** occurs together with (i).
- `NAME_COLLISION` becomes an info-level flag and plays no part in either rule.

**D4: Tiers (adopted).**

| Tier | Rule | Shown to user |
|---|---|---|
| **Strong** | A non-negated direct term in `procedure` or `equipment`, **and** at least one of: ≥ 1 infrastructure term · the per-service strong rule (3.x) · the facility is the matching specialist type. **And** a compatible type, R_tier ≠ Low, no POSSIBLE_MERGE | Yes |
| **Moderate** | A non-negated direct term in `procedure`, `equipment` or `capability`, not Strong | Yes |
| **Weak** | A direct term only in a `specialties` code or `description`, **or** Strong/Moderate downgraded by an incompatible type, Low R or POSSIBLE_MERGE | Yes, with a caveat |
| **Possible** | Supporting terms only | Hidden. Shown as "Unconfirmed" only as a fallback (0.2 B) |
| (no row) | Nothing matched | Counted in coverage via an anti-join |

**D5: Planner / NFHS view.** Out of scope for this phase.

---

## 2. Build order

### Step 0 (dependency): location
- PIN centroid = the **median** lat/lon of post offices with valid coordinates inside India, per PIN. Also store `pin_radius_km`.
- City centroid = the median coordinates of facilities in the same normalised `address_city` (only for cities with ≥ 5 facilities).
- **Vote** (V10):

| Situation | Resolved location | Confidence | Uncertainty |
|---|---|---|---|
| Coordinates and PIN centroid within 25 km of each other | Coordinates | High | max(1 km, coordinate-precision radius) |
| They disagree, and one of them is within 25 km of the city centroid | That one | Medium | 5 km, or the PIN radius |
| They disagree and the city vote doesn't settle it | PIN centroid | Low | The distance between the two |
| Only one source available | That source | Medium (coordinates) / Low (PIN only) | The PIN radius |

- Flag `LOCATION_CONFLICT`: warn for 25–200 km, severe above 200 km when the city vote is inconclusive.
- `STATE_MISMATCH` only when `address_stateOrRegion` is a real state name (AP and Telangana treated as equal).

### Step 1: `silver.facility_base` (cleaning, no judging)
1. Filter `organization_type = 'facility'`, then `SELECT DISTINCT *`, then assert `count(distinct unique_id) = count(*)` (9,989).
2. Normalise the string `"null"` to NULL. Normalise PINs with `regexp_replace(address_zipOrPostcode,'[^0-9]','')`.
3. Parse the five list columns with `from_json(col,'array<string>')`. Record `list_capped = true` for each column that has exactly 50 items.
4. Apply the V4 caps (row 3 of the table in 0.1). Flag `IMPLAUSIBLE_BEDS` (warn) when beds > 300 at a clinic, dental, diagnostic or eye facility.
5. Set `facility_type` using the rules below, top to bottom, first match wins (V3). All name regexes are case-insensitive.

| # | Type | Rule |
|---|---|---|
| 1 | other (pharmacy) | `facilityTypeId IN ('farmacy','pharmacy')` or name `\b(pharmacy\|chemist\|medical\s+stores?)\b` |
| 2 | dental | `facilityTypeId='dentist'` or name `\b(dental\|dentist\|dentistry\|orthodont\w*\|endodont\w*\|teeth\|tooth)\b`, unless the name matches `hospital\s+(and\|&)\s+dental` |
| 3 | eye | name `\b(eye\|netra\|nethra(laya)?\|ophthalm\w*\|retina\|lasik\|opticals?)\b` |
| 4 | nephrology-dialysis | name `\b(dialysis\|kidney\|nephro\w*\|renal)\b` and not `hospital` |
| 5 | diagnostic | name `\b(diagnostic\w*\|imaging\|scans?\|path(o)?lab\w*\|laborator(y\|ies)\|labs?\|x-?ray)\b` and not `hospital` |
| 6 | maternity | name `\b(maternity\|prasuti\w*\|matru\|women'?s?\|mother\|gyn(a)?ec\w*\|obstet\w*)\b`, or `\b(ivf\|fertility\|test\s+tube)\b` with `(hospital\|maternity\|nursing\s+home)` |
| 7 | hospital | `facilityTypeId IN ('hospital','nursing_home')`, or name `\b(hospitals?\|nursing\s+home\|medical\s+college\|institute\s+of\s+medical\s+sciences)\b`, or beds ≥ 50 |
| 8 | clinic | `facilityTypeId IN ('clinic','doctor')` |
| 9 | other (home care) | everything else |

6. Add `operator_type` (`public` covers public and government; otherwise private or NULL). Keep `affiliationTypeIds` for display only.
7. Keep every raw column for citation.
- Gate: re-check V1–V4 counts on the output.

### Step 2: `facility_source`
- Extract the domain with a regexp; `parse_url` fails on 11,298 URLs: `lower(regexp_replace(regexp_extract(trim(url),'^(?:https?://)?([^/?#:]+)',1),'^www\.',''))`.
- Assign tiers using the V5 mapping: 1 gov/academic (`.gov.in`, `.nic.in`, `.gov`, `.ac.in`, `.edu.in`) · 2 own site (matches the domain of `officialWebsite`) · 3 health portal · 4 aggregator/insurer · 5 social/reference/other (the default).
- `url_mentions_facility`: true when the URL path contains a name token of ≥ 4 letters. For tier 3–4 URLs where this is false, and for category pages (`/nct-`, `/Listing/`, `hospitals-in-`), downgrade the tier to 5.
- `src = min(1, best_tier_weight + 0.05 × min(n_distinct_tier1to4_domains − 1, 4))`, with tier weights gov 0.9, own site 0.8, portal 0.6, aggregator 0.4, other 0.2.

### Step 3: `ref.service`, `ref.service_term`, `ref.service_specialty_code`
- Load the seven specs from section 3 as rows.
- Load the specialty-code mapping (3.0) as its own table. Codes are matched exactly, never with regex.

### Step 4: `evidence`
1. Explode each list field with its position. Split `description` into sentences.
2. Remove duplicates on `(facility_id, field, lower(trim(item_text)))`.
3. Match each `service_term` regex against each item. Match `specialties` items against the code table.
4. **Item exclusions:** drop a hit when the item also matches that service's exclusion pattern (cardiac: gastric/bariatric; trauma: eye/dental/facial trauma).
5. **Negation:** for list items, check the whole item. For description, check 40 characters before the match. Store `negation_text`.
6. **Templated text:** set `templated = true` when an item of ≥ 40 characters appears word for word at ≥ 5 facilities with different first name tokens.

### Step 5: `facility_flag` and `facility` (record reliability R)
- Flags: `LOCATION_CONFLICT`, `STATE_MISMATCH`, `KITCHEN_SINK`, `POSSIBLE_MERGE`, `TEMPLATED_TEXT`, `IMPLAUSIBLE_BEDS`, `SHARED_CLUSTER` (info), `NAME_COLLISION` (info).
- **KITCHEN_SINK** (V9). Here, *claims* = the number of the seven services with a direct match in procedure, equipment or capability; *off-type claims* = claims for services listed as incompatible with the facility's type. Raise it when any of these holds:
  - type ∈ {dental, eye, diagnostic, nephrology-dialysis} and off-type claims ≥ 2
  - type = clinic, beds < 30 or unknown, and claims ≥ 3
  - type = hospital, beds < 30, and claims ≥ 4
- **R, with no location terms** (0.2 A):
  ```
  R = max(0.3, 0.40 × src + 0.40 × consistency + 0.15 × completeness + 0.05 × recency)
  ```
  - `consistency` = 1 − 0.25 per warn flag − 0.5 per severe flag (POSSIBLE_MERGE is severe; KITCHEN_SINK, IMPLAUSIBLE_BEDS and TEMPLATED_TEXT are warn). Floored at 0. **LOCATION_CONFLICT does not count here.**
  - `completeness` = share of {beds, doctors > 1, year, equipment non-empty} that are present.
  - `recency`: 1.0 if within 2 years, 0.6 if within 5, 0.5 if unknown, 0.3 if older.
  - `R_tier`: High ≥ 0.75, Medium ≥ 0.5, Low < 0.5. **Re-check the distribution (V15).**

### Step 6: `facility_service`
1. **conf_raw.** Collect the non-negated direct hits into one list of contributions:
   - Each structured field adds its first item at full field weight (procedure 0.85, equipment 0.85, capability 0.7, specialties code 0.45) and its second distinct item at half that weight. Further items add nothing.
   - Templated items count × 0.5.
   - `description` adds 0.3, but only if no structured field had a direct hit.

   `conf_raw = 1 − Π(1 − contribution)`. Examples: one procedure item = 0.85; procedure + capability = 0.955.
2. **Supporting-only cells:** `conf_raw = min(0.2, 0.15 × noisy-OR(supporting contributions))`. Tier Possible.
3. **Plausibility:** incompatible type → × 0.2 (for a clinic, cardiac surgery is incompatible only when beds < 30 or unknown). KITCHEN_SINK → × 0.7.
4. `conf_adj` per D1, `capability` per D2, tier per D4.
5. `reasons`: the 3–5 biggest contributions in plain English, e.g. "Dialysis listed in procedures: 'Hemodialysis unit with 12 machines'", "MRI is outsourced", "Eye hospital claiming cardiac surgery (unusual)". If `list_capped` is true, add "Record lists were cut off at 50 items; other services may be missing".

### Step 7: `serving_facility_service`
- A flat join of facility, location, scores, the top 3 citations (`item_text`, field, source URL), reasons and flags.
- Ranking:
  ```
  final = (conf_adj × cap_factor)^α × exp(−road_km / d0)^β × loc_factor
  loc_factor: High 1.0 · Medium 0.85 · Low 0.6
  road_km = 1.4 × haversine
  ```
- Gate: Strong, Moderate and Weak only. Widen the radius 25 → 50 → 100 → 250 km (up to `max_radius_km`) until there are k results of Moderate or better.
- Strong-evidence slot (0.2 E). Unconfirmed fallback (0.2 B).

### Step 8: Acceptance queries (hand-inspected)
Dialysis near Jaipur · emergency C-section near Lucknow · NICU in Pune · cardiac surgery from Patna · MRI in a rural Bihar district · trauma in a national-highway district · burn care near Delhi.

### Step 9: Labelling and calibration
- 140 facility-service pairs, stratified 40 Strong / 40 Moderate / 40 Weak / 20 Possible across the seven services. Label each true / false / can't tell.
- **Targets:** Strong precision ≥ 90%, Moderate ≥ 75%, and Weak reported as-is. Then fit a logistic regression on the same features and compare its weights with the hand-set ones.

---

## 3. Service specs (v2)

All regexes are Java/Spark syntax, case-insensitive (`(?i)`).

**Shared negation patterns:**
```
refer(red|ral)?\s+(to|out)|coming soon|planned|proposed|upcoming|under construction|tie[- ]?up|\bno\s+(facility|facilities)\b|outsourc\w*|will\s+be\s+(installed|started|commissioned|set\s+up|launched|available)|awaited|in\s+the\s+pipeline|not\s+(yet\s+)?(available|functional|operational|offered|provided)|non[- ]?functional|discontinued|unavailable|nearby\s+(centre|center|hospital)
```
Do **not** add `in collaboration with`.

### 3.0 Specialty codes (exact match, V6)

| Service | Direct code (weight 0.45) | Supporting codes |
|---|---|---|
| dialysis | none | nephrology, pediatricNephrology |
| emergency_csection | none | gynecologyAndObstetrics, obstetricsAndMaternityCare, maternalFetalMedicineOrPerinatology |
| nicu | none | neonatologyPerinatalMedicine, pediatricCriticalCareMedicine |
| cardiac_surgery | cardiacSurgery, cardiothoracicSurgery | cardiology, pediatricCardiology |
| mri | none | radiology, diagnosticRadiology, interventionalRadiology |
| trauma | none | emergencyMedicine, orthopedicSurgery, neurosurgery, burnAndTraumaPlasticSurgery |
| burn_care | burnAndTraumaPlasticSurgery | plasticSurgery (check the exact code) |

### 3.1 dialysis
- **direct:** `\b(haemo|hemo|peritoneal\s+)?dialy(sis|ses|zer|zers)\b` · `\b(CAPD|CRRT|SLED)\b`
- **supporting:** `\bnephrolog(y|ist|ists|ical)\b` · `\b(renal|kidney)\s+(care|unit|failure|replacement|transplant)\b`
- **infrastructure:** `\bdialysis\s+(machines?|stations?|beds?|units?)\b` (1.0) · `\bnephrolog(ist|ists)\b` (1.0) · `\bRO\s+(water|plant)\b` (1.0) · `(?<![NP])\bICU\b` (0.5)
- **strong rule:** the facility type is nephrology-dialysis
- **incompatible:** dental, eye, diagnostic · d0 25 km · max 150 km · α 1 · β 1.2

### 3.2 emergency_csection
- **direct:** `\b(c[- ]?section|caesarean|cesarean|LSCS)\b`
- **supporting:** `\b(obstetric(s|al|ian)?|gyn(a)?ecolog\w*|OBG|OB[/ -]?GYN|maternity|labou?r\s+room|high[- ]risk\s+pregnan\w*)\b`
- **infrastructure:** `\b(operation\s+theat(re|er)|operating\s+(theat(re|er)|room)|modular\s+OT)\b` · `\ban(a)?esthe\w*\b` · `\bblood\s+(bank|storage)\b` · `\b24\s*[x/×]\s*7\b|\b24\s+hours?\b|round[- ]the[- ]clock` · `\b(NICU|SNCU)\b`
- **strong rule:** the facility type is maternity
- **incompatible:** dental, eye, diagnostic, nephrology-dialysis · d0 25 km · max 100 km · α 1 · β 1.5

### 3.3 nicu
- **direct:** `\b(NICU|SNCU|neonatal\s+intensive\s+care|newborn\s+intensive\s+care|level\s+(II|III|2|3)\s+neonatal)\b` · `\bneonatal\s+(ICU|intensive)\b`
- **supporting:** `\b(neonatolog\w*|p(a)?ediatric\w*|paediatric\w*)\b`
- **infrastructure (widened, V11):** `\b(ventilators?|warmers?|incubators?|phototherapy|CPAP|neonatolog(ist|ists)|level\s+(II|III|IIIA|3)|SNCU)\b`
- **incompatible:** dental, eye, diagnostic, nephrology-dialysis · d0 50 km · max 200 km · α 1.2 · β 1

### 3.4 cardiac_surgery
- **direct:**
  - `\b(cardiac|heart|cardio[- ]?thoracic|open[- ]heart)\s+surger(y|ies)\b`
  - `\b(coronary(\s+artery)?|heart|cardiac)\s+bypass(\s+(graft\w*|surger(y|ies)))?\b`
  - `(?<!(gastric|bariatric|ileal)\s)\bbypass\s+surger(y|ies)\b`
  - `\b(CABG|CTVS|OPCAB)\b`
  - `\b((mitral|aortic|tricuspid|pulmonary|heart)\s+)?valve\s+(replacement|repair)\b`
- **item exclusion:** `\b(gastric|bariatric|roux|obesity|weight[- ]loss)\b`
- **supporting:** `\bcardiolog\w*\b` · `\b(angioplasty|angiography|PTCA|PCI)\b`
- **infrastructure:** `\bcath(eteri[sz]ation)?\s*lab\b` · `\b(CCU|CICU|ICCU|CTICU)\b` · `(?<![NP])\bICU\b` (0.5) · `\b(heart[- ]lung\s+machine|perfusion\w*)\b`
- **incompatible:** dental, eye, diagnostic, maternity, nephrology-dialysis, and clinic (only when beds < 30 or unknown) · min size Medium · d0 150 km · max 500 km · α 1.5 · β 0.7

### 3.5 mri
- **direct:** `\bMRI\b` · `\bmagnetic\s+resonance\b` · `\bMR\s+(imaging|angiography)\b` · `\b(1\.5|3(\.0)?)\s*T(esla)?\b`
- **supporting:** `\bradiolog\w*\b` · `\b(imaging|scan)\s+cent(re|er)\b`
- **infrastructure:** none
- **strong rule:** the MRI term is in `equipment`, or the item has a scanner/Tesla phrase (`\b(scanner|machine|\d(\.\d)?\s*T(esla)?)\b`). An MRI term only in procedure or capability is at most Moderate
- **incompatible:** dental, eye · d0 75 km · max 300 km · α 1 · β 0.8

### 3.6 trauma (narrowed, V6)
- **direct:** `\b(trauma\s+(care|cent(re|er)|unit|surgery|ward|team|icu|services?)|poly[- ]?trauma|accident\s+(and|&)\s+emergency|emergency\s+(and|&)\s+trauma|trauma\s+(and|&)\s+emergency|casualty)\b`
- **item exclusion:** `\b(ocular|eye|orbital|dental|tooth|teeth|maxillo[- ]?facial|facial|hand|psycholog\w*|emotional|birth|urinary\s+tract|genito[- ]?urinary)\s+trauma`
- **supporting (moved here from direct):** `\bemergency\s+(department|room|ward|services?|care|unit)\b|\b24\s*[x/×]\s*7\s+emergency\b` · `\b(orthop(a)?edic\w*|neuro[- ]?surg\w*|general\s+surg\w*)\b`
- **infrastructure:** `\bambulance\w*\b` · `\b24\s*[x/×]\s*7\b|round[- ]the[- ]clock` · `\bblood\s+bank\b` · `\b(CT\s+scan(ner)?|computed\s+tomography)\b` · `(?<![NP])\bICU\b`
- **incompatible:** dental, eye, diagnostic, nephrology-dialysis · d0 25 km · max 100 km · α 0.8 · β 1.5

### 3.7 burn_care (draft, not validated)
- **direct:** `\bburns?\s+(unit|ward|care|cent(re|er)|icu|management|treatment|surgery)\b` · `\bburn\s+injur\w*\b`
- **item exclusion:** `\b(sun|razor|heart|acid\s+reflux)\s*burn\w*\b|\bheartburn\b`
- **supporting:** `\bplastic\s+(and\s+reconstructive\s+)?surg\w*\b` · `\bskin\s+graft\w*\b`
- **infrastructure:** `(?<![NP])\bICU\b` (0.5) · `\bdressing\s+room\b` · `\bblood\s+bank\b` · `\boperation\s+theat(re|er)\b`
- **incompatible:** dental, eye, diagnostic, maternity, nephrology-dialysis · d0 100 km · max 400 km · α 1.2 · β 1

---

## 4. Checks to run before and after building

**Re-run after the v2 changes:**

| ID | Check | Pass criterion |
|---|---|---|
| V8′ | Tier distribution per service with the v2 weights, regexes and tier rules | `conf_raw` takes ≥ 4 distinct levels among direct cells. No service has ≥ 90% of direct cells in one tier. MRI is no longer automatically Strong |
| V12′ | The three acceptance queries under the full v2 formula | Top 5 look sensible by hand. The R and confidence spread actually changes ranks |
| V6′ | Re-sample 25 trauma and 25 cardiac direct items | Trauma precision ≥ 85%. No gastric bypass |

**New checks:**

| ID | Check | Pass criterion |
|---|---|---|
| V15 | R distribution with no location and the new `src` | p10–p90 spread ≥ 0.3. Low tier holds 5–20% |
| V16 | KITCHEN_SINK and POSSIBLE_MERGE lists | 20–60 records. Hand-check 15: ≥ 80% are real merges or contamination |
| V17 | Location vote output | Shares of High/Medium/Low. Hand-check 10 Low and 10 Medium records on a map |
| V18 | Burn care spec | Precision of a 25-item sample ≥ 85%. Number of facilities with any direct hit |
| V19 | `list_capped` effect | Share of Strong/Moderate cells per service at facilities whose lists hit the 50-item cap |
