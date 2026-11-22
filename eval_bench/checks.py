"""Executable perturbation, metamorphic, and weight sensitivity checks."""
from itertools import product
import re

from bench import decode, displayed, request


def ids(response):
    return [item["unique_id"] for item in response.get("results") or []]


def run_cases(cases, facilities, find_care_on_shadow):
    """Callback receives (records, **request) and returns the §5 response."""
    records = {r["unique_id"]: r for r in facilities}
    for case in cases:
        original = [records[uid] for uid in case["facility_ids"]]
        matches = {row["unique_id"]: row for row in case.get("patch", [])}
        changed = [{**row, **matches.get(row["unique_id"], {})} for row in original]
        before = decode(find_care_on_shadow(original, **case["before"]))
        after = decode(find_care_on_shadow(changed, **case.get("after", case["before"])))
        uid = case["target"]
        b, a = ids(before), ids(after)
        expectation = case["expect"]
        if expectation == "removed":
            passed = uid in b and uid not in [r["unique_id"] for r in displayed(after)] and bool(after.get("fallback"))
        elif expectation == "same_output":
            passed = bool(b) and before == after
        elif expectation == "rank_not_lower":
            passed = uid in b and uid in a and a.index(uid) <= b.index(uid)
        elif expectation == "same_rank_and_evidence":
            target_before = next((r for r in displayed(before) if r["unique_id"] == uid), {})
            target_after = next((r for r in displayed(after) if r["unique_id"] == uid), {})
            passed = uid in b and a == b and all(target_before.get(k) == target_after.get(k) and k in target_before
                                                for k in ("E", "evidence_label"))
        elif expectation == "truncation_caveat":
            target = next((r for r in displayed(after) if r["unique_id"] == uid), {})
            passed = uid in b and uid in a and any(re.search(r"cut.off|truncat|incomplete", message, re.I)
                                                    for message in target.get("caveats", []))
        elif expectation == "distance_decreases":
            d1 = next((r.get("distance_km") for r in displayed(before) if r["unique_id"] == uid), None)
            d2 = next((r.get("distance_km") for r in displayed(after) if r["unique_id"] == uid), None)
            passed = d1 is not None and d2 is not None and d2 < d1
        else:
            raise ValueError(expectation)
        yield dict(case_id=case["case_id"], passed=passed, before=b, after=a, expectation=expectation)


def stability(queries, find_care_with_weights, weights):
    """Callback receives (weights, **request), preserving full candidate/radius logic."""
    for query in queries:
        original = weights[query["service"]]
        baseline = decode(find_care_with_weights(original, **request(query)))
        before = ids(baseline)
        for multipliers in product((.8, 1, 1.2), repeat=3):
            if multipliers == (1, 1, 1):
                continue
            changed = [w*m for w, m in zip(original, multipliers)]
            changed = [w/sum(changed) for w in changed]
            response = decode(find_care_with_weights(changed, **request(query)))
            after = ids(response)
            union = set(before) | set(after)
            yield dict(query_id=query["query_id"], service=query["service"], split=query["split"],
                       multipliers=multipliers, jaccard=len(set(before) & set(after))/len(union) if union else 1,
                       identical_order=before == after, changed_fallback=bool(response.get("fallback")) != bool(baseline.get("fallback")),
                       before=before, after=after)


def agreement(first, second):
    a = {(r["query_id"], r["unique_id"]): r["grade"] for r in first}
    b = {(r["query_id"], r["unique_id"]): r["grade"] for r in second}
    common = sorted(a.keys() & b.keys())
    if not common:
        return dict(n=0, exact=None, quadratic_weighted_kappa=None)
    aa, bb = zip(*[(a[k], b[k]) for k in common])
    observed = sum((x-y)**2 for x, y in zip(aa, bb))/len(common)
    n = len(common)
    expected = sum(aa.count(i)*bb.count(j)*(i-j)**2 for i, j in product(range(4), repeat=2))/n**2
    return dict(n=n, exact=sum(x == y for x, y in zip(aa, bb))/n,
                quadratic_weighted_kappa=1-observed/expected if expected else None)
