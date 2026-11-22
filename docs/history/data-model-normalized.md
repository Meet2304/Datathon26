# Facility × Service Data Model (Normalised)

Draft data model for the CMU Datathon Fall 2026 (Databricks) challenge. This file is meant to be handed to another thread for review and analysis.

The [service evidence implementation plan](service-evidence-implementation-plan.md) defines the scoring rules, recommendation tiers and serving schema.

## Context

**Challenge:** given a **service** (e.g. dialysis, emergency C-section, NICU, cardiac surgery, MRI, burn care) and a **location** in India (city, district, PIN code or coordinates), return the best facility option(s). Every recommendation must:
- cite the underlying facility text it relies on,
- state its uncertainty instead of presenting weak evidence as fact,
- run on Databricks Free Edition,
- support a clear workflow for non-technical users.

**Source data** (catalog `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset`; bronze copies in `workspace.hackathon.bronze_*`):

| Table | Rows | Role |
|---|---|---|
| `facilities` | 10,088 (10,000 clean; 88 have shifted columns) | What each facility claims. 51 columns, almost all `STRING`. List fields (`specialties`, `procedure`, `equipment`, `capability`, `source_urls`) are JSON arrays stored as text. |
| `india_post_pincode_directory` | 165,627 (19,586 unique PINs) | Geocoder: PIN → coordinates, district, state. About 8.5 post offices per PIN; about 7% of rows have `"NA"` coordinates. |
| `nfhs_5_district_health_indicators` | 706 districts | District-level need and context. Not evidence about any facility. |

**Known data problems:** records that merge two facilities, contradictory locations (828 facilities sit more than 200 km from their own PIN), dirty state names (255 distinct values), implausible numbers (up to 200,000 beds), and service claims with little support.

---

## 1. The core idea: a facility × service grid with three separate questions

Picture a grid: **rows = facilities**, **columns = services**, and each **cell** = one facility-service pair.

Don't compress everything into a single number per cell. Keep three questions apart:

| Name | Question | Lives at | Example inputs |
|---|---|---|---|
| `R(f)`: record reliability | How trustworthy is the facility record? | **Row** (one value per facility) | Source quality, record consistency, metadata completeness, recency |
| `conf_adj(f,s)`: service confidence | How clearly does the record say it offers this service? | **Cell** | Eligible direct claims, claim provenance, record reliability, and service plausibility |
| `capability(f,s)` | How well equipped is the facility on paper? | **Cell** | Facility size and documented service infrastructure |

The source list named `capability` can supply infrastructure or a supporting service hint. Positive mentions from that list receive zero direct confidence weight. A 20-bed nephrology clinic can have high service confidence from a clear procedure claim.

### Worked example

```
                         ┌──────────── SERVICES ───────────────┐
  FACILITY          R(f) │  DIALYSIS            MRI            │
  Sharma Kidney     0.9  │  conf 0.85 cap 0.40  conf 0.00      │
  Clinic (20 beds)       │                                     │
  City General      0.9  │  conf 0.30 cap 0.90  conf 0.90 cap 0.85
  Hospital (500 bd)      │                                     │
  "Aravind Eye"     0.3  │  conf 0.17 cap 0.70  conf 0.17 cap 0.60
  (merged record)        │                                     │
                         └─────────────────────────────────────┘
```

In this example, `conf` represents the raw claim score after any service plausibility penalty. For dialysis, adjust it once for R using the illustrative detection rate 0.106. Multiply the adjusted confidence by `0.5 + 0.5 × capability` before applying distance and location factors:

| Facility | R | conf | cap | Dialysis score |
|---|---|---|---|---|
| Sharma Kidney Clinic | 0.9 | 0.85 | 0.40 | **0.54** |
| City General | 0.9 | 0.30 | 0.90 | 0.27 |
| "Aravind Eye" (merged, incompatible type) | 0.3 | 0.17 | 0.70 | 0.11 |

- The small clinic that really offers dialysis ranks first.
- The big hospital is held back by weak evidence for this specific service.
- The merged record is held back by its low row-level reliability.

---

## 2. Normalised storage: long format, not wide

**Don't store it wide.** One column per service × metric (`dialysis_conf`, `mri_cap`, …) means adding columns for every new service, leaves the table mostly empty, and makes queries awkward.

**Store it long.** One row per facility-service pair, and only where evidence exists:

```
facility_service
facility_id | service_id | confidence | capability | tier
F001        | dialysis   | 0.78       | 0.40       | Strong
F002        | dialysis   | 0.28       | 0.90       | Weak
F002        | mri        | 0.90       | 0.85       | Strong
```

A missing row means **"no evidence found"**. It does **not** mean "doesn't offer it".

### Entity diagram

```
                    ┌──────────────────────┐
                    │ facility             │  1 row per facility
                    └──────────┬───────────┘
          ┌────────────────────┼─────────────────────┬──────────────────┐
          ▼                    ▼                     ▼                  ▼
  facility_source       facility_flag       facility_service        evidence
  (1 row per URL)       (1 row per issue)   (1 row per cell)        (1 row per quote)
                                                     │
                                                     ▼
                                                  service ──► service_term
                                          (1 row per service)  (1 row per keyword)
```

### Table definitions

#### `facility`: one row per facility
| Column | Type | Notes |
|---|---|---|
| `facility_id` | STRING (PK) | From source `unique_id` |
| `name` | STRING | Cleaned display name |
| `name_raw` | STRING | Original text, kept for citation |
| `facility_type` | STRING | Normalised (hospital, clinic, dental, diagnostic, …) |
| `beds` | INT | NULL if missing or implausible |
| `doctors` | INT | NULL if missing or implausible |
| `year_established` | INT | NULL if outside a plausible range |
| `resolved_lat`, `resolved_lon` | DOUBLE | Best location after voting (coordinates vs PIN vs state vs city) |
| `location_source` | STRING | `coords` / `pin_centroid` / `city_centroid` |
| `location_confidence` | STRING | High / Medium / Low |
| `location_uncertainty_km` | DOUBLE | Radius of doubt around the resolved point |
| `state`, `district`, `pincode` | STRING | Taken from the PIN directory, not from the facility's own text |
| `R` | DOUBLE (0–1) | Record reliability |
| `R_tier` | STRING | High / Medium / Low |
| `last_updated` | DATE | From `recency_of_page_update`; NULL if in the future |

#### `facility_source`: one row per source URL
| Column | Type | Notes |
|---|---|---|
| `facility_id` | STRING (FK) | |
| `url` | STRING | |
| `domain` | STRING | e.g. `justdial.com` |
| `source_tier` | INT | e.g. 1 = gov, 2 = own site, 3 = Practo / health portal, 4 = JustDial / aggregator |

Caveat: source URLs belong to the whole record, not to individual claims. They count as evidence the **facility** exists, not proof that a specific service is offered.

#### `facility_flag`: one row per detected problem
| Column | Type | Notes |
|---|---|---|
| `facility_id` | STRING (FK) | |
| `flag_code` | STRING | e.g. `PIN_COORD_MISMATCH`, `STATE_MISMATCH`, `POSSIBLE_MERGE`, `KITCHEN_SINK`, `IMPLAUSIBLE_BEDS`, `NAME_COLLISION` |
| `severity` | STRING | info / warn / severe |
| `detail` | STRING | Plain-English text, e.g. "coordinates 340 km from stated PIN 110002" |

#### `service`: one row per supported service (configuration)
| Column | Type | Notes |
|---|---|---|
| `service_id` | STRING (PK) | e.g. `dialysis` |
| `display_name` | STRING | |
| `synonyms` | ARRAY<STRING> | User-facing names ("kidney dialysis", "haemodialysis") |
| `time_critical` | BOOLEAN | |
| `d0_km` | DOUBLE | Distance decay constant (e.g. trauma 25, MRI 75, cardiac surgery 150) |
| `max_radius_km` | DOUBLE | Hard cutoff for search |
| `alpha`, `beta` | DOUBLE | Weight on evidence vs proximity in the final rank |
| `incompatible_types` | ARRAY<STRING> | Facility types that can't plausibly offer the service |

#### `service_term`: one row per matching keyword (configuration)
| Column | Type | Notes |
|---|---|---|
| `service_id` | STRING (FK) | |
| `term` | STRING | Regex with word boundaries (avoid `CT` matching "Doctor", `ICU` matching "NICU") |
| `term_type` | STRING | `direct` / `supporting` / `infrastructure` / `negation` |

#### `evidence`: one row per matched quote (the citations)
| Column | Type | Notes |
|---|---|---|
| `facility_id` | STRING (FK) | |
| `service_id` | STRING (FK) | |
| `field` | STRING | `procedure` / `equipment` / `capability` / `specialties` / `description` |
| `term_type` | STRING | Which kind of term matched |
| `matched_text` | STRING | Exact verbatim snippet from the facility record |
| `negated` | BOOLEAN | e.g. "referred to", "coming soon" |

#### `facility_service`: one row per cell (the conclusions)
| Column | Type | Notes |
|---|---|---|
| `facility_id` | STRING (FK) | |
| `service_id` | STRING (FK) | |
| `confidence` | DOUBLE (0–1) | Adjusted strength of the documented service claim |
| `capability` | DOUBLE (0–1) | How well equipped is it? |
| `tier` | STRING | Strong / Moderate / Weak |
| `reasons` | ARRAY<STRING> | Plain-English explanation strings |

`R` is **not** copied into this table. It lives only in `facility`.

### Design rules
1. **Store a fact where it belongs.** Row-level facts go in `facility`; cell-level facts go in `facility_service`. No duplication.
2. **One row per item, no lists in cells.** JSON-array columns are split into rows (`facility_source`, `evidence`).
3. **Keep evidence separate from scores.** `evidence` = what the text says; `facility_service` = what we concluded. You can re-score without re-extracting, and every score traces back to quotes.
4. **Keep configuration as data.** Keywords, weights and decay constants live in `service` / `service_term`. Adding a service means adding rows, not changing code.
5. **Never overwrite raw text.** Keep originals for citation. Add normalised columns alongside them.

---

## 3. Serving layer: flatten once for instant queries

Normalised tables are for **building**. For fast user lookups, flatten them once (rebuilt whenever scores change):

```
serving_facility_service
facility_id | service_id | name | resolved_lat | resolved_lon | location_confidence |
location_uncertainty_km | R | confidence | capability | tier |
top_citations ARRAY<STRUCT<field, matched_text>> | reasons ARRAY<STRING> | flags ARRAY<STRING>
```

Query-time flow (no joins):
1. Resolve the user's input to a point plus an input uncertainty radius, using a gazetteer of PINs, cities, districts and aliases.
2. Filter by `service_id` and a bounding box.
3. Compute haversine distance; approximate road distance ≈ × 1.4.
4. Gate: drop rows with no evidence; drop Low location confidence unless nothing else qualifies.
5. Rank by `final = (conf_adj × cap_factor)^α × proximity^β × loc_factor`, where `cap_factor = 0.5 + 0.5 × capability` and `proximity = exp(−rank_km / d0_km)`. The implementation plan specifies how location determines `rank_km` and `loc_factor`.
6. If fewer than k Moderate-or-better results, widen the radius: 25 → 50 → 100 → 250 km.

**Normalise to build, flatten to serve** (silver = normalised, gold / serving = flat).

---

## 4. Score normalisation (0–1 scaling)

All components are kept on a 0–1 scale so they can be multiplied:
- **Counts** (e.g. distinct source domains): cap and scale, e.g. `min(n, 5) / 5`.
- **Beds / doctors:** use the size buckets in the plan, with doctors as a fallback when beds are missing. Implausible values are set to unknown.
- **Field-based confidence:** each eligible claim fills a fraction of the remaining gap to 1. Exact copies count once. Starting weights are procedure and equipment 0.85, qualifying specialty codes 0.45, and description 0.30.
- **Missing values** stay NULL (unknown) and are not treated as 0.

All weights and thresholds are **starting points** to be calibrated against a hand-labelled sample of 80–150 facility-service pairs.

---

## 5. Open questions for analysis
1. How well do the merge flags distinguish merged records from legitimate multi-specialty hospitals?
2. Is a long `facility_service` table storing only cells with evidence enough, or do we need explicit "no evidence" rows to report coverage?
3. Does the serving table need to be pre-joined to districts / NFHS for a planner-facing "coverage gap" view?
