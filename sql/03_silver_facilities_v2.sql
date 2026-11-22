-- silver_facilities_v2: silver_facilities plus a normalized city column.
--
-- Why: silver_facilities has no city column. find_care_v5 reads the raw bronze_facilities.address_city and
-- resolves typed city names against it, so that raw text has to be fixed first.
-- Inputs are read only: silver_facilities and bronze_facilities. This builds two new tables:
--   workspace.hackathon.silver_facilities_v2   every silver column, plus city_raw, clean_city, city_fixes, the flag_city_*
--                                              flags and city_search_ok
--   workspace.hackathon.ref_city_alias         alias_key (letters only, lower case) -> canonical city (+ state), so a
--                                              typed "Bangalore" or "Gurgaon" resolves to the canonical name. Spacing
--                                              variants ("Dehra Dun") need no alias: compare letters-only keys.
--
-- Result (2026-11-22): 10,077 rows (= silver). 9,984 have a clean_city, 674 were changed (466 alias, 107 locality,
-- 33 city suffix, 20 spelling, 15 case, 2 comma), 35 are junk, 36 are state strays, 9,948 are city_search_ok.
-- 1,643 raw spellings -> 1,531 cities.
--
-- Rules, in order (each one that fires is recorded in city_fixes):
--   1 junk         digits or dates only, JSON lists, lists of 3+ places, > 60 chars, placeholders ("null"),
--                  rows with no state and no PIN (silver's column-shifted rows)      -> NULL   (flag_city_junk)
--   2 comma        "Andheri West, Mumbai" -> the part that is a known city (the last part if both are), else the first part
--   3 locality     strip a trailing direction: "(east)", "(w)", " East", " West"; strip "Sector 3", "-1", "No 3"
--   4 city_suffix  strip a trailing " City" ("Ambala City" -> "Ambala"), except where " City" is part of the name
--                  (Bokaro Steel City, Gangapur City, Kuchaman City)
--   5 case         Title Case
--   6 spelling     one spelling per letters-only key, the most frequent one ("Sri Ganganagar" / "Sriganganagar")
--   7 alias        legacy or alternate names -> the current common name (Bangalore -> Bengaluru, Gurgaon -> Gurugram, ...)
--   flag_city_state_stray  the city has a "home" state (>= 2 facilities and >= 5% of them, find_care's city-state
--                          rule), this facility's state isn't one, and its PIN district isn't that city either
--                          ("Hyderabad" text with a Visakhapatnam PIN). One-facility towns are never strays; the
--                          district check keeps real twins such as Aurangabad, Bihar.
--   city_search_ok         clean_city IS NOT NULL AND NOT flag_city_state_stray

CREATE OR REPLACE TABLE workspace.hackathon.ref_city_alias
TBLPROPERTIES ('ftrc.owner' = 'find_care_v5')
COMMENT 'Typed or legacy city name -> canonical clean_city used in silver_facilities_v2 (state NULL = any state)'
AS SELECT * FROM VALUES
  ('bombay', 'Mumbai', 'MAHARASHTRA'), ('calcutta', 'Kolkata', 'WEST BENGAL'), ('madras', 'Chennai', 'TAMIL NADU'),
  ('bangalore', 'Bengaluru', 'KARNATAKA'), ('gurgaon', 'Gurugram', 'HARYANA'), ('poona', 'Pune', 'MAHARASHTRA'),
  ('mysore', 'Mysuru', 'KARNATAKA'), ('trivandrum', 'Thiruvananthapuram', 'KERALA'), ('cochin', 'Kochi', 'KERALA'),
  ('baroda', 'Vadodara', 'GUJARAT'), ('allahabad', 'Prayagraj', 'UTTAR PRADESH'), ('pondicherry', 'Puducherry', NULL),
  ('pondy', 'Puducherry', NULL), ('calicut', 'Kozhikode', 'KERALA'), ('mangalore', 'Mangaluru', 'KARNATAKA'),
  ('belgaum', 'Belagavi', 'KARNATAKA'), ('gulbarga', 'Kalaburagi', 'KARNATAKA'), ('hubli', 'Hubballi', 'KARNATAKA'),
  ('vizag', 'Visakhapatnam', 'ANDHRA PRADESH'), ('vishakhapatnam', 'Visakhapatnam', 'ANDHRA PRADESH'),
  ('trichy', 'Tiruchirappalli', 'TAMIL NADU'), ('tiruchy', 'Tiruchirappalli', 'TAMIL NADU'),
  ('tuticorin', 'Thoothukudi', 'TAMIL NADU'), ('bhubaneshwar', 'Bhubaneswar', 'ODISHA'),
  ('benares', 'Varanasi', 'UTTAR PRADESH'), ('banaras', 'Varanasi', 'UTTAR PRADESH'), ('kashi', 'Varanasi', 'UTTAR PRADESH'),
  ('sahibzadaajitsinghnagar', 'Mohali', 'PUNJAB'), ('sasnagar', 'Mohali', 'PUNJAB'),
  ('gautambuddhanagar', 'Noida', 'UTTAR PRADESH'), ('gautambudhnagar', 'Noida', 'UTTAR PRADESH'),
  -- Aurangabad (Maharashtra) was renamed Chhatrapati Sambhajinagar in 2023. The data and the PIN directory still mostly
  -- say Aurangabad, so that stays canonical; the new name is an alias.
  ('chhatrapatisambhajinagar', 'Aurangabad', 'MAHARASHTRA'),
  ('kanpurnagar', 'Kanpur', 'UTTAR PRADESH'), ('cawnpore', 'Kanpur', 'UTTAR PRADESH'), ('simla', 'Shimla', 'HIMACHAL PRADESH'),
  ('ooty', 'Udhagamandalam', 'TAMIL NADU'), ('ootacamund', 'Udhagamandalam', 'TAMIL NADU'),
  ('panjim', 'Panaji', 'GOA'), ('jubbulpore', 'Jabalpur', 'MADHYA PRADESH')
  AS t(alias_key, canonical_city, state);

CREATE OR REPLACE TABLE workspace.hackathon.silver_facilities_v2
TBLPROPERTIES ('ftrc.owner' = 'find_care_v5')
COMMENT 'silver_facilities + normalized city (from bronze_facilities.address_city); see sql/03_silver_facilities_v2.sql'
AS
WITH b AS (   -- bronze has 11 duplicate unique_ids: one value per id
  SELECT unique_id, max(nullif(regexp_replace(trim(address_city), '\\s+', ' '), '')) AS city_raw
  FROM workspace.hackathon.bronze_facilities GROUP BY unique_id),
s AS (SELECT f.*, b.city_raw FROM workspace.hackathon.silver_facilities f LEFT JOIN b USING (unique_id)),
-- city names seen at least 5 times, used to pick the right half of "locality, city"
known AS (SELECT lower(city_raw) AS k FROM s WHERE city_raw IS NOT NULL AND city_raw NOT LIKE '%,%' GROUP BY 1 HAVING count(*) >= 5),
r1 AS (
  SELECT s.unique_id, s.city_raw,
    s.city_raw IS NOT NULL AND (
         s.city_raw rlike '^[0-9 ./-]+$'                                   -- "0", "3800", "2024-10-21"
      OR s.city_raw rlike '^\\s*[\\[{]'                                    -- a JSON list pasted into the city field
      OR size(split(s.city_raw, ',')) >= 3                                 -- "Kalyan, Bhandup, Borivali (e), ..."
      OR length(s.city_raw) > 60
      OR lower(s.city_raw) IN ('null', 'none', 'na', 'n/a', 'nil', 'unknown', 'not available', '-')
      OR (s.clean_state IS NULL AND s.clean_pincode IS NULL)) AS junk,          -- column-shifted rows (name '["radiology"', city 'kie')
    trim(get(split(s.city_raw, ','), 0)) AS part1,
    CASE WHEN size(split(s.city_raw, ',')) = 2 THEN trim(get(split(s.city_raw, ','), 1)) END AS part2
  FROM s),
r2 AS (
  SELECT r1.*,
    CASE WHEN junk OR city_raw IS NULL THEN NULL
         WHEN part2 IS NULL THEN part1
         WHEN k2.k IS NOT NULL THEN part2
         ELSE part1 END AS c2
  FROM r1 LEFT JOIN known k2 ON k2.k = lower(r1.part2)),
r3 AS (
  SELECT r2.*,
    trim(regexp_replace(regexp_replace(regexp_replace(c2,
      '(?i)\\s*\\((east|west|north|south|e|w|n|s)\\)\\s*$', ''),       -- "Mira Road (east)"
      '(?i)\\s+(east|west)\\s*$', ''),                                   -- "Mira Road East", "Kalyan West"
      '(?i)(\\s+sector\\s*[0-9]+|\\s*-\\s*[0-9]+|\\s+no\\.?\\s*[0-9]+)\\s*$', '')) AS c3   -- "Rohini Sector 3", "Ludhiana-1"
  FROM r2),
r4 AS (
  SELECT r3.*,
    CASE WHEN lower(c3) IN ('bokaro steel city', 'gangapur city', 'kuchaman city') THEN c3
         ELSE trim(regexp_replace(c3, '(?i)\\s+city\\s*$', '')) END AS c4
  FROM r3),
-- Title Case, also after hyphens ("Pimpri-Chinchwad")
r5 AS (SELECT r4.*, nullif(array_join(transform(split(initcap(lower(c4)), '-'), x -> initcap(x)), '-'), '') AS c5,
              lower(regexp_replace(c4, '[^A-Za-z]', '')) AS k5 FROM r4),
-- one spelling per letters-only key: the most frequent, ties broken toward the spelling with spaces
spell AS (
  SELECT k5, c5 AS spelling FROM (
    SELECT k5, c5, row_number() OVER (PARTITION BY k5 ORDER BY count(*) DESC, length(c5) DESC, c5) AS rn
    FROM r5 WHERE c5 IS NOT NULL AND k5 <> '' GROUP BY k5, c5) WHERE rn = 1),
r6 AS (
  SELECT r5.*, sp.spelling AS c6, coalesce(a.canonical_city, sp.spelling) AS c7, a.canonical_city IS NOT NULL AS aliased
  FROM r5 LEFT JOIN spell sp ON sp.k5 = r5.k5
          LEFT JOIN workspace.hackathon.ref_city_alias a ON a.alias_key = r5.k5),
fixed AS (
  SELECT unique_id, city_raw, junk, c7 AS clean_city,
    filter(array(
      CASE WHEN junk THEN 'junk' END,
      CASE WHEN NOT junk AND part2 IS NOT NULL THEN 'comma' END,
      CASE WHEN c3 <> c2 THEN 'locality' END,
      CASE WHEN c4 <> c3 THEN 'city_suffix' END,
      CASE WHEN c5 <> c4 AND lower(c5) = lower(c4) THEN 'case' END,
      CASE WHEN c6 <> c5 THEN 'spelling' END,
      CASE WHEN aliased THEN 'alias' END), x -> x IS NOT NULL) AS city_fixes
  FROM r6),
-- state check: share of each (city, state) pair among that city's facilities
pair0 AS (
  SELECT fx.clean_city, s.clean_state, count(*) AS n_pair, sum(count(*)) OVER (PARTITION BY fx.clean_city) AS n_city
  FROM fixed fx JOIN s USING (unique_id) WHERE fx.clean_city IS NOT NULL GROUP BY fx.clean_city, s.clean_state),
-- a pair is a "home" of the city if it holds >= 2 facilities and >= 5% of them (find_care's city-state rule)
pair AS (
  SELECT pair0.*, n_pair >= 2 AND n_pair >= 0.05 * n_city AS is_home,
         count_if(n_pair >= 2 AND n_pair >= 0.05 * n_city) OVER (PARTITION BY clean_city) AS n_homes
  FROM pair0),
out AS (
  SELECT s.* EXCEPT (city_raw), fx.city_raw, fx.clean_city, fx.city_fixes, fx.junk AS flag_city_junk,
    coalesce(fx.clean_city IS NOT NULL
      AND NOT p.is_home AND p.n_homes >= 1                -- the city has a clear home in another state
      AND lower(regexp_replace(fx.clean_city, '[^A-Za-z]', '')) <> lower(regexp_replace(coalesce(s.clean_district, ''), '[^A-Za-z]', '')),
      false) AS flag_city_state_stray
  FROM s JOIN fixed fx USING (unique_id)
  LEFT JOIN pair p ON p.clean_city = fx.clean_city AND p.clean_state <=> s.clean_state)
SELECT out.*, clean_city IS NOT NULL AND NOT flag_city_state_stray AS city_search_ok FROM out;
