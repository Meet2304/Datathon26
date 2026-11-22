# Data Dictionary — CMU Datathon Fall 2026 ("Find the Right Care", India)

All tables: Databricks Unity Catalog, catalog `workspace`, schema `hackathon`, Delta, bronze layer.
Raw DESCRIBE output + sample rows (verbatim): [raw_schema_and_samples.txt](raw_schema_and_samples.txt)

> **Pipeline input:** the silver tables above. The bronze notes below describe the raw source.
>
> **Data assumption (team decision, 2026-11-21):** the input is treated as **clean**. Every value is either **valid** or **missing** (NULL, `''`, empty array). No wrong values, merged records or misplaced locations. All scoring is designed for missing data only. See [FEATURES.md §2](FEATURES.md) (incl. M8: two silver flags treated as missing) and [SCORING.md §1](SCORING.md).

| Table | Rows | Grain | Role |
|---|---|---|---|
| `workspace.hackathon.bronze_facilities` | 10,088 (~16 MB) | one row per facility | **Supply**: what care exists, where |
| `workspace.hackathon.bronze_nfhs5_indicators` | 706 | one row per district | **Need**: population health stats (NFHS-5 survey) |
| `workspace.hackathon.bronze_pincode_directory` | 165,627 | one row per post office | **Geography**: PIN → district/state/lat-lon |
| `workspace.hackathon.silver_facilities` | 10,077 | one row per facility (bronze de-duplicated) | **Pipeline input.** `clean_*` values + `flag_*` data-quality flags (team-built) |
| `workspace.hackathon.silver_pincode_directory` | 19,638 (19,586 PINs) | one row per (PIN, state); use `is_primary_state` | **Pipeline PIN lookup:** averaged lat/lon, district(s) |
| `workspace.hackathon.ref_specialty_mapping` | 2,934 | raw specialty → standard codes | Explains silver's specialty vocabulary (~103 codes, e.g. `obstetrics`, `cardiothoracicSurgery`, `neonatology`, `burnCare`) |

Field coverage (from challenge brief, facilities): description 100%, capability 99.7%, procedure 92.5%, equipment 77%, yearEstablished 47.8%, numberDoctors 36.4%, capacity 25.2%.

---

## 1. `bronze_facilities`

All columns are `STRING` except `latitude`, `longitude` (`DOUBLE`) and `ingested_at` (`TIMESTAMP`).

### Columns

| Group | Column | Notes from sample |
|---|---|---|
| **IDs** | `unique_id` | UUID, primary key |
| | `source_types` | JSON array: `dynamic`, `overture`, `constant`, `mongo_facility` (repeated, capped at 50) |
| | `source_ids` | JSON array of hex ids of the source records |
| | `source_content_id`, `content_table_id` | UUID; equal to each other in samples |
| | `cluster_id` | UUID — entity-resolution cluster |
| **Identity** | `name` | facility name |
| | `organization_type` | e.g. `facility` |
| | `facilityTypeId` | e.g. `hospital` |
| | `operatorTypeId` | e.g. `private`, `public` |
| | `affiliationTypeIds` | JSON array: `government`, `academic`, `community`, `philanthropy-legacy`… |
| | `yearEstablished` | string year, e.g. `1991`, `2001` |
| | `acceptsVolunteers` | `true` / `false` / `null` (string) |
| **Contact** | `phone_numbers` | JSON array of E.164 (`+91…`), capped at 50, many duplicates |
| | `officialPhone` | single number |
| | `email` | email address, or missing |
| | `websites` | JSON array; mixes bare domains and full URLs (directories, social pages, the facility's own site) |
| | `officialWebsite` | bare domain, e.g. `aravind.org`, `fortishealthcare.com` |
| | `facebookLink` | Facebook page URL, or missing |
| **Address** | `address_line1/2/3` | free text |
| | `address_city` | e.g. `Gurgaon` (vs `Gurugram` elsewhere — spelling variants) |
| | `address_stateOrRegion` | e.g. `Telangana`, `Haryana` |
| | `address_zipOrPostcode` | 6-digit PIN as string |
| | `address_country`, `address_countryCode`, `countries` | `India`, `IN`, `null` |
| **Geo** | `latitude`, `longitude` | DOUBLE |
| | `coordinates` | GeoJSON string `{"coordinates":[lon,lat],"type":"Point"}` — **lon first** |
| **Size** | `area` | numeric string (e.g. `20000`, `1000`) — unit unclear |
| | `numberDoctors` | numeric string (e.g. `1`, `200`); filled for 36%, median 2 |
| | `capacity` | beds, numeric string |
| **Clinical text (core evidence)** | `description` | one paragraph |
| | `specialties` | JSON array, camelCase taxonomy: `nephrology`, `gynecologyAndObstetrics`, `neonatologyPerinatalMedicine`, `burnAndTraumaPlasticSurgery`, `criticalCareMedicine`, `radiology`… lots of repeated `internalMedicine` |
| | `procedure` | JSON array of free-text sentences |
| | `equipment` | JSON array of free-text sentences; includes `""` and negations ("No equipment details provided…") |
| | `capability` | JSON array of free-text sentences (beds, ICU/NICU, departments, affiliations) |
| **Web-presence signals** | `recency_of_page_update` | date string; used for freshness in Completeness `C` |
| | `distinct_social_media_presence_count` | int string |
| | `affiliated_staff_presence`, `custom_logo_presence` | `true`/`false` strings |
| | `number_of_facts_about_the_organization` | int string |
| | `post_metrics_most_recent_social_media_post_date`, `post_metrics_post_count` | |
| | `engagement_metrics_n_followers/n_likes/n_engagements` | int strings |
| **Lineage** | `source` | e.g. `kie` |
| | `source_urls` | JSON array, capped at 50 — the citation sources for the text fields |
| | `ingested_at` | TIMESTAMP |

### Format notes (still apply under the clean-data assumption)

- List fields (`specialties`, `procedure`, `equipment`, `capability`, `phone_numbers`, `websites`, `source_urls`, `source_ids`, `affiliationTypeIds`) are **JSON-array strings** → `from_json(col, 'array<string>')`. Arrays are capped at 50 items.
- Empty list items (`""`) and empty strings mean **missing** and are normalised to NULL.
- Negation lines ("No explicit procedures listed…", "Ultrasound centre not available") are **valid statements of absence**, not errors. They never count as positive evidence.
- `specialties` use a camelCase taxonomy (`nephrology`, `gynecologyAndObstetrics`, `neonatologyPerinatalMedicine`…). Facilities average ~28 tags, so a tag means "department exists", not "this service is offered".
- `coordinates` is GeoJSON with **lon first**. Prefer the `latitude` / `longitude` columns.
- `address_zipOrPostcode` is a string; cast to BIGINT to join the PIN directory.

---

## 2. `bronze_nfhs5_indicators`

One row per district: `district_name`, `state_ut` + ~110 indicators + `ingested_at`. Source: National Family Health Survey 5 (2019–21).

### Value notation (why many cols are STRING)

| Raw value | Meaning | Cleaning |
|---|---|---|
| `78.0`, `927 ` | normal (note **trailing spaces**) | trim, cast |
| `(29.5)` | based on 25–49 unweighted cases → **low reliability** | value = 29.5, flag `low_n` |
| `*` | suppressed (< 25 cases) | value = NULL, flag `suppressed` |

District names also have trailing spaces (`South Andaman `). State uses `&` (`Andaman & Nicobar Islands`).

### Columns (grouped)

- **Survey size**: `households_surveyed`, `women_15_49_interviewed`, `men_15_54_interviewed` (double)
- **Demographics / household**: `female_population_age_6_years_and_above_ever_schooled_pct`, `population_below_age_15_years_pct`, `sex_ratio_total_f_per_1000_m`, `sex_ratio_at_birth_5y_f_per_1000_m`*, `child_u5_whose_birth_was_civil_reg_pct`, `deaths_in_the_last_3_years_civil_reg_pct`*, `hh_electricity_pct`, `hh_improved_water_pct`, `hh_use_improved_sanitation_pct`, `households_using_clean_fuel_for_cooking_pct`, `households_using_iodized_salt_pct`, **`hh_member_covered_health_insurance_pct`**
- **Women / education / marriage**: `child_5y_who_attended_pre_primary_school_during_the_school_pct`*, `women_age_15_49_who_are_literate_pct`, `women_age_15_49_with_10_or_more_years_of_schooling_pct`, `w20_24_married_before_age_18_years_pct`*, `births_in_the_5_years_preceding_the_survey_that_are_birth_3_pct`*, `w15_19_who_were_already_mothers_or_pregnant_at_the_time_of_pct`*, `w15_24_who_use_menstrual_hygiene_pct`
- **Family planning**: `fp_cm_w15_49_{any_method,modern_method,f_steril,m_steril,iud,pill,condom,injectables}_pct`, `fp_unmet_total_cm_w15_49_7_pct`, `fp_unmet_spacing_cm_w15_49_7_pct`, `health_worker_ever_talked_to_female_non_users_about_family_pct`, `current_users_ever_told_about_side_effects_of_current_metho_pct`*
- **Maternal care (ANC/PNC)**: `mothers_who_had_an_anc_visit_in_the_first_trimester_lb5y_pct`*, `mothers_who_had_at_least_4_anc_visits_lb5y_pct`*, `mothers_whose_last_birth_was_protected_against_neo_tetanus_pct`*, `mothers_who_consumed_ifa_for_100/180_days…_pct`*, `registered_pregnancies_for_which_the_mother_received_a_mcp_pct`*, `mothers_who_received_pnc_from_a_doctor_nurse_lhv_anm_midwif_pct`*, **`average_out_of_pocket_expenditure_per_delivery_in_a_public_fac`*** (₹), `children_born_at_home_who_were_taken_to_a_health_facility_f_pct`*, `children_who_received_pnc_from_a_doctor_nurse_lhv_anm_midwi_pct`*
- **Delivery** (key for C-section/NICU): **`institutional_birth_5y_pct`**, `institutional_birth_in_public_facility_5y_pct`, `home_birth_that_were_conducted_by_skilled_hp_5y_10_pct`, `births_attended_by_skilled_hp_5y_10_pct`, **`births_delivered_by_csection_5y_pct`**, `births_in_a_private_fac_that_were_delivered_by_csection_5y_pct`*, `births_in_a_public_fac_that_were_delivered_by_csection_5y_pct`*
- **Child vaccination** (all *): `child_12_23m_fully_vaccinated_…`, BCG, polio, penta/DPT, MCV 1/2, rotavirus, hep-B, vit-A, public/private vaccination site
- **Child illness**: `prev_diarrhoea_2wk_child_u5_pct`, ORS*/zinc*/taken-to-facility*, `children_prev_symptoms_of_acute_respiratory_infection_ari_2_pct`, `children_with_fever_or_symptoms_of_ari_2wk_taken_to_a_healt_pct`*
- **Child nutrition** (all *): breastfeeding, adequate diet, **stunted / wasted / severe wasted / underweight / overweight**
- **Adult nutrition / anaemia**: women BMI underweight/overweight/high-WHR, `child_6_59m_who_are_anaemic_…`*, `non_pregnant_w15_49_who_are_anaemic_…`, **`pregnant_w15_49_who_are_anaemic_lt_11_0_g_dl_22_pct`***, `all_w15_49_who_are_anaemic_pct`, `all_w15_19_who_are_anaemic_pct`*
- **Blood sugar** (dialysis/CKD proxy): `women_age_15_years_and_above_with_high_141_160_mg_dl_blood_pct`, `w15_plus_with_very_high_gt_160…`, `w15_plus_with_high_or_very_high_gt_140…`, men equivalents `m15_plus_…` / `men_age_15_years_and_above_with_very_high_gt_160…`
- **Blood pressure** (dialysis/cardiac proxy): `w15_plus_with_{mildly_high,moderately_or_severely_high,high}_bp_…_pct`, men equivalents `m15_plus_…`
- **Cancer screening**: cervical, breast, oral (women 30–49)
- **Tobacco/alcohol**: `w15_plus/m15_plus_who_use_any_kind_of_tobacco_pct`, `…_consume_alcohol_pct`

`*` = typed STRING in bronze (contains `(x)` / `*` / trailing spaces).

Sample districts: Nicobars, North & Middle Andaman, South Andaman (all Andaman & Nicobar Islands).

---

## 3. `bronze_pincode_directory`

| Column | Type | Notes |
|---|---|---|
| `circlename` | string | e.g. `Telangana Circle` (postal circle ≈ state) |
| `regionname` | string | e.g. `Hyderabad Region` |
| `divisionname` | string | e.g. `Adilabad Division` |
| `officename` | string | e.g. `Kothimir B.O` |
| `pincode` | **bigint** | 6-digit (facilities store it as string → cast to join) |
| `officetype` | string | `BO` (branch), `SO` (sub), `HO` (head) |
| `delivery` | string | `Delivery` / `Non-Delivery` |
| `district` | string | **UPPERCASE**, e.g. `KUMURAM BHEEM ASIFABAD` |
| `statename` | string | **UPPERCASE**, e.g. `TELANGANA` |
| `latitude`, `longitude` | **string** | contain literal `NA` → `try_cast(... AS DOUBLE)` |
| `ingested_at` | timestamp | |

Multiple post offices share a PIN (e.g. 504299 ×2, one with NA coords) → aggregate to one row per PIN (median lat/lon, mode district/state).
