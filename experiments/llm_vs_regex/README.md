# Experiment: LLM vs deterministic feature extraction

**Question:** for the features we precompute once, do LLM-extracted features produce better rankings than our regex pipeline, judged against a human ranking?

**Setup:** 15 facilities in **Raipur, Chhattisgarh** × 3 queries. All features feed the **same** scoring formula ([docs/SCORING.md](../../docs/SCORING.md) §4); only the feature source changes.

## Files

| File | What |
|---|---|
| `facilities_15.json` | **The only input for both methods.** Full record text for the 15 facilities (description, specialties, procedure, equipment, capability, size fields, contact) plus distance to each query |
| `facilities_15.csv` | Quick-look table: ids, names, coordinates, distances, doctors, beds |

## The 3 queries

| ID | Service | Location (user) | User's words |
|---|---|---|---|
| **Q1** | Dialysis | PIN **492001**, Dayanand Nagar, Raipur centre (21.23855, 81.64300) | "My father needs dialysis three times a week. We live in Dayanand Nagar, 492001." |
| **Q2** | Emergency C-section *(time-critical)* | PIN **492013**, Raipura, east Raipur (21.23784, 81.70542) | "My wife is in labour and the doctor says she may need an emergency C-section. We're in Raipura, 492013." |
| **Q3** | Cardiac surgery | PIN **492004**, Pandri, north Raipur (21.25457, 81.65708) | "My mother has been told she needs bypass surgery. We're in Pandri, 492004." |

All 15 facilities are within ~13 km of every query point, so distance can't decide the ranking alone. Evidence and capability have to matter.

## The 15 facilities

Evidence levels below come from a quick regex pre-check (`clear` = direct claim in `procedure`/`equipment`; `weak` = only a specialty tag, description, capability or negated mention; `none`). They were used **only to make sure each query has a mix**. Don't show them to the human rankers.

| # | Facility | unique_id | km Q1 / Q2 / Q3 | Dialysis | C-section | Cardiac | Why it's in the set |
|---|---|---|---|---|---|---|---|
| 1 | Hospitales CARE, Raipur | `723a6e17-fdf9-4af8-ae80-b16ea3b98244` | 2.8 / 5.6 / 4.2 | clear | weak | clear | Large hospital; all three lists hit the 50-item cap (truncation) |
| 2 | Smc Heart Institute And Ivf Research Center | `0b02d119-a409-4554-9979-39817ed38e3e` | 4.7 / 4.1 / 2.5 | weak | clear | clear | Cardiac + IVF mix |
| 3 | MMI Narayana Multispeciality Hospital | `c35dabaa-544a-4d93-9405-b5444ed0bab3` | 3.2 / 5.6 / 4.6 | weak | weak | clear | Big (182 doctors, 298 beds); capped lists |
| 4 | Shri Krishna Hospital | `8e0dbec3-fd46-42e1-b213-9204bf799f69` | 2.4 / 4.9 / 3.5 | clear | weak | none | |
| 5 | Kanha Children Hospital | `509c6668-953b-4d13-b198-5659718b54e6` | 3.7 / 5.4 / 1.5 | clear | none | none | Children's hospital claiming dialysis |
| 6 | Suyash Hospital | `3d4c1b68-7402-427c-922c-adbf52bd7dab` | 4.4 / 10.6 / 5.3 | clear | weak | weak | |
| 7 | Tiwari Nursing Home | `f73efb65-a436-45a4-b6b3-8409e412525d` | 0.6 / 6.0 / 2.3 | none | clear | none | Small nursing home, closest to Q1 |
| 8 | Devi Woman and Child Hospital | `6c08e1f3-1d59-42c0-bb0c-4617f95a8986` | 3.6 / 9.9 / 5.7 | weak | clear | none | Maternity specialist (name rule) |
| 9 | Kanwar Nursing Home | `3933c2cf-fae4-439e-a72d-39d2c28ddf4e` | 2.8 / 4.5 / 0.8 | none | clear | none | Close to Q3 but no cardiac |
| 10 | Vasudev Multispeciality Hospital and Apollo Dialysis Clinic | `702a22a9-0c4c-49b4-afbe-e54b42750283` | 4.1 / 10.6 / 6.1 | weak | weak | none | **"Dialysis" in the name, almost no text** (lists 0 / 0 / 1) |
| 11 | Vidya Hospital and Kidney Centre | `78bed667-b16e-43c1-8d82-c82891f23aa8` | 2.3 / 4.7 / 0.8 | weak | none | none | Kidney specialist by name, thin text |
| 12 | All India Institute of Medical Sciences, Raipur | `e43a21d0-8c78-436d-9656-39418b1fbf16` | 6.9 / 13.2 / 8.0 | weak | none | none | **Famous hospital; record says 10 beds.** Tests whether the LLM sticks to the record |
| 13 | Mamta Super Speciality Hospital | `f71b47e9-1504-40f9-9256-706f6173280b` | 4.4 / 4.9 / 2.1 | weak | weak | weak | "Super speciality" name, very short lists (3 / 0 / 7) |
| 14 | Sanjeevani Cancer Hospital | `269e3a30-c0d8-447c-8d74-fe6a2977a315` | 2.8 / 6.3 / 4.5 | weak | weak | weak | Cancer specialist; tests off-service matches |
| 15 | Gayatri Hospital | `8f5bea35-e441-441f-ae15-cca315bbee5b` | 4.0 / 10.5 / 5.8 | none | none | none | Ordinary nearby hospital, no evidence for any query (distractor) |

Per query, the pre-check mix is: **Q1** 5 clear / 8 weak / 2 none · **Q2** 4 clear / 8 weak / 3 none · **Q3** 3 clear / 3 weak / 9 none.

Excluded during selection: Raipur facilities whose coordinates are 100+ km away (Shri Narayana Hospital, Jeevan Jyoti, Nova IVF), dental/eye/skin clinics, and facilities with no relevant text at all except one distractor (#15).

---

## Protocol

### Rules for both methods (keep it a fair comparison)
1. **Input:** `facilities_15.json` only. No web search, no outside knowledge. The LLM prompt must say: *"Use only the record text below. Do not use what you know about this hospital."* (AIIMS is the canary.)
2. **Output schema:** the feature list in [docs/FEATURES.md](../../docs/FEATURES.md) §3 (G1–G14, S1–S12) and the evidence fields in [docs/SCORING.md](../../docs/SCORING.md) §3 (direct claim yes/no, negated yes/no, label). One row per facility × feature:

   ```
   unique_id, feature, value (0–1 or blank = unknown), status (found / not_mentioned / unknown / truncated), quote (verbatim, required when found), field
   ```
   Save as `features_regex.csv` and `features_llm.csv`.
3. **Ranking:** apply the same formula and weights (SCORING §4.2: wE / wD / wA, d_half) to both feature sets. Use the distances in the JSON (`km_q1/2/3`; road km = 1.4 × that). Rank all 15 for each query. Save as `ranking_regex.csv` / `ranking_llm.csv`:

   ```
   query_id, rank, unique_id, rank_score, label, E, D, A
   ```
4. **LLM settings:** temperature 0; record the model ID; run **twice** and save both runs (`features_llm_run1.csv`, `features_llm_run2.csv`) to measure consistency.

### Human ranking (do this **before** looking at either method's output)
1. Two people independently read the 15 records in `facilities_15.json`.
2. For each query, give each facility a grade: **3** = clearly offers it and suits this patient · **2** = probably · **1** = only a hint · **0** = no support / wrong kind of facility. Judge **only what the record says**, plus the distance.
3. Then order all 15 for each query (ties allowed). Save as `human_A.csv` and `human_B.csv`:

   ```
   query_id, unique_id, grade, rank
   ```
4. Where the two disagree by ≥ 2 grades, discuss and record an agreed grade in `human_agreed.csv`.

### Comparison
| Metric | What it tells us |
|---|---|
| **NDCG@5** per query, vs the agreed human grades | Does each method put the right facilities at the top? |
| **Kendall τ** vs the human order | Overall ordering agreement |
| **Top-3 overlap** (regex vs LLM) | How much the feature source actually changes recommendations |
| **Feature agreement** regex vs LLM, per feature | Where the two methods disagree; hand-check those cells |
| **Quote check**: is every quote a substring of the record? | LLM hallucination (citations are a hard requirement) |
| **Run-to-run agreement** (LLM run 1 vs run 2) | LLM consistency |
| Time and cost per facility | Whether the LLM is viable for all ~10,000 facilities |

**Decide before looking at results:** if the LLM beats regex by ≥ 0.10 NDCG@5 on at least 2 of 3 queries **and** has zero hallucinated quotes, use the LLM for feature extraction (or for checking borderline regex hits). Otherwise keep regex.

**Limits:** 3 queries is a pilot. Treat results as directional, not conclusive.
