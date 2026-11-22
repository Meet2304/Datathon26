"""Validate blind grades and assemble the reference lists."""
import argparse
from collections import defaultdict
from pathlib import Path

from bench import read, write
from checks import agreement


def identity(row):
    return row["query_id"], row["unique_id"]


def indexed(rows):
    result = {}
    for row in rows:
        key = identity(row)
        if key in result or type(row["grade"]) is not int or row["grade"] not in range(4) or not row.get("rationale"):
            raise ValueError(f"Duplicate or invalid judgment for {key}")
        result[key] = row
    return result


def adjudicate(packets, first, audit, resolutions):
    primary, secondary, resolved = map(indexed, (first, audit, resolutions))
    expected = {identity(r): r for r in packets}
    if primary.keys() != expected.keys() or not secondary.keys() <= expected.keys():
        raise ValueError("Primary judgments must cover all packets. Audit rows must match packets.")
    disputed = {key for key in secondary if abs(secondary[key]["grade"]-primary[key]["grade"]) >= 2}
    if not disputed <= resolved.keys() <= secondary.keys():
        raise ValueError("Resolve every audit discrepancy of two or more grades.")
    grouped = defaultdict(list)
    for key, row in (primary | resolved).items():
        grouped[key[0]].append({**row, "distance_km": expected[key].get("distance_km")})
    ranked = []
    for rows in grouped.values():
        rows.sort(key=lambda row: (-row["grade"], row["distance_km"] if row["distance_km"] is not None else float("inf"), row["unique_id"]))
        ranked.extend(dict(row, rank=i) for i, row in enumerate(rows, 1))
    return ranked, agreement(first, audit)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("packets", "primary", "audit", "resolutions", "out"):
        parser.add_argument(f"--{name}", type=Path, required=name not in ("audit", "resolutions"))
    args = parser.parse_args()
    refs, stats = adjudicate(read(args.packets), read(args.primary), read(args.audit) if args.audit else [],
                             read(args.resolutions) if args.resolutions else [])
    args.out.mkdir(parents=True, exist_ok=True)
    write(args.out/"references.jsonl", refs)
    write(args.out/"agreement.jsonl", [stats])
