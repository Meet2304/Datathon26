# Regex vs LLM in the Raipur pilot — independent review by sol

- The LLM found two details the regex missed that mattered to the recommendations. Suyash explicitly says it performs heart bypass surgery, and Vidya says it has ten dialysis units.
- Vidya rose from fifth to second for dialysis, and Suyash went from outside the eligible results to first for bypass. The emergency C-section order stayed the same.
- The saved outputs agree on 516 of 525 comparisons. That includes copied fields, many shared blanks and a label calculated from other answers. Among the 101 extraction comparisons where either method found something, they agree on 93.
- Both methods sometimes gave extra credit for repeated wording. The shared scoring rule also left every C-section result below Strong, even where the facility separately reported round-the-clock emergency care.
- Patch the fast rules and use the LLM to check cases where unclear wording could change the shortlist. Blind human grades and a new set of records should decide whether broader LLM use pays off.

## 1. Disagreements

I checked the nine differences in the saved scored outputs against `facilities_15.json`, using the feature names as intended concepts and flagging where the written pattern or prompt differs.

| Facility and cell | Source field and verbatim text | Judgment |
|---|---|---|
| Suyash Hospital, cardiac surgery direct claim | `procedure`: “Performs cardiac bypass surgery in the Cardiac Cath Lab” | **LLM.** Explicit on-site bypass claim. |
| Suyash Hospital, cardiac surgery label | `procedure`: “Performs cardiac bypass surgery in the Cardiac Cath Lab”; `equipment`: “Cardiac catheterization laboratory (CathLab)” | **LLM.** Strong follows from positive procedure evidence, corroborating equipment and sufficient beds under the shared rules. The label change repeats the impact of the missed claim. |
| Vidya Hospital and Kidney Centre, S1 dialysis unit | `description`: “offers 24-hour dialysis services with 10 units” | **LLM.** The number applies to the units delivering dialysis. The adjacent-word pattern is too narrow. |
| Kanwar Nursing Home, G10 accreditation | `capability`: “Non-NABH accreditation” | **LLM.** This cannot support positive NABH credit. The final feature is `not_mentioned`, although the source explicitly qualifies the NABH mention. |
| Tiwari Nursing Home, G5 24×7 emergency | `capability`: “24x7 nursing” | **LLM.** Continuous nursing does not establish an emergency service. The broad G5 regex is consistent with the literal trigger in FEATURES, which needs tightening. |
| Gayatri Hospital, G5 24×7 emergency | Separate `capability` items: “Offers emergency and elective services” and “Round-the-clock availability of doctors”; `equipment`: “24-hour ambulance service” | **Debatable.** The record confirms emergency service and continuous staffing, with no explicit connection between their hours. For a strict round-the-clock emergency reading I would withhold full credit. If G5 is broad emergency support, the LLM found genuinely relevant evidence. |
| SMC Heart Institute and IVF Research Center, S6 CCU | `capability`: “Operates a Heart Institute for cardiac care”; “Provides cardiac care and IVF services” | **LLM.** A cardiac service does not establish a dedicated unit. Both the written pattern and the prompt include “cardiac care,” so this is also a feature-definition defect. |
| Suyash Hospital, S6 CCU | `equipment`: “Intensive Critical Care Unit (ICCU)”; `capability`: “Intensive and critical care unit (ICCU) services” | **Debatable.** Regex follows the literal ICCU rule and the LLM prompt also lists ICCU. The supplied expansion establishes general critical care and leaves dedicated coronary care unresolved. For the current written proxy, regex wins. The LLM’s raw miss becomes `truncated` in the shared scorer. |
| Kanha Children Hospital, S1 dialysis unit | `equipment` and `capability`: “Dialysis facilities” | **Debatable.** The equipment entry supports dialysis infrastructure, but it gives no dedicated unit, machine or count. Regex is closer to the narrow equipment definition. The LLM's broader reading has some support from the field. Both separately record dialysis service evidence. |

On the eight underlying differences I count **five clear LLM wins and three debatable**, with a sixth favorable scored cell if the downstream Strong label is counted separately. I agree with most of the regex write-up’s judgments and would move Gayatri from LLM win to debatable. These judgments concern what the records support.

The comparison also hides differences within an agreed status. Kanha G5 is a clear example. Regex uses `equipment` “24x7 Pharmacy” for 1.0, whereas LLM uses `capability` “24x7 Emergency Services” for 0.9. The LLM has the correct basis, despite the lower numeric feature value. Two other hidden differences matter directly to Q1. MMI’s dialysis E differs because regex credits the same largest-centre claim in description and capability as two statements. Vidya’s dialysis E differs because the LLM also flags service equipment from the description. Its ten units are real evidence in the record, although the source is one claim and the evidence model should make clear how much extra credit the equipment detail earns.

## 2. Shared decisions checked against the records

| Facility and agreed cell | Source field and verbatim text | Assessment |
|---|---|---|
| Hospitales CARE, Q1 direct claim | `procedure`: “Dialysis treatment is provided using 25 dialysis machines.” | Supported. |
| Hospitales CARE, S1 | `equipment`: “25 dialysis machines” | Supported, including quantity. |
| Hospitales CARE, Q1 Strong | Same procedure and equipment entries | Supported by the written Strong rule. The equipment mention repeats the count in the service statement, so its incremental corroboration needs review. |
| Hospitales CARE, S5 | `equipment`: “Cath lab on site.” | Supported. |
| Hospitales CARE, G7 | `equipment`: “Integrated operating theatre designed by Carl Storz (Germany)” | Supported. |
| Hospitales CARE, Q3 direct claim | `procedure`: “Performs cardiothoracic surgery” | Supported for the broad cardiac surgery category. |
| Hospitales CARE, Q3 second claim | `procedure`: “Performs cardiothoracic surgery”; “Cardiothoracic surgery procedures are offered” | **Both grant duplicate credit** for paraphrases of the same broad claim. The literal normalized-string dedup rule permits this. |
| Shri Krishna Hospital, Q1 direct claim | `procedure`: “Dialysis” | Supported in the procedure list. |
| Shri Krishna Hospital, G5 | `capability`: “Provides 24/7 emergency care” and “Has emergency department” | Supported. The first quote establishes the hours explicitly. |
| MMI Narayana, S1 | `capability`: “Has the largest dialysis centre in Central India” | Supports a dedicated facility, with no supported unit count. |
| MMI Narayana, Q3 direct claim | `procedure`: “Heart bypass surgery is performed” and “Heart valve replacement is performed” | Supported. These are distinct procedures. |
| Suyash Hospital, S5 | `equipment`: “Cardiac catheterization laboratory (CathLab)” | Supported. |
| Suyash Hospital, G7 | `equipment`: “7 operating theatres” | Supported, including quantity. |
| Suyash Hospital, Q1 direct claim | `procedure`: “Provides hemodialysis” | Supported. Both also grant second-claim credit for “Dialysis” in the same field, which adds no independent corroboration. |
| SMC Heart Institute, Q2 direct claim | `procedure`: “Performs cesarean delivery” | Supports C-section, with no emergency qualifier in that item. |
| SMC Heart Institute, G7 | `equipment`: “Modern operation theatres” | Supported. |
| Kanwar Nursing Home, G5 | `capability`: “Provides emergency services” | **Both overstate 24×7 readiness** if that is the intended feature. The source supports the broader emergency-service proxy. |
| Devi Woman and Child Hospital, Q2 Moderate | `procedure`: “Performs Caesarean Section”; `capability`: “Offers 24/7 emergency care” | Consistent with the same-item rule. Taken together these give stronger evidence of readiness than the shared label suggests, although staffing for emergency C-sections specifically remains implicit. |
| Devi Woman and Child Hospital, G5 and G7 | `capability`: “Offers 24/7 emergency care”; “OT available” | Both features supported. |
| Sanjeevani Cancer Hospital, G8 | `capability`: “Haematology and haemato-oncology department with blood bank facility” | Supported. This alone says nothing about whether the facility offers any of the queried procedures. |
| Kanha Children Hospital, G8 | `equipment`: “Blood Storage Center” | Supported under G8’s definition, which explicitly includes storage. A storage centre and a full blood bank may have different capabilities. |

## 3. What the agreement measures

I joined the two scored feature CSVs by facility ID and feature, and reproduced `compare.py`'s test of found versus everything else, with exact status comparisons for labels. There are **516/525 agreements (98.3%)**, with eight differences in 480 non-label cells and one in 45 labels. The reported 517 omits one disagreement.

- **61 automatic structured cells** in this sample: 60 from G1, G2, G3 and G14, and one G12 from AIIMS’s `academic` affiliation. G3 can have a text fallback in the spec, but the saved cells here are from capacity or unknown in both arms. I retained the other G12 cells because the definition also allows name or text evidence. Removing just those 61 leaves **455/464 (98.1%)**.
- Of the remainder, **259** are jointly `not_mentioned`, including **45** negative-claim flags for which neither arm found negation. **59** more are jointly `truncated` or `unknown`. The status of a miss in these 59 is assigned by shared rules, but finding nothing required checking the visible text. Shared negatives likewise may include overlooked evidence. The CSVs cannot establish that all of these were truly trivial.
- As a reproducible signal-bearing comparison, remove the 61 structured cells, the 318 joint negatives or unknowns just described, and the 45 derived labels. This gives **93/101 (92.1%)**, conditional on at least one arm finding a signal. Keeping labels gives **137/146 (93.8%)** after removing the same structured cells and joint misses. If all negative searches are included and just structured fields and calculated labels are removed, extraction-status agreement is **411/419 (98.1%)**. Neither rate estimates accuracy against independently annotated text.
- Exact status and numeric value differ in **12** cells. The three additional differences are Kanha G5 and the scores attached to the unchanged MMI and Vidya dialysis labels. Corroboration, provenance and quote quality can vary even where the count gives full agreement.

## 4. Ranking impact

| Query | Regex top three | LLM top three | Assessment against the story |
|---|---|---|---|
| Q1 dialysis | Hospitales CARE, Shri Krishna, MMI Narayana | Hospitales CARE, Vidya, Shri Krishna | Vidya moves from #5 to #2 at 2.3 km, with a specific ten-unit and 24-hour claim. This is a better-supported local option for repeated visits than the relative prominence of MMI’s repeated largest-centre wording suggests. MMI remains credible at 3.2 km and Shri Krishna has an explicit procedure at 2.4 km. Actual recurring appointment access is outside the record. |
| Q2 emergency C-section | SMC, Kanwar, Tiwari | SMC, Kanwar, Tiwari | Identical ordering, with Kanwar and Tiwari losing some score in the LLM arm. All three pass as Moderate, and the patient’s need for rapid emergency access is weakly captured by that shared label. |
| Q3 cardiac surgery | Hospitales CARE, MMI Narayana, SMC | Suyash, Hospitales CARE, MMI Narayana | Suyash rises from #4 and ineligible to #1 and Strong. The mother’s specific need is bypass, which Suyash explicitly lists. This is the clearest improvement in the set of eligible options. Exact #1 is less secure. MMI explicitly lists heart bypass and is closer, and SMC at 2.5 km lists “Bypass Surgery” (`procedure`) alongside cardiothoracic surgery. |

For Q1, Vidya gains 4.92 ranking points from higher equipment capability and evidence scores, while dropping duplicate corroboration costs MMI 3.00 points. Correcting either individual input affects the shortlist. For Q3, the Suyash direct claim changes eligibility and drives the promotion despite a lower LLM capability score from S6. SMC’s CCU correction lowers its score by 8.10 points. The recorded top-three overlap is 2/3, 3/3 and 2/3. These are textual and ranking judgments without blind human grades or clinical verification.

## 5. Shared specification and scoring issues

- **Emergency readiness.** The same-item rule caps all four positive C-section cases at Moderate. Devi shows why a separately expressed emergency capability should be represented. An explicit emergency C-section statement and a general hospital emergency service are different levels of evidence. Evaluate a separate cross-item readiness tier and a clearly visible readiness caveat for urgent queries.
- **Truncation.** Five records have at least one list at 50 items. The scorer applies that cap at facility level, gives missing text features neutral half credit in D, and gives unresolved prerequisites half credit in E. For example, CARE and Suyash both get half credit for unreported cardiac blood-bank evidence. This is a common policy applied to both arms. Track which list was capped and show why a prerequisite is unknown. Test whether the half-credit policy changes the top three. The cap gives no grounds to ignore a positive item already visible, as Suyash’s S6 disagreement illustrates.
- **Repeated claims.** A verbatim quote establishes where the wording came from. It does not validate the interpretation or make paraphrases independent. The shared scorer trusts `second_claim` and equipment flags supplied by each arm. Define semantic deduplication and clarify when equipment detail from the same claim constitutes corroboration. The LLM already handles the MMI duplicate better in this pilot.
- **Procedure match and capability are different.** The cardiac category includes valve and other cardiac surgery. For a bypass-specific query, explicit bypass evidence should be visible and tested for ranking relevance. The current Strong rule rewards cath-lab evidence, which by itself establishes catheterization capability. Suyash also has an explicit bypass claim. Its Strong label follows the rule without proving current surgical availability.
- **Feature definitions.** Specify whether G5 means reported continuous emergency service or a broader emergency-support proxy. Distinguish a dedicated cardiac unit from general cardiac or intensive care, and give both arms the same policy for unspecified dialysis infrastructure. These decisions affect how the extraction disagreements should be graded.

## 6. Cost and practical choice

Use **patched regex as the default with selective, quote-backed LLM review**. First add contextual heart and cardiac bypass rules, support a dialysis phrase with a count and units in the same clause, handle `non-NABH`, and tighten G5 and S6 to the agreed concepts. Add the corresponding source examples and counterexamples as regression cases, including pharmacy hours, generic cardiac care and noncardiac bypass. Apply shared deduplication to evidence before ranking.

Then send cases to the LLM where additional evidence could plausibly cross an eligibility gate or move a facility into the shortlist. Examples include a cath lab plus bypass language without a direct claim, renal care plus an ambiguous equipment phrase, and C-section paired with separate emergency evidence. Require field, quote and which decision changed. Sample routine positives and negatives to measure what the triggers miss. Route ambiguous readiness evidence to human review during evaluation.

The pilot reports regex taking seconds for about 10,000 facilities and LLM review taking 21–26 seconds per facility. Full serial LLM extraction would take about 58–72 hours. Reviewing 5% would cost about 2.9–3.6 serial hours at the same rate, before orchestration overhead. The two LLM runs retained the same top threes but differed on Vidya ICU and its downstream cardiac label. The run notes say temperature could not be fixed to zero in the harness.

## 7. Verdict

**LLM run 1 rated the records better in this pilot, with moderate confidence in the two shortlist improvements and low confidence in generalizing beyond the sample.** Nothing in the pilot supplies the human grades required for NDCG@5. Run the patched regex and selective LLM on held-out records with two blind graders. Apply the protocol’s 0.10 NDCG@5 improvement threshold on at least two queries and zero quote failures, and independently audit whether the quotes support what was inferred. If the patched rules recover the same gains and the LLM adds no reliable improvement on held-out cases, the case for keeping LLM review shrinks.
