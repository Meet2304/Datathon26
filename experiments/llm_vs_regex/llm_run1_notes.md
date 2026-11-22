# LLM extraction: run 1 notes

## Run facts
- **Model:** `claude-opus-5-5` (Claude Opus 5.5), running as an agent through the Claude Code harness. The harness does not expose temperature, so it was not set to 0.
- **Start:** 2026-11-21 18:54:34 EST. **End:** about 19:01 EST, when the files were written. Total wall-clock time was about 6.5 minutes, roughly **26 s per facility**. That covers reading, judging and writing, and it doesn't include writing these notes.
- **Input:** `facilities_15.json` only. I used no outside knowledge, made no Databricks queries and didn't open any other run's files or `archive_v4_grid_fill`.
- **Method:** I printed each facility's record with every list item indexed. I read all 15 and recorded my judgments by hand in a Python dict, with quotes copied by eye from the printed record. Then I ran one keyword grep across all facilities to check I hadn't missed anything. The grep found no new features. The CSVs were written with `csv`.

## Quote check
- **First-pass quote failures: 0 / 175.** That covers 93 feature quotes (92 found plus 1 negated) and 82 evidence quotes (direct, second, service-equipment and prerequisite). I ran the check before writing the files. Caveat: I copied the quotes by eye from a printed record that was in my context, so this measures copying fidelity more than recall.
- **Final quote failures: 0 / 175.** I re-ran the check on the written CSVs and got the same result.

## Output shape
- `llm_features_run1.csv` has **390 rows, not 375**. The brief says 25 features, but its own table lists 26 (the 11 general ones, 6 imaging, and the 9 S-features listed there: S1–S6, S10–S12). I wrote all 26, so 15 × 26 = 390. If the script expects 25, drop whichever feature it doesn't use.
- `llm_evidence_run1.csv` has 45 rows. `prereq_found` includes prerequisites backed only by a specialties tag (anaesthesia ← `anesthesia`/`anesthesiology`, icu_ccu ← `criticalCareMedicine`, nephrology ← code), with field `specialties`. Drop those if the script wants text-only prerequisites.
- Number of direct claims: **dialysis 6**, **emergency C-section 4** and **cardiac surgery 4**.

## Decisions I found ambiguous
1. **AIIMS (canary).** The description is the 10-bed NRC unit, but the record's lists contain more than that. They mention operation theatres, a robotic surgery programme, "Medical college and hospital", a Department of Radiation Oncology and a Department of Nephrology. Some capability items are about a different institution (Raipur Institute of Medical Sciences, RIMS). I scored only what the record text says: beds_text = 10 (it's really the NRC count), ot, teaching_text and radiotherapy from "Has a Department of Radiation Oncology" (borderline), plus tag features. I didn't use any outside knowledge of AIIMS. There's no dialysis, C-section or cardiac claim.
2. **Conflicting bed totals.** CARE has "Total bed capacity of 400+ beds" (equipment) and "Has 215 beds" (capability). I took 400 because equipment is the stronger field. Sanjeevani has 120, 171 and 250+ in the same field; I took 120 because it matches the capacity column. SMC has 150, 50 and 55; I took 150, the 2023 expansion, which matches the capacity column.
3. **Kanha "Dialysis facilities"** appears in both equipment and capability. I counted it as `dialysis_unit` = found because it's an infrastructure item. For evidence I treated it as a direct claim in equipment, with `equipment_only = no` and `service_equipment = no`, because no machines or units are named. That's a judgment call: the alternative is equipment_only = yes.
4. **MMI "largest dialysis centre"** gives dialysis_unit = found (a centre) and a direct dialysis claim in capability. I set service_equipment = no, because "centre" isn't on the brief's service-equipment list.
5. **"Open 24 Hrs" / "Open 24 hours" / "24x7 nursing"** don't count as 24×7 emergency. CARE's emergency_24x7 comes from the `emergencyMedicine` tag. Tiwari has no emergency feature.
6. **Gayatri "Offers emergency and elective services"** counts as emergency_24x7 found. It states an emergency service, and a separate item says "Round-the-clock availability of doctors".
7. **Suyash "Intensive Critical Care Unit (ICCU)".** The text spells ICCU out as critical care, not coronary care, so it isn't `ccu` (it supports `icu`).
8. **SMC ct = found from "CT Angiogram"** (procedure). This is an inference that a CT scanner exists.
9. **The CARE "neonatology" tag** isn't the mapped tag (`neonatologyPerinatalMedicine`), so nicu = not_mentioned.
10. **Inferred but unstated resources were not credited.** Examples: a cath lab at SMC and MMI (they do thousands of angioplasties) and an OT at Gayatri, Kanwar, MMI and Tiwari (they list surgeries). These are recorded as not_mentioned with notes.
11. **llm_label is my own reading, not the formula.** Devi C-section = Strong, although the same-item emergency rule would cap the script's label at Moderate. Vidya dialysis = Strong, although the claim is only in the description, so the script can't give Strong. MMI cardiac = Strong with no equipment named. Tiwari C-section = Weak: it's a clinic with no OT, anaesthesia or emergency stated.

## Where a keyword regex would likely differ from me
**Paraphrases the regex would miss (LLM found, regex not):**
- **Suyash, cardiac_surgery:** "Performs cardiac bypass surgery in the Cardiac Cath Lab" (procedure), "Cardiac catheterization with Cathlab and bypass surgery" and "Cardiology program including CathLab and bypass surgery". `coronary (artery )?bypass` and `cardiac surg` both fail, so regex likely gets **no direct cardiac claim** for Suyash. Its only route would be the `cardiacSurgery` tag (Possible).
- **MMI, cardiac_surgery:** "Heart bypass surgery is performed". Regex still catches MMI through "Heart valve replacement is performed", but misses this item.
- **SMC, cardiac_surgery:** "Bypass Surgery" (bare). Regex catches SMC anyway through "Cardiothoracic Surgery" and "Has performed over 2,000 cardiac surgeries".
- **Vidya, dialysis_unit + qty:** "offers 24-hour dialysis services with 10 units" (description). The S1 pattern needs "dialysis unit(s)" side by side, and num_rx needs the number before "dialysis", so regex gets no dialysis_unit and no qty 10. The E direct claim (`dialys`) is still found.
- **Kanha, dialysis_unit:** "Dialysis facilities" (equipment). "facilities" isn't in the S1 pattern.
- **Gayatri, emergency_24x7:** "Offers emergency and elective services" and "Round-the-clock availability of doctors". The hyphens and wording defeat `round the clock` and `emergency (department|services|care|ward)`, so regex has no text hit and no tag.
- **Kanha, cath_lab:** "Philips Azurion 5 M12 Cathlab". `cath\s*lab` does match this, so it's not a difference. I list it only to confirm.

**False hits the regex would make (regex found, LLM rejected):**
- **Kanwar, acc_nabh:** "Non-NABH accreditation". `\bnabh\b` matches, so it would be a false positive unless "non-" counts as negation. I marked it `negated`.
- **SMC, ccu:** "Operates a Heart Institute for cardiac care" and "Provides cardiac care and IVF services" both match `cardiac (care|intensive)`. Neither is a CCU.
- **Suyash, ccu:** "Intensive Critical Care Unit (ICCU)" and "Intensive and critical care unit (ICCU) services" match `\biccu\b`. By the text's own expansion, this is general critical care.
- **Tiwari, emergency_24x7:** "Open 24 hours" matches `24 hours` and "24x7 nursing" matches `24\s*x\s*7`. Neither is emergency care.
- **Devi, emergency_24x7:** "Open 24x7 (24/7 operation)" would also hit. That doesn't matter here, because "Offers 24/7 emergency care" makes it a real hit anyway.
- **CARE, emergency_24x7:** "Open 24 Hrs" doesn't match `24 hours`, so regex and I agree here (both rely on the tag).
- **Kanha, icu qty:** the ICU num_rx `(\d+)\s*-?\s*(bedded|beds?)?\s*(icu|intensive)` doesn't match "Has 30-bed PICU", because "picu" isn't `icu` at a word start. I also left the ICU qty blank.
- **Kanha, nicu qty and beds:** "Has 90-bed NICU" is correctly excluded from beds_text by not_rx (nicu). Regex and I agree.
- **Sanjeevani, cardiac:** "Cardiac viability testing" doesn't match the cardiac direct regex, so no difference. Flagged only as a possible false hit for looser patterns.
- **AIIMS, radiotherapy:** "Has a Department of Radiation Oncology" matches `radiation (therapy|oncology)`. I also counted it, so we agree, but it's weak evidence.

**Evidence-level differences to hand-check:**
- **Suyash and Devi, C-section:** "Performs obstetric and gynecologic surgeries" (Suyash) is not counted as a direct claim, and the regex doesn't count it either. Devi's direct claim is clean ("Performs Caesarean Section").
- **Kanwar, C-section second claim:** "Caesarean hysterectomy" is counted as a distinct second claim. "C-Section Delivery" and "C-Section with Uterus Removal" also exist, so the regex's dedup might count 3–4 distinct claims.
- **Vasudev, dialysis:** "Apollo Dialysis Clinic" appears only in the name, and no text field mentions dialysis, so I found no direct claim. A name-based rule could differ.
- **Truncated records** (any list at 50 items: CARE, MMI, Sanjeevani, Suyash, AIIMS) are left for the script to apply M7. I wrote not_mentioned.
