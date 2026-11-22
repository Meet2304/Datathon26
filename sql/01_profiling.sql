-- =====================================================================
-- 01_profiling.sql — measure data-quality problems before building fixes
-- Run in ONE Databricks notebook (SQL language), one cell per block,
-- top to bottom. Temp views/functions live for the notebook session.
-- Paste back the result of every block marked  >>> PASTE
-- =====================================================================


-- ---------- SETUP A: helper + parsed facilities view ----------
CREATE OR REPLACE TEMPORARY FUNCTION norm(x STRING) RETURNS STRING
RETURN regexp_replace(lower(replace(trim(x), '&', 'and')), '[^a-z]', '');

CREATE OR REPLACE TEMP VIEW f AS
SELECT
  unique_id, name, facilityTypeId, operatorTypeId,
  address_city, address_stateOrRegion,
  regexp_replace(address_zipOrPostcode, '[^0-9]', '')      AS pin_str,
  latitude, longitude, email, officialWebsite, recency_of_page_update,
  description, specialties, procedure, equipment, capability,
  try_cast(capacity      AS INT)                            AS capacity_n,
  try_cast(numberDoctors AS INT)                            AS doctors_n,
  try_cast(yearEstablished AS INT)                          AS year_n,
  from_json(specialties,   'array<string>')                 AS spec_arr,
  from_json(procedure,     'array<string>')                 AS proc_arr,
  from_json(equipment,     'array<string>')                 AS equip_arr,
  from_json(capability,    'array<string>')                 AS cap_arr,
  from_json(phone_numbers, 'array<string>')                 AS phone_arr,
  from_json(source_ids,    'array<string>')                 AS srcid_arr,
  from_json(source_urls,   'array<string>')                 AS url_arr
FROM workspace.hackathon.bronze_facilities;


-- ---------- SETUP B: one row per claim (the future evidence table) ----------
CREATE OR REPLACE TEMP VIEW claims AS
SELECT unique_id, name, 'procedure'  AS field, explode(proc_arr)  AS claim FROM f
UNION ALL
SELECT unique_id, name, 'equipment'  AS field, explode(equip_arr) AS claim FROM f
UNION ALL
SELECT unique_id, name, 'capability' AS field, explode(cap_arr)   AS claim FROM f;


-- ---------- SETUP C: one row per PIN ----------
CREATE OR REPLACE TEMP VIEW pin AS
SELECT
  lpad(cast(pincode AS STRING), 6, '0')                     AS pin_str,
  percentile_approx(try_cast(latitude  AS DOUBLE), 0.5)     AS lat,
  percentile_approx(try_cast(longitude AS DOUBLE), 0.5)     AS lon,
  mode(statename)                                           AS state,
  mode(district)                                            AS district,
  count(DISTINCT statename)                                 AS n_states
FROM workspace.hackathon.bronze_pincode_directory
GROUP BY 1;


-- ---------- SETUP D: facility location vs PIN ----------
CREATE OR REPLACE TEMP VIEW loc AS
SELECT
  f.unique_id, f.name, f.address_city, f.address_stateOrRegion, f.pin_str,
  p.state AS pin_state, p.district AS pin_district,
  f.latitude, f.longitude, p.lat AS pin_lat, p.lon AS pin_lon,
  2 * 6371 * asin(sqrt(
      pow(sin(radians(p.lat - f.latitude) / 2), 2)
    + cos(radians(f.latitude)) * cos(radians(p.lat))
    * pow(sin(radians(p.lon - f.longitude) / 2), 2)))     AS km_to_pin
FROM f LEFT JOIN pin p ON f.pin_str = p.pin_str;


-- =====================================================================
-- Q1  >>> PASTE   Parsing + coverage + the 50-item cap
-- =====================================================================
SELECT
  count(*)                                                              AS n,
  count_if(spec_arr  IS NULL AND specialties NOT IN ('null','[]'))      AS spec_parse_fail,
  count_if(proc_arr  IS NULL AND procedure   NOT IN ('null','[]'))      AS proc_parse_fail,
  count_if(equip_arr IS NULL AND equipment   NOT IN ('null','[]'))      AS equip_parse_fail,
  count_if(cap_arr   IS NULL AND capability  NOT IN ('null','[]'))      AS cap_parse_fail,
  count_if(size(spec_arr)  = 50)                                        AS spec_at_cap50,
  count_if(size(proc_arr)  = 50)                                        AS proc_at_cap50,
  count_if(size(equip_arr) = 50)                                        AS equip_at_cap50,
  count_if(size(cap_arr)   = 50)                                        AS cap_at_cap50,
  count_if(size(url_arr)   = 50)                                        AS urls_at_cap50,
  percentile(size(cap_arr), 0.5)                                        AS median_cap_items,
  percentile(size(array_distinct(spec_arr)) / size(spec_arr), 0.5)      AS median_spec_distinct_ratio
FROM f;


-- =====================================================================
-- Q2  >>> PASTE   Empty + negation claims ("No equipment details...")
-- =====================================================================
SELECT
  field,
  count(*)                                                              AS claims,
  count_if(trim(claim) = '')                                            AS empty,
  count_if(lower(claim) RLIKE
    '^(no |none|n/a|not )|no (explicit |specific )?(equipment|procedure|capabilit|detail|information|data)|not (mentioned|specified|provided|available|listed)')
                                                                        AS negation,
  count(DISTINCT claim) / count(*)                                      AS distinct_ratio
FROM claims
GROUP BY field;

-- Q2b >>> PASTE   examples, so we can tune the negation regex
SELECT field, claim
FROM claims
WHERE lower(claim) RLIKE '\\bno\\b|\\bnot\\b|\\bnone\\b'
LIMIT 40;


-- =====================================================================
-- Q3  >>> PASTE   Location: PIN validity, coords, distance to PIN centre
-- =====================================================================
SELECT
  count(*)                                                                  AS n,
  count_if(pin_str IS NULL OR length(pin_str) <> 6)                         AS pin_missing_or_malformed,
  count_if(length(pin_str) = 6 AND pin_state IS NULL)                       AS pin_not_in_directory,
  count_if(latitude IS NULL OR longitude IS NULL)                           AS coords_missing,
  count_if(latitude = 0 OR longitude = 0)                                   AS coords_zero,
  count_if(NOT (latitude BETWEEN 6 AND 37.6 AND longitude BETWEEN 68 AND 97.5)) AS coords_outside_india_box,
  count_if(km_to_pin > 25)                                                  AS km_gt_25,
  count_if(km_to_pin > 50)                                                  AS km_gt_50,
  count_if(km_to_pin > 200)                                                 AS km_gt_200,
  count_if(pin_state IS NOT NULL AND norm(address_stateOrRegion) <> norm(pin_state)) AS state_ne_pin_state
FROM loc;

-- Q3b >>> PASTE   top (address state, PIN state) disagreements — separates
--                 naming variants (e.g. Orissa/Odisha) from real conflicts
SELECT address_stateOrRegion, pin_state, count(*) AS n
FROM loc
WHERE pin_state IS NOT NULL AND norm(address_stateOrRegion) <> norm(pin_state)
GROUP BY 1, 2 ORDER BY n DESC LIMIT 40;

-- Q3c >>> PASTE   distinct state spellings in facilities
SELECT address_stateOrRegion, count(*) AS n
FROM f GROUP BY 1 ORDER BY n DESC LIMIT 60;

-- Q3d >>> PASTE   many facilities sharing identical coordinates (geocoded to city centre?)
SELECT round(latitude, 5) AS lat, round(longitude, 5) AS lon, count(*) AS n,
       slice(collect_set(name), 1, 5) AS example_names
FROM f
GROUP BY 1, 2 HAVING count(*) > 2
ORDER BY n DESC LIMIT 20;


-- =====================================================================
-- Q4  >>> PASTE   Merge size: how many source records were fused per row
-- =====================================================================
SELECT
  CASE WHEN k IS NULL THEN 'null'
       WHEN k = 1  THEN '01'
       WHEN k <= 3 THEN '02-03'
       WHEN k <= 6 THEN '04-06'
       WHEN k <= 10 THEN '07-10'
       ELSE '11+' END                              AS distinct_source_ids,
  count(*)                                         AS n_facilities
FROM (SELECT size(array_distinct(srcid_arr)) AS k FROM f)
GROUP BY 1 ORDER BY 1;


-- =====================================================================
-- Q5  >>> PASTE   Email domain vs official website domain
-- =====================================================================
WITH d AS (
  SELECT name, email, officialWebsite,
         lower(substring_index(email, '@', -1))                                         AS email_dom,
         lower(regexp_extract(officialWebsite, '^(https?://)?(www\\.)?([^/]+)', 3))     AS web_dom
  FROM f
  WHERE email IS NOT NULL AND email <> 'null'
)
SELECT
  count(*)                                                                    AS with_email,
  count_if(email LIKE '%[email%')                                             AS mangled_email,
  count_if(email_dom RLIKE 'gmail|yahoo|hotmail|rediff|outlook|live\\.|icloud') AS free_mail,
  count_if(web_dom <> '' AND NOT email_dom RLIKE 'gmail|yahoo|hotmail|rediff|outlook|live\\.|icloud'
           AND email NOT LIKE '%[email%'
           AND split(email_dom, '\\.')[0] <> split(web_dom, '\\.')[0])        AS email_dom_ne_web_dom
FROM d;


-- =====================================================================
-- Q6  >>> PASTE   Claims that name a DIFFERENT hospital (merge contamination)
-- =====================================================================
CREATE OR REPLACE TEMP VIEW named_claims AS
WITH c AS (
  SELECT unique_id, name, field, claim,
         regexp_extract(claim,
           '((?:[A-Z][A-Za-z\\.\\-]+ ){1,5}(?:Hospital|Hospitals|Medical Center|Medical Centre|Institute|Nursing Home|Clinic|Medical College))', 1) AS ent
  FROM claims
)
SELECT *,
  array_except(split(lower(regexp_replace(ent,  '[^A-Za-z ]', '')), ' '),
    array('hospital','hospitals','medical','center','centre','institute','nursing','home','clinic',
          'college','the','of','and','super','speciality','specialty','multi','research','government',
          'general','district','civil','private','city','new','')) AS ent_tokens,
  split(lower(regexp_replace(name, '[^A-Za-z ]', '')), ' ')        AS name_tokens
FROM c WHERE ent <> '';

SELECT
  count(*)                                                                         AS claims_naming_a_facility,
  count_if(size(ent_tokens) > 0 AND NOT arrays_overlap(ent_tokens, name_tokens))   AS names_other_facility,
  count(DISTINCT CASE WHEN size(ent_tokens) > 0 AND NOT arrays_overlap(ent_tokens, name_tokens)
                      THEN unique_id END)                                          AS facilities_affected
FROM named_claims;

-- Q6b >>> PASTE   examples (to check the heuristic isn't too noisy)
SELECT name, field, ent, left(claim, 160) AS claim
FROM named_claims
WHERE size(ent_tokens) > 0 AND NOT arrays_overlap(ent_tokens, name_tokens)
LIMIT 30;


-- =====================================================================
-- Q7  >>> PASTE   Plausibility of numbers / dates / types
-- =====================================================================
SELECT
  count_if(year_n IS NOT NULL AND (year_n > 2026 OR year_n < 1800))          AS bad_year,
  count_if(try_to_date(recency_of_page_update) > current_date())              AS future_page_update,
  count_if(capacity_n > 3000)                                                 AS capacity_gt_3000,
  count_if(doctors_n > 0 AND capacity_n / doctors_n > 100)                    AS beds_per_doctor_gt_100,
  percentile(capacity_n, array(0.5, 0.9, 0.99))                               AS capacity_p50_p90_p99,
  percentile(doctors_n,  array(0.5, 0.9, 0.99))                               AS doctors_p50_p90_p99
FROM f;

-- Q7b >>> PASTE
SELECT facilityTypeId, operatorTypeId, count(*) AS n
FROM f GROUP BY ALL ORDER BY n DESC LIMIT 30;


-- =====================================================================
-- Q8  >>> PASTE   How many facilities mention each target service (naive keyword)
--                 + how many of those are single-specialty places (red flag)
-- =====================================================================
WITH t AS (
  SELECT name,
         lower(concat_ws(' ', description, specialties, procedure, equipment, capability)) AS txt,
         lower(name) RLIKE 'eye|netra|nethra|dental|dentist|skin|derma|ivf|fertility' AS single_specialty_name
  FROM f
)
SELECT
  count_if(txt RLIKE 'dialysis')                                                        AS dialysis,
  count_if(txt RLIKE 'dialysis' AND single_specialty_name)                              AS dialysis_at_eye_dental_skin_ivf,
  count_if(txt RLIKE 'caesarean|cesarean|c-section|c section|lscs')                     AS c_section,
  count_if(txt RLIKE 'nicu|neonatal intensive')                                         AS nicu,
  count_if(txt RLIKE 'nicu|neonatal intensive' AND single_specialty_name)               AS nicu_at_eye_dental_skin_ivf,
  count_if(txt RLIKE 'cabg|cardiac surg|cardiothoracic|open heart|bypass surg')         AS cardiac_surgery,
  count_if(txt RLIKE '\\bmri\\b|magnetic resonance')                                    AS mri,
  count_if(txt RLIKE 'burn')                                                            AS burn_care
FROM t;


-- =====================================================================
-- Q9  >>> PASTE   NFHS district ↔ PIN-directory district join rate
-- =====================================================================
CREATE OR REPLACE TEMP VIEW nfhs_pin_join AS
WITH n AS (SELECT DISTINCT trim(district_name) AS district, trim(state_ut) AS state,
                  norm(district_name) AS d, norm(state_ut) AS s
           FROM workspace.hackathon.bronze_nfhs5_indicators),
     p AS (SELECT DISTINCT norm(district) AS d, norm(statename) AS s
           FROM workspace.hackathon.bronze_pincode_directory)
SELECT n.*, p.d IS NOT NULL AS matched
FROM n LEFT JOIN p ON n.d = p.d AND n.s = p.s;

SELECT count(*) AS nfhs_districts, count_if(matched) AS matched FROM nfhs_pin_join;

-- Q9b >>> PASTE   unmatched list (we'll build the manual mapping from this)
SELECT state, district FROM nfhs_pin_join WHERE NOT matched ORDER BY state, district;
