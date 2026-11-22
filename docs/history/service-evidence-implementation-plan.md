# Service Evidence: Implementation Plan (v4)

**This file is the single source of truth** for how the service-evidence layer is scored and served. Where `data-model-normalized.md` disagrees on scoring, tiers, flags or the serving formula, this file wins. Section 5 holds the up-to-date schema.

Related files:
- `validation-report.md`: checks against the real data (cited as *V#*)
- `plan-review-sol.md`: independent review (cited as *F#*)
- `service-evidence-implementation-plan-v2.md`: the previous version

Version history:
- **v1** (2026-11-21): first draft.
- **v2** (2026-11-21): added the 12 edits from the validation report and five changes of our own.
- **v3** (2026-11-21): adds the Sol review (F01–F12), with a few items deferred (section 0.2). Cleaning now belongs to the team; this plan states what it needs from the cleaned table (section 1).
- **v4** (2026-11-21): removes the source `capability` list from positive direct confidence scoring. Routes overlapping infrastructure evidence to capability and removes facility resources from record reliability.

---

## 0. What changed in v3

### 0.1 Sol findings adopted

| Finding | Problem | v3 rule | Where |
|---|---|---|---|
| F01 | No rule for negated or contradictory claims | Each cell gets a **disposition**: positive, negated, conflicting or support-only. Negated cells are **Excluded** (never recommended, but kept for "why not X?"). Conflicting cells are capped at Weak, and the contradiction is quoted | D4, Step 4 |
| F01 | Negation could miss text after the match, or jump to another service | Negation is checked **within the same clause**, both before and after the match | Step 4 |
| F01 | "Elective C-section" + an unrelated "24 hours" could become Strong *emergency* C-section | The `emergency_csection` label requires **emergency readiness in the same item** as a C-section or obstetric term. Otherwise the result reads "C-section (emergency readiness not confirmed)" and is at most Moderate | §3.2 |
| F01 | SNCU counted as NICU | SNCU and Level II are **supporting**, not direct, evidence for NICU | §3.3 |
| F02 | A facility with a 340 km location conflict could show up 0 km away | Severe or unresolved locations are **removed from the ranked list** and shown under "Location uncertain". Low-confidence locations are ranked on **pessimistic distance** (distance + uncertainty) | Step 0, Step 7 |
| F02 | Radius rules too vague | One distance metric (estimated road km). A bounding box is only a prefilter. The search schedule always ends at the service's maximum radius. Place names are keyed by state + district + city, and ambiguous names are put back to the user | Step 0, Step 7 |
| F03 | A facility-level URL was shown next to a quote, implying it backed the quote | Quotes are cited as **"Virtue Foundation record, {field}: '…'"**. URLs are listed separately as **facility references** | Step 7, §5 |
| F03 | Scores couldn't be replayed | Persist evidence ID, item position, rule ID, polarity, contribution and every score input | §5 |
| F04 | Plan and data model disagreed | This file wins. Tiers are decided in **one fixed order** | D4, §5 |
| F05 | The same text in two fields was counted twice | **Claims are deduplicated across fields** on normalised text and kept at the strongest field. Contributions are sorted by weight before the half-weight rule applies | Step 6 |
| F06 | Shrinkage reversed for scores below the base rate | `conf_adj = min(conf_raw, base + R(conf_raw − base))`, direct evidence only. Support-only cells use their own scale | D1 |
| F06 | "Base rate" mislabelled; the 0.2 cap never applies | Renamed **`direct_hit_rate`** (a detection rate in the data, not real-world prevalence). Cap removed | D1, Step 6 |
| F06 | Unconfirmed fallback undefined | Exact eligibility rules. **No unconfirmed fallback for time-critical services** | Step 7 |
| F07 | Capability undefined in places; "ICU" alone qualified a facility for Strong | Size is a bounded bucket score. MRI uses size only. Only **service-specific** infrastructure terms qualify for Strong; generic ones (ICU, blood bank, 24/7) add to capability but never qualify | D2, §3 |
| F07 | Beds counted in both R and capability | Beds removed from R's completeness score | Step 5 |
| F08 | The strong-evidence slot could push out a useful nearby result | No replacement. A separate labelled row reads **"Stronger documented evidence, farther away"** | Step 7 |
| F09 | One KITCHEN_SINK flag was penalised three times | **One numeric penalty per cause.** KITCHEN_SINK is a warning that only affects R. POSSIBLE_MERGE needs a second, independent signal | D3, Step 5 |
| F09 | Source scoring edge cases | No URLs → `src` 0.1. Tier 5 only → 0.2. The domain bonus uses `max(0, n−1)`. Name matching uses whole distinctive tokens | Step 2 |
| F10 | Bare "bypass surgery" still matched; excluding a whole item lost real claims | Bare pattern removed. Exclusions apply **within ±40 characters of the match**, not to the whole item. Every regex is compiled and tested in Spark against fixtures before use | §3, Step 3 |
| F10 | Burn care regex flawed | Rewritten. `burnAndTraumaPlasticSurgery` moves to supporting. Burn care is **beta** and shows "insufficient evidence" until V18 passes | §3.7 |
| F11 | Small pooled sample; tier shares used as pass criteria | Results reported **per service** with Wilson intervals and the share of "can't tell". Tier shares and the R distribution become diagnostics. Labels judge **what the record supports**, not whether the service is available today | Step 9, §4 |
| F12 | Header miscount; no readable labels for specialty codes | Fixed. Codes are split from camelCase for display | §3.0 |

### 0.2 Deferred (not needed for the weekend)
- A label for "service verified by independent evidence". Labels judge what the record supports.
- Grouped holdout sets and fitting a logistic regression. Hand-set weights plus per-service precision are enough.
- Versioned rule settings and a rejection reason for every non-match. We store only what's needed to replay a score.
- Detecting near-duplicate paraphrases across fields. Exact normalised-text deduplication only.
- Automatic resolution of namesakes and chain branches. These are flagged, not resolved.

### 0.3 Kept from v2
Location is excluded from R (it enters only through location gating and `loc_factor`) · Possible tier · tiers judged on precision, not on how they split · burn care as a service (now beta) · a strong-evidence row (now a separate row).

---

## 1. Input contract: the team's cleaned table

The team owns cleaning. Its output (called `silver.facility_clean` here) must meet these rules. **Step 1 of this plan is a set of contract checks on that table, not a cleaning job.** A failed check blocks Steps 2–7.

| Requirement | Check |
|---|---|
| One row per facility, after removing the shifted rows and exact duplicates | `count(*) = count(distinct unique_id)`, about 9,989 |
| Raw text columns kept alongside the cleaned ones (name, description, the five list columns, address fields) | The columns exist and are non-null wherever the bronze value is non-null |
| `specialties`, `procedure`, `equipment`, `capability`, `source_urls` parsed to `ARRAY<STRING>`; the string `"null"` → NULL | Type check. No `"null"` strings left |
| `list_capped_<col>` true when the array has exactly 50 items | Present for all five columns |
| `facility_type` following the 9 rules of V3, in order | Values ⊆ {hospital, clinic, dental, eye, diagnostic, maternity, nephrology-dialysis, pharmacy, other} |
| `operator_type` ∈ {public, private, NULL}; `cluster_id` kept | Present |
| `beds`, `doctors` and `year_established` capped per V4. Doctors = 1 with beds ≥ 50 → NULL | No beds outside 1–5,000; no doctors outside 1–2,000; year within 1700–2026 |
| `last_updated` as a DATE; future dates → NULL | `max(last_updated) ≤ 2026-11-21` |
| PIN normalised to 6 digits, or NULL; raw PIN kept | `pincode RLIKE '^[1-9][0-9]{5}$'` or NULL |
| Coordinates numeric. (0,0) and points outside India → NULL | All inside India's bounding box |
| `address_stateOrRegion` kept raw; a `state_is_real` boolean | Used for STATE_MISMATCH |

If the team's names differ, add a thin view that renames them. Don't change the downstream steps.

---

## 2. Decisions

**D1: Service confidence and record reliability.**
```
direct evidence:  conf_adj = min(conf_raw, direct_hit_rate_s + R × (conf_raw − direct_hit_rate_s))
support only:     support_adj = R × support_raw          (a separate scale, never ranked against direct cells)
```
- The `min` keeps the result monotone: lower R can never increase confidence.
- `direct_hit_rate_s` = the share of all cleaned facilities with an eligible **positive** direct claim for the service. Recompute it after Step 6 classifies the claims, before applying the confidence adjustment. The old dialysis rate of 0.106 is for illustration.
- R measures source quality, record consistency, metadata completeness and recency. Location and facility resources have their own inputs.

**D2: Capability.**
- `cap_size` by bucket:

  | Bucket | Defined by beds | Defined by doctors (used only when beds are missing) | Score |
  |---|---|---|---|
  | Small | < 30 | 2–9 | 0.3 |
  | Medium | 30–199 | 10–49 | 0.6 |
  | Large | ≥ 200 | ≥ 50 | 0.9 |
  | Unknown | otherwise | | **0.5** |

- `cap_infra` = Σ weight of distinct positive infrastructure signals found ÷ Σ weight of all signals the service lists. Infrastructure can appear in any source field, including the raw `capability` list. Each signal counts once per facility.
- `capability = 0.4 × cap_size + 0.6 × cap_infra`. **For services with no infrastructure terms (MRI), `capability = cap_size`.**
- At serving time, `cap_factor = 0.5 + 0.5 × capability`. This is a bounded ranking factor applied after computing service confidence.
- The UI shows "not documented" for missing infrastructure, never "absent".

**D3: Flags and penalties: one numeric penalty per cause.**

| Flag | Raised when | Severity | Effect (only this) |
|---|---|---|---|
| LOCATION_CONFLICT | The location vote disagrees (Step 0) | warn (25–200 km) / severe (> 200 km and the city vote is inconclusive) | Location gating and `loc_factor` only. **Not in R** |
| STATE_MISMATCH | `state_is_real` and it differs from the PIN's state (AP and Telangana treated as equal) | warn | Location confidence only. **Not in R** |
| KITCHEN_SINK | V9 rule, counting **positive** direct claims over the **six validated services** (burn care excluded) | warn | R consistency −0.25 |
| NAMES_OTHER_FACILITY | An item contains a facility-like name (`… (Hospital\|Clinic\|Centre\|Center\|Medical College\|Nursing Home)`) sharing < 50% of distinctive tokens with this facility's name. The quoted span is stored | warn | R consistency −0.25 |
| TEMPLATED_TEXT | All of the cell's direct evidence comes from items of ≥ 40 characters that appear word for word in ≥ 5 **distinct `cluster_id`s** | info | Item weight × 0.5 (Step 6) |
| POSSIBLE_MERGE | KITCHEN_SINK **and** (NAMES_OTHER_FACILITY or TEMPLATED_TEXT), **or** NAMES_OTHER_FACILITY with ≥ 2 off-type claims | severe | R consistency −0.5 (**replaces** the warn penalties of its components); affected cells are capped at Weak |
| IMPLAUSIBLE_BEDS | Beds > 300 at a clinic, dental, diagnostic or eye facility | warn | Display caveat; size bucket → Unknown |
| SHARED_CLUSTER, NAME_COLLISION | `cluster_id` shared; the same name appears in other cities | info | Display only |

- Incompatible facility type is a **cell-level** issue: confidence × 0.2, and the tier is capped at Weak.
- The v2 KITCHEN_SINK × 0.7 confidence multiplier is **removed**.

**D4: Recommendation tiers, decided in this order (first match wins):**

The tier reflects the claim, caveats and service-specific readiness criteria. The numeric service confidence follows D1 and Step 6.

| # | Condition | Tier | Shown |
|---|---|---|---|
| 1 | Direct claims exist and **all** are negated | **Excluded** | Never ranked. Available for "why not X?", e.g. "C-section listed, but the record says it is referred to KC GMC" |
| 2 | No eligible positive direct claim and at least one positive supporting match (including a service mention from the source `capability` list) | **Possible** | Hidden. Fallback only (Step 7) |
| 3 | A positive direct claim, but any of: conflicting disposition · incompatible type · R_tier Low · POSSIBLE_MERGE · location severe/unresolved | **Weak** | Yes, with the reason quoted. (Severe-location cells go to the "Location uncertain" list) |
| 4 | A positive direct claim in `procedure` or `equipment` **and** a qualifying condition (≥ 1 **service-specific** infrastructure signal · the service's strong rule · the matching specialist type) **and** the service's size rule is met | **Strong** | Yes |
| 5 | A positive direct claim in `procedure` or `equipment` | **Moderate** | Yes |
| 6 | A positive direct claim only in a `specialties` code or `description` | **Weak** | Yes, with a caveat |

**Disposition** (per cell, over eligible direct matches and explicit service denials):
- positive = at least 1 non-negated and 0 negated
- negated = 0 non-negated and at least 1 negated
- conflicting = both
- support-only = no eligible direct claim or explicit denial, and at least one supporting match
- An infrastructure-only cell can carry capability with no recommendation tier. Preserve any service or infrastructure quote for audit.

**D5: Planner / NFHS view.** Out of scope.

---

## 3. Build order

Persist every layer as a Delta table and rebuild it in batch. Load the `ref.*` tables as small broadcast joins. Test a full refresh **and** the real query entry point early on Free Edition.

### Step 0: Location
- **PIN centroid:** the median of post offices with valid coordinates inside India. Also store `pin_radius_km`.
- **Locality centroid:** the median coordinates of facilities sharing a **(state, district, normalised city)** key from the PIN directory. Use only keys with ≥ 5 facilities, and record the facility count used.
- **Vote:**

  | Situation | Resolved location | Confidence | `location_uncertainty_km` |
  |---|---|---|---|
  | Coordinates and PIN centroid both valid and within 25 km | Coordinates | High | max(1, precision radius) |
  | Both valid, disagree; exactly one within 25 km of the locality centroid | That one | Medium | max(5, `pin_radius_km`) |
  | Both valid, disagree; the locality vote is inconclusive | PIN centroid | Low; **severe** if the gap is > 200 km | The gap between them |
  | Coordinates only | Coordinates | Medium | 5 |
  | PIN centroid only | PIN centroid | Low | `pin_radius_km` |
  | Neither | NULL | **Unresolved** | NULL |

- Displayed state and district: from the PIN directory when the resolved source is the PIN, otherwise the nearest PIN centroid to the resolved coordinates. Store `location_vote_detail`, e.g. "coordinates 340 km from PIN 110002; PIN agrees with city".
- **User input** goes through a gazetteer:
  - PIN → PIN centroid
  - District → district centroid, keyed by (state, district)
  - City → locality centroid; **if a city name exists in more than one state, return the choices to the user**
  - Coordinates → as given, after validation
  - Reject malformed PINs and coordinates outside India.

### Step 1: Contract checks on `silver.facility_clean`
Run every check in section 1. Save the results to `qa.contract_results`.

### Step 2: `facility_source`
- Domain extraction as in V5:
  ```
  lower(regexp_replace(regexp_extract(trim(url),'^(?:https?://)?([^/?#:]+)',1),'^www\.',''))
  ```
  Path = whatever follows the host.
- **Tiers:**
  1. gov/academic suffixes (`.gov.in`, `.nic.in`, `.gov`, `.ac.in`, `.edu.in`)
  2. own site: the domain equals, or is a subdomain of, `officialWebsite`'s domain
  3. health portals
  4. aggregators and insurers
  5. everything else
- `url_mentions_facility`: the path contains at least one **distinctive** name token: ≥ 4 letters, case-insensitive, and not in the stoplist {hospital, clinic, centre, center, medical, health, care, multi, speciality, specialty, super, nursing, home, india}. Tier 3–4 URLs where this is false, and category pages (`(?i)/nct-|/listing/|hospitals-in-`), are downgraded to tier 5.
- **Source score:**
  ```
  src = 0.1 if no URLs
      = min(1, best_tier_weight + 0.05 × min(max(0, n_distinct_tier1to4_domains − 1), 4))
  best_tier_weight: gov 0.9 · own site 0.8 · portal 0.6 · aggregator 0.4 · other 0.2
  ```

### Step 3: Reference tables and regex fixtures
- `ref.service`, `ref.service_term` (each term has: term ID, type, weight, qualifies-for-Strong flag, optional context pattern), `ref.service_specialty_code`, `ref.negation`, `ref.exclusion`.
- **Every stored pattern starts with `(?i)`.** Strip Markdown `\|` escapes when loading.
- `ref.regex_fixture` (pattern ID, text, expected match yes/no). It has at least 5 positive and 5 negative examples per service, including the cases in §3.x. **Gate:** all fixtures pass when run in Spark.

### Step 4: `evidence`
1. Explode the list fields with their positions. Split `description` into sentences, recording sentence offsets.
2. Split each item into **clauses** on `;`, `. `, and `,\s+(but|however|except)\b`.
3. Match terms. Each match gets: `evidence_id`, `facility_id`, `service_id`, `field`, `item_pos`, `clause_pos`, `item_text` (raw), `item_norm` (lowercased, punctuation stripped, whitespace collapsed), `matched_text`, `match_start` (inclusive), `match_end` (exclusive), `term_id`, `term_type`. Match offsets are relative to the clause.
4. **Context:** if a term has a context pattern (e.g. NICU equipment must appear with `neonat|newborn|infant|NICU`), the context must appear in the same item.
5. **Exclusion:** drop the match if the service's exclusion pattern appears **within ±40 characters of the match**.
6. **Negation:** `polarity = negated` if a negation pattern appears **in the same clause** (before or after the match). Store `negation_text`.
7. **Templated items:** `templated = true` if `item_norm` has ≥ 40 characters and appears in ≥ 5 distinct `cluster_id`s.
8. Specialty codes: exact match against `ref.service_specialty_code`.
9. Assign a scoring role while retaining the original match for audit:
   - When a direct or supporting term overlaps an infrastructure match, assign the overlapping fact to infrastructure. For example, “dialysis” inside “dialysis machine” is part of the machine claim. A separate phrase such as “we provide haemodialysis” in the same item can still be a service claim. Apply the same routing to copies across fields.
   - A remaining positive direct-term match from the raw `capability` field is supporting evidence only. An explicit service denial from any field still counts toward disposition. A negated infrastructure match alone describes the resource, so it contributes neither to capability nor to direct service disposition.

### Step 5: Flags and R
- Raise the flags in D3. **Geographic flags are excluded from R.**
- **R:**
  ```
  R = max(0.3, 0.40 × src + 0.40 × consistency + 0.15 × completeness + 0.05 × recency)
  ```
  - `consistency` = 1 − Σ penalties (D3), floored at 0
  - `completeness` = share of {valid year_established, officialWebsite present}. R's consistency uses the R penalties in D3. Beds, doctors, equipment-list presence and infrastructure coverage are excluded from R. Incompatible facility type is a separate service plausibility check.
  - `recency` (reference date **2026-11-21**): 1.0 if ≤ 2 years old · 0.6 if ≤ 5 · 0.5 if unknown · 0.3 if older
  - `R_tier`: High ≥ 0.75, Medium ≥ 0.5, Low < 0.5. The thresholds are reviewed against V15 as a diagnostic, not a quota.

### Step 6: `facility_service`
1. Take the eligible **positive direct** matches after Step 4 routing. Use this same eligibility rule for direct-hit counts and direct-claim flags.
2. **Deduplicate claims:** group by `item_norm` across the facility and service. Matching several keywords in one item still produces one scored claim. Each group is kept at its **highest-weight eligible field**. All quote variants are kept for audit.
3. **Item weight** = field weight (procedure 0.85 · equipment 0.85 · specialties code 0.45 · description 0.3) × 0.5 if templated.
   - Description claims count only if no structured field has a positive direct claim.
4. **Per field:** sort that field's claims by weight, descending. The first counts at full weight, the second at half weight, and the rest at 0. Exact copies have already been removed. Paraphrases can still survive deduplication.
5. `conf_raw = 1 − Π(1 − contribution)` over eligible direct contributions. Each claim fills a fraction of the gap to 1. These are scoring weights.
   - Example: “haemodialysis” in procedures fills 0.85 of the scale. A copy in equipment and a service mention in the source `capability` list add zero. “Dialysis unit” and “ICU” fill 1.5 of the 3.5 infrastructure checklist points. With 120 beds, capability is `0.4 × 0.6 + 0.6 × (1.5 ÷ 3.5) ≈ 0.50`. Holding R at 0.8 and using the old 0.106 rate for illustration gives `conf_adj = 0.7012`. The ranking input before distance, location and the service exponent is about 0.52.
6. **Support-only cells:** `support_raw = 0.15 × noisy-OR(supporting contributions)`. Use 0.30 for a service mention routed from the raw `capability` field, with the same template discount, deduplication and per-field cap. An infrastructure-only cell has zero support score.
7. **Incompatible type:** `conf_raw × 0.2`.
8. Compute `conf_adj` (D1), `capability` (D2), disposition and tier (D4).
9. **Reasons** (stored as codes plus rendered text). Always include:
   - (a) the primary direct quote, or the supporting or infrastructure quote for cells with only those matches
   - (b) the biggest caveat, if any: negation or conflict, an incompatible type, a flag, "emergency readiness not confirmed", or a list cut off at 50 items

   Then up to 3 more contributions.

### Step 7: Serving
**Flat table:** `serving_facility_service`. See §5 for columns.

**Query flow:**
1. Resolve the input with the gazetteer (Step 0). If the place name is ambiguous, return the choices to the user.
2. Filter by service and a bounding box (prefilter only).
3. `road_km = 1.4 × haversine`.
4. **Ranking distance:** `rank_km = road_km` for High/Medium locations, and `road_km + location_uncertainty_km` for Low.
5. **Gates:**
   - Tiers Strong, Moderate and Weak only.
   - Location not severe and not unresolved; those go to a separate "Location uncertain" list.
   - `rank_km ≤ current radius`.
6. **Radius schedule:** 25 → 50 → 100 → 250 km, then the service's `max_radius_km`. Values above the maximum are dropped and the maximum is always included. Stop at the first radius that gives **k** eligible results of Moderate or better.
7. **Ranking:**
   ```
   final = (conf_adj × cap_factor)^α × exp(−rank_km / d0)^β × loc_factor
   loc_factor: High 1.0 · Medium 0.85 · Low 0.6
   ```
   Ties are broken by tier, then `rank_km`, then `facility_id`. Scores are only compared within a single service query.
8. **Strong-evidence row:** if no Strong facility is in the top k but one exists within `max_radius_km`, append the best one as a separate row labelled "Stronger documented evidence, {X} km away". It never replaces a top-k row.
9. **Unconfirmed fallback:** only if there are fewer than k eligible direct results at `max_radius_km`, **and** the service is **not** time-critical (i.e. not emergency C-section, NICU or trauma).
   - Show Possible cells with disposition support-only, a compatible type, and a non-severe location.
   - Display them as a separate "Unconfirmed: {supporting term} listed; {service} not confirmed" list, ranked by `support_adj × proximity`.
   - For time-critical services, show instead: "No confirmed option within {max} km. Nearest Weak claim: {X} ({km})", or an honest no-result.
10. **Display:**
    - Tier
    - Primary quote, as "Virtue Foundation record, {field}: '…'"
    - Caveats
    - "~{road_km} km (± {uncertainty})"
    - Facility references (the URLs, labelled as references, not as the quote's source)
    - "Listed in dataset; call to confirm"

    Confidence and capability are never shown as percentages.

### Step 8: Acceptance queries (hand-inspected with the top-k rubric in §4)
- Dialysis near Jaipur (city)
- Emergency C-section near Lucknow (city)
- NICU for PIN 411001 (PIN)
- Cardiac surgery from Patna district (district)
- MRI at a rural Bihar coordinate (coordinates)
- Trauma in a national-highway district
- Burn care near Delhi (beta: expect a labelled "insufficient evidence" result unless V18 passes)
- **One visible rejection:** a facility listing C-section with "referred to" appears as Excluded in "why not X?"
- **One no-result case**

### Step 9: Labelling
- **Rubric** (record-level, blind to the tier):
  - Clear claim
  - Ambiguous
  - Contradicted
  - Out of scope (wrong service or another facility's text)
  - Can't tell
- **Sample:** 20 cells per validated service, stratified 8 Strong / 6 Moderate / 6 Weak, giving 120. Plus 20 for burn care (beta).
- **Report per service:** precision of "Clear claim" with a 95% Wilson interval, plus the share of "can't tell" (counted in the denominator and reported, not dropped).
- **Targets:** Strong ≥ 85% Clear claim per service, with the interval reported. If a service misses, fix that service's terms before launch.
- Logistic regression is optional (deferred).

---

## 4. Checks

**Release gates (must pass):**

| ID | Check | Pass |
|---|---|---|
| Contract | Section 1 checks on the team's table | All pass |
| Fixtures | `ref.regex_fixture` run in Spark | 100% |
| V6′ | Re-sample 25 trauma + 25 cardiac positive direct items | Each ≥ 85% precise. Zero gastric/bariatric hits |
| V12′ | The acceptance queries under full v4 | Top-k rubric passes for every query |
| Step 9 | Strong precision per service | ≥ 85%, interval reported |
| V18 | Burn care, 25-item sample | ≥ 85% before burn care leaves beta |

**Top-k rubric** (for each acceptance query):
1. Every result matches the requested service.
2. Every quote is verbatim and labelled with its field.
3. Emergency C-section results show readiness, or the "not confirmed" label.
4. No severe or unresolved location appears in the ranked list.
5. Fallback and strong-evidence rows are labelled.
6. An empty result explains itself.

**Diagnostics (recorded, not gates):** V8′ tier shares per service and the number of distinct `conf_raw` levels · V15 R distribution · V16 the POSSIBLE_MERGE and KITCHEN_SINK lists (hand-check 15) · V17 location vote shares (hand-check 10 Low and 10 Medium) · V19 tier shares at facilities whose lists hit the 50-item cap · the re-measured `direct_hit_rate`.

**Scoring regression cases:** A capability-list-only service mention yields Possible with zero direct confidence. The same service claim copied into procedure and equipment has the same confidence as procedure alone. Adding a distinct positive infrastructure fact changes capability while holding R and numeric confidence fixed. A negated infrastructure fact adds zero capability. A capability-list denial can still conflict with a procedure claim. An MRI scanner remains direct evidence under the existing MRI rule because MRI has no infrastructure checklist.

---

## 5. Schema (authoritative; supersedes `data-model-normalized.md` §2–4 where they differ)

| Table | Grain | Key columns |
|---|---|---|
| `silver.facility_clean` | facility | Owned by the team (section 1) |
| `silver.pincode_centroid` | PIN | pincode, lat, lon, pin_radius_km, state, district |
| `silver.gazetteer` | place name | name_norm, kind (pin/district/city), state, district, lat, lon, radius_km, n_facilities |
| `gold.facility_location` | facility | resolved_lat, resolved_lon, location_source, location_confidence (High/Medium/Low/Unresolved), location_severe, location_uncertainty_km, location_vote_detail, display_state, display_district |
| `gold.facility_source` | facility × URL | url, domain, path, source_tier, url_mentions_facility |
| `gold.facility_flag` | facility × flag | flag_code, severity, detail, evidence_span |
| `gold.facility` | facility | facility_type, operator_type, cluster_id, size_bucket, cap_size, src, consistency, completeness, recency, R, R_tier |
| `ref.service` | service | service_id, display_name, synonyms, time_critical, beta, d0_km, max_radius_km, alpha, beta_exp, incompatible_types, size_rule, strong_rule, direct_hit_rate |
| `ref.service_term` | service × term | term_id, pattern, term_type (direct/supporting/infrastructure), weight, qualifies_strong, context_pattern |
| `ref.service_specialty_code` | service × code | code, display_label, role (direct/supporting) |
| `ref.negation`, `ref.exclusion` | pattern | pattern_id, pattern, service_id (NULL = shared) |
| `ref.regex_fixture` | fixture | pattern_id, text, expected |
| `gold.evidence` | match | evidence_id, facility_id, service_id, field, item_pos, clause_pos, item_text, item_norm, matched_text, match_start, match_end, term_id, term_type, scoring_role, polarity, negation_text, templated, claim_group |
| `gold.facility_service` | facility × service | disposition, conf_raw, conf_adj, support_raw, support_adj, cap_infra, capability, tier, emergency_ready (C-section only), primary_evidence_id, reason_codes, reasons |
| `serving.facility_service` | facility × service | facility_id, service_id, name, resolved_lat/lon, location_confidence, location_severe, location_uncertainty_km, R, conf_adj, cap_factor, tier, primary_quote STRUCT<field, item_text>, caveats ARRAY, reasons ARRAY, facility_refs ARRAY<STRUCT<url, source_tier>>, flags ARRAY |

Tier values: Strong · Moderate · Weak · Possible · Excluded. Tier and disposition are NULL for infrastructure-only cells.

---

## 6. Service specs

Every pattern below is stored with a leading `(?i)` (omitted here for readability). Java/Spark syntax.

**Shared negations (clause scope):**
```
refer(red|ral|s)?\s+(to|out)|coming\s+soon|planned|proposed|upcoming|under\s+construction|tie[- ]?up|\bno\s+(facility|facilities)\b|outsourc\w*|will\s+be\s+(installed|started|commissioned|set\s+up|launched|available)|awaited|in\s+the\s+pipeline|not\s+(yet\s+)?(available|functional|operational|offered|provided)|non[- ]?functional|discontinued|unavailable|nearby\s+(centre|center|hospital)
```
Do not add `in collaboration with`.

### 6.0 Specialty codes (exact match; display = camelCase split, e.g. `cardiacSurgery` → "Cardiac Surgery")

| Service | Direct (0.45) | Supporting |
|---|---|---|
| dialysis | none | nephrology, pediatricNephrology |
| emergency_csection | none | gynecologyAndObstetrics, obstetricsAndMaternityCare, maternalFetalMedicineOrPerinatology |
| nicu | none | neonatologyPerinatalMedicine, pediatricCriticalCareMedicine |
| cardiac_surgery | cardiacSurgery, cardiothoracicSurgery | cardiology, pediatricCardiology |
| mri | none | radiology, diagnosticRadiology, interventionalRadiology |
| trauma | none | emergencyMedicine, orthopedicSurgery, neurosurgery, burnAndTraumaPlasticSurgery |
| burn_care | none (beta) | burnAndTraumaPlasticSurgery, plasticSurgery (confirm the exact code) |

### 6.1 dialysis (d0 25 · max 150 · α 1 · β 1.2 · not time-critical)
- **direct:** `\b(haemo|hemo|peritoneal\s+)?\s?dialy(sis|ses|zer|zers)\b` · `\b(CAPD|CRRT|SLED)\b`
- **supporting:** `\bnephrolog(y|ist|ists|ical)\b` · `\b(renal|kidney)\s+(care|unit|failure|replacement|transplant)\b`
- **infrastructure:**
  - Qualifies for Strong (weight 1.0): `\b((haemo|hemo)\s?)?dialysis\s+(machines?|stations?|beds?|units?|chairs?)\b` · `\bnephrolog(ist|ists)\b` · `\bRO\s+(water|plant)\b`
  - Generic: `(?<![NP])\bICU\b` (0.5)
- **strong rule:** facility type = nephrology-dialysis · **incompatible:** dental, eye, diagnostic
- **fixtures:** ✓ "Haemo dialysis centre" · ✓ "Hemodialysis machines (12)" · ✗ "Dialysis referred to AIIMS" (negated) · ✗ "Dialysis Room (Under Construction)" (negated)

### 6.2 emergency_csection (d0 25 · max 100 · α 1 · β 1.5 · **time-critical**)
- **direct:** `\b(c[- ]?section|caesarean|cesarean|LSCS)\b`
- **emergency readiness** (sets `emergency_ready`; it must be in the **same item** as a direct or obstetric term): `\bemergenc(y|ies)\b` · `\b24\s*[x/×]\s*7\b|\b24\s+hours?\b|round[- ]the[- ]clock` · `\bhigh[- ]risk\s+(pregnan\w*|deliver\w*|obstetric\w*)\b` · `\bobstetric\s+emergenc\w*\b`
- **supporting:** `\b(obstetric(s|al|ian)?|gyn(a)?ecolog\w*|OBG|OB[/ -]?GYN|maternity|labou?r\s+room)\b`
- **infrastructure:**
  - Qualifies for Strong: `\b(operation\s+theat(re|er)|operating\s+(theat(re|er)|room)|modular\s+OT)\b` · `\ban(a)?esthe\w*\b` · `\b(NICU)\b`
  - Generic: `\bblood\s+(bank|storage)\b` (0.5)
- **strong rule:** Strong requires `emergency_ready` **and** (a qualifying infrastructure term or facility type = maternity). Without `emergency_ready`, the cell is at most Moderate, labelled "C-section (emergency readiness not confirmed)".
- **incompatible:** dental, eye, diagnostic, nephrology-dialysis
- **fixtures:** ✓ "Emergency LSCS available 24x7" (ready) · ✓ "Caesarean section" (not ready) · ✗ "C-section deliveries are referred to Kalpana Chawla GMC" · "Elective caesarean section" + an unrelated "24 hours pharmacy" in another item → not ready

### 6.3 nicu (d0 50 · max 200 · α 1.2 · β 1 · **time-critical**)
- **direct:** `\b(NICU|neonatal\s+intensive\s+care|newborn\s+intensive\s+care|neonatal\s+ICU|level\s+(III|IIIA|3)\s+(neonatal|NICU|newborn))\b`
- **supporting:** `\bSNCU\b` · `\blevel\s+(II|2)\s+(neonatal|newborn)\b` · `\b(neonatolog\w*|p(a)?ediatric\w*|paediatric\w*)\b`
- **infrastructure** (context `neonat|newborn|infant|NICU|baby` required in the same item; qualifies for Strong): `\b(neonatal\s+)?ventilators?\b` · `\b(radiant\s+)?warmers?\b` · `\bincubators?\b` · `\bphototherapy\b` · `\b(bubble\s+)?CPAP\b` · `\bneonatolog(ist|ists)\b`
- **incompatible:** dental, eye, diagnostic, nephrology-dialysis
- **fixtures:** ✓ "Level III NICU with 20 beds" · ✗ "SNCU" (supporting only) · ✗ "Ventilators in ICU" (no neonatal context) · ✓ infrastructure: "Neonatal ventilators and radiant warmers"

### 6.4 cardiac_surgery (d0 150 · max 500 · α 1.5 · β 0.7 · not time-critical)
- **direct:**
  - `\b(cardiac|heart|cardio[- ]?thoracic|open[- ]heart)\s+surger(y|ies)\b`
  - `\b(coronary(\s+artery)?|heart|cardiac)\s+bypass(\s+(graft\w*|surger(y|ies)))?\b`
  - `\b(CABG|CTVS|OPCAB)\b`
  - `\b((mitral|aortic|tricuspid|pulmonary|heart)\s+)?valve\s+(replacement|repair)\b`
  - (The bare `bypass surgery` pattern is **removed**.)
- **exclusion (±40 characters):** `\b(gastric|bariatric|roux|obesity|weight[- ]loss|ileal|femoral|fem[- ]pop)\b`
- **supporting:** `\bcardiolog\w*\b` · `\b(angioplasty|angiography|PTCA|PCI)\b`
- **infrastructure:**
  - Qualifies for Strong: `\bcath(eteri[sz]ation)?\s*lab\b` · `\b(CTICU|CICU)\b` · `\b(heart[- ]lung\s+machine|perfusion(ist)?s?)\b`
  - Generic: `\b(CCU|ICCU)\b` (0.5) · `(?<![NP])\bICU\b` (0.5)
- **size rule:** Strong requires size bucket Medium, Large or Unknown (not Small)
- **incompatible:** dental, eye, diagnostic, maternity, nephrology-dialysis, and clinic when beds < 30 or unknown
- **fixtures:** ✓ "CABG and bariatric surgery" (CABG is outside the ±40 window; check the window) · ✗ "Gastric bypass surgery" · ✗ "Bypass surgery" alone · ✓ "Mitral valve repair"

### 6.5 mri (d0 75 · max 300 · α 1 · β 0.8 · not time-critical)
- **direct:** `\bMRI\b` · `\bmagnetic\s+resonance\b` · `\bMR\s+(imaging|angiography)\b`
- **scanner phrase** (must be in the same item as an MRI term): `\b(scanner|machine|\d(\.\d)?\s*T(esla)?)\b`
- **supporting:** `\bradiolog\w*\b` · `\b(imaging|scan)\s+cent(re|er)\b`
- **infrastructure:** none, so capability = `cap_size`
- **strong rule:** the MRI term is in `equipment`, or in the same item as a scanner phrase in an eligible direct claim. A bare MRI term in procedure is at most Moderate. A positive MRI mention in the raw `capability` field is supporting.
- **incompatible:** dental, eye
- **fixtures:** ✓ "MRI 1.5 Tesla" · ✗ "MRI (Outsource)" (negated) · ✗ "MRI services offered via outsourced provider" (negated, after the match) · "CT scanner; MRI referral" → MRI negated by clause

### 6.6 trauma (d0 25 · max 100 · α 0.8 · β 1.5 · **time-critical**)
- **direct:**
  - `\btrauma\s+(and\s+\w+\s+)?(care|cent(re|er)|unit|surgery|ward|team|icu|services?)\b`
  - `\blevel\s+(I|II|1|2)\s+trauma\b`
  - `\bpoly[- ]?trauma\b`
  - `\b(accident\s+(and|&)\s+emergency|emergency\s+(and|&)\s+trauma|trauma\s+(and|&)\s+emergency)\b`
  - `\bcasualty\s+(department|ward|services?)\b`
- **exclusion (±40 characters):** `\b(ocular|eye|orbital|dental|tooth|teeth|maxillo[- ]?facial|facial|hand|psycholog\w*|emotional|birth|urinary\s+tract|genito[- ]?urinary)\s+trauma`
- **supporting:** `\bemergency\s+(department|room|ward|services?|care|unit)\b|\b24\s*[x/×]\s*7\s+emergency\b` · `\b(orthop(a)?edic\w*|neuro[- ]?surg\w*|general\s+surg\w*)\b`
- **infrastructure:**
  - Qualifies for Strong: `\b(CT\s+scan(ner)?|computed\s+tomography)\b` · `\bambulance\w*\b`
  - Generic: `\b24\s*[x/×]\s*7\b|round[- ]the[- ]clock` (0.5) · `\bblood\s+bank\b` (0.5) · `(?<![NP])\bICU\b` (0.5)
- **incompatible:** dental, eye, diagnostic, nephrology-dialysis
- **fixtures:** ✓ "Trauma and critical care centre" · ✓ "Level I trauma center" · ✗ "Ocular trauma care" · ✗ "24/7 emergency care" (supporting) · ✓ "Polytrauma management; ocular trauma care" (separate clauses)

### 6.7 burn_care (**beta**; d0 100 · max 400 · α 1.2 · β 1 · not time-critical)
- **direct:**
  - `\bburns?\s+(units?|wards?|care|cent(re|er)s?|icu|management|treatment|surger(y|ies))\b`
  - `\b(units?|wards?|cent(re|er)s?|icu|care)\s+for\s+burns\b`
  - `\bburns?\s+injur(y|ies)\s+(care|treatment|management)\b`
- **exclusion (±40 characters):** `heart\s*burn|sun[- ]?burn|razor\s+burn|prevention|awareness|workshop|camp|training|seminar`
- **supporting:** `\bplastic\s+(and\s+reconstructive\s+)?surg\w*\b` · `\bskin\s+graft\w*\b` · specialty code `burnAndTraumaPlasticSurgery`
- **infrastructure:**
  - Qualifies for Strong: `\b(burns?\s+)?dressing\s+(room|unit)\b`
  - Generic: `\boperation\s+theat(re|er)\b` (0.5) · `(?<![NP])\bICU\b` (0.5) · `\bblood\s+bank\b` (0.5)
- **incompatible:** dental, eye, diagnostic, maternity, nephrology-dialysis
- **Beta behaviour:** excluded from KITCHEN_SINK counts. Until V18 passes, results are shown under the banner "Burn care matching is still being validated".
- **fixtures:** ✓ "Burn units with ICU" · ✓ "Ward for burns" · ✗ "Burn injury prevention camp" · ✗ "Heartburn treatment" · ✓ "Burns ward; heartburn clinic" (separate clauses; the exclusion is outside the window)
