"""Reproduce the previously saved Raipur pilot and author real-row shadow cases."""
import csv
import json

from bench import DATA, PROFILE, point, run, write
from checks import agreement

SOURCE = DATA.parents[1]/"experiments"/"llm_vs_regex"
OUT = DATA/"pilot"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    facilities = json.loads((SOURCE/"facilities_15.json").read_text())
    queries = [dict(query_id=qid, service=service, location=pin, k=5, coordinates=p,
                    split="pilot", location_format="pin", density="dense", time_critical=PROFILE[service][1])
               for qid, service, pin, p in [
                   ("Q1", "dialysis", "492001", (21.23855, 81.64300)),
                   ("Q2", "emergency_csection", "492013", (21.23784, 81.70542)),
                   ("Q3", "cardiac_surgery", "492004", (21.25457, 81.65708)),
               ]]
    graders = []
    for i in (1, 2):
        with (SOURCE/f"archive_v4_grid_fill/llm_ranking_run{i}.csv").open() as stream:
            graders.append([{**r, "grade":int(r["grade"]), "rank":int(r["rank"])} for r in csv.DictReader(stream)])
    # Freeze archived reader 1 as primary. Reader 2 only measures repeatability.
    references = graders[0]
    for name, rows in [("facilities", facilities), ("queries", queries), ("references", references),
                       ("second_reader", graders[1])]:
        write(OUT/f"{name}.jsonl", rows)
    write(OUT/"agreement.jsonl", [agreement(*graders)])
    run(queries, facilities, references, OUT/"report")

    vidya = next(r for r in facilities if r["name"].startswith("Vidya"))
    suyash = next(r for r in facilities if r["name"].startswith("Suyash"))
    uid = vidya["unique_id"]
    # Isolate service claims in shadows of genuine rows. Replacements are synthetic.
    q = dict(service="dialysis", location="21.23855,81.64300", k=5)
    c = dict(service="cardiac_surgery", location="21.25457,81.65708", k=5)
    dialysis = "This facility provides hemodialysis using ten dialysis machines."
    base = dict(unique_id=uid, description=dialysis, procedure=[], equipment=[], capability=[],
                specialties=[], name="Vidya Hospital and Kidney Centre")
    isolated = {**vidya, **base}
    cardiac = {**suyash, "description": "", "procedure": ["Performs cardiac bypass surgery in the Cardiac Cath Lab"],
               "capability": [], "equipment": [], "specialties": []}
    write(DATA/"shadow_sources.jsonl", [isolated, cardiac])
    cases = [
        ("negation", q, uid, {"description": "Dialysis not available."}, "removed"),
        ("repeat", q, uid, {}, "same_output"),
        ("corroboration", q, uid, {"capability": ["The renal unit operates ten stations for patients receiving hemodialysis."]}, "rank_not_lower"),
        ("duplicate", q, uid, {"capability": [dialysis]}, "same_rank_and_evidence"),
        ("move_facility", q, uid, {"latitude": 21.23855, "longitude": 81.64300}, "distance_decreases"),
        ("paraphrase", c, cardiac["unique_id"], {"procedure": ["The hospital performs coronary artery bypass grafting."]}, "rank_not_lower"),
        ("cap_50", q, uid, {"capability": ["Directs visitors to reception."]*50,
                            "flag_capability_truncated_50": True}, "truncation_caveat"),
    ]
    rows = [dict(case_id=name, facility_ids=[target], target=target, before=req,
                 patch=[{"unique_id": target, **patch}], expect=expect)
            for name, req, target, patch, expect in cases]
    rows.append(dict(case_id="move_origin", facility_ids=[uid], target=uid, before=q,
                     after={**q, "location": ",".join(map(str, point(isolated)))}, expect="distance_decreases"))
    write(DATA/"cases.jsonl", rows)


if __name__ == "__main__":
    main()
