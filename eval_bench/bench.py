"""Build candidate pools and evaluate the public find_care response contract."""
import argparse
from collections import Counter, defaultdict
from itertools import combinations
import json
import math
from pathlib import Path
import random
import re

DATA = Path(__file__).parent / "data"
PROFILE = {
    "dialysis": (150, False, "dialysis|hemodialysis"),
    "emergency_csection": (100, True, "c.section|caesarean|cesarean"),
    "nicu": (200, True, "nicu|neonatal intensive care"),
    "cardiac_surgery": (500, False, "cardiac surgery|bypass|cabg"),
    "mri": (300, False, "mri|magnetic resonance"),
    "trauma": (100, True, "trauma"),
    "burn_care": (400, False, "burn|burns"),
    "oncology": (500, False, "oncology|cancer|chemotherapy|radiotherapy"),
    "ent": (150, False, "ent|otolaryngology"),
}
FIELDS = ("description", "procedure", "capability", "equipment", "specialties", "name")
LABELS = ("Strong", "Moderate", "Weak", "Possible")


def read(path):
    with Path(path).open() as stream:
        return [json.loads(line) for line in stream if line.strip()]


def write(path, rows):
    with Path(path).open("w") as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")


def parts(row, field):
    value = row.get(field)
    if isinstance(value, str) and value.startswith("["):
        try:
            value = json.loads(value)
        except ValueError:
            pass
    if isinstance(value, list):
        return [x for x in value if isinstance(x, str) and x.strip()]
    return [value] if isinstance(value, str) and value.strip() else []


def number(value, default=0):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


def point(row):
    lat = number(row.get("latitude"), None)
    lon = number(row.get("longitude"), None)
    return (lat, lon) if lat is not None and lon is not None and abs(lat) <= 90 and abs(lon) <= 180 else None


def road(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat1-lat2)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon1-lon2)/2)**2
    return 2 * 6371.0088 * 1.4 * math.asin(min(1, math.sqrt(h)))


def hits(row, service):
    rx = re.compile(r"\b(?:" + PROFILE[service][2] + r")\b", re.I)
    return [(field, item, len(matches)) for field in FIELDS for item in parts(row, field)
            if (matches := rx.findall(item))]


def local(query, facilities):
    if query.get("clarification"):
        return []
    origin = query["coordinates"]
    radius = PROFILE[query["service"]][0]
    return [(row, d) for row in facilities if (p := point(row))
            and (d := road(origin, p)) <= radius]


def baselines(query, nearby):
    service = query["service"]
    candidates = [(r, d, hits(r, service)) for r, d in nearby]
    keyword = [c for c in candidates if c[2]]
    orders = {
        "B0": sorted(keyword, key=lambda c: (c[1], c[0]["unique_id"])),
        "B1": sorted(keyword, key=lambda c: (-sum(x[2] for x in c[2]), c[1], c[0]["unique_id"])),
        "B2": sorted(candidates, key=lambda c: (-number(c[0].get("capacity")), c[1], c[0]["unique_id"])),
    }
    outputs = {}
    for name, order in orders.items():
        results = []
        for rank, (row, distance, found) in enumerate(order[:query["k"]], 1):
            results.append(dict(rank=rank, unique_id=row["unique_id"], name=row.get("name"),
                                distance_km=distance, evidence_label="Moderate" if found else "Possible",
                                why=[dict(field=f, quote=q) for f, q, _ in found[:1]]))
        outputs[name] = dict(results=results, fallback=not results and not query.get("clarification"),
                             clarification=bool(query.get("clarification")))
    return outputs


def log_responses(rows):
    ordered = sorted(rows, key=lambda row: (str(row.get("ts", "")), str(row.get("query_id", ""))))
    return {key(**req): decode(row["response_json"])
            for row in ordered if (req := decode(row["request_json"]))}


def decode(value):
    return json.loads(value) if isinstance(value, str) else value


def key(service, location, k=5, **unused):
    return service, str(location).strip().casefold(), int(k)


def request(query):
    return {name: query[name] for name in ("service", "location", "k")}


def displayed(response):
    for item in response.get("results") or []:
        yield item
    yield from nested_results(response.get("extra_rows"))


def nested_results(value):
    if isinstance(value, list):
        for item in value:
            yield from nested_results(item)
    elif isinstance(value, dict):
        if "unique_id" in value or "evidence_label" in value:
            yield value
        else:
            for item in value.values():
                yield from nested_results(item)


def dcg(grades):
    return sum((2**grade - 1) / math.log2(i + 2) for i, grade in enumerate(grades))


def kendall(ids, grades):
    # Missing judged candidates tie below the returned list.
    ranks = {uid: i for i, uid in enumerate(ids)}
    c = d = ref_ties = output_ties = 0
    for a, b in combinations(grades, 2):
        x = grades[a] - grades[b]
        y = ranks.get(b, len(ids)) - ranks.get(a, len(ids))
        if x*y > 0:
            c += 1
        elif x*y < 0:
            d += 1
        elif y:
            ref_ties += 1
        elif x:
            output_ties += 1
    denominator = math.sqrt((c+d+ref_ties)*(c+d+output_ties))
    return (c-d)/denominator if denominator else None


def score(query, response, reference, records):
    metrics, failures = {}, []
    results = (response.get("results") or [])[:query["k"]]
    ids = [row.get("unique_id") for row in results]
    grades = {row["unique_id"]: row["grade"] for row in reference}
    if len(response.get("results") or []) > query["k"]:
        failures.append({"too_many_results": len(response["results"])})
    if len(set(ids)) != len(ids):
        failures.append({"duplicate_ids": ids})
    unique = list(dict.fromkeys(ids))
    ideal = dcg(sorted(grades.values(), reverse=True)[:5])
    metrics["ndcg@5"] = dcg([grades.get(uid, 0) for uid in unique[:5]]) / ideal if ideal else None
    metrics["kendall_tau_b"] = kendall(unique, grades)
    metrics["judged_coverage"] = sum(uid in grades for uid in unique)/len(unique) if unique else None
    counts = {}
    for label in LABELS:
        group = [row for row in results if row.get("evidence_label") == label]
        judged = [grades[row["unique_id"]] for row in group if row.get("unique_id") in grades]
        counts[label] = [sum(g >= 2 for g in judged), len(judged)]
        metrics[f"precision_{label.lower()}@k"] = counts[label][0]/len(judged) if judged else None
    if query.get("clarification"):
        metrics["ambiguity_correct"] = int(bool(response.get("clarification")) and not results and not response.get("fallback"))
        if not metrics["ambiguity_correct"]:
            failures.append({"expected": "city clarification", "response_query": response.get("query")})
    expected = query.get("expected_fallback")
    if expected is not None:
        metrics["fallback_correct"] = int(bool(response.get("fallback")) == expected and bool(results) != expected)
        if not metrics["fallback_correct"]:
            failures.append({"expected_fallback": expected, "actual": response.get("fallback"), "ids": ids})
    if PROFILE[query["service"]][1]:
        possible = [row.get("unique_id") for row in displayed(response) if row.get("evidence_label") == "Possible"]
        metrics["no_possible"] = int(not possible)
        if possible:
            failures.append({"unsafe_possible": possible})
        if expected is False:
            metrics["no_false_fallback"] = int(bool(results) and not response.get("fallback"))
    valid, total = 0, 0
    for row in displayed(response):
        facility = records.get(row.get("unique_id"), {})
        for claim in row.get("why") or [{}]:
            quote = claim.get("quote")
            field = claim.get("field", "")
            total += 1
            if isinstance(quote, str) and quote.strip() and any(quote in item for item in parts(facility, field)):
                valid += 1
            else:
                failures.append({"invalid_quote": claim, "unique_id": row.get("unique_id")})
    metrics["quote_validity"] = valid/total if total else None
    return metrics, failures, counts


def interval(values, seed=47):
    rng = random.Random(seed)
    draws = sorted(sum(rng.choices(values, k=len(values)))/len(values) for _ in range(1000))
    return [sum(values)/len(values), draws[25], draws[974], len(values)]


def run(queries, facilities, references, out, *, find_care=None, log=None):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    records = {r["unique_id"]: r for r in facilities}
    grouped = defaultdict(list)
    seen = set()
    for row in references:
        identity = row["query_id"], row["unique_id"]
        if identity in seen:
            raise ValueError(f"Duplicate reference: {identity}")
        seen.add(identity)
        if row.get("grade") not in range(4):
            raise ValueError(f"Invalid grade: {row}")
        grouped[row["query_id"]].append(row)
    logged = log_responses(log) if log is not None else {}
    raw, failures, missing, observed = [], [], [], []
    for query in queries:
        qid = query["query_id"]
        outputs = baselines(query, local(query, facilities))
        if find_care is not None:
            outputs["method"] = decode(find_care(**request(query)))
        elif log is not None:
            response = logged.get(key(**request(query)))
            if response is None:
                missing.append(qid)
            else:
                outputs["method"] = response
        observed.extend(dict(system=name, query_id=qid, response=response) for name, response in outputs.items())
        for name, response in outputs.items():
            ref = grouped[qid]
            metrics, errors, counts = score(query, response, ref, records)
            raw.append(dict(system=name, query_id=qid, service=query["service"], split=query["split"],
                            metrics=metrics, label_counts=counts))
            failures.extend(dict(system=name, query_id=qid, **error) for error in errors)
            if metrics["ndcg@5"] is not None and metrics["ndcg@5"] < .5:
                failures.append(dict(system=name, query_id=qid, low_ndcg=metrics["ndcg@5"],
                                     returned=[r.get("unique_id") for r in response.get("results") or []],
                                     reference=sorted(ref, key=lambda r: -r["grade"])[:5]))
    cells, labels = defaultdict(list), defaultdict(Counter)
    for row in raw:
        for service in ("all", row["service"]):
            prefix = (row["split"], row["system"], service)
            for metric, value in row["metrics"].items():
                if value is not None:
                    cells[(*prefix, metric)].append(value)
            for label, (positives, total) in row["label_counts"].items():
                labels[prefix][label, "pos"] += positives
                labels[prefix][label, "n"] += total
    summary = []
    for cell, values in sorted(cells.items()):
        mean, low, high, n = interval(values)
        summary.append(dict(zip(("split", "system", "service", "metric"), cell),
                            mean=mean, low=low, high=high, n=n))
    monotonicity = []
    for (split, system, service), counts in sorted(labels.items()):
        rates = {label: counts[label, "pos"]/counts[label, "n"]
                 for label in LABELS if counts[label, "n"]}
        inversions = [[a, b] for a, b in combinations(rates, 2) if rates[a] < rates[b]]
        monotonicity.append(dict(split=split, system=system, service=service, rates=rates,
                                 totals={label: counts[label, "n"] for label in LABELS},
                                 inversions=inversions, all_labels_observed=len(rates) == len(LABELS)))
    write(out/"summary.jsonl", summary)
    write(out/"per_query.jsonl", raw)
    write(out/"failures.jsonl", failures)
    write(out/"responses.jsonl", observed)
    write(out/"label_monotonicity.jsonl", monotonicity)
    write(out/"missing_method.jsonl", (dict(query_id=qid) for qid in missing))
    lines = ["# Evaluation results", "", "| Split | System | Service | Metric | Mean | 95% bootstrap interval | n |",
             "|---|---|---|---|---:|---:|---:|"]
    lines.extend(f"| {r['split']} | {r['system']} | {r['service']} | {r['metric']} | "
                 f"{r['mean']:.3f} | [{r['low']:.3f}, {r['high']:.3f}] | {r['n']} |" for r in summary)
    lines.extend(["", f"Failure examples: {len(failures)}. Missing method responses: {len(missing)}."])
    (out/"REPORT.md").write_text("\n".join(lines)+"\n")
    return summary


def main():
    parser = argparse.ArgumentParser()
    for name in ("queries", "facilities", "references"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--log", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    run(read(args.queries), read(args.facilities), read(args.references), args.out,
        log=read(args.log) if args.log else None)


if __name__ == "__main__":
    main()
