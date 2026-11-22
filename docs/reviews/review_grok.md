# Review: regex vs LLM on the 15-facility pilot (grok)

Judged only from `facilities_15.json` and the scored outputs of both arms. No human grades exist, so this is not an NDCG result. The earlier holistic ratings in `llm_vs_regex/archive_v4_grid_fill/` are used only as a side check in §4.

## Plain-English summary

- Where the two methods made a different yes-or-no call, the LLM read the record better. Five of those eight calls are clear LLM wins, three are judgment calls, and the regex has no clear win.
- Two of those calls change the shortlist a family would see. For dialysis, Vidya (a kidney centre that says it has 10 units) moves into the top three. For bypass surgery, Suyash (the record says it performs cardiac bypass) moves to the top; the regex treats that hospital as only a possibility and keeps it off the recommended list. For an emergency C-section, the top three are the same.
- "98.5% agreement" counts a lot of cells that never needed reading. Of 525 cells, 424 agree because they are copied from a form field, blank, a formula label, or an "unknown" forced by a cut-off list. On the 101 cells that required reading, they agree on 93.
- Both methods share the scoring rules, and those rules make some weak recommendations no extractor can fix. No hospital is marked Strong for an emergency C-section, including Devi, which lists caesareans, 24/7 emergency care, an operating theatre and delivery rooms. Tiwari still passes the emergency gate even though its description gives afternoon clinic hours.
- The LLM took about 25 seconds a hospital. Every clear win here is a pattern the regex can be taught. Patch those patterns, and use the LLM only on the leftover borderline lines.

**Verdict:** The LLM rated this pilot better. Ship a patched regex plus a small LLM check on borderline lines, rather than an LLM read of all 10,000 hospitals.

---

## 1. Disagreements

`compare.py` compares "found" vs anything else, and compares labels exactly. On that rule the scored files disagree in **9 of 525 cells (516 agree, 98.3%)**. `RESULTS_REGEX.md` says 517/525 and "LLM right 6, regex right 0, debatable 2". The extra cell is Suyash's cardiac **label** (Possible vs Strong), which is the formula's consequence of the missed bypass sentence, not a second reading. The write-up folds that label into the bypass row and gets 8 disagreements and 517/525. The eight yes/no calls below are the real extraction disputes. I agree with five of the six "LLM" verdicts. I do not agree that Tiwari is a clean LLM win.

| Facility | Cell | Regex | LLM | Call |
|---|---|---|---|---|
| Suyash | Cardiac direct claim | missed | found | **LLM** |
| Vidya | S1 dialysis unit | missed | found, qty 10 | **LLM** |
| Kanwar | G10 NABH | found | rejected (`negated`) | **LLM** |
| SMC | S6 CCU | found | not mentioned | **LLM** |
| Gayatri | G5 24×7 emergency | missed | found | **LLM** |
| Suyash | S6 CCU | found "ICCU" | not mentioned (scored `truncated`) | **Debatable** |
| Kanha | S1 dialysis unit | missed | found | **Debatable** |
| Tiwari | G5 24×7 emergency | found | not mentioned | **Debatable** |

Suyash's cardiac label follows the first row: regex Possible (E 37.5, fails the Moderate gate), LLM Strong (E 87.5). That label is not an independent judgment.

### Clear LLM wins

**Suyash, cardiac direct claim.** Procedure item: "Performs cardiac bypass surgery in the Cardiac Cath Lab". The same list also has "Cardiac catheterization with Cathlab and bypass surgery" and "Cardiac catheterization laboratory (CathLab) and bypass surgery", and capability has "Cardiology program including CathLab and bypass surgery". The regex direct pattern wants `coronary bypass`, `cardiac surg` or `cardiothoracic surg`. "Cardiac bypass surgery" contains neither "coronary" nor the consecutive words "cardiac surg", so the regex records no direct claim and a Possible label from the `cardiacSurgery` tag plus the cath lab. The sentence is an explicit bypass claim. The odd setting ("in the Cardiac Cath Lab") is a reason to be careful about ranking Suyash first (§4), and it is still a claim the record makes.

**Vidya, dialysis unit.** Description: "offers 24-hour dialysis services with 10 units and intensive renal care facilities." Both methods already accept this as a dialysis **direct** claim (the word "dialysis"). The regex S1 pattern needs "dialysis" immediately beside unit/machine/centre. "10 units" is two words later, so S1 is missed and the quantity 10 is missed. Those are dialysis units. The LLM quote is a verbatim substring. The field is `description`, so the formula still withholds Strong (§5).

**Kanwar, NABH.** The only accreditation line is capability "Non-NABH accreditation". The regex matches `\bnabh\b` and scores G10 = 0.8. The LLM marks the same quote `negated`, and the scorer then stores "not mentioned", which is the right credit: this facility is not NABH. No other NABH line exists. This is the only negation of its kind in the 15 records.

**SMC, CCU.** Regex quote: "Operates a Heart Institute for cardiac care". Capability also has "Provides cardiac care and IVF services". The S6 pattern includes `cardiac (care|intensive)`, so the regex is doing what that pattern says. Neither sentence names a coronary care unit or a CCU. Cardiac depth should not get the CCU point (weight 0.20) from the words "cardiac care". SMC's Q3 depth falls from 43.3 to 25.3 because of this, and SMC drops from regex rank 3 to LLM rank 4.

**Gayatri, 24×7 emergency.** Capability: "Offers emergency and elective services" and, as the next item, "Round-the-clock availability of doctors". G5 is defined as 24×7, round the clock, an emergency department, or casualty. The hyphenated "Round-the-clock" is the spec's own phrase, and the emergency-services line is a direct emergency claim. The regex matches neither (hyphens; "emergency and elective services" is not "emergency department"). `RESULTS_REGEX.md` calls this "probably" the LLM. The two lines together are enough. I count it as a clear LLM win.

### Debatable

**Suyash, CCU.** Equipment: "Intensive Critical Care Unit (ICCU)". Capability: "Intensive and critical care unit (ICCU) services". A separate equipment item is "60-bed intensive care unit (ICU)", which both methods already count as ICU. The spec's S6 pattern includes `\biccu\b`, so the regex hit is faithful to the pattern. The record's own expansion says critical care, which is the ICU already counted, not a coronary care unit. I lean toward the LLM on meaning. The scorer then turns the LLM's "not mentioned" into `truncated`, because Suyash's capability list is 50 items long (rule M7). The ICCU line is in the visible equipment list, so "truncated / unknown" is a third, worse status: the extractor considered the line and rejected it, and the scorer treats that like a line that may have been cut off.

**Kanha, dialysis unit.** Equipment and capability both say "Dialysis facilities". Both methods already count that phrase as a dialysis **direct** claim (Weak, E 40): it contains "dialys", it names no machines, and Kanha has no nephrology tag. S1 is the extra question of whether "facilities" is a unit. It is an equipment-list item at a children's hospital, with no count. Presence-only S1 is defensible. So is leaving S1 blank and letting the direct claim carry the evidence. The label stays Weak either way, so Kanha stays off the dialysis recommended list. Depth moves (38.6 to 59.6) inside the non-gated ranks.

**Tiwari, 24×7 emergency.** I do not agree with the write-up's clean "LLM" verdict. The regex quote is capability "24x7 nursing", which does not say the hospital has an emergency department. Two other lines are in the same record. Capability item 26 is "Open 24 hours". The description says "Timings: Mon - Sat 11:30 - 03:30 06:30 - 09:00 Sun 11:00 - 03:00." The written G5 rule counts a bare 24×7 / 24-hour statement, so a regex that fires is following the current rule, and "Open 24 hours" would be the honest quote. The LLM rejected both 24-hour lines on purpose (see `llm_run1_notes.md`). That matches the feature's name and the emergency-C-section patient, and it matches the fix the regex write-up itself proposes. It does not match the rule as written. The description's clinic hours also conflict with "Open 24 hours". Status: debatable. It does not change the top three (§4): Tiwari stays rank 3 either way (score 61.99 vs 60.19).

### A disagreement the 98% table hides

**Kanha, G5.** Both methods say "found", so `compare.py` counts an agreement. The quotes differ, and the values differ (1.0 vs 0.9). Regex quote: equipment "24x7 Pharmacy". LLM quote: capability "24x7 Emergency Services". The emergency line is real, so the yes/no bit is true, and the pharmacy line is the wrong fact. The quote check still passes, because "24x7 Pharmacy" is a verbatim substring. The check tests copying, not whether the quote supports the feature. If the emergency line were absent, the regex would still fire on the pharmacy.

**MMI, dialysis evidence strength.** Both say there is a direct claim, so this is not one of the eight. Description: "It also has the largest dialysis centre in Central India." Capability: "Has the largest dialysis centre in Central India." The regex counts those as two distinct direct claims. The LLM counts one. They are one fact in two wordings. I side with the LLM. Evidence falls from 76 to 66. The label stays Moderate. Once Vidya is in the top three, MMI's Q1 score at the higher evidence (78.85) is still below Vidya (79.98) and Shri Krishna (79.18), so this does not change the Q1 top three.

Quotes on every disputed cell above are verbatim substrings of the record. I found no hallucinated quote in the disagreement set. The published quote checks (regex 173/173, LLM 175/175) are consistent with that, and they would also have passed the Kanha pharmacy quote.

## 2. Shared blind spots

Agreement is not correctness. I checked the claims that actually put hospitals in the top five, plus the obvious traps (AIIMS, Vasudev, a children's hospital, a cancer hospital). I did not find a top-five driver where **both** methods assert a service the text does not contain. The shared mistakes are scoring rules (§5), not shared misreads.

Checked agreements, each one in the record:

1. CARE, procedure, "Dialysis treatment is provided using 25 dialysis machines." Both: dialysis direct claim and S1, quantity 25. This is why both rank CARE first for dialysis, Strong, E 90.
2. CARE, procedure, "Performs cardiothoracic surgery." Both: cardiac direct claim, Strong, E 87.5.
3. CARE, equipment, "Has a catheterization laboratory (Cath Lab)" / "Cath Lab (Catheterization Laboratory)." Both: S5 cath lab.
4. CARE, equipment, "Integrated operating theatre designed by Carl Storz (Germany)." Both: G7 operating theatre.
5. Shri Krishna, procedure, "Dialysis." Both: direct claim in `procedure`, Moderate, E 80. Bare, and still a real claim. Both also leave S1 blank. The neighbouring line "Nephrology, Dialysis & Urology services" does not name machines or units, so a blank S1 is right.
6. Shri Krishna, capability, "Provides 24/7 emergency care" and "Has emergency department." Both found G5. The quotes differ and both lines exist.
7. SMC, procedure, "Performs cesarean delivery." Both: C-section direct claim, Moderate. Same-item emergency flag is no for both (§5).
8. SMC, procedure, "Cardiothoracic Surgery", and capability, "Has performed over 2,000 cardiac surgeries." Both: cardiac direct claim. The bare procedure item "Bypass Surgery" is extra; the regex does not need it, because "cardiothoracic" already matches.
9. Devi, procedure, "Performs Caesarean Section." Both: direct claim. Equipment, "Delivery rooms designed to international safety standards." Both: labour room. Capability, "OT available" and "Offers 24/7 emergency care." Both found. The formula still says Moderate (§5).
10. Kanwar, procedure, "Caesarean Delivery" (also "Caesarean hysterectomy", "C-Section Delivery", "C-Section with Uterus Removal"). Both: direct claim plus a second claim.
11. Tiwari, procedure, "Caesarean Section (C Section)." Both: direct claim. There is no operating-theatre line and no emergency line. Both leave those blank.
12. Suyash, equipment, "Cardiac catheterization laboratory (CathLab)" and "7 operating theatres." Both: cath lab and operating theatre, with a quantity. Those are what let the formula mark Suyash Strong **once** the bypass sentence is accepted.
13. MMI, procedure, "Heart bypass surgery is performed" and "Heart valve replacement is performed." Both treat one as the direct quote and the other as the second claim. The yes/no bit agrees, and both sentences are true. MMI's five-item equipment list is PET-CT, MRI, CT, PET-CT, and a blank. There is no cath lab, heart-lung machine, or CCU string anywhere in the record. Both leave service-equipment blank, so both stay Moderate. That cap is a rule (§5), and the absence is real in the visible text.
14. Kanha, equipment, "Philips Azurion 5 M12 Cathlab." Both: cath lab. Cardiac stays Possible, because there is no bypass or cardiac-surgery sentence. Right.
15. AIIMS, the canary. `capacity` is "10". Description: "NRC facility located at AIMS-All India Institute of Medical Sciences, Raipur with 10 beds". Both use 10 beds. Teaching comes from the `academic` affiliation, not from outside knowledge. There is no dialysis, caesarean, or cardiac-surgery sentence. Both stay at Possible from a nephrology department line and an operating-theatre line. Neither invented AIIMS's real-world services.
16. Vasudev. The name is "Vasudev Multispeciality Hospital and Apollo Dialysis Clinic". No text field contains "dialysis". Both direct claims are blank. Specialties include `nephrology`, so both labels are Possible. Faithful to the text. A human would still treat the name as a hint (§5).
17. Sanjeevani, capability, "Haematology and haemato-oncology department with blood bank facility." Both: blood bank. It is a cancer hospital. Cardiac stays Possible from a `cardiothoracicSurgery` tag, with no bypass sentence. Right.
18. Gayatri has no dialysis, caesarean, or cardiac-surgery sentence. Both evidence labels are None / Possible. Right. Both do mark ICU from the specialty tag `criticalCareMedicine`, with no ICU sentence in the prose. That is generous, and Gayatri is last for every query, so it does not move a shortlist.

The one agreed **bit** whose regex citation is wrong is Kanha's "24x7 Pharmacy", covered in §1. The bit is saved by a real emergency line the regex did not quote.

Negation flags: all 45 are "not mentioned" for both arms. The only "non-" hit in the file is Kanwar's "Non-NABH accreditation". There is no "not available", "outsourced", or "under construction" service claim in these 15 records.

## 3. Is 98.5% agreement meaningful?

No. The denominator is 15 facilities × 35 scored rows = 525. Most of those rows cannot show an extraction difference.

| Bucket | Cells | Agree | Why agreement is cheap |
|---|---:|---:|---|
| Structured columns | 58 | 58 | G1 facility type (15), G2 doctors (15), G14 year (15), G3 beds where `capacity` is filled (12), G12 teaching from the `academic` affiliation (AIIMS only) |
| Formula labels | 45 | 44 | `EV_*_label` is computed by `score_features.py`. The one miss is Suyash's cardiac label, which follows the missed bypass sentence |
| Negation flags | 45 | 45 | All empty. These records do not negate dialysis, C-section, or cardiac surgery |
| Cut-off lists, neither method found it | 60 | 60 | CARE, MMI, Sanjeevani, Suyash and AIIMS have a list of 50. Rule M7 stores "truncated", not "absent" |
| Plain blanks | 216 | 216 | Both say not mentioned, and the prose has no keyword for that feature |
| **Cells that needed a reading** | **101** | **93** | Someone marked the feature found, or the prose actually contains the keyword |

**93/101 = 92%** on the cells that required reading. **8/101** disagree. That is the meaningful agreement rate. The headline 516/525 (98.3%), and the write-up's 517/525 (98.5%), are what you get after adding 424 cells that agree for structural reasons.

Inside the 93 shared "found" cells, one value differs: Kanha G5, 1.0 from "24x7 Pharmacy" versus 0.9 from "24x7 Emergency Services". Many other shared hits use different but valid quotes (CARE's MRI line, CARE's 25 dialysis machines in procedure vs equipment, Shri Krishna's two emergency lines). Those are tied on the yes/no bit and do not change these three rankings.

Run 1 vs run 2 of the LLM is a separate check, already computed: 1 of 390 raw feature cells (Vidya ICU) and the same top three on every query. Temperature was not actually 0. Stability on 15 hospitals is encouraging and is not a test of 10,000.

## 4. Ranking impact

The gate sorts first. A hospital below Moderate is ranked behind every hospital that passes, even when its score is higher. Cardiac and dialysis use that gate. Distance cannot settle these lists on its own: every hospital is within about 13 km.

### Q1 dialysis — the LLM shortlist is better

Patient: father needs dialysis three times a week, Dayanand Nagar, 492001. Weights put 60% on closeness.

| Rank | Regex | LLM |
|---|---|---|
| 1 | CARE, Strong, 85.84, 2.8 km | CARE, Strong, 85.84, 2.8 km |
| 2 | Shri Krishna, Moderate, 79.18, 2.4 km | **Vidya, Moderate, 79.98, 2.3 km** |
| 3 | MMI, Moderate, 78.85, 3.2 km | Shri Krishna, Moderate, 79.18, 2.4 km |
| 5 | Vidya, Moderate, 75.06 | MMI, Moderate, 75.85 |

Vidya's move is the S1 hit: evidence 68.8 → 78.8, depth 27.2 → 46.4, caveat "direct claim not in procedure/equipment" because the 10 units are in the description. Shri Krishna stays Moderate on a procedure item that says only "Dialysis", with no unit count. MMI's dialysis evidence is "Has the largest dialysis centre in Central India" in the description and capability, with no machine count.

For this patient, a kidney centre 2.3 km away that states 10 units and 24-hour dialysis belongs in the top three. CARE stays first on either arm (25 machines, procedure field, Strong). The holistic ratings from the earlier archive agree on the part that matters: Vidya grade 3, rank 2; Shri Krishna grade 2, rank 5. I am confident about Vidya **in** the top three. Vidya above Shri Krishna is close (79.98 vs 79.18) and reasonable.

### Q3 cardiac surgery — include Suyash; do not be sure it should be first

Patient: mother needs bypass surgery, Pandri, 492004. Weights put 45% on depth and 20% on closeness.

| Rank | Regex | Passes gate | LLM | Passes gate |
|---|---|---|---|---|
| 1 | CARE, Strong, 78.80 | yes | **Suyash, Strong, 82.35** | yes |
| 2 | MMI, Moderate, 70.30 | yes | CARE, Strong, 78.80 | yes |
| 3 | SMC, Moderate, 65.41 | yes | MMI, Moderate, 70.30 | yes |
| 4 | Suyash, Possible, 69.35 | **no** | SMC, Moderate, 57.31 | yes |

Regex Suyash scores 69.35, which is higher than SMC's 65.41, and still sits at rank 4 because Possible fails the gate. A gated list would not show the hospital whose procedure list says it performs cardiac bypass. That is the regex's worst error on this pilot.

The LLM top three is the better **set**: Suyash in, SMC out. Suyash names bypass three times, has a cath lab, 7 operating theatres, a 60-bed ICU and 250 beds. SMC's cardiac evidence is real ("Cardiothoracic Surgery", "over 2,000 cardiac surgeries") and thinner, and the regex had been inflating SMC's depth with the false CCU hit.

Suyash at **number 1** is less clear. The strongest sentence places the bypass "in the Cardiac Cath Lab", which is muddled clinical language. MMI says "Heart bypass surgery is performed", "Heart valve replacement is performed", and "Has the largest cardiology and cardiac surgery programme in Chhattisgarh", with 182 doctors and 298 beds, and never names a cath lab, so the Strong rule holds it at Moderate. The holistic ratings put MMI first, CARE second and Suyash third, all grade 3, and SMC fourth. Replacing SMC with Suyash matches that reading. Ranking Suyash above MMI is the formula rewarding a named cath lab.

### Q2 emergency C-section — no extraction winner

Both arms: 1 SMC (4.1 km, Moderate, E 73.3), 2 Kanwar (4.5 km, Moderate, E 73.3), 3 Tiwari (6.0 km, Moderate, E 63.3), 4 Devi (9.9 km, Moderate, E 73.3). Kendall τ is 1.0. The G5, NABH and CCU disputes move depth by a few points and do not change the order.

This shortlist is the weak one, and both methods produce it. The holistic ratings put Kanwar first (grade 3), Devi second (grade 3), SMC third (grade 2) and Tiwari fourth (grade 2). Devi is the women's-and-children hospital with an explicit caesarean, 24/7 emergency care, an operating theatre and delivery rooms. It loses because access is 60% of the score and because the formula will not mark it Strong (§5). SMC is a heart-and-IVF centre whose C-section line is "Performs cesarean delivery". Tiwari passes the gate on that one caesarean sentence despite published afternoon hours. Changing the extractor does not fix Q2.

## 5. Scorer and spec issues

These hit both arms. They are separate from the extraction score in §1.

**The same-item rule means nobody is Strong for an emergency C-section.** Strong requires `24x7`, `emergency`, or `round the clock` **in the same list item** as the caesarean sentence. Every positive C-section claim is a bare procedure item: Devi "Performs Caesarean Section", Kanwar "Caesarean Delivery", SMC "Performs cesarean delivery", Tiwari "Caesarean Section (C Section)". Devi's "Offers 24/7 emergency care", "Open 24x7 (24/7 operation)" and "OT available" are other items. Both arms set `emergency_same_item` to no and attach the caveat "emergency readiness not confirmed". Devi's own LLM label was Strong; the shared scorer overwrote it to Moderate. Four hospitals sit on Moderate with the same evidence score of 73.3 (Devi, Kanwar, SMC), so the 60% access weight decides.

**A direct caesarean claim auto-credits an operating theatre and anaesthesia.** Tiwari has neither in the text, is typed `clinic`, and its description gives daytime hours. Implied prerequisites still fill two of three prerequisite slots, evidence is 63.3, and Moderate passes the time-critical gate. The LLM's private label was Weak. The formula publishes Moderate.

**The name is not a direct claim.** Vasudev is "Apollo Dialysis Clinic" and is only Possible, rank 11, hidden by the Moderate gate. The name rule can help a hospital reach Strong **after** a direct claim. It cannot create the claim. Vidya is spared this only because the description also says "10 units".

**Strong cardiac surgery requires a named cath lab, CTICU/CICU, or heart-lung machine, and beds not known to be under 30.** MMI documents bypass, valve replacement, and the largest cardiac-surgery programme in the state, and the equipment list is five imaging items. Both arms: Moderate, E 77.5. The holistic read graded MMI a 3 and ranked it first. The rule is why the formula, once Suyash's bypass line is extracted, ranks the cath-lab hospital above the programme that never uses the words "cath lab".

**M7 is facility-wide.** If any of procedure, equipment, or capability has 50 items, every feature the extractor did not find becomes `truncated` and counts as 0.5 in depth, including features whose own list is short and complete. That raises depth for CARE, MMI, Sanjeevani, Suyash and AIIMS on blanks. It also turned the LLM's reasoned rejection of Suyash's ICCU into "unknown".

**AIIMS beds stay 10.** Both arms obey the column. The description is a 10-bed nutrition centre sitting on a record whose lists also mention the medical college, robotic surgery, and, in places, a different institution. Sticking to the record is what the protocol asked. The record is a bad join. Confidence on AIIMS is correctly Low for dialysis.

**Quote checking is a substring test.** It catches invented quotes. It does not catch a true substring that answers a different question ("24x7 Pharmacy", "24x7 nursing", "cardiac care").

## 6. Cost and practicality

Regex: seconds for the full corpus of about 10,000 facilities. LLM: about 21–26 seconds a facility in these notes, roughly 60–70 hours if run one hospital at a time, before retries. Temperature could not be set to 0. Run-to-run agreement on this sample was high (one cell in 390; same top three). That does not make a full-corpus LLM read the right tool.

What I would actually run:

1. **Patch the regex.** Each clear miss is local.
   - Cardiac direct: also match `(cardiac|heart) bypass`, and a bare `bypass surgery` when the same item has a cardiac word. On these 15, that catches Suyash's procedure line. SMC's item is the bare "Bypass Surgery" with no cardiac word in that item, and SMC is already caught by "Cardiothoracic Surgery", so the guard does not have to be loose.
   - Dialysis units: allow a number and "units/machines/beds" in the same clause as "dialysis", not only the adjacent phrase. That catches Vidya's "dialysis services with 10 units". Add "dialysis facilit(y|ies)" only as presence, with no quantity. Kanha is the only hit, and it is debatable.
   - Negation: `non-` immediately before NABH/JCI is a negative. Kanwar is the only hit here.
   - G5: a 24×7 / 24-hour / round-the-clock hit counts when the same item also says emergency or casualty, and "emergency (and …) services" counts. "Round-the-clock" should match with hyphens. That catches Gayatri, stops crediting Tiwari's "24x7 nursing" and Kanha's "24x7 Pharmacy", and still catches Kanha's "24x7 Emergency Services" and Devi's "Offers 24/7 emergency care".
   - CCU: drop bare `cardiac care`. Keep `ccu`, `coronary care`, and `cardiac intensive`. If the record expands ICCU, trust the expansion. That drops SMC's false CCU and Suyash's "Intensive Critical Care Unit".
2. **Re-score this same file after the patch** before trusting it. The patch should reproduce the LLM's yes/no calls on the five clear cells. It should not create a new Strong C-section, and it should not invent a cath lab for MMI.
3. **Hybrid, narrow.** After the patch, send the LLM only clauses the broad net caught and the strict pattern did not: "bypass" without a cardiac direct hit, "dialysis" within the same clause as a number, accreditation next to "non-", and 24×7 lines that still look ambiguous. That is a handful of lines on this sample, not 15 full records and not 10,000.
4. **Do not switch production to LLM-only** on this pilot. The README's own rule needs the LLM ahead by at least 0.10 NDCG@5 on two of the three queries, against human grades, with zero bad quotes. There are no human grades. Q2 would not move. The Q1 and Q3 gains are pattern bugs.

Separately, and not solved by either extractor: revisit the same-item C-section rule, the auto-credited theatre, and whether a dialysis or maternity name can count as a weak direct claim. Those three change Q2 and Vasudev more than any regex/LLM difference in this file.

## 7. Verdict

The LLM rated this pilot better. Confidence is **high** on the disputed sentences (5 clear LLM, 3 debatable, 0 clear regex) and on the two shortlist changes that follow from them: Vidya in the dialysis top three, Suyash on the cardiac recommended list. Confidence is **medium** that the LLM should be the production extractor. The margin is a few patterns, Q2 is identical and still a poor shortlist for reasons above both arms, there are no human grades, and the sample is 15 hospitals.

What would change my mind: agreed human grades on this set or a larger one, with the LLM ahead by the README's 0.10 NDCG@5 bar on two queries after the regex patches have been applied. If the patches close the gap, keep the regex. If new paraphrases keep appearing that a pattern list cannot name, widen the hybrid queue. A full LLM read of 10,000 records is not justified by these eight cells.
