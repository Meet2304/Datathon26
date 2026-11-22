# Brief: LLM semantic fill of the facility × service grid (15 Raipur facilities)

You are one arm of an experiment comparing **LLM semantic inference** with a **deterministic regex + formula pipeline** (plan v4) for scoring Indian healthcare facilities by service. Your job is to fill in the final data structure **by reading and reasoning over the record text**, not by implementing the pipeline's formulas.

Folder: `/Users/meet/Meet/Projects_Ad Astra/Project_2_Databricks Datathon/llm_vs_regex/`
Read first: `README.md` (experiment protocol), then `facilities_15.json` (the 15 records, which is the only input).
For background only, read the meaning of each value in `../output/evaluation-context-handoff.md` §4 to §6. Use it to understand **what each value means and its scale**. Do **not** compute `noisy-OR`, shrinkage or weighted formulas. The point is to see what holistic judgment produces.

## Hard rules
1. **Use only the record text in `facilities_15.json`.** Do not use what you know about any hospital from the web or memory. AIIMS Raipur is the canary: its record says 10 beds and describes an NRC unit, so score what the record says.
2. **Every claim you rely on needs a verbatim quote**: an exact substring of one field value, which can be an item of `procedure`, `equipment`, `capability` or `specialties`, or the `description` string. Name the field. Before you finish, run a script that checks every quote is a substring of the stated field of that facility (case-sensitive, after nothing more than whitespace trimming). Fix or remove any that fail. Report the count.
3. **Read-only on Databricks.** You may use your Databricks access only to do two things. First, confirm that the 15 `unique_id`s exist in the source table. Second, spot-check that the JSON text for 3 facilities matches the source (`description` plus list lengths). Do not create, alter or drop anything, and do not pull extra columns into the inference. Report any mismatch.
4. Work independently. Do not open any other `llm_grid_run*` or `llm_ranking_run*` file in the folder.

## Services (3), matching the README queries
- `dialysis`: Q1, recurring haemodialysis for an adult (the user's father)
- `emergency_csection`: Q2, **time-critical**, a woman in labour
- `cardiac_surgery`: Q3, bypass (CABG) or open-heart surgery for an adult (the user's mother)

## Values to fill, and what they mean

**Row level (one value per facility, repeated in each of its 3 rows):**
- `R` (0.30 to 1.00): **can this record's text be trusted at all?** Judge internal consistency, specificity versus templated or boilerplate text, plausibility, signs that it was merged with another facility's data (items that name a different hospital, kitchen-sink claims that don't fit the facility type or size), whether there is an official website and a valid year established, and recency (`recency_of_page_update`, where the reference date is 2026-11-21). **Do not reward size** (beds and doctors are not trust) and **do not use location** here. `R_tier`: High ≥ 0.75, Medium ≥ 0.5, Low < 0.5.
- `location_confidence`: High / Medium / Low / Unresolved, with `location_uncertainty_km`. You only have the coordinates, the PIN and the address, so judge whether they agree (all are expected to be in Raipur, with PINs 4920xx).

**Cell level (facility × service):**
- `offers` (0 to 1), the LLM equivalent of `conf_adj`: **how likely is it that this facility actually provides this service today, given the record?** It already accounts for R, so a shaky record pulls it down. Rough anchors: 0.9 or more means an explicit, specific, credible claim of performing the service; 0.6 to 0.8 means an explicit claim with some doubt; 0.2 to 0.5 means indirect (only a related specialty or department, a name hint, or a single capability-list line); below 0.15 means essentially no support.
- `capability` (0 to 1): **if it does offer it, how well equipped is it for this service specifically?** Use the size fields (beds and doctors, treating placeholder values such as 1 or 2 doctors with suspicion) and service-specific resources (dialysis: machines, stations, RO, nephrologist; C-section: OT, anaesthesia, NICU, 24/7 obstetric readiness; cardiac: cath lab, CTVS/CTICU, heart-lung machine, perfusion). Blank if offers < 0.15.
- `disposition`: positive / negated / conflicting / support_only / none. Negated means the text denies it ("referred to", "not available", "under construction", "planned").
- `tier`: Strong / Moderate / Weak / Possible / Excluded / None. This is what a non-technical user would be shown. Strong means you would confidently send this patient there. Moderate means it is explicitly offered but less corroborated. Weak means it is mentioned with real caveats. Possible means only indirect hints (hidden from users). Excluded means it is denied. None means nothing at all. For `emergency_csection`, Strong also requires evidence of **emergency or 24/7 readiness**.
- `primary_quote` and `primary_field`: the single best verbatim quote. `supporting_quotes`: up to 3 more, written as `field: "quote"` and separated by ` || `.
- `caveats`: short text, such as "children's hospital; adult dialysis unclear", "list truncated at 50 items", or "templated text".
- `rationale`: one to two sentences in plain English for a non-technical user.

**Your own end-to-end ranking (a third arm, independent of any formula):** for each query, grade all 15 facilities using the README's human scale (3 = clearly offers it and suits this patient; 2 = probably; 1 = only a hint; 0 = no support or the wrong kind of facility). Then order them from 1 to 15, taking distance into account (`km_q1`, `km_q2` and `km_q3`; road km is about 1.4 × that). For Q2, being nearby matters more because it is time-critical.

## Output (write exactly these files; replace `{N}` with your run number)
1. `llm_grid_run{N}.csv`, 45 rows (15 × 3), with columns:
   `unique_id,name,service,R,R_tier,location_confidence,location_uncertainty_km,offers,capability,disposition,tier,primary_field,primary_quote,supporting_quotes,caveats,rationale`
2. `llm_ranking_run{N}.csv`, 45 rows, with columns: `query_id,rank,unique_id,name,grade,km,reason`
3. `llm_run{N}_notes.md`: the model ID you are running as, the start and end time, the quote-check result (n checked / n failed), the Databricks spot-check result, and anything ambiguous you had to decide (for example, how you treated capped 50-item lists, a children's hospital claiming dialysis, AIIMS, or a name that contains "Dialysis" or "Kidney" with no supporting text).

Quote CSV fields properly (Python `csv` module, `QUOTE_MINIMAL`). Finish by replying with a 10-line summary: the top 3 for each query, the number of Strong cells for each service, and any failures.
