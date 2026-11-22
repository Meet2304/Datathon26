# Review (opus): regex vs LLM feature extraction, 15-facility Raipur pilot

Reviewer: Claude Opus 5.5 (`claude-opus-5-5`). Read-only review of `Datathon26/experiments/llm_vs_regex/` on branch `experiment/regex-arm`. Every verdict below was checked against `facilities_15.json`. I recomputed the diffs from the raw extraction files (`regex_*_extract.csv` vs `llm_*_run1.csv`) as well as the scored files, so I also report disagreements the automatic comparison doesn't show.

## Summary in plain English

- **The LLM read the records more accurately than the regex, but the gap is small and mostly cheap to fix.** I found 11 places where the two methods really disagree. The LLM was clearly right in 6, the regex was arguably right in 2 (it followed our own written rules), 1 is a toss-up, and the other 2 only change which sentence gets quoted (the regex quoted the wrong one both times). I found no case where the regex was clearly right and the LLM clearly wrong.
- **Only two mistakes changed the top 3.** The regex missed that Suyash Hospital "Performs cardiac bypass surgery", so it was rated "Possible" (hidden in the real app) instead of a top cardiac option. It also missed that Vidya Kidney Centre has "dialysis services with 10 units". In both cases the LLM's top 3 is better for the patient in the story. Emergency C-section (Q2) came out identical.
- **"98.5% agreement" sounds better than it is.** About 7 in 10 cells are either fixed fields like bed count or plainly blank in both. On the 149 cells that actually needed reading, agreement is 94%. On cells where either method found something, it's 92%. The true total is also 516/525, not 517.
- **Some problems hurt both methods equally, and they matter more than regex vs LLM.** No hospital can ever be "Strong" for emergency C-section because of the "same item" rule, even Devi Woman and Child Hospital, which says "Offers 24/7 emergency care". A kidney centre whose only claim is in its description can't be Strong either. Hospitals with cut-off lists get free half-points for missing features.
- **Recommendation: keep regex for all 10,000 facilities, apply the 6 regex fixes, and use the LLM only as a targeted second reader.** That means borderline cells: a specialty tag but no direct claim, a service word with a number nearby, overmatch-prone hits, and anything that lands in a top-k. Reading every record with the LLM costs about 60–70 hours serial for a few extra hits that a fixed regex mostly catches.

---

## 1. Disagreements, judged against the record

`compare.py` lists 9 disagreeing cells (8 distinct issues; Suyash cardiac counts twice, as direct claim and label). The raw extraction files hold 2 more score-relevant ones and 2 citation-only ones that `compare.py` can't see, because it compares found vs not found on scored features only.

### 1a. The 8 disagreements in `RESULTS_REGEX.md`

| # | Facility · feature | Regex | LLM | Text I relied on | My verdict | RESULTS_REGEX |
|---|---|---|---|---|---|---|
| 1 | **Suyash · cardiac direct claim** | no (→ Possible) | yes | procedure: *"Performs cardiac bypass surgery in the Cardiac Cath Lab"*; *"Cardiac catheterization with Cathlab and bypass surgery"*; capability: *"Cardiology program including CathLab and bypass surgery"*; tag `cardiacSurgery` | **LLM, clearly.** Three separate items claim bypass surgery. The direct regex only has `coronary (artery )?bypass` / `cardiac surg`. (Caveat: "bypass in the cath lab" reads like templated text, but the rule is to judge the record.) | agree |
| 2 | **Vidya · S1 dialysis_unit** | not found | found, qty 10 | description: *"offers 24-hour dialysis services with 10 units and intensive renal care facilities"* | **LLM, clearly.** The S1 pattern needs "dialysis unit(s)" side by side, and `num_rx` needs the number before "dialysis". | agree |
| 3 | **Kanwar · G10 NABH** | found 0.8 | negated | capability: *"Non-NABH accreditation"* | **LLM, clearly.** The regex flags an explicit statement of no accreditation as accredited. | agree |
| 4 | **Tiwari · G5 emergency 24×7** | found (quote *"24x7 nursing"*) | not found | capability: *"24x7 nursing"* and *"Open 24 hours"*. No emergency or casualty wording anywhere | **Debatable, leaning regex by the written spec.** FEATURES G5 is "24x7 / round the clock / emergency dept / casualty", so a bare 24x7 counts. The LLM brief narrowed it to "24×7 *emergency*", so the two arms were given different definitions. "24x7 nursing" alone isn't emergency care, but "Open 24 hours" at a maternity nursing home is relevant for a woman in labour. The spec is at fault here, not the extractor. | **disagree** (they say LLM) |
| 5 | **SMC Heart · S6 CCU** | found (*"…Heart Institute for cardiac care"*) | not found | capability: *"Operates a Heart Institute for cardiac care"*, *"Provides cardiac care and IVF services"* | **LLM.** "Cardiac care" here means cardiology in general, not a coronary care unit. The spec's S6 pattern `cardiac (care\|intensive)` is too loose. (The LLM's own brief also listed "cardiac care" under S6, so the LLM overrode its brief, correctly.) | agree |
| 6 | **Gayatri · G5 emergency 24×7** | not found | found | capability: *"Offers emergency and elective services"*, *"Round-the-clock availability of doctors"* | **LLM, clearly** (stronger than RESULTS' "probably"). "Round-the-clock" with hyphens beats `round the clock`, and "emergency and elective services" beats `emergency (department\|services\|…)`. It meets even the spec's own definition. | agree, but stronger |
| 7 | **Suyash · S6 CCU** | found (*"Intensive Critical Care Unit (ICCU)"*) | truncated (not found) | equipment: *"Intensive Critical Care Unit (ICCU)"*; capability: *"Intensive and critical care unit (ICCU) services"* | **Debatable, leaning regex by the spec.** FEATURES S6 lists `\biccu\b` explicitly, and so does the LLM's brief. The LLM went by the record's own expansion (critical care, not coronary). Both readings are defensible. Effect: Suyash cardiac D 82 vs 72. | agree ("debatable") |
| 8 | **Kanha · S1 dialysis_unit** | not found | found | equipment and capability: *"Dialysis facilities"* | **Toss-up.** "Facilities" isn't in the S1 list, and the item names no machines or units. As an item in the equipment list, though, it does imply infrastructure. It matters little because Kanha is a children's hospital, which is wrong for an adult father in either arm. | agree |

### 1b. Disagreements `compare.py` and `RESULTS_REGEX.md` missed

| # | Facility · field | Regex | LLM | Text | Verdict | Effect |
|---|---|---|---|---|---|---|
| 9 | **MMI Narayana · dialysis `second_claim`** | yes (description) | no | capability: *"Has the largest dialysis centre in Central India"*; description: *"It also has the largest dialysis centre in Central India."* | **LLM.** It's the same sentence repeated in the description. SCORING §3.2 step 6 dedups to stop exactly this, but the regex dedups on the whole normalised item, and the description is a paragraph, so it never matches. | E 76 vs 66; **Q1 rank #3 (regex) vs #5 (LLM)** |
| 10 | **Vidya · dialysis `service_equipment`** | no | yes | same "10 units" sentence as #2 | **LLM** (same root cause as #2) | E 68.8 vs 78.8 (+10 corroboration) |
| 11 | **Kanha · G5 quote** | *"24x7 Pharmacy"* (equipment) | *"24x7 Emergency Services"* (capability) | both in record | **LLM.** The regex's value is right by luck, but the "why" line it would show users cites a pharmacy as emergency evidence. | value 1.0 vs 0.9; citation wrong |
| 12 | Regex `beds_text` quote vs qty (Sanjeevani, Suyash, SMC) | quote *"Has 120 beds."* with qty **171**; quote *"60-bed intensive care unit (ICU)"* with qty 250 | quote matches qty | Sanjeevani has both *"Has 120 beds."* and *"171-bed hospital"* | **Regex export bug.** The quote is the strongest hit, but the qty is the max over all hits. No score effect, because `capacity` overrides it in G3. A display bug only. | none |

There were also field and tag-choice differences (CARE `pediatricNephrology` vs `nephrology`, and which field the second claim was quoted from). None of them affects any score.

**My tally:** LLM clearly right on 6 (#1, #2/#10, #3, #5, #6, #9). Regex right by the written spec on 2 (#4, #7). Toss-up on 1 (#8). Citation-only regex errors on 2 (#11, #12). **I agree with RESULTS_REGEX's direction ("LLM right 6, regex right 0") but not its details.** Tiwari is a spec-definition clash, not an LLM win. Suyash ICCU leans toward the regex under the written spec. And the table misses the MMI dedup error, which moves MMI two places in Q1.

## 2. Shared blind spots (cells where both agree)

I spot-checked 15 agreeing cells, chosen to drive the top 5:

| Facility · cell | Both say | Record | Correct? |
|---|---|---|---|
| CARE · dialysis direct + S1 | yes, qty 25, Strong | *"Dialysis treatment is provided using 25 dialysis machines."* | ✓ |
| Shri Krishna · dialysis | direct yes, 2nd yes, no equipment, Moderate | procedure *"Dialysis"*; capability *"Nephrology, Dialysis & Urology services are available"* | ✓ (a bare word plus a department list. Moderate is fair) |
| Suyash · dialysis | direct yes, no S1, Moderate | *"Provides hemodialysis"*, *"Nephrology and dialysis services"* | ✓ |
| Suyash · S5 cath lab | found | equipment *"Cardiac catheterization laboratory (CathLab)"* | ✓ |
| CARE · cardiac direct + S5 | yes, Strong | *"Performs cardiothoracic surgery"*; *"Cath Lab on site."* | ✓ |
| MMI · cardiac | direct yes, no equipment, Moderate, S5 truncated | *"Heart valve replacement is performed"*, *"Heart bypass surgery is performed"*, *"NABH accredited"*. No cath lab anywhere in the record | ✓ under the spec. Moderate is a **spec** consequence (see §5) |
| SMC · cardiac direct, S5 | yes, S5 not mentioned | *"Cardiothoracic Surgery"*, *"Has performed over 2,000 cardiac surgeries"*. No cath lab text | ✓ |
| SMC · C-section direct, G7, G8 | yes; OT yes; blood bank no | *"Performs cesarean delivery"*, *"Modern operation theatres"* | ✓ |
| Kanwar · C-section direct + 2nd, G5, G7 | yes/yes; G5 yes; OT no | *"Caesarean Delivery"*, *"C-Section Delivery"*, *"Provides emergency services"*. No theatre text | ✓ (OT = 0 in D is a **spec** issue, §5) |
| Devi · C-section, G5, G7, S2, G10 | direct yes, Moderate; all found | *"Performs Caesarean Section"*, *"Offers 24/7 emergency care"*, *"OT available"*, *"Delivery rooms…"*, *"NABH accredited"* | ✓ extraction. The Moderate label is a **spec** problem |
| Tiwari · C-section | direct yes, no 2nd | *"Caesarean Section (C Section)"* | ✓ |
| Kanha · dialysis | direct yes (equipment), Weak | *"Dialysis facilities"* | ✓ under the spec. Neither arm knows it's paediatric-only |
| Vasudev · dialysis | no direct, Possible | "Apollo Dialysis Clinic" is only in the **name**. The single text item is *"Operates as a multispeciality hospital"* | ✓ under the spec (the name isn't evidence) |
| AIIMS · G3 beds | 10 (capacity) | capacity 10; *"…has 10 beds"* | ✓ both passed the canary |
| Vidya · G4 ICU (run 1) | not found | *"intensive renal care facilities"* | ✓ arguable (LLM run 2 said found: the one run-to-run flip) |

**I found no agreeing cell where both arms are wrong about what the text says.** Every shared "wrong-looking" outcome traces back to the spec: Devi Moderate, MMI Moderate, Vidya Moderate, Kanwar OT = 0, Vasudev Possible, and Kanha treated as a dialysis option. Those are covered in §5.

## 3. Is 98.5% agreement meaningful?

- **The correct total is 516/525 (98.3%).** `compare.py` lists 9 disagreeing cells, not 8.
- I split the 525 cells into three groups ([script logic](#appendix-method): loose keyword triggers per feature on description, specialties and lists):
  - **Structured, so automatic agreement:** G1, G2, G3, G12, G14 = **75 cells**, all agreeing.
  - **Trivially absent:** neither arm found anything and the record has no related word at all = **301 cells**, all agreeing.
  - **Needed reading:** **149 cells, 140 agree (94.0%)**.
  - The strictest view counts non-structured, non-label, non-negation cells where **either arm found a positive**: **101 cells, 93 agree (92.1%)**.
- Where the disagreements sit: S6 CCU agrees 0/2 on contested cells, S1 4/6, G5 11/13, G10 6/7, cardiac evidence 13/15.

So the honest figure is that on the cells that need reading, the methods differ on about 1 in 12–16 cells. These cluster in exactly the features that feed D for cardiac and dialysis.

## 4. Ranking impact

| Query | Regex top 3 | LLM top 3 | What drives the change |
|---|---|---|---|
| Q1 dialysis | CARE, Shri Krishna, MMI | CARE, **Vidya**, Shri Krishna | Vidya S1 + corroboration (#2, #10): score 75.1 → 80.0. MMI dedup (#9): 78.9 → 75.9 |
| Q2 C-section | SMC, Kanwar, Tiwari | same | Only D shifts (Kanwar NABH, Tiwari 24×7), no order change |
| Q3 cardiac | CARE, MMI, SMC (Suyash #4, Possible) | **Suyash**, CARE, MMI (SMC #4) | Suyash direct claim (#1) → Strong. SMC CCU (#5) cuts its D from 43 to 25 |

**Q1 (father, 3×/week dialysis, Dayanand Nagar).** Vidya is 2.3 km away, *"a 50-bed renal care facility"*, with *"24-hour dialysis services with 10 units"*. For a recurring adult dialysis patient, it's a better #2 than Shri Krishna, which has a one-word "Dialysis" plus a department list. **The LLM's list is better**, but only on a knife edge: #2 to #3 are within 1.2 points in the LLM ranking (80.0 / 79.2 / 75.9) and about 0.3 apart in the regex one (79.2 vs 78.9). Neither arm can call Vidya Strong, because its only claim is in the description (§5).

**Q3 (mother, bypass, Pandri).** Suyash's record says *"Performs cardiac bypass surgery"* three ways. It has a cath lab, *"60-bed intensive care unit"*, *"7 operating theatres"*, NABH and 250 beds. Under regex it's **Possible, which SCORING §4.3 hides in the real app** (it only appears as an "Unconfirmed option" if fewer than k results). That's a real miss for this patient. The LLM's top 3 swaps out SMC, which has bypass and "2,000 cardiac surgeries" but no cath lab and 2 doctors, for Suyash. **That's better for the patient.** Putting Suyash at #1 above CARE is less obviously right. Both are Strong with E 87.5, and Suyash wins on D only through the OT count and NABH, while CARE's cut-off lists give it 0.5s. CARE's *"Heart transplant"* / *"Performs cardiothoracic surgery"* is at least as deep. I'd call the #1 vs #2 order neutral.

**Q2.** Identical. Both arms put SMC Heart Institute (2 doctors, one of them an infertility gynaecologist) above Devi Woman and Child Hospital, which is a maternity specialist with 24/7 emergency care, an OT, delivery rooms and NABH. That's caused by weights and spec, not extraction (§5).

The earlier holistic LLM rating (`archive_v4_grid_fill`) agrees on Vidya #2 for Q1 and Suyash in the top 3 for Q3. It differs where the spec is the problem: Q2 Kanwar/Devi above SMC, and Q3 MMI at #1. That supports the view that the spec rules, more than the extractor, are what separate the formula from a careful reader.

## 5. Scorer and spec issues (hurt both arms equally)

1. **The "same item" emergency rule makes Strong almost unreachable for emergency C-section.** All 4 direct claims (SMC, Kanwar, Devi, Tiwari) are capped at Moderate. Devi has *"Offers 24/7 emergency care"* and *"Performs Caesarean Section"* as separate items in the same record. Fix: allow a facility-level emergency signal (G5 found in procedure/capability, not just a tag) to meet the rule, keeping a caveat.
2. **Description-only claims can't be Strong** (rule 4 needs procedure/equipment). Vidya, a kidney centre with 10 units, is stuck at Moderate. Consider letting name type `nephrology_dialysis` plus a quantified description claim qualify.
3. **E saturates for C-section.** SMC (one caesarean line), Kanwar (four caesarean items plus maternal-fetal tag) and Devi all score E = 73.3. Combined with wA = .60 and d_half = 15 km, distance alone decides Q2, and maternity name type (G15) never helps D.
4. **Implied prerequisites aren't reflected in D.** A caesarean claim implies an OT for E, but G7 stays 0 in D (Kanwar and Tiwari each lose 20% of C-section D).
5. **Truncation (M7) is per facility, not per list, and unknowns score 0.5.** Any list at 50 makes every missing feature "truncated". So AIIMS, whose capability list hits 50 and which has no dialysis text at all, gets dialysis D 58.5, above Shri Krishna (38.1), which actually lists dialysis. Truncation also blocks Strong when the equipment the rule needs might be in the cut-off part (MMI cardiac). Suggestion: apply M7 only to the list that hit the cap, and cap D credit from unknowns.
6. **Spec patterns that are themselves too loose or too tight.** Some of these are regex "errors" that the spec dictates: S6 `cardiac (care|intensive)`, G5 bare `24x7` / `24 hours`, S1 adjacency, a cardiac direct list without heart/cardiac bypass, no `non-` negation, and dedup on the whole item instead of the clause. The LLM was given a semantically worded brief, so the two arms didn't have identical definitions (Tiwari, SMC).
7. **No patient-fit filter.** A children's hospital (Kanha, *"Largest paediatric facility"*) is an adult dialysis candidate. Possibly out of scope, but worth a caveat.
8. **The name isn't evidence.** "Vasudev … Apollo Dialysis Clinic" stays Possible. That's defensible, but the name could at least lift Possible to Weak, with a "call to confirm" caveat.

## 6. Cost and practicality: what I'd do

**Regex with the fixes, plus a targeted LLM second reader.** Concretely:

1. **Apply the fixes now. They would clear all 6 LLM wins here**, as long as the new S1 number pattern is also added to SCORING's dialysis `equip_rx`, which gives Vidya its corroboration point (#10):
   - cardiac: `(cardiac|heart) bypass`, or bare `bypass surgery` with a cardiac word or tag in the item, keeping the gastric exclusion
   - S1: `dialysis[^.;]{0,40}\b\d+\s*(units?|machines?|beds?|stations?)` and the reverse
   - negation: `\bnon-?\s*` before the term
   - G5: allow hyphenated `round[- ]the[- ]clock` and `emergency (and \w+ )?services`, and decide as a team whether bare 24x7 counts
   - S6: drop `cardiac care`
   - dedup: by sentence or clause text, not whole item
   These run in seconds on 10k facilities and stay deterministic and auditable.
2. **Route only borderline cells to the LLM, and send it clauses, not whole records.** Triggers:
   - (a) a specialty code for the service but no direct claim (the Suyash pattern)
   - (b) a service word within one clause of a number (the Vidya pattern)
   - (c) hits from overmatch-prone patterns (bare 24x7, "cardiac care", NABH near "non")
   - (d) every facility that lands in a top-k for the demo queries before showing it
   A clause-level yes/no with a verbatim quote is far cheaper than ~25 s of full-record reading, and it keeps the hallucination check (a quote substring assert) mechanical.
3. **Don't run full-record LLM extraction on all 10,088.** At 21–26 s each that's about 60–73 h serial (hours if parallelised, at a real token bill). On this pilot it changed 2 of 9 top-3 slots, and fixed regex would recover most of that.
4. **Measure on new data before deciding.** These fixes were tuned on these 15 records, so the next city will have new paraphrases. Run fixed regex and the LLM on ~50 held-out facilities (another city) and count rank-relevant disagreements per 100 facilities.

## 7. Verdict

**The LLM extracted better on this pilot**: 6 clear wins, 0 clear losses, and 2 cases where the regex followed the written spec more literally. Its wins are the ones that matter for patients (Suyash for bypass, Vidya for dialysis). Confidence: **high** that the LLM was more accurate cell for cell here, and **low to moderate** that full-record LLM extraction is worth it at scale. Most regex misses have one-line fixes, and the spec problems in §5 move rankings more than the extractor does.

**What would change my mind:**
- Toward LLM-only: on a held-out set, the fixed regex still misses ≥ 3 rank-relevant claims per 100 facilities, or human NDCG@5 favours the LLM by ≥ 0.10 on 2 of 3 queries (the README rule).
- Toward regex-only: the fixed regex matches the LLM on held-out data, or the LLM produces any quote failure or unstable cells at scale. Here it had 0/175 failed quotes, but the quotes were copied from text in its context, and 1/390 cells flipped between runs.

---

### Appendix: method
- Raw diffs: compared `regex_features_extract.csv` with `llm_features_run1.csv` (status and qty), and `regex_evidence_extract.csv` with `llm_evidence_run1.csv` (all columns), plus the scored `features_*` / `evidence_*` / `ranking_*` files.
- §3 classification: G1/G2/G3/G12/G14 = structured. Any other cell is "needs reading" if either arm marked it found, or if a loose trigger regex for that feature (e.g. S6 `ccu|cardiac care|cardiac intens|coronary care`; cardiac evidence `bypass|cabg|cardiac surg|cardiothor|valve|open.heart|heart surg`) matches the facility's description, specialties or lists. Otherwise it's trivially absent. Agreement uses `compare.py`'s metric (found vs not found; label equality for `_label` rows).
- Nothing in the repo was edited. My scripts lived in the session scratchpad.
