# Evidence, Completeness & Ranking — Design

> Status: **draft v3** (2026-11-21). Assumes clean input: **every value is either valid or missing (NULL / empty). No wrong data.** v3 adds extraction and ranking ideas from Meet's plan v4 that fit this assumption (clause negation, exclusions, context words, service vs equipment terms, dedup, truncation, Strong rules, radius schedule, evaluation design). 2026-11-21: prerequisites split into **implied** (met by a direct claim) and **checked** (must be in text), for all services. The Raipur pilot showed only 1 of 15 facilities passing the old C-section gate, because records saying "performs caesareans" rarely also mention an OT. Thresholds and weights marked *(tune)* are provisional.
> Related: [FEATURES.md](FEATURES.md) (Depth `D`, feature computation, SQL) · [DATA_DICTIONARY.md](DATA_DICTIONARY.md)

## 1. What this answers

The data contains no wrong values, so we don't try to detect wrong records. The open questions are **"does this facility offer the service?"** and **"how much do we actually know about it?"**

| Question | Score | Scope | Used for |
|---|---|---|---|
| **Does this facility offer the requested service?** | **Service Evidence `E`** (0–100) + label | facility × service | gate + ranking |
| **How well-equipped is it for this service?** | **Capability Depth `D`** (0–100) | facility × service | ranking (see [FEATURES.md](FEATURES.md)) |
| **How reachable is it from the user?** | **Access `A`** (0–100) | facility × query | ranking |
| **How much information do we have about this facility?** | **Record Completeness `C`** (0–100) | facility | **confidence only, not ranking** |

Design principles:
1. **Every point is explainable.** Scores come from named rules, and every rule that fires produces a human-readable line.
2. **Every positive claim is citable.** Evidence comes only from the facility's own text (`procedure`, `equipment`, `capability`, `specialties`, `description`), quoted verbatim.
3. **Missing is not negative.** A missing field (or a list cut off at 50 items) is shown as "not reported" and lowers **confidence**. It never lowers the **rank**.
4. **Simple over clever.** Additive rules a judge can check by hand beat an opaque model.

> **Note on specialty tags:** a specialty tag on its own is weak evidence. Tags aren't wrong, but a tag says a department exists, not that a specific service is offered. Facilities average ~28 tags; 3,003 are tagged `cardiology`, but only 489 mention a cath lab.

**Services (9):** dialysis · emergency C-section · NICU · cardiac surgery · MRI · trauma · burn care (beta) · oncology · ENT. **Time-critical:** emergency C-section, NICU, trauma.

---

## 2. Record Completeness `C` (per facility)

`C` measures how much of the useful information is present. Points *(tune)*:

| Component | Points | Rule |
|---|---|---|
| **Location precision** | 25 | exact lat/lon 25 · PIN centroid only 15 · city/state only 5 · none 0 |
| **Contact** | 10 | `officialPhone` or `phone_numbers` present (needed for "call to confirm") |
| **Doctors** | 10 | `numberDoctors` present |
| **Beds** | 10 | `capacity` present, or a bed count stated in text |
| **Clinical text** | 30 | 10 each for non-empty `procedure`, `equipment`, `capability` |
| **Year established** | 5 | present |
| **Freshness** | 10 | `recency_of_page_update` within 2 years 10 · older 5 · missing 0 |
| **Total** | **100** | |

### 2.1 Bands

| C | Band | UI treatment |
|---|---|---|
| 70–100 | **Rich** | shown normally |
| 40–69 | **Partial** | missing fields listed under "Not reported" |
| 0–39 | **Sparse** | "Limited information. Call to confirm before travelling." |

`C` does **not** multiply the rank score. A small rural clinic with a thin web presence can be the right answer, and penalising it for missing data would push people toward well-documented city hospitals. Instead, `C` lowers the **confidence** label (§4.7).

### 2.2 Worked example

A hospital with exact coordinates, a phone number, no doctor count, a stated capacity, non-empty `procedure` and `capability` but empty `equipment`, no founding year, and a page updated in 2025:

| Component | Points |
|---|---|
| Location (exact) | 25 |
| Contact | 10 |
| Doctors (missing) | 0 |
| Beds | 10 |
| Clinical text (2 of 3) | 20 |
| Year (missing) | 0 |
| Freshness (≤ 2 years) | 10 |
| **C** | **75 → Rich** |

---

## 3. Service Evidence `E` (per facility × service)

### 3.1 Service definitions *(regexes tuned on the live data; tune further from E1 in §7)*

Each service has four term lists. **Direct** terms name the service. **Equipment** terms name a service-specific resource. **Specialty codes** are matched exactly, never by regex. **Exclusions** cancel a direct match in the same clause.

| Service | Direct terms | Service-specific equipment | Specialty codes (exact) | Exclusion (same clause) | Strong also needs |
|---|---|---|---|---|---|
| **Dialysis** | `dialys`, `crrt` (after equipment phrases are removed, §3.2 step 4) | dialysis machines/units/stations/chairs/beds, haemodialysis machine, RO (water) plant, nephrologist | `nephrology`, `pediatricNephrology` | — | equipment **or** name type nephrology_dialysis |
| **Emergency C-section** | `caesarean`, `cesarean`, `c-section`, `\blscs\b` | operating theatre, labour room, anaesthesia, NICU | `gynecologyAndObstetrics`, `obstetricsAndMaternityCare`, `maternalFetalMedicineOrPerinatology` | — | **emergency readiness in the same item** (`24x7`, `24/7`, `emergency`, `round the clock`). Otherwise label "C-section (emergency readiness not confirmed)", at most Moderate |
| **NICU** | `\bnicu\b`, `neonatal intensive` (SNCU / Level II count as **supporting**, not direct) | ventilator, CPAP, warmer, incubator, phototherapy, **only with a neonatal context word in the same item** | `neonatologyPerinatalMedicine`, `pediatricCriticalCareMedicine` | — | neonatal equipment |
| **Cardiac surgery** | `cabg`, `coronary (artery )?bypass`, `open[- ]heart`, `valve (replacement\|repair)`, `cardiac surg`, `cardiothoracic surg` | cath lab, CTICU/CICU, heart-lung machine | `cardiacSurgery`, `cardiothoracicSurgery` | `gastric`, `bariatric`, `obesity`, `weight loss`, `roux` (73 of 327 "bypass" facilities) | equipment, and beds not known to be < 30 |
| **MRI** | `\bmri\b`, `magnetic resonance` | (none: MRI is the equipment) | `radiology`, `diagnosticRadiology` (supporting) | — | MRI term in `equipment`, or in the same item as `tesla` / `scanner` |
| **Trauma** | `trauma (care\|centre\|center\|unit\|ward\|surgery)`, `polytrauma`, `accident (and\|&) emergency` | CT scan, ambulance | `emergencyMedicine` (supporting; "24/7 emergency" alone is supporting only) | `eye`, `ocular`, `orbit`, `dental`, `tooth`, `teeth`, `maxillofacial`, `facial` (222 facilities) | CT or ambulance |
| **Burn care** *(beta)* | `burns? (unit\|ward\|centre\|center\|icu\|care)`, `burn injur` | burn ICU, burns dressing room | `burnAndTraumaPlasticSurgery` | — | burn-specific equipment |
| **Oncology** | `chemotherap`, `radiotherap`, `oncolog`, `cancer (surgery\|treatment\|care)` | LINAC, PET-CT, brachytherapy | `medicalOncology`, `surgicalOncology`, `radiationOncology` | — | LINAC/PET **or** name type oncology |
| **ENT** | `\bent\b`, `otolaryngolog`, `tonsillectomy`, `cochlear implant`, `sinus surgery` | audiometry, BERA, ENT endoscope | `otolaryngology`, `headAndNeckSurgeryOtolaryngology` | — | audiometry/endoscope |

**Prerequisites** (feed the 0–20 prerequisite points in §3.3) come in two kinds:
- **Implied:** the service physically can't be delivered without it, on site. A positive direct claim counts as meeting it, and it's never shown as missing. (A record that says "performs caesareans" has an operating theatre and anaesthesia, whether or not it says so.)
- **Checked:** it matters, but a facility could reasonably lack it or get it from elsewhere. It must appear in the text, adds points when found, and is shown under "Not reported" when not.

| Service | Implied by a direct claim | Checked in text |
|---|---|---|
| Dialysis | — | nephrology specialty code **or** nephrologist |
| Emergency C-section | operating theatre, anaesthesia | blood bank / blood storage |
| NICU | — | neonatology / paediatrics specialty code |
| Cardiac surgery | operating theatre, anaesthesia, ICU/CCU | blood bank |
| MRI | — | radiology specialty code |
| Trauma | 24×7 emergency | operating theatre |
| Burn care *(beta)* | — | operating theatre, ICU |
| Oncology | — | oncology specialty code |
| ENT | — | ENT specialty code |

`prereq points = 20 × (implied + checked met) / (implied + checked defined)`. With no direct claim, implied prerequisites aren't met automatically: they must be found in text like checked ones. If the record's lists are cut off at 50 items (FEATURES M7), an unfound prerequisite counts **half** and is shown as "not reported (list cut off)".

**Generic infrastructure** (ICU, blood bank, 24×7, ambulance alone) adds to **D**, but **never** qualifies a result for Strong.

The direct, routing and exclusion patterns as a table (used by extraction and by the E1 sample in §7.4):

```sql
CREATE OR REPLACE TABLE workspace.hackathon.ref_service_direct AS
SELECT * FROM VALUES
 -- service,            direct_rx,                                                                                     equip_rx (removed before direct test),                                                                                excl_rx
 ('dialysis',           'dialys|\\bcrrt\\b',                                                                           'dialysis (machines?|units?|stations?|chairs?|beds?)|ha?emodialysis machines?|ro (water )?plant',                    NULL),
 ('emergency_csection', 'caesarean|cesarean|c-section|\\blscs\\b',                                                     NULL,                                                                                                                 NULL),
 ('nicu',               '\\bnicu\\b|neonatal intensive',                                                               NULL,                                                                                                                 NULL),
 ('cardiac_surgery',    '\\bcabg\\b|coronary (artery )?bypass|open[- ]heart|valve (replacement|repair)|cardiac surg|cardiothoracic surg', NULL,                                                                              'gastric|bariatric|obesity|weight loss|roux'),
 ('mri',                '\\bmri\\b|magnetic resonance',                                                                NULL,                                                                                                                 NULL),
 ('trauma',             'trauma (care|centre|center|unit|ward|surgery)|polytrauma|accident (and|&) emergency',         NULL,                                                                                                                 'eye|ocular|orbit|dental|tooth|teeth|maxillofacial|facial'),
 ('burn_care',          'burns? (unit|ward|centre|center|icu|care)|burn injur',                                        NULL,                                                                                                                 NULL),
 ('oncology',           'chemotherap|radiotherap|oncolog|cancer (surgery|treatment|care)',                             NULL,                                                                                                                 NULL),
 ('ent',                '\\bent\\b|otolaryngolog|tonsillectomy|cochlear implant|sinus surgery',                        NULL,                                                                                                                 NULL)
AS t(service, direct_rx, equip_rx, excl_rx);
```

Checked on the live data (facilities with a positive direct claim after negation, exclusion and routing): dialysis 967 · C-section 440 · NICU 700 · cardiac surgery 477 · MRI 943 · trauma 963 (65 eye/dental excluded) · burn care 80 · oncology 1,606 · ENT 1,622.

### 3.2 Extraction steps

Run once, offline, on `silver_claims` ([FEATURES.md §4.2](FEATURES.md)):

1. **Clauses.** Every item is split into clauses on `;`, `. ` and `, but / however / except`.
2. **Negation, per clause.** A match is negated if its clause matches: `not available/provided/offered…`, `no …`, `referred to/out`, `outsourced`, `under construction`, `will be installed/started`, `coming soon`, `upcoming`, `proposed`, `is planned / planned to`. ("In collaboration with" was tested and rejected: it describes real programmes.)
3. **Exclusion, per clause.** Drop a direct match if the service's exclusion pattern is in the same clause. Clauses are short (median 27–41 chars), so this is close to Meet's ±40-character window.
4. **Service vs equipment.** Remove service-specific equipment phrases from the clause **before** testing direct terms, so one phrase isn't counted twice. If a facility's **only** mention is an equipment phrase in `procedure` or `equipment` ("Dialysis unit with 12 machines"), that phrase still counts as a direct claim at ×0.8, but then it can't also earn the equipment corroboration point. Without this, 85 dialysis facilities would drop to the hidden Possible label (the false negative in Meet's open question Q2).
5. **Context.** NICU equipment counts only if the same item has a neonatal context word.
6. **Deduplicate.** Group claims by normalised item text (`norm_item`). Each group counts once, at its highest-weight field. (5,330 items repeat across fields, mostly description repeating a list.)
7. **Field weight.** `procedure` 1.0 · `equipment` 1.0 · `capability` 0.9 · `description` 0.6.

Not adopted from Meet's plan: treating a direct term in `capability` as supporting-only (his open question Q3; it would drop ~594 dialysis facilities without evidence that they're wrong).

### 3.3 Scoring a cell (0–100)

Each kept direct claim gets `w = field weight × specificity`, where specificity is ×1.2 with a quantity or concrete detail ("20-bed unit, 10 machines", "3T MRI"), ×1.0 for a standard claim, and ×0.6 for a generic list mention ("Departments include … Nephrology …"). `w_best` = the highest.

| Component | Points | Rule |
|---|---|---|
| **Direct claim** | 0–40 | `40 × min(w_best, 1)` |
| **Corroboration** | 0–30 | +10 each, max 3: specialty code present · service-specific equipment present · a second **distinct** (deduplicated) direct claim |
| **Prerequisites** | 0–20 | `20 × (prerequisites met / prerequisites defined)`, implied + checked (§3.1) |
| **Specificity bonus** | 0–10 | +10 if any kept claim has a quantity |
| **Total E** | **0–100** | |

A specialty code or equipment alone (no direct claim) scores at most 50 and is labelled **Possible**, never Strong.

### 3.4 Labels (first match wins)

| # | Condition | Label | Shown |
|---|---|---|---|
| 1 | Direct claims exist and **all** are negated | **Not offered** | Never ranked; used to answer "why not X?" |
| 2 | No direct claim (step 4's equipment-only rule included), only specialty codes / supporting terms / generic equipment | **Possible** | Hidden. Fallback only, **never for time-critical services** |
| 3 | Positive and negated direct claims both present | **Weak** ("record has conflicting statements", both quoted) | Yes |
| 4 | E ≥ 70 **and** a direct claim in `procedure` or `equipment` **and** the service's "Strong also needs" rule (§3.1) | **Strong** | Yes |
| 5 | E ≥ 45 (or E ≥ 70 but row 4's rule failed; the missing rule is shown as a caveat) | **Moderate** | Yes |
| 6 | Any other positive direct claim | **Weak** | Yes, with caveat |

---

## 4. Service-specific ranking

A woman in labour needs the **nearest** place that can safely do a C-section. A patient needing bypass surgery can travel, and should go where the **capability is deepest**.

### 4.1 Formula

```
road_km    = 1.4 × haversine_km(user, facility)
A          = 100 × 0.5^(road_km / d_half)
rank_score = wE·E + wD·D + wA·A                    where wE + wD + wA = 1
```

- **E**: §3. **D**: [FEATURES.md](FEATURES.md). **A**: computed at query time.
- No trust multiplier: with clean data there's nothing to discount. Completeness affects **confidence** (§4.7), not rank.
- For an approximate (PIN-centroid) facility location, add the PIN's radius to `road_km`.

### 4.2 Service profiles *(tune)*

| Service | Time-critical | Gate (minimum label) | wE | wD | wA | d_half | Max radius | Why |
|---|---|---|---|---|---|---|---|---|
| **Emergency C-section** | **yes** | Moderate | .30 | .10 | **.60** | 15 km | 100 km | Minutes matter |
| **NICU** | **yes** | Moderate | .35 | .15 | **.50** | 25 km | 200 km | Fragile transfer; NICU level matters somewhat |
| **Trauma** | **yes** | Moderate | .30 | .15 | **.55** | 15 km | 100 km | Golden hour |
| **Dialysis** | no (recurring) | Moderate | .30 | .10 | **.60** | 15 km | 150 km | Travelled 2–3×/week for life |
| **Burn care** *(beta)* | no | Moderate | .35 | .25 | .40 | 40 km | 400 km | A real burn unit is worth extra travel |
| **MRI** | no | Weak + MRI term | .40 | .10 | .50 | 50 km | 300 km | Scanner exists or not |
| **Cardiac surgery** | no | Moderate | .35 | **.45** | .20 | 150 km | 500 km | Outcomes depend on team and equipment |
| **Oncology** | no | Moderate | .35 | **.45** | .20 | 150 km | 500 km | Radiotherapy/chemo capability matters most |
| **ENT** | no | Weak | .40 | .30 | .30 | 40 km | 150 km | Widely available |

### 4.3 Query steps

1. **Resolve the location.** PIN → PIN centroid · district → district centroid · city → median of that city's facilities. **If a city name exists in more than one state, ask the user.**
2. **Expand the radius step by step:** 25 → 50 → 100 → 250 km → the service maximum. Stop as soon as k results that pass the gate are found.
3. **Score and rank** with §4.1. Ties: label, then distance, then ID.
4. **Extra rows:**
   - "**Stronger documented evidence, X km away**", when no Strong facility is in the top k but one exists within the maximum radius.
   - "**Unconfirmed options**" (label Possible), only for **non-time-critical** services with fewer than k results.
5. **Fallback:** if nothing passes the gate within the maximum radius: "No facility with good evidence for **{service}** within **{radius}** km. Call before travelling." This feeds the planner's care-desert view.

### 4.4 Capability depth

Defined in [FEATURES.md](FEATURES.md) §3. The dataset has **no outcome data**, so the UI says **"capability"**, never "quality".

### 4.5 Explaining the order to the user

Each result list starts with one plain sentence about how that service is ranked:
- **C-section:** "For emergency delivery we show the **closest** facilities whose records say they perform caesareans."
- **Cardiac surgery:** "For heart surgery we prioritise **equipment and experience** over distance. It's often worth travelling."

Each result shows three bars (Evidence / Capability / Access) and a confidence word, so a user can see *why* #1 beat #2.

### 4.6 Later option: user-adjustable priorities

For the planner / NGO persona, a "closer ↔ more capable" slider shifts `wA` and `wD` around the default. ASHA-worker mode keeps the defaults.

### 4.7 Confidence

```
Low     if completeness band = Sparse
        OR depth feature coverage < 0.4                  (FEATURES.md §6)
        OR (location ≠ exact AND label ≠ Strong)
High    if label = Strong AND completeness band = Rich AND feature coverage ≥ 0.6
Medium  otherwise
```

---

## 5. What the user sees (per result)

```
Fortis Hospital, Gurugram                     ~17 km (road est.) · Dialysis: STRONG · Confidence: High
 Why:
  ✓ Virtue Foundation record, capability: "Dialysis treatment is provided via a 20-bed Dialysis Unit with 10 machines"
  ✓ Virtue Foundation record, specialties: nephrology
  ✓ Virtue Foundation record, capability: "…24-bed ICU…"
 Not reported:
  ? Number of nephrologists
  ? Year established
 References: fortishealthcare.com · 3 more
 Listed in dataset. Call to confirm: +91 …
```

Display rules:
- Every ✓ line is a **verbatim quote**, cited as "Virtue Foundation record, {field}: '…'".
- URLs are shown as **facility references**, not as the source of the quote (we can't tie a quote to a URL).
- Confidence and capability are shown as **words** (High / Medium / Low), **never as percentages**.
- Distance is "~X km", plus "± U km" for approximate locations.
- Every ? line is a missing field, a list cut off at 50 items, or an unmet **checked** prerequisite (implied ones are never shown as missing).

---

## 6. Output tables (gold layer)

**`workspace.hackathon.gold_facility_completeness`**

| Column | Type |
|---|---|
| `unique_id` | string |
| `completeness_score` | int |
| `completeness_band` | string (`rich` / `partial` / `sparse`) |
| `location_precision` | string (`exact` / `pin` / `city` / `none`) |
| `missing_fields` | array<string> |

**`workspace.hackathon.gold_service_evidence`**

| Column | Type |
|---|---|
| `unique_id`, `service` | string |
| `evidence_score` | int |
| `evidence_label` | string (`Strong` / `Moderate` / `Weak` / `Possible` / `Not offered`) |
| `caveats` | array<string> (e.g. "emergency readiness not confirmed", "conflicting statements") |
| `primary_quote` | struct<field, claim_text> |
| `supporting_claims` | array<struct<field, claim_text, weight>> (deduplicated) |
| `absence_claims` | array<struct<field, claim_text>> (negated clauses) |
| `prerequisites_met`, `prerequisites_missing` | array<string> |

Depth tables (`gold_facility_features`, `gold_service_depth`) and `find_care` are in [FEATURES.md](FEATURES.md) §4.

---

## 7. Evaluation

### 7.1 Ground rules

- **No ground truth exists.** Labels judge **what the record supports**, not real-world availability:
  **Clear claim** / **Ambiguous** / **Contradicted** / **Out of scope** (e.g. gastric bypass for cardiac) / **Can't tell**.
- **Blind labelling.** Labellers see the facility's text and the service, never the label, score or rank.
- **Agreement.** 20% of items are labelled by two people. If Cohen's κ < 0.6, tighten the rubric before continuing.
- **Hold-out.** Tune weights on 10 test queries; report ranking results on the other 10.
- Precision is reported with **Wilson 95% intervals**.

### 7.2 Experiments, ranked by value per labelling hour

| # | Question | Needs pipeline? | Sample | Metric | Decision rule |
|---|---|---|---|---|---|
| **E1** | Are direct matches correct? What do they miss? | **No** (raw `silver_claims`) | Precision: 25 direct-match clauses per service, stratified by field (9 × 25 = 225 short phrases). Recall probe: 10 facilities per service with the specialty code but **no** direct match, full record read | Precision per service; missed-claim rate | Precision < 80% → fix the regex or add an exclusion. Missed rate > 20% → add terms |
| **E2** | Is negation right? | **No** | 60 negated clauses (≈ 6 per phrase) + 40 un-negated clauses containing a service term and words like "refer", "plan", "not" | Precision and recall of negation | A phrase with precision < 70% → remove it |
| **E3** | Does the label mean something? (Strong > Moderate > Weak > Possible) | Yes | Pooled across services: 40 Strong, 30 Moderate, 30 Weak, 20 Possible = 120 cells. Per service, Strong only for the four core services (10 each, inside the 40) | % Clear claim per label; must fall monotonically | Strong < 85% pooled, or not monotone → tighten the Strong rule or the E thresholds |
| **E4** | Does the ranking beat simple baselines? | Yes | 10 hold-out queries (service × PIN; urban + rural; 4 time-critical). Top-3 from the method vs **B0** nearest facility with any keyword · **B1** most keyword mentions within radius · **B2** largest facility nearby | Blind pairwise preference of anonymised top-3 lists; rate of top-3 entries without a Clear claim | Method wins < 60% of non-tied comparisons vs B0 → revisit wE / wA |
| **E5** | Which parts earn their complexity? | Yes, no labels | Same 20 queries, run without D · without negation · without dedup · without truncation rule · without exclusions | Top-3 overlap (Jaccard) with the full method; E4 labels where they differ | A part that changes < 5% of top-3s → candidate to drop for simplicity |
| **E6** | Is the ranking stable? | Yes, no labels | ±20% on every weight, d_half and the field weights | % queries with an unchanged #1; mean top-3 Jaccard | #1 changes in > 30% of queries → weights are too knife-edge; simplify |
| **E7** | Is uncertainty shown honestly? | Yes, automatic | All query outputs | Every quote is a substring of the record (SQL assert) · time-critical queries never show Possible · caveats present for Conflicting / approximate location | Any failure is a bug, fixed before demo |
| **E8** | Where is care missing? Is "nothing found" honest? | Yes, automatic + 10 spot checks | All (district, service) pairs | # pairs with no gate-passing facility within max radius; spot-check that empties have no direct claims nearby | Feeds the planner's care-desert map |
| **E9** | Does list truncation hide evidence? | **No** | Facilities at the 50-item cap vs below it | Share of `truncated` statuses; label distribution | If truncated facilities rarely reach Strong, raise their visibility via the "Not reported" line |

**Not adopted from Meet's sample plan:** a fixed 20 labels per service stratified 8/6/6. At 6–8 items per (service, label) cell, a precision estimate has a ±30-point interval, too wide to decide anything. We pool labels for the monotonicity test (E3) and spend per-service labels only where a per-service decision is made (E1 regex fixes, Strong for core services).

### 7.3 Budget and run order (one weekend)

| When | What | Person-hours |
|---|---|---|
| Saturday, as soon as `silver_claims` exists | E1 (≈ 2 h), E2 (≈ 0.7 h), E9 (automatic) | 2.7 |
| Sunday morning, pipeline built | E3 (≈ 2 h, records are longer), E5–E8 (automatic, ≈ 0.5 h to review) | 2.5 |
| Sunday midday | E4 (≈ 1.5 h) | 1.5 |
| Throughout | double labelling for κ (20%) | ≈ 1.3 |
| **Total** | | **≈ 8 person-hours**, ~2 h each for 4 people |

### 7.4 Sampling SQL (E1 example)

```sql
-- 25 direct-match clauses per service, spread across fields, reproducible
WITH m AS (
  SELECT s.service, c.unique_id, c.field, c.text,
         row_number() OVER (PARTITION BY s.service, c.field ORDER BY rand(42)) AS rn
  FROM workspace.hackathon.silver_claims c
  JOIN workspace.hackathon.ref_service_direct s ON c.lc rlike s.direct_rx
  WHERE NOT c.is_negated)
SELECT service, unique_id, field, text
FROM m
WHERE rn <= 7          -- ~7 per field × 4 fields ≈ 25 per service
ORDER BY service, rand(7);
-- Export without the service's label/score columns (blinding).
```

### 7.5 Threats to validity

- **Circularity:** labels judge the record text the method reads, so we measure extraction fidelity, not real-world availability. Say so in the pitch.
- **Regex-defined sampling frames:** E1 precision is sampled from regex hits, so it can't see misses. That's why it has a recall probe.
- **Labeller bias:** famous hospital names invite assumptions. Labellers judge only the text shown.
- **Small samples:** report intervals, not point estimates, and don't over-read differences between services.
- **Tuning on the test set:** weights are tuned only on the 10 tuning queries.

---

## 8. Open questions

- Should a direct term in the `capability` list count fully (current) or as supporting only (Meet's v4)? Settle it with E1 data on capability-field precision.
- Can claims be linked to a specific `source_url`? If not, URLs stay as facility references (§5).
- Does NFHS need data feed into ranking, or only the planner view? (Current plan: planner view only.)
- The ×1.4 road factor may be too low for hilly and north-east states.
- Burn care rests mostly on one specialty code (131 facilities). Keep it marked beta until E1/E3 cover it.
