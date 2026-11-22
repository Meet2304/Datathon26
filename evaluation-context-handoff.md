# Context Handoff: Facility × Service Scoring, and Designing an Evaluation Experiment

**For:** a fresh agent with no prior context.
**Your task:** design an experiment that measures how well this scoring method works (section 9).
**Status of the method:** fully specified (plan v4), **not yet built**. Nothing in sections 4–7 has been run end-to-end on the data. Numbers marked *(V#)* come from read-only SQL checks against the real tables.

Source documents, all in `/Users/meet/Meet/Projects_Ad Astra/Project_2_Databricks Datathon/output/`. Read them only if you need detail beyond this file:

| File | What it is |
|---|---|
| `service-evidence-implementation-plan.md` | **Authoritative spec (v4).** Every formula, regex and threshold. If it conflicts with this file, the plan wins |
| `validation-report.md` | Real-data checks V1–V14 behind the current weights and rules |
| `plan-review-sol.md` | Independent review (F01–F12) that produced v3 |
| `data-model-normalized.md` | Original data-model draft. Its scoring sections are superseded by the plan |

---

## 1. The problem

CMU Datathon, Fall 2026, sponsored by Databricks. A user gives two inputs:
- a **medical service**: dialysis, emergency C-section, NICU, cardiac surgery, MRI, trauma, burn care
- a **location** in India: city, district, PIN code or coordinates

The system returns the best facilities. Hard requirements from the challenge:
1. **Cite the underlying facility text** for every important claim, score or ranking.
2. **Communicate uncertainty** instead of presenting weak evidence as fact.
3. Be able to answer **"WHY this facility?"** and **"HOW did you decide?"** for every recommendation.
4. Run on **Databricks Free Edition**, with a workflow non-technical users can follow (community health workers, NGO coordinators, district planners).

The core difficulty: about 10,000 facility records were extracted from web text. A facility *saying* it offers a service isn't proof that it does. Some records merge two facilities, some have contradictory locations, and some list services with almost no support.

**There is no ground-truth label** for "facility X really offers service Y". Any evaluation has to create its own labels or proxies. That is the central challenge for your experiment.

---

## 2. Data

### 2.1 Tables
Catalog: `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset`. Bronze copies live in `workspace.hackathon.bronze_*`.

| Table | Rows | Role |
|---|---|---|
| `facilities` | 10,088 raw. 88 have shifted columns (removed by keeping `organization_type = 'facility'`). 11 exact duplicates, leaving **9,989 distinct facilities** | What each facility claims. 51 columns, almost all STRING |
| `india_post_pincode_directory` | 165,627 post offices / 19,586 PINs | Geocoder: PIN → coordinates, district, state |
| `nfhs_5_district_health_indicators` | 706 districts | District-level health need. **Not used in scoring** |

A team is producing a cleaned table, `silver.facility_clean`, that keeps the raw columns, parses the lists and caps implausible numbers. Its required contract is section 1 of the plan. If it isn't ready, apply the same filters to bronze yourself.

### 2.2 Source columns the method uses

| Source column | Cleaned name | Shape / quirks |
|---|---|---|
| `unique_id`, `cluster_id` | `facility_id`, `cluster_id` | `cluster_id` is shared by 30 extra records (a duplicate signal) |
| `name` | `name` | Free text. Many generic names ("Galaxy Hospital" in many cities) |
| `facilityTypeId` | → `facility_type` | Only hospital / clinic / dentist / doctor / pharmacy. The finer types come from **name rules** (eye, diagnostic, maternity, nephrology-dialysis, …) *(V3)* |
| `operatorTypeId` | `operator_type` | private 8,842 · public 469 · NULL 687 |
| `capacity` | `beds` | Present for 25%. Valid range 1–5,000 (one record says 200,000) *(V4)* |
| `numberDoctors` | `doctors` | Present for 36%. **1,194 rows say exactly 1**, including 4,000-bed hospitals, so doctors = 1 with beds ≥ 50 → NULL *(V4)* |
| `yearEstablished` | `year_established` | Present for 48%. Valid range 1700–2026 |
| `recency_of_page_update` | `last_updated` | **Missing or unparseable for 65%.** Some dates are in the future (up to 2027-07-20) → NULL |
| `officialWebsite` | same | Present for 8,385 facilities |
| `source_urls` | same | JSON array. Median 10 URLs per facility. **Many are about other facilities, or are directory category pages** *(V5)* |
| `procedure`, `equipment`, `capability` | same | JSON arrays of short phrases (median 27–41 characters). **Every list is cut off at 50 items** (29% of facilities hit the cap in some list) *(V2)* |
| `specialties` | same | JSON array of **camelCase codes** (`cardiacSurgery`, `nephrology`). A controlled vocabulary of about 2,900 codes |
| `description` | same | Short free text (median 115 characters) |
| `address_zipOrPostcode`, `latitude`, `longitude`, `address_city`, `address_stateOrRegion` | `pincode`, coordinates, city, state | **764 facilities are > 200 km from their own PIN.** State often holds a city name *(V10)* |

### 2.3 Facts that affect any evaluation
- **Service coverage is thin and urban-heavy.** Facilities with any direct mention: dialysis about 1,056 · C-section 441 · NICU 715 · cardiac surgery 948 · MRI 949 · trauma about 1,500 after the regex fix *(V6)*. The median district has about 2 facilities in total.
- **The description repeats structured fields 85–93% of the time** *(V14)*, so fields are not independent evidence.
- **Templated text:** 94 long strings appear word for word across unrelated facilities, e.g. "CABG, including intra operative balloon pump" in 19 facilities, two of them eye hospitals *(V13)*.
- **Location conflicts are mostly namesake or chain-branch mix-ups, not merged records.** Neither coordinates nor PIN is reliably the correct one *(V10)*.

---

## 3. Architecture

```
silver.facility_clean (team) ─┐
india_post_pincode_directory ─┼─► Step 0 location vote ──► gold.facility_location
                              │
                              ├─► Step 2 sources ─────────► gold.facility_source ─┐
                              │                                                   ├─► Step 5 flags + R ─► gold.facility
                              ├─► Step 4 evidence extraction ─► gold.evidence ────┤
ref.service / service_term ───┘   (regex + clause negation)                       └─► Step 6 per cell ─► gold.facility_service
                                                                                                │
                                         Step 7: flatten ─► serving.facility_service ◄──────────┘
                                         Query time: resolve location → distance → gates → rank
```

- Everything up to `serving.facility_service` is **precomputed in batch**.
- At query time, the only computation is: resolve the user's location, compute distances, apply gates, rank.

---

## 4. The final data structure

A **grid**. Rows are facilities, columns are services, and each cell is one facility-service pair. It is stored **long** (one row per facility-service pair that has any evidence), not wide.

| Lives at | Value | Question it answers | Scale |
|---|---|---|---|
| **Row** (facility) | `R`, `R_tier` | Can this record be trusted at all? | 0.3–1.0 · High / Medium / Low |
| **Row** (facility) | `location_confidence`, `location_uncertainty_km` | How sure are we where it is? | High / Medium / Low / Unresolved · km |
| **Cell** | `conf_adj` | Does this facility offer this service? | 0–1 |
| **Cell** | `capability`, `cap_factor` | If it does, how well equipped is it for this service? | 0–1 · 0.5–1.0 |
| **Cell** | `disposition` | Is the claim positive, negated, conflicting or support-only? | category |
| **Cell** | `tier` | What the user sees | Strong / Moderate / Weak / Possible (hidden) / Excluded (hidden) |
| **Cell** | `reasons`, `primary_quote` | Why: the verbatim text and caveats | text |
| **Query** | `final` | Rank for this user's location | relative within one query |

### Illustrative grid
Computed by hand with the v4 rules (worked through in section 8). These facilities are made up.

| Facility | R | Dialysis: conf_adj / capability / tier | MRI: conf_adj / capability / tier |
|---|---|---|---|
| Sharma Kidney Clinic (20 beds, nephrology-dialysis) | 0.94 (High) | **0.80 / 0.29 / Strong** | no evidence, so no cell |
| City General Hospital (500 beds) | 1.00 (High) | nephrology specialty only → **Possible** (hidden, no direct confidence) | **0.98 / 0.90 / Strong** |
| "Aravind Eye", a merged record (eye type, location conflict) | 0.50 (Medium) | **0.14 / 0.20 / Weak**, in the "Location uncertain" list, not ranked | Weak (incompatible type + merge) |

Key design choices:
- **R is never copied into cells.** It enters confidence only through the shrinkage formula.
- **Location is not part of R.** It affects only gating and ranking.
- **Beds and doctors affect only capability, never R or confidence.** A small clinic can be very confident about dialysis while being small.

---

## 5. Row-level values

### 5.1 Location
**Inputs:**
- the facility's coordinates
- its PIN, from which a **PIN centroid** is computed: the median of post-office coordinates inside India, plus `pin_radius_km`
- a **locality centroid**: the median coordinates of facilities sharing a (state, district, city) key, used only when ≥ 5 facilities share it

**The vote:**

| Situation | Resolved location | Confidence | Uncertainty (km) |
|---|---|---|---|
| Coordinates and PIN centroid within 25 km of each other | coordinates | High | max(1, precision) |
| They disagree; exactly one is within 25 km of the locality centroid | that one | Medium | max(5, pin_radius) |
| They disagree; the locality vote is inconclusive | PIN centroid | Low (**severe** if the gap is > 200 km) | the gap |
| Coordinates only | coordinates | Medium | 5 |
| PIN only | PIN centroid | Low | pin_radius |
| Neither | NULL | Unresolved | NULL |

Severe or unresolved facilities are **removed from ranked results** and shown in a separate "Location uncertain" list.

### 5.2 Record reliability R

```
R = max(0.3, 0.40·src + 0.40·consistency + 0.15·completeness + 0.05·recency)
R_tier: High ≥ 0.75 · Medium ≥ 0.5 · Low < 0.5
```

**What R does NOT use, and why.** People often assume R uses the number of doctors or beds. It doesn't.

| Excluded from R | Where it goes instead | Reason |
|---|---|---|
| Beds, number of doctors | Capability (`cap_size`) | Size isn't trustworthiness. Counting it in both places double-counted it *(F07)*. Doctors = 1 is a common placeholder value |
| Equipment-list presence, infrastructure coverage | Capability (`cap_infra`) | Same reason |
| Location agreement, STATE_MISMATCH | Location confidence | Location counted twice in v2 *(V12)* |
| Incompatible facility type | Cell-level plausibility (× 0.2) | It's a property of a facility-service pair, not of the record |

**The four components:**

| Component | Weight | Computed from | Formula |
|---|---|---|---|
| `src` | 0.40 | `source_urls`, `officialWebsite` | Each URL gets a tier: 1 gov/academic (`.gov.in`, `.nic.in`, `.ac.in`, …) · 2 own site (same domain as `officialWebsite`) · 3 health portal (Practo, Lybrate, …) · 4 aggregator/insurer (JustDial, IndiaMART, …) · 5 other. A tier 3–4 URL whose path doesn't contain a distinctive name token, and any category page, drops to tier 5. Then `src = min(1, best_tier_weight + 0.05·min(max(0, n_distinct_tier1to4_domains − 1), 4))` with weights gov 0.9 · own 0.8 · portal 0.6 · aggregator 0.4 · other 0.2. No URLs → 0.1 |
| `consistency` | 0.40 | Facility flags (5.3) | `1 − Σ penalties`, floored at 0 |
| `completeness` | 0.15 | `yearEstablished`, `officialWebsite` | Share of {valid year established, official website present}. So 0, 0.5 or 1 |
| `recency` | 0.05 | `recency_of_page_update` | Reference date 2026-11-21: ≤ 2 years old 1.0 · ≤ 5 years 0.6 · unknown 0.5 · older 0.3 |

### 5.3 Flags that feed R (one numeric penalty per cause)

| Flag | Raised when | Penalty to consistency |
|---|---|---|
| KITCHEN_SINK | A specialist type (dental, eye, diagnostic, nephrology-dialysis) has ≥ 2 positive claims for services incompatible with that type; or a clinic with beds < 30 (or unknown) claims ≥ 3 services; or a hospital with beds < 30 claims ≥ 4. Counts only the six validated services (burn care excluded) | −0.25 |
| NAMES_OTHER_FACILITY | An item contains a facility-like name ("… Hospital / Clinic / Centre / Medical College / Nursing Home") sharing < 50% of distinctive tokens with this facility's name | −0.25 |
| POSSIBLE_MERGE | KITCHEN_SINK + (NAMES_OTHER_FACILITY or TEMPLATED_TEXT), or NAMES_OTHER_FACILITY with ≥ 2 incompatible-type claims | −0.5, **replacing** the penalties of its components. Its cells are capped at Weak |
| TEMPLATED_TEXT, IMPLAUSIBLE_BEDS, SHARED_CLUSTER, NAME_COLLISION, LOCATION_CONFLICT, STATE_MISMATCH | various | **No R penalty.** Templated text halves an item's weight in confidence (6.2). Implausible beds sets size to Unknown. Location flags affect location only. The rest are display only |

---

## 6. Cell-level values (per facility × service)

### 6.1 Evidence extraction (Step 4)
1. Explode `procedure`, `equipment`, `capability` and `specialties` into items. Split `description` into sentences. Split each item into **clauses** on `;`, `. ` and `, but|however|except`.
2. Match each service's regexes (Java/Spark syntax, all case-insensitive):
   - **direct** terms name the service ("haemodialysis", "CABG", "LSCS")
   - **supporting** terms name a related department or specialty ("nephrology", "cardiology")
   - **infrastructure** terms name a resource ("dialysis machines", "cath lab", "incubators")

   Specialty codes are matched **exactly**, never by regex.
3. **Context:** some infrastructure terms only count if the same item has a context word (NICU equipment needs `neonat|newborn|infant|NICU|baby`).
4. **Exclusion:** drop a match if a service's exclusion pattern is within ±40 characters (e.g. "gastric" near "bypass").
5. **Negation:** a match is `negated` if a negation phrase is in the **same clause**, before or after it ("referred to", "outsourced", "under construction", "not available", "will be installed", …).
6. **Templated:** the item's normalised text is ≥ 40 characters and appears in ≥ 5 distinct `cluster_id`s.
7. **Routing (v4):**
   - If a direct or supporting term overlaps an infrastructure match, the overlap counts as **infrastructure**. "Dialysis" inside "dialysis machine" is a resource claim, not a service claim.
   - A positive direct-term match in the raw **`capability` list counts as supporting only**.
   - An explicit denial in any field still counts toward the cell's disposition.

### 6.2 Service confidence (Step 6)

| Step | Rule |
|---|---|
| Eligible claims | Positive direct matches after routing, from `procedure`, `equipment`, `specialties` (direct codes only) and `description` |
| Deduplicate | Group by normalised item text across all fields. Each group is one claim, kept at its highest-weight field |
| Item weight | procedure **0.85** · equipment **0.85** · specialties code **0.45** · description **0.3** (only if no structured field has a positive direct claim). × 0.5 if templated |
| Per-field cap | Within a field, sort claims by weight: 1st counts in full, 2nd at half weight, the rest at 0 |
| Combine | **noisy-OR**: `conf_raw = 1 − Π(1 − contribution)`. Examples: one procedure claim 0.85 · procedure + a different equipment claim 0.9775 · the same text in both fields 0.85 |
| Plausibility | Incompatible facility type → `conf_raw × 0.2` |
| Shrinkage by R | `conf_adj = min(conf_raw, rate_s + R·(conf_raw − rate_s))`, where `rate_s` = `direct_hit_rate` = the share of all facilities with an eligible positive direct claim for service s, **re-measured after extraction**. Draft values: dialysis 0.106, C-section 0.044, NICU 0.072, cardiac 0.095, MRI 0.095. The `min` keeps it monotone: lower R never raises confidence |
| Support-only cells | `support_raw = 0.15 × noisy-OR(supporting contributions)`. A service mention from the `capability` list uses 0.30 (see open question Q1). `support_adj = R × support_raw`. **A separate scale, never ranked against direct cells** |

### 6.3 Capability

```
cap_size  = Small 0.3 · Medium 0.6 · Large 0.9 · Unknown 0.5
            from beds (< 30 / 30–199 / ≥ 200); doctors only if beds are missing (2–9 / 10–49 / ≥ 50)
cap_infra = Σ weights of distinct positive infrastructure signals found ÷ Σ weights of all the service's signals
            (any field counts, including the raw capability list; each signal once per facility; negated signals count 0)
capability = 0.4·cap_size + 0.6·cap_infra        (MRI has no infrastructure list, so capability = cap_size)
cap_factor = 0.5 + 0.5·capability                (used at serving time; bounded, so it can never zero out a claim)
```

### 6.4 Disposition and tier, in fixed order (first match wins)

**Disposition**, over eligible direct matches and explicit denials:
- positive = ≥ 1 non-negated and 0 negated
- negated = 0 non-negated and ≥ 1 negated
- conflicting = both
- support-only = supporting matches only

An **infrastructure-only cell** has capability but no tier or disposition.

| # | Condition | Tier | Shown to user |
|---|---|---|---|
| 1 | All direct claims negated | **Excluded** | Never ranked. Used for "why not X?" |
| 2 | No positive direct claim, but supporting matches exist | **Possible** | Hidden. Fallback only, and never for time-critical services |
| 3 | Positive direct claim, but conflicting / incompatible type / R_tier Low / POSSIBLE_MERGE / location severe or unresolved | **Weak** | Yes, with the caveat quoted |
| 4 | Positive direct claim in procedure or equipment **and** (≥ 1 *service-specific* infrastructure signal, or the service's strong rule, or the matching specialist facility type) **and** the service's size rule is met | **Strong** | Yes |
| 5 | Positive direct claim in procedure or equipment | **Moderate** | Yes |
| 6 | Positive direct claim only in a specialties code or the description | **Weak** | Yes, with a caveat |

Generic infrastructure (ICU, blood bank, 24/7) adds to capability but **never qualifies a cell for Strong**.

### 6.5 Per-service parameters (full regexes in plan §6)

| Service | Time-critical | d0 km | Max radius km | α | β | Qualifies for Strong | Incompatible types | Special rules |
|---|---|---|---|---|---|---|---|---|
| dialysis | no (but recurring) | 25 | 150 | 1 | 1.2 | dialysis machines/stations, nephrologist, RO plant · or type nephrology-dialysis | dental, eye, diagnostic | |
| emergency_csection | **yes** | 25 | 100 | 1 | 1.5 | operating theatre, anaesthesia, NICU · or type maternity | dental, eye, diagnostic, nephrology | Strong also needs **emergency readiness in the same item**. Otherwise "C-section (emergency readiness not confirmed)", at most Moderate |
| nicu | **yes** | 50 | 200 | 1.2 | 1 | neonatal ventilators, warmers, incubators, CPAP, phototherapy (neonatal context required) | dental, eye, diagnostic, nephrology | SNCU and Level II count as supporting, not direct |
| cardiac_surgery | no | 150 | 500 | 1.5 | 0.7 | cath lab, CTICU/CICU, heart-lung machine | dental, eye, diagnostic, maternity, nephrology, small clinics | Size must not be Small. Gastric/bariatric excluded |
| mri | no | 75 | 300 | 1 | 0.8 | none: Strong = MRI term in equipment, or in the same item as a scanner/Tesla phrase | dental, eye | Capability = size only |
| trauma | **yes** | 25 | 100 | 0.8 | 1.5 | CT scan, ambulance | dental, eye, diagnostic, nephrology | "24/7 emergency care" is supporting only. Eye/dental/facial trauma excluded |
| burn_care | no | 100 | 400 | 1.2 | 1 | burns dressing room | dental, eye, diagnostic, maternity, nephrology | **Beta**: not validated |

---

## 7. Query-time ranking (Step 7)

1. Resolve the user's input with the gazetteer (PIN → PIN centroid; district → district centroid; city → locality centroid). If a city name exists in more than one state, ask the user.
2. `road_km = 1.4 × haversine`. `rank_km = road_km`, or `road_km + uncertainty` for Low-confidence locations.
3. **Gates:** tier ∈ {Strong, Moderate, Weak} · location not severe or unresolved · `rank_km ≤ radius`. The radius schedule is 25 → 50 → 100 → 250 → service maximum, stopping once k results of Moderate or better are found.
4. **Score:**
   ```
   final = (conf_adj × cap_factor)^α × exp(−rank_km/d0)^β × loc_factor
   loc_factor: High 1.0 · Medium 0.85 · Low 0.6
   ```
   Ties are broken by tier, then distance, then ID.
5. **Extra rows:**
   - "Stronger documented evidence, X km away", when no Strong facility is in the top k but one exists within the maximum radius.
   - An "Unconfirmed" list of Possible cells, **only** for non-time-critical services with fewer than k results.
6. **Display:**
   - tier
   - verbatim quote, cited as "Virtue Foundation record, {field}: '…'"
   - caveats
   - "~X km (± U)"
   - URLs as *facility references* (not as the quote's source)
   - "Listed in dataset; call to confirm"

   Confidence and capability are never shown as percentages.

---

## 8. Worked examples (v4 rules, illustrative facilities)

**A. Sharma Kidney Clinic, dialysis.** Type nephrology-dialysis, 20 beds, own website plus 2 other tier 1–4 domains, valid year, last-updated date unknown.

The record's evidence:
- procedure: "Haemodialysis" → direct, 0.85
- equipment: "Dialysis machines (6)" → infrastructure (routed, because it overlaps an infrastructure term)
- capability: "Dialysis services" → supporting only (v4)

Calculation:
- conf_raw = 0.85
- R:
  - src = 0.8 + 0.05×2 = 0.90
  - consistency = 1
  - completeness = 1
  - recency = 0.5
  - R = 0.36 + 0.40 + 0.15 + 0.025 = **0.935**
- conf_adj = min(0.85, 0.106 + 0.935×(0.85 − 0.106)) = **0.802**
- cap_size = 0.3 (Small)
- cap_infra = 1.0 ÷ 3.5 = 0.286, out of dialysis machines 1 + nephrologist 1 + RO 1 + ICU 0.5
- capability = 0.12 + 0.171 = **0.291**
- cap_factor = 0.646
- Tier **Strong**: procedure claim + a qualifying infrastructure signal + specialist type.

At 10 km: `final = (0.802 × 0.646)^1 × exp(−10/25)^1.2 × 1.0 = 0.518 × 0.619 = 0.32`.

**B. City General Hospital, MRI.** 500 beds, gov URL plus 4 domains, all metadata present, updated in 2025.
- equipment: "1.5 Tesla MRI scanner" (0.85); procedure: "MRI brain and spine" (0.85, different text)
- conf_raw = 1 − 0.15² = 0.9775
- R = 1.0
- conf_adj = **0.9775**
- capability = cap_size = **0.9**
- Tier **Strong** (MRI term in equipment).
- Dialysis cell: only the `nephrology` specialty code → **Possible**, hidden.

**C. "Aravind Eye", dialysis.** Type eye. Procedure "Haemodialysis services" (0.85).
- Incompatible type: conf_raw = 0.85 × 0.2 = 0.17.
- Flags: KITCHEN_SINK (an eye facility with 4 off-type claims) + NAMES_OTHER_FACILITY → POSSIBLE_MERGE, so consistency = 0.5.
- R:
  - src = 0.4 (aggregator) + 0.10 = 0.5
  - completeness = 0.5
  - recency = 0.5
  - R = 0.20 + 0.20 + 0.075 + 0.025 = **0.50**
- conf_adj = min(0.17, 0.106 + 0.5×0.064) = **0.138**
- Size: a claim of 1,241 beds at an eye facility → IMPLAUSIBLE_BEDS → Unknown (0.5). No infrastructure → capability = **0.20**.
- Tier **Weak** (incompatible type, merge).
- The PIN is in Delhi and the coordinates are in Puducherry → location severe → shown in the "Location uncertain" list, **not ranked**.

---

## 9. Your task: design the evaluation experiment

### 9.1 Goal
Measure whether this method produces **correct, well-ordered and honestly hedged** recommendations, and **which components earn their complexity**. The output is an experiment design that a small team can run within the datathon weekend on Databricks Free Edition. Labelling time is the scarcest resource.

### 9.2 Questions the experiment should answer (a starting point; refine or reprioritise)
1. **Claim extraction:** per service, how precise are the direct matches? What important claims do they miss (recall)? How accurate are negation and exclusion?
2. **Tier validity:** is precision monotone across tiers (Strong > Moderate > Weak > Possible)? Does Strong reach ≥ 85% "clear claim" for each service, with a confidence interval?
3. **Does R carry signal?** Are claims from low-R records wrong more often than claims from high-R records, holding the evidence field constant? Is R's spread wide enough to matter (v2's R bunched at a median of 0.84)?
4. **Is capability meaningful?** Does it agree with independent signals (beds, facility type, a hand judgment of "well equipped")? How often does it fall back to Unknown?
5. **Location:** how accurate is the High / Medium / Low vote on a hand-checked sample? Does gating severe locations remove wrong answers without removing many right ones?
6. **Ranking quality:** on realistic queries, does the full method beat simple baselines? Suggested baselines:
   - B0: nearest facility with any keyword mention
   - B1: keyword-mention count
   - B2: largest facility nearby
   - B3: the full method without R / without capability / without deduplication / without routing
7. **Sensitivity:** how stable are the top-k results under ±20% changes to field weights, α, β and d0?
8. **Honesty of uncertainty:** are caveats shown when they should be? Do time-critical queries avoid unconfirmed fallbacks? Is every quote verbatim and correctly attributed?
9. **Coverage:** for how many (district, service) pairs does the method return nothing within the maximum radius? Is the empty answer honest?

### 9.3 Constraints and resources
- **No ground truth.** Labels judge **what the record supports**: Clear claim / Ambiguous / Contradicted / Out of scope / Can't tell. They don't judge real-world availability. If you propose external checks (e.g. visiting a facility's own website), estimate their cost and keep them optional.
- The plan already proposes **120 labels**: 20 per validated service, stratified 8 Strong / 6 Moderate / 6 Weak. Plus 20 for burn care, and seven acceptance queries (plan Step 8). Critique this; don't just adopt it. Pay attention to sample size per service, stratification versus estimating each tier's rate, blinding labellers to the tier, and inter-rater agreement.
- **Data access:** Databricks SQL through the claude.ai Databricks MCP (`execute_sql`). Read-only on the source catalog. The Databricks CLI is not installed locally. The team's cleaned table may not exist yet.
- **The method isn't built yet.** Your design should say which experiments can run on raw extraction now (regex precision, negation, location vote) and which need the full pipeline (tiers, ranking, ablations).

### 9.4 Known weak spots worth probing
- **Q1, ambiguity:** for support-only cells, does the "0.30" for a capability-list service mention replace the 0.15 multiplier, or act as a contribution inside it? This changes the order of Possible cells.
- **Q2, possible false negatives from v4 routing:** a facility whose only dialysis evidence is "Dialysis unit with 12 machines" becomes **infrastructure-only, with no tier**, so it is never recommended. Measure how many cells this affects per service.
- **Q3:** v4 treats a service mention in the raw `capability` list as supporting only. About 594 facilities have a dialysis match in `capability` *(V6)*. How many of those lose their only direct claim, and are they actually right?
- **Q4:** R's completeness now takes only 3 values (0, 0.5, 1), and recency is "unknown" (0.5) for 65% of rows. R may again vary too little to change rankings.
- **Q5:** the 50-item list cut-off. Large hospitals may lose evidence. Compare tier shares for facilities at the cap with those below it.
- **Q6:** `direct_hit_rate` is measured on the same data it adjusts. Check that the ranking isn't sensitive to it.
- **Q7:** generic facility names and chain branches cause location mix-ups. Test whether evidence from one branch leaks into another branch's ranking.
- **Q8:** burn care has only one structured signal, the `burnAndTraumaPlasticSurgery` specialty code (131 facilities).

### 9.5 Deliverable
A markdown experiment design with:
1. The hypotheses or questions you chose, ranked by value per labelling hour.
2. For each one: data slice, sampling plan with sizes and the reasoning behind them, labelling protocol and rubric, metric(s), baseline or ablation, and the decision rule ("if X < threshold, then change Y").
3. Which experiments can run now and which need the pipeline built.
4. A labelling budget, in person-hours, and a run order that fits one weekend.
5. Concrete SQL or pseudocode for drawing the samples. Use column names from section 2.2.
6. Threats to validity: circularity, labeller bias, regex-defined sampling frames, and so on.

Save it as `evaluation-experiment-design.md` in the same `output/` folder.
