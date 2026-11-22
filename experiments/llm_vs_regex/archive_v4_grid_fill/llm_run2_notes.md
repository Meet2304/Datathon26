# LLM semantic fill: run 2 notes

- **Model:** `claude-opus-5-5` (Claude Opus 5.5), running as a sub-agent through Claude Code. No temperature control is exposed in this harness.
- **Start / end:** 2026-11-21 18:44 EST to 2026-11-21 18:49 EST (wall clock for the agent session; most of the time went on reading the records).
- **Method:** I read all 15 records in full from `facilities_15.json`. Every value was set by hand from that text. I did not use noisy-OR, shrinkage or weighted formulas, or any outside knowledge. A scratch script (kept outside this folder) only stores the hand-set values, writes the CSVs and checks the quotes.
- **Independence:** `llm_grid_run1.csv` and `llm_ranking_run1.csv` appeared in the folder while I was working. I did not open them.

## Quote check
- **101 quotes checked, 0 failed.** These are the 45 cells' primary and supporting quotes. A quote passes if it is a case-sensitive substring of the named field: one item of `procedure`, `equipment`, `capability` or `specialties`, or the `description` string. The only normalisation is trimming whitespace. The check ran twice: once on the in-memory data, and once by parsing `llm_grid_run2.csv` back from disk.
- 9 cells, all with tier `None`, have no quote because the record has nothing relevant.

## Databricks spot-check (read-only, `SELECT` only)
- Table: `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities`.
- **All 15 `unique_id`s exist, with exactly 1 row each,** and the names match the JSON.
- **3 facilities checked against the source: AIIMS (`e43a21d0…`), Vidya (`78bed667…`) and Vasudev (`702a22a9…`).** For each, the `description` length and md5 are identical to the JSON. The list lengths for procedure, equipment, capability and specialties also match: AIIMS 14/11/50/50, Vidya 1/0/9/41, Vasudev 0/0/1/21. **No mismatches.**

## Decisions on ambiguous cases
- **Lists capped at 50 items (CARE, MMI, AIIMS, Sanjeevani, Suyash specialties/capability):** I read them as possibly truncated. For a service that is absent from a capped list, I did not treat the absence as strong evidence that the service is missing, but I also did not invent support. For example, CARE's C-section cell is *Possible* (0.45): the record has obstetrics services and no C-section text, and the caveat says the list is truncated.
- **AIIMS (canary):** scored only on the record. The description is a 10-bed NRC unit, and the capability list is clearly merged with a different institution: Raipur Institute of Medical Sciences, "Lord Buddha Education Society", a different chairman and a 2008 founding year. That gives R = 0.48 (Low). Every AIIMS cell is *Possible*, because there is only a department or specialty mention and no dialysis, delivery or cardiac surgery text. AIIMS ranks 8th for Q1, 11th for Q2 and 7th for Q3.
- **Children's hospital claiming dialysis (Kanha):** the explicit claim `"Dialysis facilities"` counts as a positive disposition. Because the patient is an adult, `offers` is 0.30 and the tier is *Weak*, with the caveat "adult dialysis unclear". Kanha's cath lab does not support adult CABG (*Possible*, 0.08).
- **Name-only hints (Vasudev "…Apollo Dialysis Clinic", Vidya "…Kidney Centre"):** a name is not a quotable field, so a name alone was not treated as evidence. Vasudev has an empty boilerplate record with only a `nephrology` tag, giving *Possible* (0.35) and R = 0.42 (Low, templated text). Vidya's *description* states "24-hour dialysis services with 10 units", so its *Strong* tier comes from the text and not the name. Vidya's page is old (2011), which lowers R a little.
- **Specialty tag naming the service exactly** (Mamta `cardiacSurgery`): positive but *Weak* (0.18). Mamta's own specialization line leaves cardiac out, and its specialties list looks templated. **Related tags** (`nephrology` for dialysis, `gynecologyAndObstetrics` for C-section, `cardiology` for CABG) are support_only and *Possible*.
- **Sanjeevani `cardiothoracicSurgery`:** at a cancer hospital this most likely means thoracic oncology, so it is *Possible* (0.10). "Cardiac viability testing" is a diagnostic scan, not surgery.
- **"Obstetric surgeries" without the words C-section (Suyash):** treated as a near-direct claim, so it is *Weak* (0.55). A plain obstetrics department or services mention (CARE, MMI, Shri Krishna, Mamta) is *Possible*.
- **Emergency readiness for C-section Strong:** Devi ("Offers 24/7 emergency care", OT, ICU, high-risk pregnancy unit) and Kanwar ("Provides emergency services", ICU, high-risk delivery) qualify. Tiwari ("Open 24 hours", "24x7 nursing") is *Moderate*: it is a small clinic with no theatre, anaesthesia or NICU listed, and its description gives OPD hours. SMC is *Moderate* because its emergency readiness is not confirmed.
- **SMC cardiac:** *Moderate* rather than Strong. It explicitly lists "Bypass Surgery" and claims "over 2,000 cardiac surgeries", but only one cardiologist is named and no cardiac surgeon. It also claims heart transplants at a 50–150-bed hospital, the bed counts disagree, and no cath lab is listed.
- **MMI dialysis:** *Moderate*. "Largest dialysis centre in Central India" is explicit but promotional, with no machine count.
- **R:** I did not reward size. Penalties applied for: merged data (AIIMS, plus Gayatri's Kharsia 496661 item), boilerplate or templated text (Vasudev; Devi's and Mamta's portal department lists), internal contradictions (bed counts at CARE, SMC and Sanjeevani; years at Shri Krishna), and stale pages (Vidya 2011).
- **Location:** for all 15, the coordinates, address and a 4920xx PIN agree on Raipur, so all are *High*. I used 2 km instead of 1 where the address is vague ("Main Road") or the PIN covers a wide area: the three facilities with PIN 492013 sit 5–10 km from the Q2 point, which has the same PIN. I had no PIN-centroid data, so these are judgment calls.
- **Ranking:** ranked within each grade, using evidence strength first and then distance. For Q2, which is time-critical, Devi (grade 3, 9.9 km) still ranks above SMC (grade 2, 4.1 km) because only Devi confirms emergency readiness. Kanwar (grade 3, 4.5 km) ranks first.

## Strong cells
- dialysis: 3 (CARE, Suyash, Vidya)
- emergency_csection: 2 (Kanwar, Devi)
- cardiac_surgery: 3 (MMI, CARE, Suyash)
