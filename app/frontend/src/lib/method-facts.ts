// Numbers shown on the "How it works" page. Each one was read from the Databricks tables in workspace.hackathon on
// 2026-11-22, or from docs/IMPLEMENTATION_NOTES.md and evaluation/EVAL_RESULTS.md. Keep the source next to
// each value so a reviewer can check it.

export const DATA = {
  bronzeRows: 10088, // bronze_facilities
  facilities: 10077, // silver_facilities (11 duplicate ids in bronze)
  silverColumns: 113,
  services: 9,
  cells: 90693, // facilities × 9 services, gold_service_scores
  quoteFailures: 0, // verbatim check, notebook run 5
  pinPoints: 19586, // silver_pincode_directory, is_primary_state
  pinOutliers: 206, // > 300 km from the median of their 3-digit prefix
  buildSeconds: 175,
  tablesBuilt: 17,
}

// silver_facility_clean / silver_facility_location / gold_facility_completeness
export const CLEANING = {
  truncated: 2078, // a list stops at exactly 50 items
  coordsFar: 1492, // flag_coordinates_far_from_pincode → PIN centre
  doctorsImplausible: 112, // flag_numberDoctors_implausible → unknown
}

// silver_facilities_v2.sql
export const CITY = {
  rawSpellings: 1643,
  cities: 1531,
  // real rows of silver_facilities_v2 (city_raw → clean_city)
  fixes: [
    { rule: "Old or other name", n: 466, example: ["Bangalore", "Bengaluru"] },
    { rule: "Locality removed", n: 107, example: ["Dombivli East", "Dombivli"] },
    { rule: "“City” suffix removed", n: 33, example: ["Ambala City", "Ambala"] },
    { rule: "One spelling", n: 20, example: ["Dehra Dun", "Dehradun"] },
    { rule: "Letter case", n: 15, example: ["Pimpri-chinchwad", "Pimpri-Chinchwad"] },
    { rule: "Locality, city", n: 2, example: ["Andheri West, Mumbai", "Mumbai"] },
  ],
  junkExample: ["null", "missing"],
  strayExample: ["Nagpur, with a Kerala address", "kept, but not used to place Nagpur"],
  junk: 35,
  strays: 36,
}

export const LOCATION = { exact: 8460, approximate: 1479, unknown: 138, medianPinRadiusKm: 5.9 }

// silver_claims
export const CLAIMS = {
  total: 405759,
  negated: 616,
  byField: [
    { field: "Capabilities", n: 178175 },
    { field: "Procedures", n: 156879 },
    { field: "Equipment", n: 50824 },
    { field: "Description", n: 19881 },
  ],
}

// gold_facility_features: facilities where the feature was found, and where a cut-off list leaves it unknown
export const FEATURES: { code: string; name: string; found: number; cut: number; kind: "general" | "care" }[] = [
  { code: "G1", name: "Facility type", found: 9932, cut: 0, kind: "general" },
  { code: "G14", name: "Year founded", found: 4781, cut: 0, kind: "general" },
  { code: "G2", name: "Number of doctors", found: 3516, cut: 0, kind: "general" },
  { code: "G5", name: "24/7 emergency", found: 3510, cut: 890, kind: "general" },
  { code: "G4", name: "Intensive care unit", found: 2752, cut: 1030, kind: "general" },
  { code: "G3", name: "Number of beds", found: 2690, cut: 0, kind: "general" },
  { code: "G7", name: "Operating theatre", found: 1895, cut: 1226, kind: "general" },
  { code: "G9", name: "Anaesthesia", found: 1877, cut: 1257, kind: "general" },
  { code: "G10", name: "Accreditation (NABH / JCI)", found: 1296, cut: 1459, kind: "general" },
  { code: "G6", name: "Ambulance", found: 1149, cut: 1593, kind: "general" },
  { code: "G8", name: "Blood bank", found: 561, cut: 1766, kind: "general" },
  { code: "G11", name: "Lab accreditation (NABL)", found: 350, cut: 1873, kind: "general" },
  { code: "S3", name: "Newborn intensive care", found: 1514, cut: 1477, kind: "care" },
  { code: "S8", name: "CT scanner", found: 1509, cut: 1325, kind: "care" },
  { code: "S11", name: "Chemotherapy", found: 1486, cut: 1402, kind: "care" },
  { code: "S7", name: "MRI scanner", found: 940, cut: 1580, kind: "care" },
  { code: "S5", name: "Cath lab", found: 478, cut: 1770, kind: "care" },
  { code: "S1", name: "Dialysis machines", found: 463, cut: 1835, kind: "care" },
  { code: "S10", name: "Radiotherapy", found: 355, cut: 1837, kind: "care" },
  { code: "S12", name: "Audiometry", found: 304, cut: 1932, kind: "care" },
  { code: "S9", name: "PET scanner", found: 275, cut: 1894, kind: "care" },
  { code: "S6", name: "Coronary care unit", found: 269, cut: 1942, kind: "care" },
  { code: "S4", name: "Neonatal equipment", found: 188, cut: 1991, kind: "care" },
  { code: "S2", name: "Labour room", found: 165, cut: 2004, kind: "care" },
]

// gold_service_scores, Hospitales CARE, Raipur × dialysis, searched from PIN 492001
export const WORKED = {
  name: "Hospitales CARE, Raipur",
  quote: "Dialysis treatment is provided using 25 dialysis machines.",
  E: [
    { part: "Direct claim in its procedures list", pts: 40 },
    { part: "Backed up: kidney specialty and dialysis machines", pts: 20 },
    { part: "Needed services present", pts: 20 },
    { part: "A number is given (25 machines)", pts: 10 },
  ],
  D: [
    { part: "Dialysis machines", pts: 35 },
    { part: "Facility type", pts: 20 },
    { part: "Intensive care (125 ICU beds)", pts: 15 },
    { part: "Beds (215)", pts: 8 },
    { part: "Everything else", pts: 10 },
  ],
  roadKm: 3.9,
  halfKm: 15,
  C: 90,
  weights: { E: 0.3, D: 0.1, A: 0.6 },
}

// gold_service_scores where passes_gate (7,436 facility × care pairs)
export const CONFIDENCE_SPLIT = { High: 1475, Medium: 4345, Low: 1616 }
export const LOW_REASONS = [
  { reason: "Location is only known to the PIN area, and the evidence is not Strong", n: 1028 },
  { reason: "Fewer than 4 in 10 of the supporting details could be checked", n: 769 },
  { reason: "The record is sparse overall", n: 7 },
]

// gold_facility_completeness
export const COMPLETENESS = {
  parts: [
    { part: "Clinical text (procedures, equipment, capabilities)", pts: 30 },
    { part: "Exact location", pts: 25 },
    { part: "Phone number", pts: 10 },
    { part: "Doctor count", pts: 10 },
    { part: "Bed count", pts: 10 },
    { part: "Recently updated", pts: 10 },
    { part: "Year founded", pts: 5 },
  ],
  bands: { rich: 5606, partial: 4268, sparse: 203 },
}

// silver_facilities flags, applied in the app (find_care_core.RECORD_CHECKS)
export const RECORD_CHECKS = [
  { check: "Describes itself as in another state", n: 25, cap: "Low" },
  { check: "Names another facility in its capabilities", n: 6, cap: "Low" },
  { check: "Description is template text", n: 451, cap: "Medium" },
  { check: "Specialties don't fit its type", n: 129, cap: "Medium" },
  { check: "State doesn't match its PIN code", n: 63, cap: "Medium" },
  { check: "Bed or doctor numbers implausible", n: 52, cap: "Medium" },
]
export const RECORD_CHECKS_ANY = 702

// evaluation/EVAL_RESULTS.md (83 queries, 1,422 blind judge packets)
export const EVAL = {
  queries: 83,
  packets: 1422,
  kappa: 0.82,
  systems: ["Our method", "Nearest keyword match", "Most mentions", "Biggest hospital"],
  rows: [
    { metric: "First result is backed by its own record", unit: "%", v: [100, 88, 93, 41], better: "high" },
    { metric: "Quotes appear word for word", unit: "%", v: [100, 100, 100, 38], better: "high" },
    { metric: "No hint-only place for urgent care", unit: "%", v: [100, 100, 100, 0], better: "high" },
    { metric: "Distance to the first result (median)", unit: " km", v: [61, 56, 116, 114], better: "low" },
    { metric: "Useful options within 25 km, per search", unit: "", v: [1.13, 1.13, 0.65, 0.22], better: "high" },
    { metric: "Ranking quality vs. reference (NDCG@5, held out)", unit: "", v: [0.777, 0.653, 0.836, 0.407], better: "high" },
  ],
}

export const APP_URL = "https://find-the-right-care-7474644416958437.aws.databricksapps.com"
