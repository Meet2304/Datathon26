# Apollo narration (final, v2 with policy impact)

One clip per scene. File: `public/audio/SNN.mp3`. Clip starts 8 frames after the scene starts.

| Scene | Frames | Narration |
|---|---|---|
| S01 | 0–180 | A patient needs regular dialysis. Which nearby facility has evidence that it can help? |
| S02 | 180–390 | This is Apollo. Choose dialysis, then enter the patient's PIN code: four nine two, zero zero one. |
| S03 | 390–660 | Apollo ranks options by evidence, capability, and closeness, with rules specific to each service. |
| S04 | 660–990 | Each result shows the facility's own words, the score breakdown, and its uncertainty, plus why others were left out. Then call to confirm. |
| S05 | 990–1290 | The pipeline is deterministic: same inputs, data, and rules, same ranking, and every score is traceable. |
| S06 | 1290–1620 | We resolve the location, gate out unsupported matches, then weight evidence, capability, and distance. For dialysis, closeness dominates. |
| S07 | 1620–1920 | Exploration runs as a bronze-to-silver medallion pipeline. We joined Virtue Foundation records to the India Post PIN directory, deduplicated IDs with a window function, parsed JSON list fields, mapped specialties to a controlled vocabulary, and canonicalized city aliases. |
| S08 | 1920–2220 | Profiling exposed systematic defects. Two thousand seventy-eight records had lists truncated at exactly fifty items, so a missing service there is unknown, not absent. Implausible doctor counts were nulled. Coordinates far from their PIN centroid were snapped to it and flagged approximate. And clause-level regex extraction handles negation, so "no dialysis" never counts as evidence. |
| S09 | 2220–2490 | Databricks notebooks and serverless jobs build Delta tables in Unity Catalog. A SQL warehouse serves the app on Databricks Apps. |
| S10 | 2490–2760 | Eighty-three searches were benchmarked against three baselines with Databricks AI judges. Ranking stays rule-based, and human validation is pending. |
| S11 | 2760–3360 | These gaps point to policy. Planners can target dialysis outreach where none is documented nearby, like Dantewada, about three hundred kilometres from the nearest option. Health departments can phone-verify often-recommended but uncertain facilities. And registries can stop truncating lists, and validate every location against its PIN code. |
| S12 | 3360–3540 | Apollo. Find nearby care. Understand why. Call to confirm. |
