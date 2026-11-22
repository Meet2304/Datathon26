# Evaluation design

## Geography and split

The sampler targets 72 ranking requests across nine services, two density bands, two state-disjoint origin splits and two replicas. A deterministic state hash freezes each state's split. Service radius and time-critical policy follow SCORING §4.2. PINs and district centers come from primary-state PIN-directory rows. City names and centers come from facility records in the same geographic stratum. Lat/lon requests use directory-derived coordinates. A sparse area has at most two mapped facilities within 25 estimated road km. A dense area has at least ten. These are settlement proxies. District and city substitutions can change density, so the sampler records density at the actual evaluation origin. Duplicate requests collapse to a single row. Ambiguous cities and verified empty-radius requests are diagnostic queries when the inventory supports them.

Tune weights on tuning origins and freeze the settings before held-out evaluation. Large radii can bring the same facility into multiple splits even though origin states are disjoint. Report candidate overlap when interpreting transfer across geographies.

## Grading

Use the union of up to eight candidates from each baseline, the method response if available, and three geographically nearby candidates selected by a deterministic hash. Packets carry full text and distance with system provenance, scores and ranking withheld. A human or a model distinct from any extractor reads the full text for an on-site claim. Use only record evidence. Give a short rationale grounded in a field and quote when possible.

| Grade | Meaning |
|---|---|
| 3 | Clear on-site service with credible, service-specific suitability evidence. For emergency C-section, look for text linking delivery surgery with emergency obstetric readiness. |
| 2 | Positive on-site service claim with suitability or readiness details left open. |
| 1 | Plausible hint, such as a specialty, ambiguous equipment claim or general department. |
| 0 | No support, a relevant negation, an unrelated mention, or an explicitly off-site service. |

Freeze the primary judgments. Independently double-grade a blinded subset spanning each service, both densities and each split. Review differences of two or more grades and record resolutions. The grader reports exact agreement and quadratic-weighted Cohen κ. Reference lists sort by grade, then estimated road distance, then facility ID. Kendall τ-b treats equal grades as ties.

The shipped pilot uses archived full-record holistic judgments from reader 1 as its reference and reader 2 for repeatability. Across 45 pairs, agreement was 41/45 and weighted κ was 0.965. The archive readers used the same model and also supplied extraction judgments during the earlier experiment. The pilot therefore carries shared-model and shared-task bias. A human audit of the wider set remains pending.

## Measurements

B0 sorts keyword matches by proximity. B1 sorts by mention count then proximity. B2 sorts all nearby facilities by numeric bed capacity then proximity. Each uses the service maximum radius and 1.4× great-circle distance. Keyword hits carry a baseline Moderate label and other B2 rows carry Possible. These are baseline display conventions.

NDCG@5 uses exponential grade gains and assigns unjudged returns zero gain. Judged coverage is reported beside it. Queries with zero ideal gain are undefined for NDCG. Kendall τ-b compares judged candidates, with omitted candidates tied at the bottom. Strong and Moderate precision are calculated among judged returns with grade at least 2. Monotonicity checks pooled clear-claim rates across observed labels. Intervals resample queries within each reported cell. Repeated locations and very small cells limit interval interpretation.

Quote checks require a case-sensitive substring in the named record field, including extras. Time-critical checks examine Possible rows in the primary list and extras. Fallback accuracy uses an explicit oracle on the query. Populate `expected_fallback=false` for a query with an independently reviewed gate-passing witness within the maximum radius. Retain the witness ID, distance and evidence when doing so. Populate `expected_fallback=true` for verified empty geographic coverage or a complete in-radius review with no qualifying claim. Missing oracle values remain unscored. Dataset coverage, date, routing distance and documented readiness limit what these measures establish about available care.

Shadow cases copy real rows and isolate synthetic edits. Cases cover negation, duplicate text, truncation, paraphrase, corroboration and location movement, plus repeat determinism. The shadow adapter must extract afresh. Single-facility cases test retention and distance changes. Corroboration retention alone supplies weak evidence about rank changes under competition. The weight check replays 26 normalized combinations of 0.8×, 1.0× and 1.2× E/D/A weights and captures top-k overlap, ordering and fallback changes.

## Status

The Raipur baseline run covers one dense city, three PINs, three services and one time-critical request. The wider Silver-derived data, human audit, held-out scores and production method run require Databricks access. Pooling favors participating systems, and the shadow edits test specific documented behaviors.
