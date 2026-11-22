export const NARRATION: Record<string, string> = {
 "S01": "A patient needs regular dialysis. Which nearby facility has evidence that it can help?",
 "S02": "This is Apollo. Choose dialysis, then enter the patient's PIN code: four nine two, zero zero one.",
 "S03": "Apollo ranks nearby options by documented evidence, supporting capability, and closeness, using rules specific to the care needed.",
 "S04": "Open a result to see the facility's own words, the score breakdown, and its uncertainty. See why other options were left out, then call to confirm.",
 "S05": "Behind Apollo is a deterministic pipeline. The same inputs, data, and rules always produce the same ranking, and every score can be traced.",
 "S06": "We resolve the location, filter unsupported matches, then combine evidence, capability, and distance. Dialysis weights closeness most, because patients return several times a week.",
 "S07": "We joined Virtue Foundation facility records with India Post geography, removed duplicate IDs, parsed lists, and normalized specialties and place names.",
 "S08": "We flagged lists cut off at fifty items, implausible counts, and misplaced coordinates. Missing stays unknown, and approximate locations are labelled.",
 "S09": "Databricks notebooks and serverless jobs build Delta tables in Unity Catalog. A SQL warehouse feeds the app, which runs on Databricks Apps.",
 "S10": "We tested eighty-three searches against three baselines, graded by Databricks AI judges. Ranking stays rule-based, and human validation is still needed.",
 "S11": "These gaps point to policy. Planners can target dialysis outreach where none is documented nearby, like Dantewada, about three hundred kilometres from the nearest option. Health departments can phone-verify facilities that are often recommended but uncertain. And registries can stop cutting lists short, and check every location against its PIN code.",
 "S12": "Apollo. Find nearby care. Understand why. Call to confirm."
};
