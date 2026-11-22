-- =====================================================================
-- silver_facilities
-- Source : workspace.hackathon.bronze_facilities
-- Ref    : workspace.hackathon.silver_pincode_directory   (run silver_pincode_directory.sql first)
--          workspace.hackathon.ref_specialty_mapping       (run ref_specialty_mapping.sql first)
--
-- One row per unique_id (duplicates dropped first). Output = flag_* and clean_* columns plus the few raw columns
-- not yet cleaned (yearEstablished, acceptsVolunteers, facebookLink) and unique_id as the row key; other raw / ID columns are dropped at the end. Adds:
--   flags  : flag_{column}_{issue}   (TRUE/FALSE, never NULL)
--   clean  : clean_name, clean_email, clean_website,
--            clean_officialPhone, clean_phone_numbers,
--            clean_address_line1, clean_address_line2, clean_address_line3,
--            clean_pincode, clean_state, clean_district, clean_address,
--            clean_facility_type, clean_operator_type, clean_affiliations, govt_scheme_evidence,
--            clean_area, clean_number_doctors, clean_capacity, clean_distinct_social_count, clean_number_of_facts,
--            clean_post_count, clean_n_likes, clean_n_engagements, clean_n_followers,
--            clean_affiliated_staff_presence, clean_custom_logo_presence,
--            clean_recency_of_page_update, clean_most_recent_post_date,
--            clean_specialties, clean_procedures, clean_equipment, clean_capabilities, clean_description, clean_capacity_from_text,
--            clean_latitude, clean_longitude, distance_to_pincode_km
-- Missing values in clean_* columns are NULL, or imputed from other address columns where possible
-- (PIN from the address lines, state from the PIN directory).
-- =====================================================================
CREATE OR REPLACE TABLE workspace.hackathon.silver_facilities
COMMENT 'Silver facilities: bronze_facilities de-duplicated on unique_id, original columns unchanged, plus data-quality flags (flag_*) and cleaned values (clean_*) for name, email, website, phones, address (validated against silver_pincode_directory), facility type, operator type, affiliations, numeric / date / boolean metrics, text columns (specialties mapped via ref_specialty_mapping), and coordinates (with PIN-centroid distance).'
AS
WITH
-- =====================================================================
-- STEP 0: drop unique_id duplicates (keep one row per unique_id, deterministic)
-- =====================================================================
dedup AS (
  SELECT * EXCEPT (_rn)
  FROM (
    SELECT *, row_number() OVER (PARTITION BY unique_id ORDER BY ingested_at DESC, source_content_id, cluster_id) AS _rn
    FROM workspace.hackathon.bronze_facilities
  )
  WHERE _rn = 1
),
prep AS (
  SELECT
    b.*,
    lower(trim(b.name))            AS _ln,
    lower(trim(b.email))           AS _le,
    lower(trim(b.officialWebsite)) AS _lw,
    -- host part of officialWebsite, e.g. "https://www.practo.com/x" -> "practo.com"
    regexp_extract(lower(trim(b.officialWebsite)), '^(?:https?://)?(?:www\\.|m\\.)?([^/:?#\\s]+)', 1) AS _wd,
    -- words of the name (letters/digits only, 3+ chars) used for the name-vs-email check
    filter(split(regexp_replace(lower(coalesce(b.name, '')), '[^a-z0-9]+', ' '), ' '), t -> length(t) >= 3) AS _name_words
  FROM dedup b
),
base AS (
  SELECT *,
    (name IS NULL OR _ln IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-', 'unknown'))                  AS _name_missing,
    (email IS NULL OR _le IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-', '[]'))                       AS _email_missing,
    (officialWebsite IS NULL OR _lw IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-', 'unknown', '[]'))  AS _web_missing
  FROM prep
),
flagged AS (
  SELECT
    *,

    -- ================= NAME FLAGS =================
    -- a. address or PIN code inside the name
    coalesce(NOT _name_missing AND (
          _ln RLIKE '\\b[1-9][0-9]{5}\\b'                                   -- 6-digit PIN
       OR size(split(name, ',')) >= 4                                        -- 3+ commas: "X, Area, City, State"
       OR (length(name) > 50 AND _ln RLIKE '\\b(road|rd\\.|nagar|near|opp\\.?|opposite|floor|plot|shop no|sector|marg|chowk|colony|layout)\\b')
    ), false) AS flag_name_address_or_pin,

    -- b. SEO / marketing text inside the name
    coalesce(NOT _name_missing AND (
          name RLIKE '\\|'
       OR _ln RLIKE '\\bbest\\b|\\btop\\b|\\bnear me\\b|24 ?(x|by|/) ?7'
    ), false) AS flag_name_seo_text,

    -- c. generic name that cannot identify a specific facility
    coalesce(NOT _name_missing AND
       _ln RLIKE '^(the )?(hospital|clinic|dental clinic|eye hospital|nursing home|medical centre|medical center|health centre|health center|government hospital|civil hospital|district hospital|general hospital|city hospital|community health centre|primary health centre)s?$'
    , false) AS flag_name_generic,

    -- d. veterinary / animal care (out of scope for human care)
    coalesce(NOT _name_missing
       AND _ln RLIKE 'veterin|pet clinic|pet care|pets? hospital|animal|cattle|livestock|poultry'
       AND NOT _ln RLIKE 'pet[ -]?ct|pet scan'                               -- PET-CT is a human imaging scan
    , false) AS flag_name_veterinary_oos,

    -- e. missing name
    _name_missing AS flag_name_missing,

    -- ================= EMAIL FLAGS =================
    -- a. missing email
    _email_missing AS flag_email_missing,

    -- b. not a real address: scraper captured the Cloudflare "[email protected]" text
    coalesce(_le LIKE '%email%protected%', false) AS flag_email_not_real_address,

    -- c. spelled out, e.g. name[at]gmail[dot]com, name(at)gmail(dot)com
    coalesce(_le RLIKE '[a-z0-9]\\s*[\\[\\(]\\s*at\\s*[\\]\\)]\\s*[a-z0-9]', false) AS flag_email_spelled_out,

    -- d. placeholder / template address
    coalesce(_le RLIKE '@(domain|example|email|yourdomain|website)\\.(com|in|org)'
          OR _le RLIKE '(^|[\\s",\\[])(test|sample|xyz|abc|yourname|youremail|name|info)@(domain|example|email|gmail)\\.com'
          OR _le RLIKE '(^|[\\s",\\[])(no-?reply|donotreply)@'
          OR _le RLIKE '\\[[a-z]+\\]@', false) AS flag_email_placeholder,

    -- e. not one word of the name (3+ chars) appears anywhere in the email string (covers every email in a list)
    coalesce(NOT _email_missing
         AND NOT (_le LIKE '%email%protected%')
         AND size(_name_words) > 0
         AND NOT exists(_name_words, t -> instr(_le, t) > 0), false) AS flag_email_no_name_word,

    -- ================= OFFICIAL WEBSITE FLAGS =================
    -- a. missing
    _web_missing AS flag_officialWebsite_missing,

    -- b. a directory / listing / maps page instead of the facility's own site
    coalesce(NOT _web_missing AND _wd RLIKE '(^|\\.)(practo|justdial|lybrate|indiamart|sulekha|credihealth|medindia|zoominfo|mappls|tracxn|wikipedia|apollo247|clinicspots|hexahealth|drlogy|quickerala|sehat|healthfrog|mediyaar|vaidam|asklaila|grotal|magicpin|nowfloats|1mg|bajajfinserv)\\.|(^|\\.)eka\\.care$|^business\\.site$|\\.business\\.site$|^g\\.page$|^goo\\.gl$|^maps\\.app\\.goo\\.gl$|^sites\\.google\\.com$|^(www\\.)?google\\.', false) AS flag_officialWebsite_directory_listing,

    -- c. social media page
    coalesce(NOT _web_missing AND _wd RLIKE '(^|\\.)(facebook|fb|instagram|youtube|youtu|twitter|x|linkedin|wa|whatsapp|threads|pinterest)\\.(com|be|me)$', false) AS flag_officialWebsite_social_media,

    -- d. government domain (.gov.in / .nic.in): shared state/ESIC portals AND some facilities' own govt sites (e.g. tmc.gov.in)
    coalesce(NOT _web_missing AND _wd RLIKE '\\.(gov|nic)\\.in$', false) AS flag_officialWebsite_govt_portal,

    -- ================= CLEANING HELPERS =================
    -- name step 1: collapse whitespace, drop everything after "|" (SEO tail)
    regexp_replace(regexp_replace(trim(name), '\\s+', ' '), '\\s*\\|.*$', '') AS _n1,

    -- email: turn [at]/(at) -> @ and [dot]/(dot) -> . , then pull out every well-formed address
    filter(
      regexp_extract_all(
        regexp_replace(regexp_replace(_le, '\\s*[\\[\\(]\\s*at\\s*[\\]\\)]\\s*', '@'), '\\s*[\\[\\(]\\s*dot\\s*[\\]\\)]\\s*', '.'),
        '([a-z0-9._%+-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,})', 1),
      e -> NOT (e RLIKE '@(domain|example|email|yourdomain|website)\\.(com|in|org)$'
             OR e RLIKE '^(test|sample|xyz|abc|yourname|youremail|name|info)@(domain|example|email|gmail)\\.com$'
             OR e RLIKE '^(no-?reply|donotreply)@')
    ) AS _emails,

    -- website: unwrap a JSON list (take first entry), trim
    trim(CASE WHEN trim(officialWebsite) LIKE '[%'
              THEN try_element_at(from_json(trim(officialWebsite), 'array<string>'), 1)
              ELSE officialWebsite END) AS _w0
  FROM base
),
cleaning AS (
  SELECT *,
    -- name step 2: if SEO flagged, drop " - Best ..." tails, then a trailing "Best ... in/near <place>" phrase
    -- (a bare "Best" inside a real name, e.g. "Renee Best Multispeciality Hospital", is kept)
    CASE WHEN flag_name_seo_text
         THEN regexp_replace(regexp_replace(_n1, '(?i)\\s+[-–—:]\\s+[^-–—:]*\\bbest\\b.*$', ''), '(?i)(?<=\\S{3})\\s+best\\b.*\\b(in|near)\\b.*$', '')
         ELSE _n1 END AS _n2,
    -- website: split into host + path (accepts with/without scheme and www; rejects anything with spaces)
    regexp_extract(_w0, '(?i)^(?:https?://)?(?:www\\.)?([a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,})(?::[0-9]+)?(/[^\\s#]*)?(?:#.*)?$', 1) AS _w_host,
    regexp_extract(_w0, '(?i)^(?:https?://)?(?:www\\.)?([a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,})(?::[0-9]+)?(/[^\\s#]*)?(?:#.*)?$', 2) AS _w_path
  FROM flagged
),
cleaning2 AS (
  SELECT *,
    -- name step 3: if address flagged, cut at "near/opp", then at first comma, then at " - " separator, then drop PIN and what follows
    CASE WHEN flag_name_address_or_pin
         THEN regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(_n2, '(?i)[\\s,(]+\\b(near|opp|opposite)\\b.*$', ''),
                  '\\s*,.*$', ''),
                '\\s+[-–—]\\s+.*$', ''),
              '[\\s,(-]*\\b[1-9][0-9]{5}\\b.*$', '')
         ELSE _n2 END AS _n3
  FROM cleaning
),
stage1 AS (
SELECT
  -- ---------- all original columns, untouched, in original order ----------
  * EXCEPT (_ln, _le, _lw, _wd, _name_words, _name_missing, _email_missing, _web_missing,
            _n1, _emails, _w0, _n2, _w_host, _w_path, _n3),

  -- ================= CLEAN VALUES =================
  -- clean_name: NULL if missing; otherwise name with SEO tail / address / PIN removed and trailing punctuation trimmed.
  -- Falls back to the whitespace-normalised name if cleaning would leave fewer than 3 characters.
  CASE WHEN flag_name_missing THEN NULL
       WHEN length(regexp_replace(_n3, '[\\s,.;:|–—\\-(]+$', '')) >= 3
            THEN regexp_replace(_n3, '[\\s,.;:|–—\\-(]+$', '')
       ELSE regexp_replace(trim(name), '\\s+', ' ') END AS clean_name,

  -- clean_email: first well-formed, non-placeholder address (lower-case), after de-obfuscation; NULL if none.
  CASE WHEN flag_email_missing OR size(_emails) = 0 THEN NULL ELSE try_element_at(_emails, 1) END AS clean_email,

  -- clean_website: normalised to https://<host-without-www>/<path> (host lower-cased, trailing "/" removed); NULL if missing or malformed.
  CASE WHEN flag_officialWebsite_missing OR coalesce(_w_host, '') = '' THEN NULL
       ELSE concat('https://', lower(_w_host), regexp_replace(coalesce(_w_path, ''), '/+$', '')) END AS clean_website

FROM cleaning2
),

-- =====================================================================
-- PHONES: officialPhone + phone_numbers
-- Every number is normalised the same way:
--   digits = all digits of the raw value
--   toll-free  : digits match (91|0)?(1800|1860)xxxxxx..  -> kept out of the 10-digit columns
--   10-digit   : +91XXXXXXXXXX -> XXXXXXXXXX
--                0XXXXXXXXXX  -> XXXXXXXXXX        (STD trunk prefix)
--                +10XXXXXXXXXX -> XXXXXXXXXX       (Indian landline mis-tagged as +1)
--                XXXXXXXXXX / +XXXXXXXXXX (10 digits, no 91) -> as is
--   foreign    : starts with "+", not 91, not toll-free, not convertible, 10+ digits
--   dummy      : 10-digit value with 7+ repeated digits, 1234567 or 9876543
-- =====================================================================
ph AS (
  SELECT *,
    (officialPhone IS NULL OR lower(trim(officialPhone)) IN ('', 'null', 'none', 'nan', 'n/a', '-', '[]')) AS _op_missing,
    regexp_replace(coalesce(officialPhone, ''), '[^0-9]', '') AS _op_d,
    trim(coalesce(officialPhone, '')) LIKE '+%'              AS _op_plus,
    CASE WHEN trim(phone_numbers) LIKE '[%' THEN from_json(phone_numbers, 'array<string>') END AS _pn_arr
  FROM stage1
),
ph2 AS (
  SELECT *,
    -- officialPhone normalisation
    (_op_d RLIKE '^(91|0)?(1800|1860)[0-9]{6,8}$') AS _op_tf,
    CASE WHEN _op_d RLIKE '^(91|0)?(1800|1860)[0-9]{6,8}$' THEN NULL
         WHEN _op_d RLIKE '^91[1-9][0-9]{9}$'            THEN substr(_op_d, 3)
         WHEN _op_d RLIKE '^0[1-9][0-9]{9}$'             THEN substr(_op_d, 2)
         WHEN _op_plus AND _op_d RLIKE '^10[1-9][0-9]{9}$' THEN substr(_op_d, 3)
         WHEN _op_d RLIKE '^[1-9][0-9]{9}$'              THEN _op_d END AS _op_ten,
    -- phone_numbers normalisation, item by item
    transform(_pn_arr, x -> named_struct(
      'd',  regexp_replace(coalesce(x, ''), '[^0-9]', ''),
      'p',  trim(coalesce(x, '')) LIKE '+%')) AS _pn_s
  FROM ph
),
ph3 AS (
  SELECT *,
    transform(_pn_s, s -> named_struct(
      'd',   s.d,
      'tf',  s.d RLIKE '^(91|0)?(1800|1860)[0-9]{6,8}$',
      'ten', CASE WHEN s.d RLIKE '^(91|0)?(1800|1860)[0-9]{6,8}$' THEN NULL
                  WHEN s.d RLIKE '^91[1-9][0-9]{9}$'            THEN substr(s.d, 3)
                  WHEN s.d RLIKE '^0[1-9][0-9]{9}$'             THEN substr(s.d, 2)
                  WHEN s.p AND s.d RLIKE '^10[1-9][0-9]{9}$'    THEN substr(s.d, 3)
                  WHEN s.d RLIKE '^[1-9][0-9]{9}$'              THEN s.d END)) AS _pn_n
  FROM ph2
),
ph4 AS (
  SELECT *,
    -- cleaned officialPhone: valid, non-dummy 10-digit Indian number
    CASE WHEN NOT _op_missing AND _op_ten IS NOT NULL AND NOT _op_ten RLIKE '(\\d)\\1{6,}|1234567|9876543' THEN _op_ten END AS _op_clean,
    -- cleaned phone_numbers: distinct valid, non-dummy 10-digit numbers in original order
    array_distinct(filter(transform(_pn_n, s -> CASE WHEN s.ten IS NOT NULL AND NOT s.ten RLIKE '(\\d)\\1{6,}|1234567|9876543' THEN s.ten END),
                          z -> z IS NOT NULL)) AS _pn_valid,
    -- comparison keys (10-digit if possible, else toll-free core, else raw digits)
    coalesce(_op_ten, CASE WHEN _op_tf THEN regexp_replace(_op_d, '^(91|0)', '') END, _op_d) AS _op_key,
    transform(_pn_n, s -> coalesce(s.ten, CASE WHEN s.tf THEN regexp_replace(s.d, '^(91|0)', '') END, s.d)) AS _pn_keys
  FROM ph3
),
-- how many distinct facilities use each cleaned number (officialPhone or phone_numbers)
num_use AS (
  SELECT num, count(DISTINCT unique_id) AS n_fac
  FROM (SELECT unique_id, explode(array_distinct(filter(concat(coalesce(_pn_valid, cast(array() AS array<string>)), array(_op_clean)), z -> z IS NOT NULL))) AS num FROM ph4)
  GROUP BY num
),
list_share AS (
  SELECT l.unique_id, max(u.n_fac) AS max_n_fac
  FROM (SELECT unique_id, explode(_pn_valid) AS num FROM ph4) l JOIN num_use u ON l.num = u.num
  GROUP BY l.unique_id
),
-- =====================================================================
-- name / email / website / phone flags + clean values (same logic as the earlier bronze_facilities_flagged view)
-- =====================================================================
stage2 AS (
SELECT
  p.* EXCEPT (_op_missing, _op_d, _op_plus, _pn_arr, _op_tf, _op_ten, _pn_s, _pn_n, _op_clean, _pn_valid, _op_key, _pn_keys),

  -- ================= OFFICIAL PHONE FLAGS =================
  -- toll-free 1800/1860 number (cannot be expressed as 10 digits)
  coalesce(NOT p._op_missing AND p._op_tf, false) AS flag_officialPhone_tollfree,
  -- foreign number (starts with +, not +91, not convertible to an Indian 10-digit number)
  coalesce(NOT p._op_missing AND p._op_plus AND NOT p._op_tf AND p._op_ten IS NULL
           AND length(p._op_d) >= 10 AND NOT p._op_d LIKE '91%', false) AS flag_officialPhone_foreign,
  -- wrong number of digits for an Indian number (and not toll-free / foreign)
  coalesce(NOT p._op_missing AND NOT p._op_tf AND p._op_ten IS NULL
           AND NOT (p._op_plus AND length(p._op_d) >= 10 AND NOT p._op_d LIKE '91%'), false) AS flag_officialPhone_invalid_length,
  -- dummy-looking number (7+ repeated digits, 1234567 or 9876543)
  coalesce(NOT p._op_missing AND p._op_ten RLIKE '(\\d)\\1{6,}|1234567|9876543', false) AS flag_officialPhone_dummy,
  -- same number used by 5+ different facilities (booking / call-centre line)
  coalesce(op_use.n_fac >= 5, false) AS flag_officialPhone_shared_many,
  -- officialPhone does not appear in phone_numbers (compared after normalisation; TRUE if the list is missing)
  coalesce(NOT p._op_missing AND (p._pn_keys IS NULL OR NOT array_contains(p._pn_keys, p._op_key)), false) AS flag_officialPhone_not_in_phone_numbers,

  -- ================= PHONE NUMBERS FLAGS =================
  -- missing: NULL / 'null' / not a list / list with no non-empty item
  coalesce(p._pn_arr IS NULL OR size(filter(p._pn_arr, x -> trim(coalesce(x, '')) <> '')) = 0, true) AS flag_phone_numbers_missing,
  -- the same number appears more than once (after normalisation)
  coalesce(size(filter(p._pn_keys, k -> k <> '')) > size(array_distinct(filter(p._pn_keys, k -> k <> ''))), false) AS flag_phone_numbers_has_duplicates,
  -- at least one item is empty, wrong length, foreign or dummy (toll-free items are NOT counted as invalid)
  coalesce(exists(p._pn_n, s -> s.d = '' OR (s.ten IS NULL AND NOT s.tf) OR s.ten RLIKE '(\\d)\\1{6,}|1234567|9876543'), false) AS flag_phone_numbers_has_invalid_items,
  -- at least one number in the list is used by 5+ different facilities
  coalesce(ls.max_n_fac >= 5, false) AS flag_phone_numbers_has_shared_number,

  -- ================= CLEAN VALUES =================
  -- clean_officialPhone: 10-digit string; NULL if missing, toll-free, foreign, wrong length or dummy
  p._op_clean AS clean_officialPhone,
  -- clean_phone_numbers: array of distinct 10-digit numbers; NULL if missing or nothing valid
  CASE WHEN size(p._pn_valid) > 0 THEN p._pn_valid END AS clean_phone_numbers

FROM ph4 p
LEFT JOIN num_use op_use ON op_use.num = p._op_clean
LEFT JOIN list_share ls  ON ls.unique_id = p.unique_id
),

-- =====================================================================
-- ADDRESS: address_line1/2/3, address_city, address_stateOrRegion, address_zipOrPostcode
-- Reference (ground truth) = workspace.hackathon.silver_pincode_directory
-- =====================================================================
pin_ref AS (
  SELECT pincode,
    collect_set(statename)                                            AS _pin_states,
    max(CASE WHEN is_primary_state THEN statename END)                AS _pin_primary_state,
    array_distinct(flatten(collect_list(districts)))                  AS _pin_districts,
    collect_list(named_struct('st', statename, 'dist', district))     AS _pin_st_dist,
    max(CASE WHEN is_primary_state THEN latitude END)                 AS _pin_lat,
    max(CASE WHEN is_primary_state THEN longitude END)                AS _pin_lon
  FROM workspace.hackathon.silver_pincode_directory
  GROUP BY pincode
),
-- centroid of every district (average of its PIN centroids) - used to tell a genuinely different district
-- from a neighbouring district of the same metro area (e.g. Hyderabad vs Ranga Reddy)
dist_centroid AS (
  SELECT d AS _cd, avg(latitude) AS _cd_lat, avg(longitude) AS _cd_lon
  FROM workspace.hackathon.silver_pincode_directory LATERAL VIEW explode(districts) e AS d
  WHERE latitude IS NOT NULL
  GROUP BY d
),
ref_lists AS (
  SELECT
    (SELECT collect_set(statename) FROM workspace.hackathon.silver_pincode_directory)                                       AS _valid_states,
    (SELECT collect_set(d) FROM workspace.hackathon.silver_pincode_directory LATERAL VIEW explode(districts) e AS d)         AS _known_dists
),
ad1 AS (
  SELECT unique_id, address_line1, address_line2, address_line3, address_city, address_stateOrRegion, address_zipOrPostcode,
    CASE WHEN address_line1 IS NULL OR lower(trim(address_line1)) IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-') THEN NULL
         ELSE regexp_replace(trim(address_line1), '\\s+', ' ') END AS _l1,
    CASE WHEN address_line2 IS NULL OR lower(trim(address_line2)) IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-') THEN NULL
         ELSE regexp_replace(trim(address_line2), '\\s+', ' ') END AS _l2,
    CASE WHEN address_line3 IS NULL OR lower(trim(address_line3)) IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-') THEN NULL
         ELSE regexp_replace(trim(address_line3), '\\s+', ' ') END AS _l3,
    CASE WHEN address_city IS NULL OR lower(trim(address_city)) IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-') THEN NULL
         ELSE regexp_replace(trim(address_city), '\\s+', ' ') END AS _city,
    CASE WHEN address_stateOrRegion IS NULL OR lower(trim(address_stateOrRegion)) IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-') THEN NULL
         ELSE upper(regexp_replace(trim(address_stateOrRegion), '\\s+', ' ')) END AS _st_u,
    CASE WHEN address_zipOrPostcode IS NULL OR lower(trim(address_zipOrPostcode)) IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-') THEN NULL
         ELSE trim(address_zipOrPostcode) END AS _zip_raw
  FROM stage2
),
ad2 AS (
  SELECT *,
    -- zip field as a clean 6-digit PIN (spaces / hyphens removed): '201 301' -> 201301
    CASE WHEN regexp_replace(coalesce(_zip_raw, ''), '[\\s-]', '') RLIKE '^[1-9][0-9]{5}$'
         THEN cast(regexp_replace(_zip_raw, '[\\s-]', '') AS BIGINT) END AS _zip6,
    -- every 6-digit token inside the zip field (e.g. '144005, 144008, 144001')
    transform(regexp_extract_all(coalesce(_zip_raw, ''), '(?<![0-9])([1-9][0-9]{5})(?![0-9])', 1), x -> cast(x AS BIGINT)) AS _zip_tokens,
    -- every 6-digit PIN written inside the address lines ('560 034' joined to 560034 first)
    array_distinct(transform(
      regexp_extract_all(
        regexp_replace(concat_ws(' , ', _l1, _l2, _l3), '(?<![0-9])([1-9][0-9]{2}) ([0-9]{3})(?![0-9])', '$1$2'),
        '(?<![0-9])([1-9][0-9]{5})(?![0-9])', 1),
      x -> cast(x AS BIGINT))) AS _line_pins,
    -- state candidates: the whole value and the text after the last comma ('Ghaziabad, Uttar Pradesh'), alias-mapped
    transform(array(_st_u, trim(element_at(split(_st_u, ','), -1))), s -> CASE
        WHEN s IS NULL THEN NULL
        WHEN s RLIKE '^(TAMILNADU|TAMIL NADU|TN)$'                                         THEN 'TAMIL NADU'
        WHEN s RLIKE '^(ORISSA|ODISHA)$'                                                  THEN 'ODISHA'
        WHEN s RLIKE '^(UP|U\\.? ?P\\.?|UTTAR PRADESH|UTTARPRADESH)$'                     THEN 'UTTAR PRADESH'
        WHEN s RLIKE '^(MP|M\\.? ?P\\.?|MADHYA PRADESH|MADHYAPRADESH|MADHYA)$'            THEN 'MADHYA PRADESH'
        WHEN s RLIKE '^(CG|CHATTISGARH|CHHATTISGARH|CHATTISGADH|CHHATISGARH)$'            THEN 'CHHATTISGARH'
        WHEN s RLIKE '^(PONDICHERRY|PUDUCHERRY|U\\.?T\\.? OF PUDUCHERRY)$'                THEN 'PUDUCHERRY'
        WHEN s RLIKE '^(DELHI|NEW DELHI|DL|NCT|NCT DELHI|NCT OF DELHI|DELHI NCR|DELHI/NCR|NCR-DELHI|NCR DELHI|(EAST|WEST|NORTH|SOUTH|CENTRAL) DELHI)$' THEN 'DELHI'
        WHEN s RLIKE '^(JAMMU AND KASHMIR|JAMMU & KASHMIR|J&K|J & K|JAMMU, J&K|KASHMIR)$'  THEN 'JAMMU AND KASHMIR'
        WHEN s RLIKE '^(UTTARANCHAL|UTTRANCHAL|UTTARAKHAND|UTTRAKHAND)$'                             THEN 'UTTARAKHAND'
        WHEN s RLIKE '^(MH|MAHARASHTRA|MAHARASTRA)$'                                      THEN 'MAHARASHTRA'
        WHEN s RLIKE '^(GJ|GUJARAT|GUJRAT)$'                                              THEN 'GUJARAT'
        WHEN s RLIKE '^(PUNJAB|PUNJAB REGION)$'                                           THEN 'PUNJAB'
        WHEN s RLIKE '^(CHANDIGARH|CHANDIGARH \\(UT\\)|CHANDIGARH UT)$'                    THEN 'CHANDIGARH'
        WHEN s RLIKE '^(BR|BIHAR)$'                                                       THEN 'BIHAR'
        WHEN s RLIKE '^(KA|KARNATAKA)$'                                                   THEN 'KARNATAKA'
        WHEN s RLIKE '^(KL|KERALA)$'                                                      THEN 'KERALA'
        WHEN s RLIKE '^(WB|WEST BENGAL)$'                                                 THEN 'WEST BENGAL'
        WHEN s RLIKE '^(HR|HARYANA)$'                                                     THEN 'HARYANA'
        WHEN s RLIKE '^(RJ|RAJASTHAN)$'                                                   THEN 'RAJASTHAN'
        WHEN s RLIKE '^(AP|ANDHRA PRADESH)$'                                              THEN 'ANDHRA PRADESH'
        WHEN s RLIKE '^(TS|TG|TELANGANA)$'                                                THEN 'TELANGANA'
        WHEN s RLIKE 'DADRA|DAMAN'                                                        THEN 'THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU'
        WHEN s RLIKE '^ANDAMAN'                                                           THEN 'ANDAMAN AND NICOBAR ISLANDS'
        ELSE s END) AS _st_cands,
    -- city mapped to the directory's district spelling for common renamed / alternate names
    CASE upper(_city)
      WHEN 'BANGALORE' THEN 'BENGALURU' WHEN 'GURGAON' THEN 'GURUGRAM' WHEN 'MOHALI' THEN 'S.A.S NAGAR'
      WHEN 'BOMBAY' THEN 'MUMBAI' WHEN 'CALCUTTA' THEN 'KOLKATA' WHEN 'TRIVANDRUM' THEN 'THIRUVANANTHAPURAM'
      WHEN 'ALLAHABAD' THEN 'PRAYAGRAJ' WHEN 'VIZAG' THEN 'VISAKHAPATNAM' WHEN 'COCHIN' THEN 'ERNAKULAM'
      WHEN 'KOCHI' THEN 'ERNAKULAM' WHEN 'MYSORE' THEN 'MYSURU' WHEN 'MANGALORE' THEN 'DAKSHINA KANNADA'
      WHEN 'BELGAUM' THEN 'BELAGAVI' WHEN 'GULBARGA' THEN 'KALABURAGI' WHEN 'NAVI MUMBAI' THEN 'THANE'
      WHEN 'NOIDA' THEN 'GAUTAM BUDDHA NAGAR' WHEN 'GREATER NOIDA' THEN 'GAUTAM BUDDHA NAGAR'
      WHEN 'PONDICHERRY' THEN 'PUDUCHERRY'
      ELSE upper(_city) END AS _city_u,
    -- raw comparison keys (lower-case, alphanumerics only)
    trim(regexp_replace(lower(coalesce(_l1, '')),   '[^a-z0-9]+', ' ')) AS _rk1,
    trim(regexp_replace(lower(coalesce(_l2, '')),   '[^a-z0-9]+', ' ')) AS _rk2,
    trim(regexp_replace(lower(coalesce(_l3, '')),   '[^a-z0-9]+', ' ')) AS _rk3,
    trim(regexp_replace(lower(coalesce(_city, '')), '[^a-z0-9]+', ' ')) AS _kc,
    trim(regexp_replace(lower(coalesce(_st_u, '')), '[^a-z0-9]+', ' ')) AS _ks,
    -- address lines with PINs (and 'Pin Code -' labels) removed, punctuation tidied
    transform(array(_l1, _l2, _l3), x -> nullif(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(x, ''),
              '(?i)[\\s,]*(-\\s*)?(pin(\\s*code)?\\s*[:.\\-]?\\s*)?(?<![0-9])[1-9][0-9]{2} ?[0-9]{3}(?![0-9])', ''),
            '(\\s*,\\s*){2,}', ', '),
          '^[\\s,.;:\\-–]+|[\\s,.;:\\-–(]+$', ''),
        '\\s+', ' '),
      '')) AS _sl
  FROM ad1
),
-- ---------- choose the PIN: directory-verified candidate first (zip field, then zip tokens, then lines), else first well-formed ----------
pin_cands AS (
  SELECT unique_id, pos, p
  FROM ad2 LATERAL VIEW posexplode(filter(concat(array(_zip6), _zip_tokens, _line_pins), x -> x IS NOT NULL)) t AS pos, p
),
pin_pick AS (
  SELECT c.unique_id,
         min_by(c.p, CASE WHEN r.pincode IS NOT NULL THEN c.pos ELSE 100000 + c.pos END) AS _best_pin,
         max(r.pincode IS NOT NULL)                                                        AS _best_in_dir
  FROM pin_cands c
  LEFT JOIN (SELECT DISTINCT pincode FROM workspace.hackathon.silver_pincode_directory) r ON r.pincode = c.p
  GROUP BY c.unique_id
),
ad3 AS (
  SELECT a.*,
    pp._best_pin,
    coalesce(pp._best_in_dir, false)                     AS _pin_in_dir,
    pr._pin_states, pr._pin_primary_state, pr._pin_districts, pr._pin_st_dist,
    (zr.pincode IS NOT NULL)                             AS _zip6_in_dir,
    -- km between the PIN's centre and the centre of the district named in address_city (NULL if either unknown)
    2 * 6371 * asin(sqrt(pow(sin(radians(dc._cd_lat - pr._pin_lat) / 2), 2)
      + cos(radians(pr._pin_lat)) * cos(radians(dc._cd_lat)) * pow(sin(radians(dc._cd_lon - pr._pin_lon) / 2), 2))) AS _city_pin_km,
    rl._valid_states, rl._known_dists,
    try_element_at(filter(a._st_cands, s -> array_contains(rl._valid_states, s)), 1) AS _st_res,
    -- stripped-line comparison keys
    trim(regexp_replace(lower(coalesce(a._sl[0], '')), '[^a-z0-9]+', ' ')) AS _k1,
    trim(regexp_replace(lower(coalesce(a._sl[1], '')), '[^a-z0-9]+', ' ')) AS _k2,
    trim(regexp_replace(lower(coalesce(a._sl[2], '')), '[^a-z0-9]+', ' ')) AS _k3
  FROM ad2 a
  LEFT JOIN pin_pick pp ON pp.unique_id <=> a.unique_id
  LEFT JOIN pin_ref  pr ON pr.pincode = pp._best_pin AND coalesce(pp._best_in_dir, false)
  LEFT JOIN (SELECT DISTINCT pincode FROM workspace.hackathon.silver_pincode_directory) zr ON zr.pincode = a._zip6
  LEFT JOIN dist_centroid dc ON dc._cd = a._city_u
  CROSS JOIN ref_lists rl
),
ad4 AS (
  SELECT *,
    -- state to keep: facility state if it is one of the PIN's states; else the PIN's primary state; else the facility state if it is a real state
    CASE WHEN _pin_in_dir THEN CASE WHEN array_contains(_pin_states, _st_res) THEN _st_res ELSE _pin_primary_state END
         ELSE _st_res END AS _state_chosen,
    -- a line is dropped when empty, equal to city/state, or (word-level) contained in a longer / earlier line
    (_k1 = '' OR _k1 = _kc OR _k1 = _ks
       OR (_k2 <> '' AND instr(concat(' ', _k2, ' '), concat(' ', _k1, ' ')) > 0 AND length(_k2) >  length(_k1))
       OR (_k3 <> '' AND instr(concat(' ', _k3, ' '), concat(' ', _k1, ' ')) > 0 AND length(_k3) >  length(_k1))) AS _d1,
    (_k2 = '' OR _k2 = _kc OR _k2 = _ks
       OR (_k1 <> '' AND instr(concat(' ', _k1, ' '), concat(' ', _k2, ' ')) > 0 AND length(_k1) >= length(_k2))
       OR (_k3 <> '' AND instr(concat(' ', _k3, ' '), concat(' ', _k2, ' ')) > 0 AND length(_k3) >  length(_k2))) AS _d2,
    (_k3 = '' OR _k3 = _kc OR _k3 = _ks
       OR (_k1 <> '' AND instr(concat(' ', _k1, ' '), concat(' ', _k3, ' ')) > 0 AND length(_k1) >= length(_k3))
       OR (_k2 <> '' AND instr(concat(' ', _k2, ' '), concat(' ', _k3, ' ')) > 0 AND length(_k2) >= length(_k3))) AS _d3
  FROM ad3
),
ad5 AS (
  SELECT *,
    CASE WHEN _d1 THEN NULL ELSE _sl[0] END AS _cl1,
    CASE WHEN _d2 THEN NULL ELSE _sl[1] END AS _cl2,
    CASE WHEN _d3 THEN NULL ELSE _sl[2] END AS _cl3
  FROM ad4
),
addr_out AS (
  SELECT
    unique_id,

    -- ================= ADDRESS FLAGS =================
    -- zip field present but not a 6-digit PIN after removing spaces / hyphens ('NAGPUR-10', '10', '000000', '4000050', lists)
    coalesce(_zip_raw IS NOT NULL AND _zip6 IS NULL, false)                                        AS flag_address_zipOrPostcode_invalid_format,
    -- zip field is a well-formed PIN but does not exist in the PIN directory
    coalesce(_zip6 IS NOT NULL AND NOT _zip6_in_dir, false)                                       AS flag_address_zipOrPostcode_not_in_directory,
    -- state field present but not a state / UT name even after alias mapping (e.g. 'Thane', 'Mumbai', 'Kutch')
    coalesce(_st_u IS NOT NULL AND _st_res IS NULL, false)                                         AS flag_address_stateOrRegion_not_a_state,
    -- state field is a real state, but not a state the (directory-verified) PIN belongs to
    coalesce(_pin_in_dir AND _st_res IS NOT NULL AND NOT array_contains(_pin_states, _st_res), false) AS flag_address_stateOrRegion_pin_mismatch,
    -- city is itself a district name in the directory, is not one of this PIN's districts,
    -- and that district's centre is > 50 km from the PIN's centre (so neighbouring districts of one metro are not flagged)
    coalesce(_pin_in_dir AND _city_u IS NOT NULL AND array_contains(_known_dists, _city_u)
             AND NOT exists(_pin_districts, d -> instr(d, _city_u) > 0 OR instr(_city_u, d) > 0)
             AND coalesce(_city_pin_km > 50, true), false) AS flag_address_city_pin_mismatch,
    -- a PIN written in the address lines differs from the zip field
    coalesce(_zip6 IS NOT NULL AND size(_line_pins) > 0 AND NOT array_contains(_line_pins, _zip6), false) AS flag_address_lines_pin_conflict,
    -- lines repeat each other (equal or word-level contained) or just repeat the city / state
    coalesce(
         (_rk1 <> '' AND _rk2 <> '' AND (instr(concat(' ', _rk1, ' '), concat(' ', _rk2, ' ')) > 0 OR instr(concat(' ', _rk2, ' '), concat(' ', _rk1, ' ')) > 0))
      OR (_rk1 <> '' AND _rk3 <> '' AND (instr(concat(' ', _rk1, ' '), concat(' ', _rk3, ' ')) > 0 OR instr(concat(' ', _rk3, ' '), concat(' ', _rk1, ' ')) > 0))
      OR (_rk2 <> '' AND _rk3 <> '' AND (instr(concat(' ', _rk2, ' '), concat(' ', _rk3, ' ')) > 0 OR instr(concat(' ', _rk3, ' '), concat(' ', _rk2, ' ')) > 0))
      OR (_kc <> '' AND (_rk1 = _kc OR _rk2 = _kc OR _rk3 = _kc))
      OR (_ks <> '' AND (_rk1 = _ks OR _rk2 = _ks OR _rk3 = _ks)), false)                    AS flag_address_lines_duplicated,

    -- ================= ADDRESS CLEAN VALUES =================
    _cl1 AS clean_address_line1,
    _cl2 AS clean_address_line2,
    _cl3 AS clean_address_line3,
    -- PIN: directory-verified candidate (zip field > zip tokens > PIN found in lines), else first well-formed one; NULL if none
    cast(_best_pin AS STRING) AS clean_pincode,
    -- state (upper-case, directory spelling): from the PIN when verified, else the alias-mapped state field; NULL if neither
    _state_chosen AS clean_state,
    -- district (upper-case, directory spelling) of the verified PIN for the chosen state; NULL if PIN not verified
    CASE WHEN _pin_in_dir THEN try_element_at(filter(_pin_st_dist, x -> x.st <=> _state_chosen), 1).dist END AS clean_district,
    -- full address: cleaned lines, city (if not already in the lines and not equal to the state), state, PIN
    nullif(concat_ws(', ',
      _cl1, _cl2, _cl3,
      CASE WHEN _kc <> ''
            AND NOT (instr(concat(' ', concat_ws(' ', CASE WHEN NOT _d1 THEN _k1 END, CASE WHEN NOT _d2 THEN _k2 END, CASE WHEN NOT _d3 THEN _k3 END), ' '), concat(' ', _kc, ' ')) > 0)
            AND _kc <> lower(coalesce(_state_chosen, ''))
           THEN _city END,
      regexp_replace(initcap(lower(_state_chosen)), ' And ', ' and '),
      cast(_best_pin AS STRING)), '') AS clean_address
  FROM ad5
)
stage3 AS (
SELECT
  s.*,
  a.* EXCEPT (unique_id)
FROM stage2 s
LEFT JOIN addr_out a ON a.unique_id <=> s.unique_id
),

-- =====================================================================
-- FACILITY TYPE / OPERATOR TYPE / AFFILIATIONS
--   operatorTypeId     = who owns / runs the facility (private / public)
--   affiliationTypeIds = institutions the facility is linked to (one entry per source page, so values repeat);
--                        'government' here usually means scheme empanelment / listing, NOT government ownership
-- =====================================================================
ty1 AS (
  SELECT *,
    CASE WHEN facilityTypeId IS NULL OR lower(trim(facilityTypeId)) IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-') THEN NULL
         ELSE lower(trim(facilityTypeId)) END AS _ft,
    CASE WHEN operatorTypeId IS NULL OR lower(trim(operatorTypeId)) IN ('', 'null', 'none', 'nan', 'n/a', 'na', '-') THEN NULL
         ELSE lower(trim(operatorTypeId)) END AS _opt,
    lower(coalesce(clean_name, name, '')) AS _nm,
    -- affiliation items: trimmed, lower-cased; NULL when the column is missing / not a list
    CASE WHEN trim(affiliationTypeIds) LIKE '[%'
         THEN transform(from_json(affiliationTypeIds, 'array<string>'), x -> lower(trim(coalesce(x, '')))) END AS _aff_items,
    -- government scheme / empanelment mentioned in the facility's own text
    coalesce(lower(concat_ws(' ', description, capability, procedure, specialties))
      RLIKE 'pm-?jay|ayushman|\\bcghs\\b|\\bechs\\b|\\besic?\\b|e\\.s\\.i\\.|empanel|government scheme|govt\\.? scheme|state health scheme|a?arogyasri|mjpjay|jeevandayee|cmchis|\\bbsky\\b|mahatma jyotiba|chief minister.{0,40}(insurance|scheme|health)', false) AS _scheme_txt,
    -- at least one source page on a government domain
    coalesce(exists(from_json(source_urls, 'array<string>'), u -> lower(u) RLIKE '\\.gov\\.in|\\.nic\\.in'), false) AS _gov_url
  FROM stage3
),
ty2 AS (
  SELECT *,
    -- valid vocabulary only ('farmacy' typo -> 'pharmacy'); anything else (junk from CSV-shifted rows) -> NULL
    CASE WHEN _ft = 'farmacy' THEN 'pharmacy'
         WHEN _ft IN ('hospital', 'clinic', 'dentist', 'doctor', 'pharmacy', 'nursing_home') THEN _ft
         ELSE NULL END AS _ft_clean,
    -- strict government-ownership name pattern (road / area names like "Civil Hospital Road" excluded)
    (_nm RLIKE '\\b(government|govt\\.?|civil hospital|district hospital|sub[- ]?divisional hospital|taluk hospital|community health cent|primary health cent|phc|chc|esic?|e\\.s\\.i|aiims|railway hospital|military hospital|command hospital|municipal|zilla)\\b'
      AND NOT _nm RLIKE '(civil|district) hospital (road|rd|marg|chowk)') AS _govt_name,
    -- strict dental words (also inside joined names like 'Sakhiyadentalclinic'; 'accidental' / 'incidental' excluded)
    (_nm RLIKE '(?<!acci|inci)dental|dentist|\\bdent|dento|orthodont|root canal|\\bteeth\\b|\\btooth\\b|\\boral\\b|\\b32\\b') AS _dental_name,
    -- broader dental hint, only used to accept a 'dentist' type ('dent' anywhere, smile, braces, aligners, MDS / BDS, implants, CBCT ...)
    (_nm RLIKE 'dent|orthodont|root canal|teeth|tooth|\\boral\\b|\\b32\\b|smile|braces|aligner|\\bmds\\b|\\bbds\\b|prostho|endodon|implant|cbct|ortho ?square|maxillofacial') AS _dental_hint,
    (_nm RLIKE '\\bhospitals?\\b') AS _hosp_name,
    (_nm RLIKE '\\b(clinic|clinics|polyclinic)\\b') AS _clinic_name,
    filter(_aff_items, x -> x <> '') AS _aff_nonempty,
    -- standard vocabulary after mapping the one synonym ('teaching-institute' -> 'academic')
    filter(transform(_aff_items, x -> CASE WHEN x = 'teaching-institute' THEN 'academic' ELSE x END),
           x -> x IN ('government', 'academic', 'philanthropy-legacy', 'faith-tradition', 'community')) AS _aff_std
  FROM ty1
),
ty3 AS (
  SELECT *,
    CASE WHEN _opt IN ('public', 'government') THEN 'public'
         WHEN _opt = 'private'                 THEN 'private'
         WHEN _opt IS NULL AND _govt_name      THEN 'public'
         ELSE NULL END AS _opt_clean,
    CASE WHEN size(_aff_std) > 0 THEN array_sort(array_distinct(_aff_std)) END AS _aff_clean
  FROM ty2
)
stage4 AS (
SELECT
  * EXCEPT (_ft, _opt, _nm, _aff_items, _scheme_txt, _gov_url, _ft_clean, _govt_name, _dental_name, _dental_hint, _hosp_name, _clinic_name,
            _aff_nonempty, _aff_std, _opt_clean, _aff_clean),

  -- ================= FACILITY TYPE FLAGS =================
  -- pharmacy (incl. the 'farmacy' typo): sells medicines, does not deliver care
  coalesce(_ft_clean = 'pharmacy', false)                                                            AS flag_facilityTypeId_not_a_care_facility,
  -- an individual doctor, not a facility
  coalesce(_ft_clean = 'doctor', false)                                                              AS flag_facilityTypeId_individual_practitioner,
  -- the name contradicts the type: "...Hospital" typed clinic, "...Clinic" typed hospital,
  -- dental name typed clinic/doctor, or typed dentist with no dental hint at all in the name
  coalesce(_ft_clean IS NOT NULL AND _nm <> '' AND (
        (_hosp_name AND NOT _clinic_name AND _ft_clean = 'clinic')
     OR (_clinic_name AND NOT _hosp_name AND _ft_clean = 'hospital')
     OR (_dental_name AND NOT _hosp_name AND _ft_clean IN ('clinic', 'doctor'))
     OR (_ft_clean = 'dentist' AND NOT _dental_hint)), false)                                        AS flag_facilityTypeId_name_mismatch,

  -- ================= OPERATOR TYPE FLAGS =================
  -- clearly government-run name (Civil / District Hospital, PHC, CHC, ESIC, AIIMS, Govt ...) but operator = private
  coalesce(_opt = 'private' AND _govt_name, false)                                                   AS flag_operatorTypeId_govt_name_but_private,

  -- ================= AFFILIATION FLAGS =================
  -- the same value appears more than once (one entry per source page)
  coalesce(size(_aff_nonempty) > size(array_distinct(_aff_nonempty)), false)                          AS flag_affiliationTypeIds_has_duplicates,
  -- any item outside the standard vocabulary (empty strings, accreditation bodies, 'private', 'public', noise words)
  coalesce(exists(_aff_items, x -> x NOT IN ('government', 'academic', 'philanthropy-legacy', 'faith-tradition', 'community')), false) AS flag_affiliationTypeIds_nonstandard_value,
  -- privately operated but affiliated with government (usually scheme empanelment - descriptive, not an error)
  coalesce(_opt_clean = 'private' AND array_contains(_aff_clean, 'government'), false)                AS flag_affiliationTypeIds_private_with_govt_affiliation,
  -- government affiliation on a non-public facility with no scheme text and no .gov.in / .nic.in source page
  coalesce(array_contains(_aff_clean, 'government') AND NOT (_opt_clean <=> 'public')
           AND NOT _scheme_txt AND NOT _gov_url, false)                                               AS flag_affiliationTypeIds_govt_unsupported,

  -- ================= CLEAN VALUES =================
  -- facility type: hospital | clinic | dentist | doctor | pharmacy | nursing_home ('farmacy' -> 'pharmacy'); missing / 'null' / junk -> NULL
  _ft_clean   AS clean_facility_type,
  -- operator: private | public ('government' merged into 'public'); missing -> 'public' only for clearly government names, else NULL
  _opt_clean  AS clean_operator_type,
  -- affiliations: distinct, sorted, standard vocabulary only; NULL when missing or nothing standard left
  _aff_clean  AS clean_affiliations,
  -- TRUE when the facility's own text mentions a government health scheme / empanelment (PM-JAY, CGHS, ESI, state schemes)
  _scheme_txt AS govt_scheme_evidence
FROM ty3
),

-- =====================================================================
-- NUMERIC / DATE / BOOLEAN COLUMNS
-- area, numberDoctors, capacity, distinct_social_media_presence_count, number_of_facts_about_the_organization,
-- post_metrics_post_count, engagement_metrics_n_likes / n_engagements / n_followers,
-- affiliated_staff_presence, custom_logo_presence, recency_of_page_update, post_metrics_most_recent_social_media_post_date
--   * all raw columns are STRING; clean_* columns are typed (BIGINT / BOOLEAN / DATE)
--   * rows that are not real facility rows (broken CSV fragments) get NULL in every clean_* column here
--   * relative dates ('2 months ago', '9h', 'April 9') are resolved against an anchor date =
--     the most recent valid ISO post date in the data (proxy for the scrape date)
-- =====================================================================
num1 AS (
  SELECT st.*,
    a._anchor,
    (st.organization_type <=> 'facility')                                                     AS _isfac,
    try_cast(trim(st.area) AS BIGINT)                                                          AS _area,
    try_cast(trim(st.numberDoctors) AS BIGINT)                                                 AS _docs,
    try_cast(trim(st.capacity) AS BIGINT)                                                      AS _beds,
    try_cast(trim(st.distinct_social_media_presence_count) AS BIGINT)                          AS _soc,
    try_cast(trim(st.number_of_facts_about_the_organization) AS BIGINT)                        AS _facts,
    try_cast(trim(st.post_metrics_post_count) AS BIGINT)                                       AS _posts,
    try_cast(trim(st.engagement_metrics_n_likes) AS BIGINT)                                    AS _likes,
    try_cast(trim(st.engagement_metrics_n_engagements) AS BIGINT)                              AS _eng,
    try_cast(trim(st.engagement_metrics_n_followers) AS BIGINT)                                AS _fol,
    coalesce(lower(trim(st.facebookLink)) NOT IN ('', 'null', 'none', 'nan'), false)            AS _has_fb,
    -- brand key = first word of the cleaned name (to tell a chain's shared page from an unrelated copy)
    regexp_extract(lower(coalesce(st.clean_name, st.name, '')), '([a-z0-9]+)', 1)               AS _brand
  FROM stage4 st
  CROSS JOIN (
    SELECT max(try_cast(post_metrics_most_recent_social_media_post_date AS DATE)) AS _anchor
    FROM stage4
    WHERE post_metrics_most_recent_social_media_post_date RLIKE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND try_cast(post_metrics_most_recent_social_media_post_date AS DATE) <= current_date()
  ) a
),
num2 AS (
  SELECT *,
    CASE
      WHEN recency_of_page_update IS NULL OR lower(trim(recency_of_page_update)) IN ('', 'null', 'none', 'nan') THEN NULL
      -- ISO date (future dates dropped)
      WHEN trim(recency_of_page_update) RLIKE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN CASE WHEN try_cast(trim(recency_of_page_update) AS DATE) > current_date() THEN NULL ELSE try_cast(trim(recency_of_page_update) AS DATE) END
      -- relative values, counted back from the anchor date
      WHEN lower(trim(recency_of_page_update)) RLIKE '^[0-9]+ ?(h|hr|hrs|hour|hours|min|mins|minute|minutes)( ago)?$' THEN _anchor
      WHEN lower(trim(recency_of_page_update)) RLIKE '^[0-9]+ ?(d|day|days)( ago| before)?$'                     THEN date_sub(_anchor, cast(regexp_extract(lower(trim(recency_of_page_update)), '^([0-9]+)', 1) AS INT))
      WHEN lower(trim(recency_of_page_update)) RLIKE '^[0-9]+ ?(w|wk|wks|week|weeks)( ago| before)?$'            THEN date_sub(_anchor, 7 * cast(regexp_extract(lower(trim(recency_of_page_update)), '^([0-9]+)', 1) AS INT))
      WHEN lower(trim(recency_of_page_update)) RLIKE '^[0-9]+ ?(mo|month|months)( ago| before)?$'                THEN add_months(_anchor, -cast(regexp_extract(lower(trim(recency_of_page_update)), '^([0-9]+)', 1) AS INT))
      WHEN lower(trim(recency_of_page_update)) RLIKE '^[0-9]+ ?(y|yr|yrs|year|years)( ago| before)?$'            THEN add_months(_anchor, -12 * cast(regexp_extract(lower(trim(recency_of_page_update)), '^([0-9]+)', 1) AS INT))
      -- 'April 2025' -> first day of that month
      WHEN lower(trim(recency_of_page_update)) RLIKE '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* [0-9]{4}$'
        THEN try_to_date(concat_ws('-', regexp_extract(lower(trim(recency_of_page_update)), '([0-9]{4})', 1), cast(cast((instr('janfebmaraprmayjunjulaugsepoctnovdec', substr(regexp_extract(lower(trim(recency_of_page_update)), '([a-z]+)', 1), 1, 3)) + 2) / 3 AS INT) AS STRING), '1'), 'yyyy-M-d')
      -- day + month without a year ('April 9 at 5:54 AM', '13 March') -> latest such date not after the anchor
      WHEN lower(trim(recency_of_page_update)) RLIKE '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* [0-9]{1,2}( at .*)?$' OR lower(trim(recency_of_page_update)) RLIKE '^[0-9]{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*( at .*)?$'
        THEN CASE WHEN try_to_date(concat_ws('-', cast(year(_anchor) AS STRING), cast(cast((instr('janfebmaraprmayjunjulaugsepoctnovdec', substr(regexp_extract(lower(trim(recency_of_page_update)), '([a-z]+)', 1), 1, 3)) + 2) / 3 AS INT) AS STRING), cast(cast(regexp_extract(lower(trim(recency_of_page_update)), '([0-9]{1,2})', 1) AS INT) AS STRING)), 'yyyy-M-d') > _anchor THEN add_months(try_to_date(concat_ws('-', cast(year(_anchor) AS STRING), cast(cast((instr('janfebmaraprmayjunjulaugsepoctnovdec', substr(regexp_extract(lower(trim(recency_of_page_update)), '([a-z]+)', 1), 1, 3)) + 2) / 3 AS INT) AS STRING), cast(cast(regexp_extract(lower(trim(recency_of_page_update)), '([0-9]{1,2})', 1) AS INT) AS STRING)), 'yyyy-M-d'), -12) ELSE try_to_date(concat_ws('-', cast(year(_anchor) AS STRING), cast(cast((instr('janfebmaraprmayjunjulaugsepoctnovdec', substr(regexp_extract(lower(trim(recency_of_page_update)), '([a-z]+)', 1), 1, 3)) + 2) / 3 AS INT) AS STRING), cast(cast(regexp_extract(lower(trim(recency_of_page_update)), '([0-9]{1,2})', 1) AS INT) AS STRING)), 'yyyy-M-d') END
      -- bare year or anything else: too vague -> NULL
      ELSE NULL END AS _recency_d,
    CASE
      WHEN post_metrics_most_recent_social_media_post_date IS NULL OR lower(trim(post_metrics_most_recent_social_media_post_date)) IN ('', 'null', 'none', 'nan') THEN NULL
      -- ISO date (future dates dropped)
      WHEN trim(post_metrics_most_recent_social_media_post_date) RLIKE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN CASE WHEN try_cast(trim(post_metrics_most_recent_social_media_post_date) AS DATE) > current_date() THEN NULL ELSE try_cast(trim(post_metrics_most_recent_social_media_post_date) AS DATE) END
      -- relative values, counted back from the anchor date
      WHEN lower(trim(post_metrics_most_recent_social_media_post_date)) RLIKE '^[0-9]+ ?(h|hr|hrs|hour|hours|min|mins|minute|minutes)( ago)?$' THEN _anchor
      WHEN lower(trim(post_metrics_most_recent_social_media_post_date)) RLIKE '^[0-9]+ ?(d|day|days)( ago| before)?$'                     THEN date_sub(_anchor, cast(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '^([0-9]+)', 1) AS INT))
      WHEN lower(trim(post_metrics_most_recent_social_media_post_date)) RLIKE '^[0-9]+ ?(w|wk|wks|week|weeks)( ago| before)?$'            THEN date_sub(_anchor, 7 * cast(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '^([0-9]+)', 1) AS INT))
      WHEN lower(trim(post_metrics_most_recent_social_media_post_date)) RLIKE '^[0-9]+ ?(mo|month|months)( ago| before)?$'                THEN add_months(_anchor, -cast(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '^([0-9]+)', 1) AS INT))
      WHEN lower(trim(post_metrics_most_recent_social_media_post_date)) RLIKE '^[0-9]+ ?(y|yr|yrs|year|years)( ago| before)?$'            THEN add_months(_anchor, -12 * cast(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '^([0-9]+)', 1) AS INT))
      -- 'April 2025' -> first day of that month
      WHEN lower(trim(post_metrics_most_recent_social_media_post_date)) RLIKE '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* [0-9]{4}$'
        THEN try_to_date(concat_ws('-', regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '([0-9]{4})', 1), cast(cast((instr('janfebmaraprmayjunjulaugsepoctnovdec', substr(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '([a-z]+)', 1), 1, 3)) + 2) / 3 AS INT) AS STRING), '1'), 'yyyy-M-d')
      -- day + month without a year ('April 9 at 5:54 AM', '13 March') -> latest such date not after the anchor
      WHEN lower(trim(post_metrics_most_recent_social_media_post_date)) RLIKE '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* [0-9]{1,2}( at .*)?$' OR lower(trim(post_metrics_most_recent_social_media_post_date)) RLIKE '^[0-9]{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*( at .*)?$'
        THEN CASE WHEN try_to_date(concat_ws('-', cast(year(_anchor) AS STRING), cast(cast((instr('janfebmaraprmayjunjulaugsepoctnovdec', substr(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '([a-z]+)', 1), 1, 3)) + 2) / 3 AS INT) AS STRING), cast(cast(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '([0-9]{1,2})', 1) AS INT) AS STRING)), 'yyyy-M-d') > _anchor THEN add_months(try_to_date(concat_ws('-', cast(year(_anchor) AS STRING), cast(cast((instr('janfebmaraprmayjunjulaugsepoctnovdec', substr(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '([a-z]+)', 1), 1, 3)) + 2) / 3 AS INT) AS STRING), cast(cast(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '([0-9]{1,2})', 1) AS INT) AS STRING)), 'yyyy-M-d'), -12) ELSE try_to_date(concat_ws('-', cast(year(_anchor) AS STRING), cast(cast((instr('janfebmaraprmayjunjulaugsepoctnovdec', substr(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '([a-z]+)', 1), 1, 3)) + 2) / 3 AS INT) AS STRING), cast(cast(regexp_extract(lower(trim(post_metrics_most_recent_social_media_post_date)), '([0-9]{1,2})', 1) AS INT) AS STRING)), 'yyyy-M-d') END
      -- bare year or anything else: too vague -> NULL
      ELSE NULL END AS _post_d
  FROM num1
),
-- exact follower counts (>= 1,000 with >= 4 significant digits, i.e. not platform-rounded like '1.8K' = 1800)
-- used by facilities of 2+ different brands
fol_share AS (
  SELECT _fol, count(DISTINCT _brand) AS _n_brands
  FROM num1
  WHERE _isfac AND _fol >= 1000 AND length(regexp_replace(cast(_fol AS STRING), '0+$', '')) >= 4
  GROUP BY _fol
)
stage5 AS (
SELECT
  n.* EXCEPT (_anchor, _isfac, _area, _docs, _beds, _soc, _facts, _posts, _likes, _eng, _fol, _has_fb, _brand, _recency_d, _post_d),

  -- ================= NUMERIC / DATE FLAGS =================
  -- 0 doctors, > 3,000 doctors, or exactly 1 doctor at a hospital with >= 50 beds
  coalesce(n._isfac AND (n._docs = 0 OR n._docs > 3000
           OR (n._docs = 1 AND n.clean_facility_type = 'hospital' AND n._beds >= 50)), false)          AS flag_numberDoctors_implausible,
  -- 0 beds or > 5,000 beds
  coalesce(n._isfac AND (n._beds = 0 OR n._beds > 5000), false)                                        AS flag_capacity_implausible,
  -- > 50 beds at a clinic, dentist or individual doctor
  coalesce(n._isfac AND n._beds > 50 AND n.clean_facility_type IN ('clinic', 'dentist', 'doctor'), false) AS flag_capacity_vs_facility_type,
  -- more than 3x as many doctors as beds
  coalesce(n._isfac AND n._beds > 0 AND n._docs > 3 * n._beds, false)                                 AS flag_numberDoctors_exceeds_capacity,
  -- page-update date given as text / bare year, or in the future
  coalesce(n._isfac AND coalesce(NOT (n.recency_of_page_update IS NULL OR lower(trim(n.recency_of_page_update)) IN ('', 'null', 'none', 'nan'))
           AND (NOT trim(n.recency_of_page_update) RLIKE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR try_cast(trim(n.recency_of_page_update) AS DATE) > current_date()), false), false)                         AS flag_recency_of_page_update_invalid,
  -- most-recent-post date given as text, or in the future
  coalesce(n._isfac AND coalesce(NOT (n.post_metrics_most_recent_social_media_post_date IS NULL OR lower(trim(n.post_metrics_most_recent_social_media_post_date)) IN ('', 'null', 'none', 'nan'))
           AND (NOT trim(n.post_metrics_most_recent_social_media_post_date) RLIKE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR try_cast(trim(n.post_metrics_most_recent_social_media_post_date) AS DATE) > current_date()), false), false) AS flag_post_date_invalid,
  -- >= 1M followers, or an exact follower count shared with facilities of another brand (copied from another page)
  coalesce(n._isfac AND (n._fol >= 1000000 OR fs._n_brands >= 2), false)                               AS flag_social_followers_shared_or_extreme,
  -- likes more than 10x followers
  coalesce(n._isfac AND n._fol > 0 AND n._likes > 10 * n._fol, false)                                  AS flag_social_likes_exceed_followers,
  -- 0 posts but a most-recent-post date, or posts > 0 but no post date at all
  coalesce(n._isfac AND ((n._posts = 0 AND n._post_d IS NOT NULL)
           OR (n._posts > 0 AND (n.post_metrics_most_recent_social_media_post_date IS NULL
                                 OR lower(trim(n.post_metrics_most_recent_social_media_post_date)) IN ('', 'null')))), false) AS flag_social_posts_date_conflict,
  -- social-presence count is 0 although followers / likes / posts or a Facebook link exist
  coalesce(n._isfac AND n._soc = 0 AND (n._fol > 0 OR n._likes > 0 OR n._posts > 0 OR n._has_fb), false) AS flag_social_count_conflict,
  -- facility row cut off mid-record: its trailing columns spilled into a broken CSV fragment row
  coalesce(n._isfac AND n.source_urls IS NULL AND n.area IS NULL AND n.engagement_metrics_n_likes IS NULL AND n.numberDoctors IS NULL, false) AS flag_row_truncated,

  -- ================= NUMERIC / DATE / BOOLEAN CLEAN VALUES =================
  CASE WHEN n._isfac AND n._area > 0 THEN n._area END                                                   AS clean_area,
  CASE WHEN n._isfac AND n._docs BETWEEN 1 AND 3000 THEN n._docs END                                    AS clean_number_doctors,
  CASE WHEN n._isfac AND n._beds BETWEEN 1 AND 5000 THEN n._beds END                                    AS clean_capacity,
  CASE WHEN n._isfac AND n._soc   >= 0 THEN n._soc   END                                                 AS clean_distinct_social_count,
  CASE WHEN n._isfac AND n._facts >= 0 THEN n._facts END                                                 AS clean_number_of_facts,
  CASE WHEN n._isfac AND n._posts >= 0 THEN n._posts END                                                 AS clean_post_count,
  CASE WHEN n._isfac AND n._likes >= 0 THEN n._likes END                                                 AS clean_n_likes,
  CASE WHEN n._isfac AND n._eng   >= 0 THEN n._eng   END                                                 AS clean_n_engagements,
  CASE WHEN n._isfac AND n._fol   >= 0 THEN n._fol   END                                                 AS clean_n_followers,
  CASE WHEN n._isfac AND lower(trim(n.affiliated_staff_presence)) = 'true'  THEN true
       WHEN n._isfac AND lower(trim(n.affiliated_staff_presence)) = 'false' THEN false END              AS clean_affiliated_staff_presence,
  CASE WHEN n._isfac AND lower(trim(n.custom_logo_presence)) = 'true'  THEN true
       WHEN n._isfac AND lower(trim(n.custom_logo_presence)) = 'false' THEN false END                   AS clean_custom_logo_presence,
  CASE WHEN n._isfac THEN n._recency_d END                                                              AS clean_recency_of_page_update,
  CASE WHEN n._isfac THEN n._post_d END                                                                 AS clean_most_recent_post_date

FROM num2 n
LEFT JOIN fol_share fs ON fs._fol = n._fol
),

-- =====================================================================
-- TEXT COLUMNS: description, specialties, procedure, equipment, capability
--   * specialties are mapped with the team-curated table ref_specialty_mapping
--     (built from specialty_mapping.json by ref_specialty_mapping.sql); values mapped to [] are dropped
--   * clean list columns: distinct, no empty items, no LLM "nothing found" placeholders
--   * broken CSV fragment rows (organization_type <> 'facility') get NULL clean values and FALSE flags
-- =====================================================================
spec_vocab AS (
  SELECT collect_set(s) AS _vocab FROM workspace.hackathon.ref_specialty_mapping LATERAL VIEW explode(std_specialties) e AS s
),
spec_map AS (
  SELECT t.unique_id, array_sort(array_distinct(flatten(collect_list(m.std_specialties)))) AS _spec_std
  FROM (SELECT unique_id, explode(array_distinct(from_json(specialties, 'array<string>'))) AS x
        FROM stage5 WHERE organization_type <=> 'facility') t
  JOIN workspace.hackathon.ref_specialty_mapping m ON m.raw_specialty = t.x
  GROUP BY t.unique_id
),
desc_counts AS (
  SELECT lower(trim(description)) AS _dk, count(*) AS _dn
  FROM stage5 WHERE organization_type <=> 'facility' AND description IS NOT NULL
  GROUP BY 1
),
tx1 AS (
  SELECT s.*,
    (s.organization_type <=> 'facility')                       AS _isf,
    from_json(s.specialties, 'array<string>')                   AS _sp_raw,
    from_json(s.procedure,   'array<string>')                   AS _pr_raw,
    from_json(s.equipment,   'array<string>')                   AS _eq_raw,
    from_json(s.capability,  'array<string>')                   AS _ca_raw,
    sm._spec_std,
    sv._vocab,
    dc._dn,
    lower(coalesce(s.clean_name, s.name, ''))                   AS _nm,
    regexp_extract(lower(coalesce(s.clean_name, s.name, '')), '^([a-z]{4,})', 1) AS _nm_tok,
    lower(coalesce(s.description, ''))                          AS _ld
  FROM stage5 s
  LEFT JOIN spec_map sm  ON sm.unique_id <=> s.unique_id
  LEFT JOIN desc_counts dc ON dc._dk = lower(trim(s.description)) AND s.organization_type <=> 'facility'
  CROSS JOIN spec_vocab sv
),
tx2 AS (
  SELECT *,
    -- items with nulls / blanks / LLM placeholders removed, de-duplicated
    array_distinct(filter(transform(_pr_raw, x -> trim(x)), x -> x IS NOT NULL AND x <> '' AND NOT lower(x) RLIKE '(in|from) the provided (content|text)|no (specific|explicit) [a-z ]{0,40}(listed|mentioned|found|provided|available)|not (explicitly )?(mentioned|listed|specified) in|does not (have|list|mention) any')) AS _pr_c,
    array_distinct(filter(transform(_eq_raw, x -> trim(x)), x -> x IS NOT NULL AND x <> '' AND NOT lower(x) RLIKE '(in|from) the provided (content|text)|no (specific|explicit) [a-z ]{0,40}(listed|mentioned|found|provided|available)|not (explicitly )?(mentioned|listed|specified) in|does not (have|list|mention) any'
                                                     AND NOT lower(x) RLIKE '^(provides|offers|performs|treats|conducts|has |is |located)'))                                   AS _eq_c,
    array_distinct(filter(transform(_ca_raw, x -> trim(x)), x -> x IS NOT NULL AND x <> '' AND NOT lower(x) RLIKE '(in|from) the provided (content|text)|no (specific|explicit) [a-z ]{0,40}(listed|mentioned|found|provided|available)|not (explicitly )?(mentioned|listed|specified) in|does not (have|list|mention) any'
                                                     AND NOT lower(x) RLIKE '\\blocated (in|at)\\b|\\baddress\\b|\\bpin ?code\\b|\\+91|\\b[0-9]{10}\\b|\\bphone\\b|\\bcontact\\b|e-?mail|\\bopen (24|all)|\\btimings?\\b|\\b[0-9]{1,2} ?(am|pm)\\b|monday|sunday|walk-?ins?|staffed by|\\bemploys\\b|\\bdr\\.? [a-z]+ [a-z]+|facebook|instagram|twitter|youtube|google review|\\breviews?\\b|\\brating\\b|\\bfounded\\b|\\bestablished\\b|since [12][0-9]{3}|company size|employees|industry:|type: |incorporated|listed (as|in|under|on)|is listed|directory|headquartered'
                                                     AND NOT lower(x) RLIKE 'is listed as a referral|referral hospital outside|listed under .* scheme'))                                     AS _ca_c,
    -- bed count written in capability / equipment / description text
    try_cast(regexp_extract(lower(concat_ws(' ', concat_ws(' ', _ca_raw), concat_ws(' ', _eq_raw), description)), '([0-9]{2,5})[ -]?(bedded|beds?)\\b', 1) AS INT) AS _beds_txt,
    -- description: literal \n escapes and extra spaces removed
    nullif(trim(regexp_replace(regexp_replace(coalesce(description, ''), '\\\\[nrt]', ' '), '\\s+', ' ')), '') AS _desc_c
  FROM tx1
),
tx3 AS (
  SELECT *,
    (_desc_c IS NULL OR lower(_desc_c) IN ('null', 'none', 'nan') OR lower(_desc_c) = _nm
       OR (lower(_desc_c) RLIKE '^[a-z&.,\\- ]{1,30}$' AND size(split(trim(regexp_replace(_desc_c, '[^A-Za-z ]', ' ')), ' +')) <= 3)) AS _desc_uninf
  FROM tx2
)
stage6 AS (
SELECT
  * EXCEPT (_isf, _sp_raw, _pr_raw, _eq_raw, _ca_raw, _spec_std, _vocab, _dn, _nm, _nm_tok, _ld, _pr_c, _eq_c, _ca_c, _beds_txt, _desc_c, _desc_uninf),

  -- ================= TEXT FLAGS =================
  -- lists cut off at 50 items by the extraction (incomplete)
  coalesce(_isf AND size(_sp_raw) = 50, false)                                                       AS flag_specialties_truncated_50,
  coalesce(_isf AND size(_pr_raw) = 50, false)                                                       AS flag_procedure_truncated_50,
  coalesce(_isf AND size(_eq_raw) = 50, false)                                                       AS flag_equipment_truncated_50,
  coalesce(_isf AND size(_ca_raw) = 50, false)                                                       AS flag_capability_truncated_50,
  -- the same specialty value repeated in the raw list
  coalesce(_isf AND size(_sp_raw) > size(array_distinct(_sp_raw)), false)                           AS flag_specialties_has_duplicates,
  -- at least one raw specialty is not itself a standard specialty (needed mapping / spelling variant / free text)
  coalesce(_isf AND exists(_sp_raw, x -> x IS NOT NULL AND NOT array_contains(_vocab, x)), false)    AS flag_specialties_nonstandard_value,
  -- 15+ distinct standard specialties (merged-record / group-page risk)
  coalesce(_isf AND size(_spec_std) >= 15, false)                                                    AS flag_specialties_too_many,
  -- dentist with medical specialties, or eye-named facility with unrelated surgical specialties
  coalesce(_isf AND (
       (clean_facility_type = 'dentist' AND exists(_spec_std, x -> x IN ('cardiology','cardiothoracicSurgery','neurosurgery','neurology','urology','gynecology','obstetrics','orthopedics','gastroenterology','nephrology','oncology','ophthalmology','dermatology','psychiatry','otolaryngology','reproductiveMedicine')))
    OR (_nm RLIKE '\\b(eye|netra|nethra|nethralaya|netralaya|vision|ophthal)' AND exists(_spec_std, x -> x IN ('cardiology','cardiothoracicSurgery','neurosurgery','urology','gynecology','obstetrics','orthopedics','gastroenterology','nephrology')))), false) AS flag_specialties_type_mismatch,
  -- any LLM "nothing found" placeholder item in procedure / equipment / capability / description
  coalesce(_isf AND (exists(_pr_raw, x -> lower(x) RLIKE '(in|from) the provided (content|text)|no (specific|explicit) [a-z ]{0,40}(listed|mentioned|found|provided|available)|not (explicitly )?(mentioned|listed|specified) in|does not (have|list|mention) any') OR exists(_eq_raw, x -> lower(x) RLIKE '(in|from) the provided (content|text)|no (specific|explicit) [a-z ]{0,40}(listed|mentioned|found|provided|available)|not (explicitly )?(mentioned|listed|specified) in|does not (have|list|mention) any')
                     OR exists(_ca_raw, x -> lower(x) RLIKE '(in|from) the provided (content|text)|no (specific|explicit) [a-z ]{0,40}(listed|mentioned|found|provided|available)|not (explicitly )?(mentioned|listed|specified) in|does not (have|list|mention) any') OR _ld RLIKE '(in|from) the provided (content|text)|no (specific|explicit) [a-z ]{0,40}(listed|mentioned|found|provided|available)|not (explicitly )?(mentioned|listed|specified) in|does not (have|list|mention) any'), false)           AS flag_text_placeholder_items,
  -- equipment list contains services / facts ("Provides ...", "Offers ...", "Has ...")
  coalesce(_isf AND exists(_eq_raw, x -> lower(trim(x)) RLIKE '^(provides|offers|performs|treats|conducts|has |is |located)'), false)                      AS flag_equipment_contains_services,
  -- capability list contains location / contact / hours / staff / social / company / directory text
  coalesce(_isf AND exists(_ca_raw, x -> lower(x) RLIKE '\\blocated (in|at)\\b|\\baddress\\b|\\bpin ?code\\b|\\+91|\\b[0-9]{10}\\b|\\bphone\\b|\\bcontact\\b|e-?mail|\\bopen (24|all)|\\btimings?\\b|\\b[0-9]{1,2} ?(am|pm)\\b|monday|sunday|walk-?ins?|staffed by|\\bemploys\\b|\\bdr\\.? [a-z]+ [a-z]+|facebook|instagram|twitter|youtube|google review|\\breviews?\\b|\\brating\\b|\\bfounded\\b|\\bestablished\\b|since [12][0-9]{3}|company size|employees|industry:|type: |incorporated|listed (as|in|under|on)|is listed|directory|headquartered'), false)                                 AS flag_capability_contains_non_capability,
  -- capability text describes a different facility (referral / scheme listing naming another hospital)
  coalesce(_isf AND exists(_ca_raw, x -> lower(x) RLIKE 'is listed as a referral|referral hospital outside|listed under .* scheme' AND NOT (_nm_tok <> '' AND instr(lower(x), _nm_tok) > 0)), false) AS flag_capability_mentions_other_facility,
  -- cardiac surgery claimed by a clinic / dentist / individual doctor
  coalesce(_isf AND clean_facility_type IN ('clinic', 'dentist', 'doctor')
           AND lower(concat_ws(' ', concat_ws(' ', _pr_raw), concat_ws(' ', _ca_raw))) RLIKE 'bypass surgery|cabg|open heart|valve replacement|cardiac surgery', false) AS flag_procedure_type_mismatch,
  -- bed count in the text differs more than 2x from clean_capacity
  coalesce(_isf AND clean_capacity IS NOT NULL AND _beds_txt > 0
           AND (_beds_txt > 2 * clean_capacity OR clean_capacity > 2 * _beds_txt), false)              AS flag_capacity_text_conflict,
  -- description is missing / just the name / a 1-3 word type
  coalesce(_isf AND _desc_uninf, false)                                                               AS flag_description_uninformative,
  -- the exact same description appears on 3+ facilities
  coalesce(_isf AND _dn >= 3, false)                                                                  AS flag_description_boilerplate,
  -- description names a state different from clean_state (Telangana/Andhra and NCR overlaps ignored)
  coalesce(_isf AND clean_state IS NOT NULL AND NOT instr(upper(_ld), clean_state) > 0
           AND upper(_ld) RLIKE '\\b(MAHARASHTRA|GUJARAT|KARNATAKA|KERALA|TAMIL NADU|TELANGANA|ANDHRA PRADESH|WEST BENGAL|UTTAR PRADESH|MADHYA PRADESH|RAJASTHAN|BIHAR|ODISHA|PUNJAB|HARYANA|ASSAM|JHARKHAND|CHHATTISGARH|DELHI|GOA|UTTARAKHAND)\\b'
           AND NOT (clean_state IN ('TELANGANA', 'ANDHRA PRADESH') AND upper(_ld) RLIKE 'ANDHRA|TELANGANA')
           AND NOT (clean_state IN ('HARYANA', 'UTTAR PRADESH', 'DELHI') AND upper(_ld) RLIKE 'DELHI|HARYANA|UTTAR PRADESH'), false) AS flag_description_other_state,

  -- ================= TEXT CLEAN VALUES =================
  -- standard specialties from the curated mapping (distinct, sorted); NULL if none
  CASE WHEN _isf AND size(_spec_std) > 0 THEN _spec_std END                                         AS clean_specialties,
  CASE WHEN _isf AND size(_pr_c) > 0 THEN _pr_c END                                                 AS clean_procedures,
  CASE WHEN _isf AND size(_eq_c) > 0 THEN _eq_c END                                                 AS clean_equipment,
  CASE WHEN _isf AND size(_ca_c) > 0 THEN _ca_c END                                                 AS clean_capabilities,
  CASE WHEN _isf AND NOT _desc_uninf THEN _desc_c END                                                AS clean_description,
  -- bed count read from text, only where clean_capacity is missing (1..5000)
  CASE WHEN _isf AND clean_capacity IS NULL AND _beds_txt BETWEEN 1 AND 5000 THEN _beds_txt END     AS clean_capacity_from_text

FROM tx3
),

-- =====================================================================
-- COORDINATES: coordinates (GeoJSON Point, [lon, lat]), latitude, longitude
--   * reference location = silver_pincode_directory centroid of clean_pincode
--     (row for clean_state when the PIN spans states, else the PIN's primary-state row)
--   * distance = haversine (great-circle) km between the facility point and the PIN centroid
--   * clean point is NULL when coordinates are malformed, outside India, exactly (0, 0) or only 1-decimal precise
--   * broken CSV fragment rows: flags FALSE, values NULL
-- =====================================================================
co1 AS (
  SELECT s.*,
    (s.organization_type <=> 'facility')                                                    AS _isc,
    from_json(s.coordinates, 'struct<type:string,coordinates:array<double>>')                AS _g,
    (s.coordinates IS NULL OR lower(trim(s.coordinates)) IN ('', 'null', 'none', 'nan'))     AS _coord_str_missing
  FROM stage6 s
),
co2 AS (
  SELECT *,
    (latitude IS NULL AND longitude IS NULL AND _coord_str_missing)                         AS _c_missing,
    -- coordinates text present but not a 2-value GeoJSON Point, or disagreeing with latitude / longitude
    (NOT _coord_str_missing AND (_g IS NULL OR NOT (_g.type <=> 'Point') OR NOT (size(_g.coordinates) <=> 2)
       OR abs(_g.coordinates[1] - latitude) > 1e-4 OR abs(_g.coordinates[0] - longitude) > 1e-4
       OR (latitude IS NULL) <> (longitude IS NULL)))                                      AS _c_malformed,
    (latitude IS NOT NULL AND longitude IS NOT NULL
       AND NOT (latitude BETWEEN 6 AND 37.5 AND longitude BETWEEN 68 AND 97.5))            AS _c_outside,
    (latitude = 0 AND longitude = 0)                                                       AS _c_null_island,
    (latitude IS NOT NULL AND longitude IS NOT NULL
       AND latitude * 10 = round(latitude * 10) AND longitude * 10 = round(longitude * 10)) AS _c_low_prec
  FROM co1
),
pin_pt AS (
  -- one reference point per (pincode, state); plus the primary-state point per pincode
  SELECT pincode, statename, latitude AS _p_lat, longitude AS _p_lon, is_primary_state
  FROM workspace.hackathon.silver_pincode_directory
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
),
co3 AS (
  SELECT c.*,
    coalesce(ps._p_lat, pp._p_lat) AS _pin_lat,
    coalesce(ps._p_lon, pp._p_lon) AS _pin_lon
  FROM co2 c
  LEFT JOIN pin_pt ps ON ps.pincode = try_cast(c.clean_pincode AS BIGINT) AND ps.statename <=> c.clean_state
  LEFT JOIN pin_pt pp ON pp.pincode = try_cast(c.clean_pincode AS BIGINT) AND pp.is_primary_state
),
co4 AS (
  SELECT *,
    -- clean point: only when none of the coordinate defects apply
    CASE WHEN _isc AND NOT _c_malformed AND NOT _c_outside AND NOT coalesce(_c_null_island, false) AND NOT coalesce(_c_low_prec, false)
         THEN latitude END                                                                AS _clat,
    CASE WHEN _isc AND NOT _c_malformed AND NOT _c_outside AND NOT coalesce(_c_null_island, false) AND NOT coalesce(_c_low_prec, false)
         THEN longitude END                                                               AS _clon
  FROM co3
),
co5 AS (
  SELECT *,
    2 * 6371 * asin(sqrt(pow(sin(radians(_pin_lat - _clat) / 2), 2)
      + cos(radians(_clat)) * cos(radians(_pin_lat)) * pow(sin(radians(_pin_lon - _clon) / 2), 2))) AS _dist_km
  FROM co4
)
stage7 AS (
SELECT
  * EXCEPT (_isc, _g, _coord_str_missing, _c_missing, _c_malformed, _c_outside, _c_null_island, _c_low_prec,
            _pin_lat, _pin_lon, _clat, _clon, _dist_km),

  -- ================= COORDINATE FLAGS =================
  -- no latitude, no longitude and no coordinates text
  coalesce(_isc AND _c_missing, false)                                         AS flag_coordinates_missing,
  -- clean point is more than 50 km from the centroid of its clean_pincode
  coalesce(_isc AND _dist_km > 50, false)                                      AS flag_coordinates_far_from_pincode,

  -- ================= COORDINATE CLEAN VALUES =================
  -- facility point; NULL when missing or any coordinate defect applies
  _clat                                                                        AS clean_latitude,
  _clon                                                                        AS clean_longitude,
  -- haversine distance in km between (clean_latitude, clean_longitude) and the PIN centroid; NULL if either is missing
  CASE WHEN _isc THEN round(_dist_km, 3) END                                   AS distance_to_pincode_km

FROM co5
)

-- =====================================================================
-- FINAL OUTPUT: drop raw columns that now have a clean_* version, plus ID / lineage / constant columns
-- (flags and clean_* columns above were computed from these raw values before they are dropped)
-- =====================================================================
SELECT * EXCEPT (
  -- IDs / lineage / constant columns (unique_id is kept as the row key)
  source_ids, source_content_id, content_table_id, cluster_id, source_types, source, source_urls,
  websites, ingested_at, address_country, address_countryCode, countries, organization_type,
  -- raw columns replaced by clean_* columns
  name, email, officialWebsite, officialPhone, phone_numbers,
  address_line1, address_line2, address_line3, address_zipOrPostcode, address_stateOrRegion, address_city,
  facilityTypeId, operatorTypeId, affiliationTypeIds,
  area, numberDoctors, capacity, distinct_social_media_presence_count, number_of_facts_about_the_organization,
  post_metrics_post_count, engagement_metrics_n_likes, engagement_metrics_n_engagements, engagement_metrics_n_followers,
  affiliated_staff_presence, custom_logo_presence, recency_of_page_update, post_metrics_most_recent_social_media_post_date,
  specialties, procedure, equipment, capability, description,
  latitude, longitude, coordinates
)
FROM stage7;
