# Validation Report: Service Evidence Plan vs Real Data

Companion to `data-model-normalized.md` and `service-evidence-implementation-plan.md`. All numbers come from read-only SQL against `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.*` on 2026-11-21. Nothing was created or changed in the catalog.

## Summary

The plan's structure holds up: long-format evidence, noisy-OR across fields, rule-based tiers and the D1 shrinkage are all workable on this data. The weights, regexes and several assumptions about the source columns need changing before the build. Five problems matter most:

1. **The source columns are not what the plan assumes.** `unique_id` is not unique (11 exact duplicate rows, so 9,989 facilities). `facilityTypeId` only has hospital / clinic / dentist / doctor / pharmacy, so eye, diagnostic, maternity and dialysis types have to come from the name. `specialties` is a camelCase code list (`cardiacSurgery`), so the draft regexes never match it. Every list column is cut off at 50 elements.
2. **R hardly varies.** `source_urls` is long and mostly unrelated to the facility (median 6 domains, p90 15), so `src` hits its cap of 1.0 for 53% of facilities. With the plan's weights the median R is 0.84 and 63% of facilities score at least 0.8. The 0.3 floor never applies. In the three test queries every top-5 facility had R ≥ 0.98 except one, so D1 currently does almost nothing.
3. **`conf_raw` jumps straight to 1.0.** One procedure or equipment hit gives 1.0, so confidence cannot separate the top candidates. Capability and distance decide the ranking instead.
4. **Trauma direct terms are only about 40% precise.** Generic "24/7 emergency care" makes up most of the matches. Cardiac surgery matches "gastric bypass surgery" (72 of the 176 facilities that mention bypass surgery). MRI misses the negation "outsourced".
5. **The ≥2-signal merge rule (D3) catches the wrong records.** Of the 189 records with 2 or more signals, almost all are PIN_COORD_MISMATCH + NAME_COLLISION on generic names ("Galaxy Hospital", "Medicare Hospital"). Those are geocoding mix-ups with a namesake, not merged records. The real merges show up in the content: an eye hospital claiming dialysis, NICU and MRI.

Overall verdict: **ADJUST, then build.** 3 checks pass, 9 need adjustment, 2 fail.

---

## Results table

| ID | Result | One-line recommendation |
|---|---|---|
| V1 | **FAIL** (minor) | 9,989 unique facilities, not 10,000: 11 `unique_id`s appear twice as identical copies. `SELECT DISTINCT *` (or `row_number()` per `unique_id`) before anything else. Normalise PINs (strip spaces). |
| V2 | **ADJUST** | JSON parsing works 100% (the only failures are the literal string `"null"`). Every list is cut at 50 elements (29% of facilities hit the cap in `specialties`). Items are short phrases (median 27–41 chars), so `item_text` works as a citation. Dedupe repeated items. |
| V3 | **ADJUST** | `facilityTypeId` has 5 real values. Use the name-based rules below, in order of precedence (99.75% of rows covered). |
| V4 | **ADJUST** | Beds valid 1–5,000 (NULL 1 value of 200,000 and 13 values ≤ 0). Doctors valid 1–2,000, and NULL when doctors = 1 with beds ≥ 50 (102 rows) or doctors > 200 at a clinic or diagnostic centre. Year valid 1700–2026. |
| V5 | **ADJUST** | The mapped tiers 1–4 cover 63% of URL rows (76% counting named social/reference sites as tier 5). The tail is long, so 80% is out of reach. Change the formula, not the mapping: `src` saturates for 53% of facilities. |
| V6 | **ADJUST** | Direct-term precision: dialysis, C-section and NICU ≥ 95%. Cardiac 92–96% (fix gastric bypass). MRI 88% (needs the outsourced negation). **Trauma about 40%**: move "emergency care/services" to supporting and exclude eye/dental/facial trauma. Map specialties by code. |
| V7 | **ADJUST** | The draft negations hit 33 of 16,452 direct items (0.2%), and all 14 sampled were correct. Add `outsourc\w*`, "will be installed/available", "not functional" and similar (+24 items, 23 of 24 correct). Leave out "in collaboration with". |
| V8 | **FAIL** | Tiers are degenerate. MRI is 98% Strong among cells with a direct term (no infrastructure terms, so Strong is automatic). NICU and cardiac Strong is ≤ 3%, because cap_infra ≥ 0.5 is almost never reached. Weak is 50–87% of cells (supporting-only matches). `conf_raw` jumps to 1.0. |
| V9 | **ADJUST** | The specialties count is useless (29% are at the 50 cap). For hospitals, the six-service claim count has p95 = 3, and the facilities claiming 5 are mostly real large hospitals. KITCHEN_SINK should mean "specialist type with ≥ 2 off-type claims", not a p95 cut-off. |
| V10 | **ADJUST** | 189 records have ≥ 2 signals, almost all PIN + NAME on generic names. Make PIN/NAME a location-confidence problem (`LOCATION_CONFLICT`) and build POSSIBLE_MERGE from content signals. STATE_MISMATCH is rare (32) once you compare only real state names. |
| V11 | **PASS** (informative) | Among Moderate-or-better cells, beds are present 50–71% of the time (size known 65–80%). At least one infrastructure term appears in 75–88% of C-section and trauma cells but only 25% of NICU cells. NICU's infrastructure list needs widening. |
| V12 | **ADJUST** | Prefer (b), D1 shrinkage × cap_factor. It keeps a 350-bed hospital that lists cardiac surgery in its procedures in the Patna top 5, while (a) demotes it only because no infrastructure term matched. But (b) only differs from (a) through cap_factor while R ≈ 1, and it counts location twice (in R and in `loc_factor`). |
| V13 | **PASS** | 110 incompatible-type facility-service pairs have a direct match. In a sample of 24, about 20 were contamination or merges (an eye hospital claiming CABG). The rule is needed. Two type exceptions fix most of the true positives. |
| V14 | **PASS** (decision) | 85–93% of description hits for a service also appear in a structured field. Description is not independent: give it weight only when no structured field matched. |

---

## V1. Row counts and uniqueness

```sql
WITH f AS (SELECT * FROM ...facilities WHERE organization_type='facility')
SELECT count(*), count(distinct unique_id), count(distinct cluster_id) FROM f;
-- dup check: GROUP BY unique_id HAVING count(*)>1, then md5 of all content columns
```

| Metric | Value |
|---|---|
| Rows with `organization_type='facility'` | 10,000 |
| Distinct `unique_id` | **9,989** (11 IDs appear twice; each pair has an identical content hash) |
| Distinct `cluster_id` | 9,959 (so 30 more records share a cluster with another `unique_id`) |
| Name + city + PIN duplicate groups | 13 groups / 26 rows (11 are the exact copies) |
| Normalised name + PIN duplicate groups | 15 |

The duplicated IDs include MOSC Medical College Hospital (Kolenchery), Trustwell Hospitals (Bengaluru), HCG Multi Specialty Hospital (Ahmedabad) and Shraddha Heart Hospital (Mumbai).

**Recommendation.**
- Step 1: `SELECT DISTINCT *` and assert that `unique_id` is unique afterwards.
- Store `cluster_id` and flag `SHARED_CLUSTER` (info) when it is shared. That covers 30 records; it is a cheap duplicate signal.
- Normalise PINs with `regexp_replace(address_zipOrPostcode,'[^0-9]','')` (e.g. "629 165").
- All later numbers in this report use the 9,989 deduplicated rows.

## V2. JSON parsing and element shape

```sql
SELECT col, count(*), sum(case when v is not null and from_json(v,'array<string>') is null then 1 end) ...
-- element lengths: explode(from_json(...)) then percentile(length(el), array(0.5,0.95))
```

| Column | Parse fail | Elements per row p50 / p95 / max | Element length p50 / p95 | Distinct / total elements |
|---|---|---|---|---|
| specialties | 0 | 24 / 50 / 50 | 16 / 34 | 2,933 / 279k (controlled vocabulary) |
| procedure | 30 (`"null"` literal) | 12 / 50 / 50 | 27 / 83 | 89k / 167k |
| equipment | 110 (`"null"`) | 4 / 30 / 50 | 29 / 79 | 35k / 60k |
| capability | 7 (`"null"`) | 19 / 50 / 50 | 41 / 112 | 168k / 233k |
| source_urls | 0 | 10 / 50 / 50 | 68 / 134 | 110k / 170k |

- Parsing is effectively 100%. Treat the string `"null"` as NULL.
- **Every list is cut off at exactly 50 elements.** 2,878 facilities (29%; 44% of hospitals) have 50 specialties, 573 hospitals have 50 procedures, and 1,278 hospitals have 50 capabilities. Missing evidence on a big hospital can mean "cut off", not "absent".
- Items are phrases or short sentences ("Cesarean section deliveries", "MRI 1.5 Tesla with Advanced Studies"). C1's `item_text` is the right citation unit; `matched_text` alone is too short.
- `specialties` holds camelCase codes (`internalMedicine`, `cardiacSurgery`, `neonatologyPerinatalMedicine`). `\b` regexes fail on them: `\bcardiac\s+surgery` never matches `cardiacSurgery`. See V6 for the code mapping.
- The same item is often repeated within a facility ("Has Haemo dialysis centre" twice). Dedupe evidence on `(facility_id, field, lower(trim(item_text)))`.
- `description` is short (median 115 chars, p95 535) and splits into 18,504 sentences in total.

## V3. Facility type mapping

The only type-like columns are `facilityTypeId` and `operatorTypeId`, plus `affiliationTypeIds`. `organization_type` is constant after the filter.

| Column | Values (count) |
|---|---|
| `facilityTypeId` | hospital 5,637 · clinic 3,782 · dentist 490 · NULL 57 · doctor 21 · farmacy 10 · pharmacy 2 · nursing_home 1 |
| `operatorTypeId` | private 8,842 · NULL 687 · public 469 · government 2 |
| `affiliationTypeIds` | NULL 8,761; otherwise a JSON array with repeats such as `["government","government"]`. Values: government, academic, philanthropy-legacy, community, faith-tradition |

**Proposed mapping.** Rules are applied top to bottom and the first match wins. Name regexes are case-insensitive.

| # | Normalised type | Rule | Rows (approx.) | Examples |
|---|---|---|---|---|
| 1 | other (pharmacy) | `facilityTypeId IN ('farmacy','pharmacy')` or name `\b(pharmacy\|chemist\|medical\s+stores?)\b` | 13 | Adarsh Medical Stores, Medplus |
| 2 | dental | `facilityTypeId='dentist'` or name `\b(dental\|dentist\|dentistry\|orthodont\w*\|endodont\w*\|teeth\|tooth)\b`, **unless** name matches `hospital\s+(and\|&)\s+dental` (then fall through) | ~1,790 | Thind Dental Clinic, Meenakshi Ammal Dental College |
| 3 | eye | name `\b(eye\|netra\|nethra(laya)?\|ophthalm\w*\|retina\|lasik\|opticals?)\b` | ~565 | Sankara Eye Hospital, Mehta International Eye Institute |
| 4 | nephrology-dialysis | name `\b(dialysis\|kidney\|nephro\w*\|renal)\b` **and not** `hospital` | ~25 | Patna Dialysis Centre, Tolly Lions Dialysis Centre |
| 5 | diagnostic | name `\b(diagnostic\w*\|imaging\|scans?\|path(o)?lab\w*\|laborator(y\|ies)\|labs?\|x-?ray)\b` **and not** `hospital` | ~595 | Vijaya Diagnostic Centre, Metro Imaging Centre |
| 6 | maternity | name `\b(maternity\|prasuti\w*\|matru\|women'?s?\|mother\|gyn(a)?ec\w*\|obstet\w*)\b`, or `\b(ivf\|fertility\|test\s+tube)\b` **and** `(hospital\|maternity\|nursing\s+home)` | ~250 | Brinda Women's Hospital, Swastik Maternity & Medical Centre |
| 7 | hospital | `facilityTypeId IN ('hospital','nursing_home')`, or name `\b(hospitals?\|nursing\s+home\|medical\s+college\|institute\s+of\s+medical\s+sciences)\b`, or beds ≥ 50 | ~4,950 | KEM Hospital Pune, Belle Vue Clinic (304 beds) |
| 8 | clinic | `facilityTypeId IN ('clinic','doctor')`, including standalone IVF clinics | ~1,840 | Madhavbag Clinic, Nova IVF Fertility |
| 9 | other (home care) | everything else | ~25 | Sanjeevani Home Care, Beena Home Nursing |

- Coverage: all but about 25 rows (99.75%) land in a named type. **PASS on coverage**, but only with name rules.
- The order matters. Putting nephrology before diagnostic and requiring "not hospital" fixes "I Care Diagnostic and Dialysis Center" and "Life Line Care Hospital & Dialysis Centre" (see V13).
- Large records labelled clinic are really hospitals: Attingal Medical Centre (580 beds), Belle Vue Clinic (304), Vijaya Hospital Kochi (300). The beds ≥ 50 rule promotes them.
- Keep `operator_type` (private / public / NULL) as its own column. Map `public` and `government` to `public`. Use `affiliationTypeIds` only for display.

## V4. Beds, doctors, year established

```sql
SELECT percentile(try_cast(capacity AS DOUBLE), array(0.01,0.5,0.95,0.99)), max(...) ...
```

| Field | Rows present | p1 / p50 / p95 / p99 | Max | Notes |
|---|---|---|---|---|
| beds (`capacity`) | 2,510 | 2 / 100 / 798 / 1,671 | 200,000 (Harsh Hospital, Motihari) | Next highest: King George's Medical University 4,000 (plausible). 13 values ≤ 0. Hospital median 100, clinic 25, dentist 4 |
| doctors (`numberDoctors`) | 3,628 | 1 / **2** / 94 / 409 | 15,000 (Nithya Hospital, Dharmapuri) | **1,194 rows have doctors = 1**, including KGMU (4,000 beds, 1 doctor). Diagnostic chains claim 1,500–3,000 (Medall, Vijaya Diagnostic) |
| year | 4,775 | 1902 / 2005 / 2021 / 2023 | 2025 | Values 0, 7 and 15 occur (Purba Medinipur District Hospital = 0). Min plausible 1723 (Changethu Ayurveda) |

**Proposed caps and how many values become NULL.**

| Rule | Values set to NULL |
|---|---|
| beds outside 1–5,000 | 14 (1 × 200,000 and 13 × ≤ 0) |
| beds > 300 at type clinic/dental/diagnostic/eye: keep the value, flag `IMPLAUSIBLE_BEDS` (warn) | about 10 flagged |
| doctors outside 1–2,000 | 7 |
| doctors = 1 with beds ≥ 50 (placeholder value) | 102 |
| doctors > 200 at type clinic or diagnostic (chain-level number) | about 10 |
| year outside 1700–2026 | about 5 |

- After cleaning, size is known (beds, or doctors > 1) for **54% of hospitals, 18% of clinics and 6% of dental** records.
- Use beds as the main size signal. Use doctors only when beds are missing and doctors > 1.

## V5. Source domains and tiers

```sql
-- domain = lower(regexp_replace(regexp_extract(trim(url),'^(?:https?://)?([^/?#:]+)',1),'^www\.',''))
-- NB: parse_url(url,'HOST') returns NULL for 11,298 URLs (unusual characters); use the regexp above.
```

**Top domains** (facilities / URL rows): facebook.com 8,840/18,402 · justdial.com 5,425/16,154 · practo.com 2,705/33,109 · mappls.com 1,678 · medindia.net 1,543 · onefivenine.com 1,464 · proptiger.com 1,141 · in.linkedin.com 1,093 · policyx.com 1,031 · lybrate.com 935 · indiamart.com 865 · docindia.org 835 · hexahealth.com 705 · medicineindia.org 574 · scribd.com 560 · latlong.net 518 · instagram 516 · bajajfinservhealth.in 507 · healthfrog.in 501 · chotu.com 477 · drlogy.com 468 · sulekha.com 405 · clinicspots.com 380 · en.wikipedia.org 371 · cardiologistindia.com 353 · … · pmc/pubmed.ncbi.nlm.nih.gov ~245 each.

**Proposed domain → tier mapping** (the 60 most common domains, plus rules):

| Tier | Rule / domains |
|---|---|
| 1 gov / academic | suffix `\.gov\.in$`, `\.nic\.in$`, `\.gov$`, `\.ac\.in$`, `\.edu\.in$` |
| 2 own site | domain equals, or is a subdomain of, the domain of `officialWebsite` (8,385 facilities have one) |
| 3 health portal | practo, lybrate, medindia.net, docindia.org, hexahealth, bajajfinservhealth, drlogy, clinicspots, myupchar, eka.care, skedoc, kivihealth, 1mg, medifee, whatclinic, sehat, healthfrog, credihealth, apollo247, myhospitalnow, watchdoq, diagnosticcentres.in, cardiologistindia, gynecologistnearme, 365doctor, mediyaar, medicineindia |
| 4 aggregator / directory / insurer | justdial, sulekha, indiamart, mappls, onefivenine, grotal, bdir, chotu, mapcarta, latlong.net, joonsquare, 5bestincity, bharatibiz, magicpin, shuru, zaubacorp, tracxn, zoominfo, dnb, crunchbase, wanderlog, proptiger, foujiadda; insurers policyx, policybazaar, healthinsuranceindia, iffcotokio, insurancedekho, cashlesshospitalindia, newindia.co.in, starhealth, policy.online, ayushmancardhospitals, godigit |
| 5 social / reference / other | facebook, instagram, linkedin, x/twitter, youtube, wikipedia, ncbi/pubmed, scribd, news sites, and every unmapped domain |

**Coverage.** Tier 1 holds 3,666 URL rows, tier 2 17,535, tier 3 50,468 and tier 4 34,981, so tiers 1–4 cover 63% of rows. Adding named social/reference sites gives 76%. The rest is a long tail: the next 60 domains each cover ≤ 156 facilities (proceed.fit, tradeindia, ambitionbox, vaidam, …). **The 80% target is not reachable with a curated list. Tier 5 as the default is the right answer.**

**A bigger problem than coverage: the URLs often don't describe the facility.** Two examples:
- KEM Hospital Pune's list includes Navi Mumbai dental clinics on Practo.
- Sagar Hospital Jamshedpur's list includes dozens of Bihar JustDial category pages.

Per facility: median 6 distinct domains, p90 15. 94% of facilities have at least one tier 1–4 URL, 47% have their own site and 12% have a gov/academic URL. With the plan's `src = min(Σ tier_weight, 1)`, **53% of facilities score exactly 1.0** (p25 = 0.7).

**Recommendation.** Replace the formula with one based on the best tier plus a small bonus for corroboration:
```
src = min(1, best_tier_weight + 0.05 × min(n_distinct_tier1to4_domains − 1, 4))
best_tier_weight: gov 0.9, own site 0.8, portal 0.6, aggregator 0.4, other 0.2
```
- Count a tier 3–4 URL only when its path contains a token of the facility's name (at least 4 letters). Only 23% of URL rows contain the first name token, so that filter does real work.
- Treat a category page (`/nct-`, `/Listing/`, `hospitals-in-`) as tier 5.

## V6. Service-term matches and precision

**Facilities with a direct match, by field.** These use the draft regexes; specialties were camelCase-split first, otherwise the specialties column would be all zeros.

| Field | dialysis | C-section | NICU | cardiac surgery | MRI | trauma |
|---|---|---|---|---|---|---|
| procedure | 724 | 431 | 73 | 457 | 452 | 662 |
| equipment | 478 | 3 | 243 | 25 | 885 | 151 |
| capability | 594 | 90 | 612 | 328 | 334 | 2,827 |
| specialties (split) | 33 | 0 | 2 | 726 | 0 | 49 |
| description | 108 | 12 | 76 | 34 | 68 | 349 |
| **any** | **1,056** | **441** | **715** | **948** | **949** | **3,002** |

**Sampled precision.** I read 25 random matched items per service from procedure, equipment, capability and description, and judged each one at two levels: is the text a real claim of the service (text level), and is the record plausibly the facility offering it (facility level).

| Service | Text-level | Facility-level | False-positive patterns seen |
|---|---|---|---|
| dialysis | 25/25 | ~24/25 | none in the text. Noted: "Covid-19 dialysis services" (District Hospital Satara) is a true positive |
| C-section | 25/25 | ~22/25 | "Apollo Clinic Barrackpore: Caesarean Section" (an outpatient clinic), "Ananya Kidney Stone Clinic: Cesarean Delivery" (merged record). "Caesarean hysterectomy" counts as a true positive |
| NICU | 25/25 | ~24/25 | "The Liver Unit and Monarch Liver Lab: Level III NICU" (merged record) |
| cardiac surgery | 24/25 | ~23/25 | **"Fortis Escorts: Gastric bypass surgery"**. Across all data **72 of the 176 facilities mentioning "bypass surgery" have gastric/bariatric context**. Also "Sapthagiri Eye Care Centre: CABG" (templated text, see V13) |
| MRI | 22/25 | ~21/25 | "Outsources CT, MRI…" (Kapil Hospital), "MRI services … through an outsourced arrangement" (Rajeshwar Hospital), "A new MRI machine will be installed at District Hospital Jalna" (a future claim about another facility) |
| trauma | **~10/25** | ~9/25 | 15 of 25 are generic emergency text ("24/7 emergency care" at Institute of Urology, Cloudnine maternity, Dr. Srija Heart Care). Population-wide, **2,680** facilities match `emergency (department\|room\|services\|care)` against 1,548 with any `trauma\|polytrauma\|accident`. A further **61** facilities match eye, dental or maxillofacial trauma ("ocular trauma care", "dental trauma care") |

Other risks from section 3, checked:
- `1.5T` / `3T` without "MRI" nearby: 0 facilities. Safe.
- `casualty` in insurance text: 0 of 174. Safe.
- `SLED`: all 18 are dialysis ("sustained low efficiency dialysis"). Safe.
- `valve replacement` in a urology context: 0. Safe.

**Corrected regexes (Spark/Java).**

```text
# cardiac_surgery direct: replace the bare "bypass surgery"
(?i)\b(cardiac|heart|cardio[- ]?thoracic|open[- ]heart)\s+surger(y|ies)\b
(?i)\b(coronary(\s+artery)?|heart|cardiac)\s+bypass(\s+(graft\w*|surger(y|ies)))?\b
(?i)(?<!(gastric|bariatric|ileal)\s)\bbypass\s+surger(y|ies)\b
(?i)\b(CABG|CTVS|OPCAB)\b
(?i)\b((mitral|aortic|tricuspid|pulmonary|heart)\s+)?valve\s+(replacement|repair)\b
# item-level exclusion for this service: drop the hit if the item matches
(?i)\b(gastric|bariatric|roux|obesity|weight[- ]loss)\b

# trauma direct (trauma only)
(?i)\b(trauma\s+(care|cent(re|er)|unit|surgery|ward|team|icu|services?)|poly[- ]?trauma|accident\s+(and|&)\s+emergency|(emergency\s+(and|&)\s+trauma)|(trauma\s+(and|&)\s+emergency)|casualty)\b
# item-level exclusion for trauma:
(?i)\b(ocular|eye|orbital|dental|tooth|teeth|maxillo[- ]?facial|facial|hand|psycholog\w*|emotional|birth|urinary\s+tract|genito[- ]?urinary)\s+trauma
# move to trauma SUPPORTING (or a separate "emergency" service):
(?i)\bemergency\s+(department|room|ward|services?|care|unit)\b|\b24\s*[x/×]\s*7\s+emergency\b

# NICU direct: add
(?i)\bneonatal\s+(ICU|intensive)\b

# MRI direct: add
(?i)\bMR\s+(imaging|angiography)\b
```

**Map specialties by code, not regex.** First convert camelCase with `regexp_replace(el,'([a-z])([A-Z])','$1 $2')` for display. Then map the codes:

| Service | Direct (specialty weight 0.5) | Supporting |
|---|---|---|
| dialysis | none | nephrology (2,153), pediatricNephrology (92) |
| C-section | none | gynecologyAndObstetrics (4,489), obstetricsAndMaternityCare (358), maternalFetalMedicineOrPerinatology (739) |
| NICU | none | neonatologyPerinatalMedicine (1,252), pediatricCriticalCareMedicine (218) |
| cardiac surgery | cardiacSurgery (587), cardiothoracicSurgery (190) | cardiology (3,003), pediatricCardiology (202) |
| MRI | none | radiology (2,993), diagnosticRadiology (169), interventionalRadiology (296) |
| trauma | none | emergencyMedicine (2,079), orthopedicSurgery (3,519), neurosurgery (1,690), burnAndTraumaPlasticSurgery (131) |

## V7. Negations

```sql
regexp_extract(el, '(?i)(refer(red|ral)?\s+(to|out)|coming soon|planned|proposed|upcoming|under construction|tie[- ]?up|not available|\bno\s+(facility|facilities)\b)',1)
```

- **Rate:** 33 of 16,452 direct-match items (0.20%) contain a draft negation.
- **All 14 sampled were correct negations.** Examples:
  - "High-risk obstetric cases requiring C-section deliveries are referred to Kalpana Chawla GMC"
  - "Dialysis Room (Under Construction)"
  - "Proposed MRI"
  - "Caesarean section facility not available on-site"
- **Missed negations** come mainly from MRI. Adding this pattern finds 24 more items, 23 of which are correct:
  ```text
  outsourc\w*|will\s+be\s+(installed|started|commissioned|set\s+up|launched|available)|awaited|in\s+the\s+pipeline|not\s+(yet\s+)?(available|functional|operational|offered|provided)|non[- ]?functional|discontinued|unavailable|nearby\s+(centre|center|hospital)
  ```
  Examples: "MRI (Outsource)", "MRI services offered via outsourced provider", "NICU facility not available", "City Hospital is listed as a nearby hospital to Millat Dialysis Center".
- **Do not add `in collaboration with`.** It negated "Performs pediatric heart surgeries … in collaboration with …", which is a real claim.
- **Effect:** negations move only about 0.35% of direct items, but about 2% of MRI facilities (17 of 949). Keep the 40-character window for descriptions. For list items, matching on the whole item is right, because items are short.
- Store `negation_text` (C2). It produces good reasons, such as "MRI is outsourced".

## V8. `conf_raw` and tier distribution (draft formula)

This uses the draft regexes and negation, camelCase-split specialties, the V3 types, and no R_tier (treated as never Low).

| Service | Cells (any match) | Strong | Moderate | Weak | Has direct | `conf_raw` p25 / p50 / p75 / p90 | `conf_raw` = 1 |
|---|---|---|---|---|---|---|---|
| dialysis | 3,144 | 534 (17%) | 490 | 1,526 (49%) | 1,054 | 0.125 / 0.225 / 1.0 / 1.0 | 903 |
| C-section | 6,336 | 89 (1.4%) | 337 | 4,369 (69%) | 439 | 0.125 / 0.225 / 0.25 / 0.25 | 431 |
| NICU | 5,565 | 71 (1.3%) | 622 | 4,840 (87%) | 714 | 0.125 / 0.225 / 0.25 / 0.8 | 293 |
| cardiac | 3,886 | 129 (3.3%) | 416 | 2,838 (73%) | 948 | 0.125 / 0.225 / 0.25 / 1.0 | 463 |
| MRI | 3,594 | 913 (25%) | **16** | 2,664 (74%) | 945 | 0.125 / 0.225 / 1.0 / 1.0 | 921 |
| trauma | 6,138 | 304 (5%) | 2,423 | 2,445 (40%) | 2,998 | 0.125 / 0.25 / 0.8 / 1.0 | 766 |

(Cells that only have a direct match in specialties or description fall outside Strong and Moderate, so the three tiers don't always add up to the cell count.)

Problems:
1. **`conf_raw` has two values in practice.** Supporting-only cells sit at 0.125–0.25. Any procedure or equipment hit gives exactly 1.0, because weight 1.0 makes the noisy-OR saturate. Among facilities with a direct match, 85–97% have conf = 1.0 for dialysis, C-section, cardiac and MRI.
2. **MRI goes straight to Strong.** It has no infrastructure terms, so "or the service has no infrastructure terms" applies. Result: Strong 913 vs Moderate 16.
3. **Strong is almost unreachable for NICU and cardiac**, because cap_infra ≥ 0.5 means 1 of 1 NICU terms or 2 of 4 cardiac terms. The average cap_infra among direct cells is 0.15 for NICU and 0.21 for cardiac.
4. **Weak is mostly noise.** Supporting-only cells are 50–87% of all cells ("pediatrics" means a NICU Weak cell for 4,800 facilities).

**Recommendations.**
- Weights: procedure 0.85, equipment 0.85, capability 0.7, specialties 0.45, description 0.3 (description only when no structured field matched, see V14). Add a corroboration bonus: a second distinct item in the same field counts at half weight. Then one procedure item gives 0.85, procedure + capability gives 0.955, and two procedure items give 0.89. Supporting-only cells: `0.15 × noisy-OR`, capped at 0.2.
- Strong: a direct term in procedure or equipment, **and** (at least 1 infrastructure term found, or the service has none and the direct term is in **equipment**, or the facility is a matching specialist type), and no incompatible type, and R_tier ≠ Low. For MRI, Strong = the MRI term is in equipment or comes with a scanner/Tesla phrase. Moderate = an MRI term only in procedure or capability.
- Weak: a direct term only in specialties or description. **Supporting-only cells are not a tier.** Store them as `tier = 'Possible'` and hide them by default, or drop them. That removes 50–87% of rows.
- Expected result with these rules: Strong is roughly 30–50% of direct cells for every service except trauma. Re-run V8 after the regex fixes.

## V9. Claim counts and KITCHEN_SINK

"Claim count" here means how many of the six services a facility has a direct match for (procedure, equipment or capability).

| Type | n | Claim count p50 / p90 / p95 / p99 | Claiming ≥ 4 | Specialties p50 / p90 | At the 50-specialty cap |
|---|---|---|---|---|---|
| hospital | 4,956 | 0 / 2 / 3 / 4 | 125 | 41 / 50 | 2,167 |
| clinic | 1,841 | 0 / 0 / 1 / 2 | 3 | 13 / 50 | 214 |
| dental | 1,789 | 0 / 0 / 0 / 1 | 1 | 17 / 50 | **191** |
| diagnostic | 597 | 0 / 1 / 1 / 2 | 0 | 12 / 50 | 80 |
| eye | 555 | 0 / 0 / 1 / 1.5 | 1 | 30 / 50 | 171 |
| maternity | 188 | 0 / 2 / 2 / 3 | 0 | 26 / 50 | 43 |

**Top outliers inspected.**
- Hospitals claiming 5 of 6 (25 records): CARE Hospitals Nagpur, Orange City Hospital Nagpur, SPARSH Hennur Bengaluru, Jindal Super Speciality Bharatpur, Rajeshwar Hospital Patna. **These are legitimately large hospitals.** Flagging the hospital p95 (≥ 3, 417 hospitals) would mostly hit real multispecialty hospitals.
- Specialist types with off-type claims (**clear merges or contamination**):

| Record | City | Claims | Why flagged |
|---|---|---|---|
| Aravind Eye Hospital | Hyderabad | dialysis, NICU, MRI, trauma | Eye hospital claiming four non-eye services |
| Aashirwad Ortho & Dental Care Centre | Dehradun | dialysis, NICU, MRI, trauma; "300+ beds incl. ICU, NICU, PICU" | Dental/ortho clinic with hospital-scale claims |
| Raj Eye Hospital | Gorakhpur | dialysis, C-section, NICU | Eye hospital with obstetric and neonatal claims |
| The Liver Unit and Monarch Liver Lab | Kochi | dialysis, NICU, MRI | Lab with NICU claims |
| Javitri Test Tube Baby Center | Lucknow | dialysis, NICU, trauma | IVF clinic with dialysis and trauma claims |
| Mukta Nursing Home (typed clinic) | Siliguri | dialysis, NICU, MRI, trauma | Small, size unknown |

- **The specialties count cannot be a signal.** It is cut off at 50 for 29% of records, and 191 dental records list 50 specialties.

**Proposed KITCHEN_SINK rule** (replaces "p95 for the facility type"):
```
off_type_claims = number of the six services claimed that are in the service's incompatible_types for this facility type
KITCHEN_SINK if:
   (type IN dental, eye, diagnostic, nephrology-dialysis AND off_type_claims >= 2)
OR (type = clinic AND beds_known < 30 or unknown AND claims >= 3)
OR (type = hospital AND beds_known < 30 AND claims >= 4)
```
Expected: about 20–40 records. That is a precise list, not 5% of each type.

## V10. Overlap of location and merge signals

These use PIN centroids: the median lat/lon of post offices with valid coordinates, per PIN. 279 facility PINs are not in the directory, 4 have no PIN and 30 have no coordinates.

**Distance from the facility's coordinates to its PIN centroid:** p50 2.4 km · p75 11.7 km · p90 150 km · p95 291 km · p99 618 km. 1,933 are more than 25 km away, 1,558 more than 50 km and **764 more than 200 km** (the data model says 828; the difference comes from the centroid method and dedup).

| Signal | Records |
|---|---|
| PIN_COORD_MISMATCH (> 200 km) | 764 |
| STATE_MISMATCH, naive comparison | 305 (most are cities or districts in the state field, e.g. "Hyderabad", "Erode", "Prakasam") |
| STATE_MISMATCH, strict (stated value is a real state name and differs from the PIN's state, AP/Telangana treated as equal) | **32** |
| NAME_COLLISION (normalised name in ≥ 2 cities) | 906 |
| PIN + STATE | 9 |
| PIN + NAME | 178 |
| STATE + NAME | 32 (naive) |
| **2 or more signals** | **189** |

**10 records with 2 or more signals:**

| Record | City | PIN → district | Distance | Flags | Reading |
|---|---|---|---|---|---|
| ASG Eye Hospital | Kolkata | 700109 N 24 Parganas | 450 km | PIN + NAME | Chain (8 cities). Coordinates are from another branch |
| SRL Diagnostics | Kolkata | 700005 Kolkata | 460 km | PIN + NAME | Chain. Coordinates are from another branch |
| Galaxy Hospital | Agra | 221010 **Varanasi** | 540 km | PIN + NAME | Generic name. The PIN belongs to a namesake in Varanasi |
| Vijaya Hospital | Chennai | 629002 **Kanniyakumari** | 398 km | PIN + NAME | Namesake mix-up |
| Siddhi Vinayak Clinic | Thane | 443101 **Buldhana** | 402 km | PIN + NAME | Namesake mix-up |
| Vinayak Hospital | Kachchh | 390019 **Vadodara** | 297 km | PIN + NAME | Namesake mix-up |
| Medicare Hospital | Mumbai | 400059 Mumbai Suburban | 290 km | PIN + NAME | PIN matches the city, so the coordinates are wrong |
| Sanjivani Hospital | Ganganagar | 335001 Ganganagar | 565 km | PIN + NAME | PIN matches the city, so the coordinates are wrong |
| iTek Vision Centre | Noida | 201301 Gautam Buddha Nagar (UP) | 567 km | PIN + STATE | State says "Delhi" (normal for Noida). The coordinates are wrong |
| St Anns Hospital | Jaggayyapeta | 521235 Krishna | 361 km | PIN + NAME | PIN matches the city, so the coordinates are wrong |

**None of these is a merged record.** They are location conflicts between namesakes or branches. The "≥ 2 signals" rule would mark about 190 records as merges, almost all wrongly.

**Which location wins?** I compared each candidate against the median coordinates of other facilities in the same `address_city`, for cities with at least 5 facilities:
- PIN > 200 km away: the PIN centroid is closer to the city in 326 of 540 cases; the facility's coordinates in 214.
- PIN 25–200 km away: the coordinates are closer in 459 of 826.

So neither source can be trusted on its own.

**Recommendations.**
- Drop NAME_COLLISION and PIN_COORD_MISMATCH from the merge rule. Use them in a `LOCATION_CONFLICT` flag and in location voting:
  - If the coordinates and the PIN centroid agree within 25 km: High.
  - Otherwise pick whichever is within 25 km of the city centroid: Medium.
  - Otherwise use the PIN centroid: Low, with uncertainty = the distance between them.
- Compute STATE_MISMATCH only when `address_stateOrRegion` matches a state name in the PIN directory. Otherwise treat the field as a city or district hint.
- Build POSSIBLE_MERGE from content:
  - (i) KITCHEN_SINK as defined in V9
  - (ii) the text names another facility (examples: "Smt. B. C. J. General Hospital … listed" in J J Eye Hospital; "LSCS was performed at Sandhya Hospital" in Sanidhya Eye Hospital; "MRI … will be installed at District Hospital Jalna" in District Women Hospital Amravati)
  - (iii) TEMPLATED_TEXT (V13)

  Flag on any one of (i) or (ii), or on (iii) together with (i).
- Thresholds: severe if > 200 km and the city vote is inconclusive; warn if 25–200 km.

**R distribution with the plan's formula** (a proxy: loc + plan src + consistency from PIN > 200 km + recency + completeness): p5 0.55 · p10 0.64 · p25 0.75 · p50 0.84 · p75 0.90 · p90 0.95. 63% are at least 0.8 and only 278 (2.8%) are below 0.5. **The 0.3 floor never applies, and the values bunch up at the top.**
- `recency_of_page_update` is empty or unparseable for 65% of rows. The parsed dates run from 2003-09-04 to **2027-07-20** (in the future). So recency is 0.5 for most rows.
- Fixing `src` (V5) and making location three-level spreads R out the most.

## V11. How often capability falls back to neutral

These cells have a direct match in procedure or equipment (Moderate or better).

| Service | Cells | Beds present | Size known (beds, or doctors > 1) | 0 infra terms | 1 | 2 | ≥ 3 |
|---|---|---|---|---|---|---|---|
| dialysis | 904 | 65% | 73% | 362 (40%) | 530 | 12 | 0 |
| C-section | 432 | 50% | 65% | 85 (20%) | 137 | 137 | 73 |
| NICU | 293 | 63% | 72% | **221 (75%)** | 72 | 0 | 0 |
| cardiac | 463 | 71% | 80% | 165 (36%) | 167 | 103 | 28 |
| trauma | 766 | 58% | 69% | 95 (12%) | 176 | 185 | 310 |

- `cap_size` falls back to 0.5 for 20–35% of cells. That is acceptable.
- NICU infrastructure is almost never found. Add these terms:
  ```text
  (?i)\b(ventilators?|warmers?|incubators?|phototherapy|CPAP|neonatolog(ist|ists)|level\s+(II|III|IIIA|3)|SNCU)\b
  ```
  For dialysis, add `(?i)\b(dialysis\s+(machines?|stations?|beds?|units?)|nephrolog(ist|ists))\b`. Counting machines or stations is the best available proxy for dialysis capacity.
- `(?<![NP])\bICU\b` is the main dialysis infrastructure term, and it is weak evidence for dialysis. Lower its weight to 0.5 within cap_infra, or count it as supporting.

## V12. Formula comparison on three acceptance queries

Setup:
- Location: the facility's own coordinates if within 25 km of its PIN centroid, otherwise the PIN centroid.
- Road distance: 1.4 × haversine. Search radius from the service spec.
- R proxy: `max(0.3, 0.5×loc + 0.5×src)`, with loc = 1.0 / 0.6 / 0.2 for ≤ 25 km / 25–200 km or no PIN / > 200 km, and src as in the plan.
- `conf_raw`: the draft noisy-OR, × 0.2 for an incompatible type. `capability = 0.4 × cap_size + 0.6 × cap_infra`.
- Base rates = share of facilities with any direct match: dialysis 0.106, C-section 0.044, cardiac 0.095.
- (a) `(R × conf × cap)^α × prox^β`. (b) `((base + R(conf − base)) × (0.5 + 0.5 cap))^α × prox^β × loc_factor`.

**Dialysis near Jaipur** (66 candidates within 150 km)

| Rank (a) | Rank (b) | Facility | km | R | conf | cap | tier |
|---|---|---|---|---|---|---|---|
| 1 | 1 | Soni Hospital | 5 | 1.00 | 1.00 | 0.60 | Strong (P, E, C) |
| 2 | 3 | Deep Hospital & Research Centre, Jhotwara | 6 | 1.00 | 1.00 | 0.60 | Strong (P) |
| 3 | 4 | Indus Jaipur Hospital | 7 | 1.00 | 1.00 | 0.64 | Strong (P) |
| 4 | 6 | Monilek Hospital & Research Center | 8 | 1.00 | 1.00 | 0.62 | Strong (E) |
| 5 | 2 | NAV Imperial Hospital & Research Centre | 4 | 1.00 | 1.00 | 0.50 | Strong (E) |
| 12 | 5 | Garg Child Hospital (30 beds) | 1 | 1.00 | 1.00 | 0.22 | Moderate (P) |

**Emergency C-section near Lucknow** (91 candidates within 100 km)

| Rank (a) | Rank (b) | Facility | km | R | conf | cap | tier |
|---|---|---|---|---|---|---|---|
| 1 | 1 | BNK Hospital | 5 | 0.98 | 1.00 | 0.68 | Strong |
| 2 | 3 | Wellsun Medicity Hospital | 11 | 1.00 | 1.00 | 0.70 | Strong |
| 3 | 2 | Krishna Medical Centre | 9 | 1.00 | 1.00 | 0.54 | Moderate |
| 4 | 4 | St. Joseph Hospital | 10 | 1.00 | 1.00 | 0.57 | Moderate |
| 5 | 8 | Nova Hospital | 9 | **0.60** | 1.00 | 0.78 | Strong |
| 6 | 5 | Aiman Nursing Home (20 beds) | 10 | 1.00 | 1.00 | 0.44 | Moderate |

**Cardiac surgery from Patna** (303 candidates within 500 km)

| Rank (a) | Rank (b) | Facility | km | R | conf | cap | tier |
|---|---|---|---|---|---|---|---|
| 1 | 1 | Rajeshwar Hospital (150 beds) | 5 | 1.00 | 1.00 | 0.77 | Strong |
| 2 | 2 | Ford Hospital & Research Center | 2 | 1.00 | 1.00 | 0.60 | Strong |
| 3 | 3 | Indira Gandhi Institute of Medical Sciences (1,000 beds) | 7 | 1.00 | 1.00 | 0.55 | Moderate |
| 4 | 8 | Ganja Jal Hospital | 36 | 0.80 | 1.00 | 0.67 | Strong |
| 5 | 5 | New B K Hospital, Hajipur | 18 | 1.00 | 1.00 | 0.40 | Moderate |
| 6 | 4 | Paras HMRI Hospital (350 beds) | 8 | 1.00 | 1.00 | 0.38 | Moderate (P) |

**Reading.**
- With R ≈ 1 and conf = 1, both formulas sort mainly on capability and distance. (b) ranks the large, close Paras HMRI 4th, ahead of Ganja Jal (36 km away, R 0.8). That is more sensible for a patient in Patna: (a) demotes Paras only because no infrastructure term matched, which is a text-coverage gap rather than evidence of weak capability.
- For C-section, (b) pushes Nova Hospital down 3 places because its location is uncertain. Its R is 0.6 because of the PIN mismatch, and `loc_factor` applies again at serving time, so location counts twice.
- (b) lets low-capability nearby options into the top 5 (Garg Child Hospital, 1 km, cap 0.22; Aiman Nursing Home, 20 beds). That suits a time-critical service, where a nearby, smaller option with a confirmed claim is usually what you want shown, as long as the tier label and reasons make the limits visible.
- Neither formula separates strong from weak evidence, because conf saturates (V8).

**Recommendation.** Adopt **(b)**, with three changes:
1. Remove `loc` from R, **or** remove `loc_factor` from the serving formula. Don't use both. I'd keep `loc_factor` at serving time, since location is about the query, and keep R about content.
2. Apply the V8 weights so conf has room to vary.
3. Rank by tier first (Strong > Moderate > Weak) only after the V8 tier fixes. With today's tiers, Paras HMRI (Moderate, because it has no infrastructure terms) would fall below every Strong facility.

## V13. Incompatible types with a direct match

| Service | Incompatible-type facilities with a direct match |
|---|---|
| cardiac surgery (clinic, dental, eye, diagnostic, maternity, nephrology) | 23 (77 when every `facilityTypeId=clinic` counts as clinic) |
| trauma (dental, eye, diagnostic, nephrology) | 37 (230 with the draft trauma regex, i.e. "emergency care" everywhere) |
| dialysis (dental, eye, diagnostic) | 17 |
| NICU | 15 |
| C-section | 9 |
| MRI (dental, eye) | 9 |

From a sample of 24 (4 per service), about 20 are false at the facility level:
- "Asian Eye Hospital, Pune: Cardiac surgery services including heart bypass…"
- "Deshmukh Eye Hospital" and "Sapthagiri Eye Care Centre": **identical** text "Coronary artery bypass grafting (CABG), including intra operative balloon pump"
- "Well Care Diagnostic Center: Fully equipped NICU"
- "Smile Dental Hub: imaging modalities include CBCT, CT, MRI"
- "J J Eye Hospital: Smt. B. C. J. General Hospital … is listed as…" (another facility's text)

The true positives come from type rules, not the services:
- "I Care Diagnostic and Dialysis Center" (dialysis)
- "Life Line Care Hospital & Dialysis Centre" (C-section)
- "Attingal Medical Centre, 580 beds" (cardiothoracic)

The V3 precedence and beds ≥ 50 fixes handle all three.

**Templated text.** Long items (≥ 60 characters) appear word for word across unrelated facilities: 94 such strings, 463 facility-item pairs. Examples:
- "Aortic arch replacement / thoracoabdominal aneurysm repair using bypass" in 23 facilities
- "CABG, including intra operative balloon pump" in 19 facilities, including Sri Krishna Eye Hospital and Srinivasa Nursing Home

24 cardiac and 24 NICU facilities rely only on such strings (each shared by ≥ 5 facilities).

**Recommendation.**
- Keep the incompatible-type × 0.2 factor. It is sized about right: it targets roughly 110 cells, about 80% of which are false.
- For type = clinic, apply it to cardiac surgery only when beds < 30 or unknown.
- Add `TEMPLATED_TEXT`: an item of 40 or more characters, appearing word for word in 5 or more facilities with different first name tokens, gets × 0.5 on its field weight.

## V14. Does description repeat the structured fields?

| Service | Facilities with a description hit | Also in procedure / equipment / capability | Description only |
|---|---|---|---|
| dialysis | 108 | 98 (91%) | 10 |
| C-section | 12 | 8 | 4 |
| NICU | 76 | 70 (92%) | 6 |
| cardiac | 31 | 25 (81%) | 6 |
| MRI | 68 | 62 (91%) | 6 |
| trauma | 324 | 281 (87%) | 43 |

**Recommendation.**
- Description is not an independent source. In the noisy-OR, use description weight 0.3 only when no structured field has a direct match, otherwise 0.
- Apply the same reasoning to capability vs procedure. Capability often restates procedures, so give capability 0.7 and use the corroboration bonus from V8 rather than full independence.
- Description adds only 4–43 facilities per service. Its main value is in citations.

---

## Data facts that contradict the input files

1. "10,000 clean rows": there are 9,989 distinct facilities (V1).
2. "255 distinct state names": `address_stateOrRegion` often holds a city or district ("Hyderabad", "Kachchh", "Krishna"). Treat it as a location hint, not a state (V10).
3. The data model's type list (dental, diagnostic, eye, …) is not in the source. `facilityTypeId` has only hospital, clinic, dentist, doctor and pharmacy (V3).
4. `specialties` is a controlled camelCase vocabulary, not free text. Regex word boundaries fail on it (V2, V6).
5. All list columns are cut off at 50 elements, so "no evidence" is less certain for large hospitals (V2).
6. "Source URLs count as evidence the facility exists": many URLs are about other facilities or are directory category pages. That makes the URL count closer to noise than to corroboration (V5).
7. `numberDoctors = 1` is a common placeholder (1,194 rows, including 4,000-bed hospitals). The plan's completeness score counts it as "present" (V4).
8. `recency_of_page_update` is missing for 65% of rows and has future dates up to 2027-07-20 (V10).
9. Location conflicts come mostly from namesakes and chain branches, not merged records (V10). PIN vs coordinates is wrong in both directions (V10).
10. The data model's worked example puts "Aravind Eye" in as a merged record. The real data confirms the pattern (Aravind Eye Hospital, Hyderabad claims dialysis, NICU, MRI and trauma), but it shows up through content, not location.
11. Burn care is in the challenge statement but not among the six specs. The only direct structured signal is the specialty `burnAndTraumaPlasticSurgery` (131 facilities), plus free text.
12. `parse_url(url,'HOST')` returns NULL for 11,298 URLs. Use a regexp to extract domains (V5).

---

## Prioritised edits to the implementation plan

1. **Step 1, cleaning:** add `SELECT DISTINCT *` and assert that `unique_id` is unique (9,989). Normalise PINs. Treat `"null"` strings as NULL. Note the 50-element cut-off. Add the V3 name-based type mapping, in its stated order, as the definition of `facility_type`. Add the V4 caps, including doctors = 1 with beds ≥ 50 → NULL.
2. **Section 3, service regexes:**
   - Trauma: keep only trauma-specific direct terms. Move `emergency (department|room|services|care)` to supporting. Add the eye/dental/facial trauma exclusion.
   - Cardiac: replace bare `bypass surgery` with the coronary/heart forms plus a gastric/bariatric exclusion.
   - Negations: add the outsourced/"will be installed"/"not functional" pattern, but not "in collaboration with".
   - NICU and dialysis: widen the infrastructure lists (V11).
3. **Specialties:** match by exact code using the V6 table, not by regex. Display them camelCase-split.
4. **Step 6, noisy-OR weights:** procedure 0.85, equipment 0.85, capability 0.7, specialties 0.45, description 0.3 (only when no structured hit). Supporting-only: `0.15 × noisy-OR`, max 0.2. Second-item bonus at half weight. Add `TEMPLATED_TEXT` × 0.5.
5. **D4 tiers:** Strong = a direct term in procedure or equipment + at least 1 infrastructure term (MRI: a direct term in equipment) + compatible type + R_tier ≠ Low. Make supporting-only cells "Possible" (hidden) rather than Weak. Re-run V8 and aim for Strong at 30–50% of direct cells.
6. **Step 5, `src`:** replace `min(Σ tier weights, 1)` with best-tier weight + a small bonus for distinct domains. Count portal or aggregator URLs only when the URL path contains the facility's name. Treat category pages as tier 5.
7. **D3, merges:** remove NAME_COLLISION and PIN_COORD_MISMATCH from POSSIBLE_MERGE. Route them to `LOCATION_CONFLICT` and a three-way location vote (coordinates, PIN centroid, city centroid). Define POSSIBLE_MERGE from KITCHEN_SINK (specialist type with ≥ 2 off-type claims), text naming another facility, and templated text. Use STATE_MISMATCH only when the stated value is a real state name.
8. **D1 / serving:** adopt the shrinkage formula (b), but count location once: either in R or in `loc_factor`, not both (recommended: keep `loc_factor`, drop `loc` from R). Define `base_rate_s` as the share of facilities with any direct match (dialysis 0.106, C-section 0.044, NICU 0.072, cardiac 0.095, MRI 0.095, trauma about 0.15 after the regex fix).
9. **V9 / C5, KITCHEN_SINK:** use the off-type claim rule from V9, not the p95 claim count. Don't use the specialties count.
10. **Incompatible types:** keep × 0.2, but for a clinic with beds ≥ 30, cardiac surgery is not incompatible. Put the V3 type precedence (nephrology/dialysis before diagnostic, "hospital" in the name wins) into the spec.
11. **Recency:** NULL future dates and expect about 65% unknown. Consider lowering the recency weight from 0.10 to 0.05 and giving the difference to `consistency`.
12. **Data model:** add `facility.operator_type`, `facility.cluster_id`, the `LOCATION_CONFLICT` and `TEMPLATED_TEXT` flag codes, and a `tier = 'Possible'` value (or say explicitly that supporting-only cells are not stored).
