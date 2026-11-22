"""Sample geography reproducibly, then export full-text blind judging packets."""
import argparse
import json
from collections import defaultdict
from hashlib import sha256
from pathlib import Path
from statistics import median

from bench import PROFILE, baselines, key, local, log_responses, point, read, request, road, write


def order(value):
    return sha256(str(value).encode()).hexdigest()


def centroid(points):
    return tuple(map(median, zip(*points)))


def district_names(row):
    value = row.get("districts") or row.get("district")
    if isinstance(value, str) and value.startswith("["):
        value = json.loads(value)
    return [str(x).strip() for x in (value if isinstance(value, list) else [value]) if x]


def build_queries(pins, facilities, complete):
    districts, cities = defaultdict(list), defaultdict(lambda: defaultdict(list))
    anchors = []
    places = sorted(p for f in facilities if (p := point(f)))
    for row in pins:
        if not row.get("is_primary_state", True) or not (p := point(row)):
            continue
        state = str(row.get("state") or row.get("statename") or "").strip().casefold()
        for district in district_names(row):
            districts[district.casefold()].append((state, p))
        anchors.append((str(row["pincode"]), state, p))
    for row in facilities:
        if row.get("address_city") and row.get("address_stateOrRegion") and (p := point(row)):
            cities[row["address_city"].strip().casefold()][row["address_stateOrRegion"].strip().casefold()].append(p)
    district_points = {d: (next(iter(states)), centroid([x[1] for x in rows]))
                       for d, rows in districts.items() if len(states := {x[0] for x in rows}) == 1}
    city_points = [(city, centroid(next(iter(regions.values()))))
                   for city, regions in cities.items() if len(regions) == 1]
    by_density = defaultdict(list)
    for pin, state, p in anchors:
        count = sum(road(p, f) <= 25 for f in places if abs(p[0]-f[0]) <= .17 and abs(p[1]-f[1]) <= .3)
        density = "dense" if count >= 10 else "sparse" if count <= 2 else "middle"
        by_density[density].append((pin, state, p))
    queries = []
    for density in ("dense", "sparse"):
        for split in ("tuning", "heldout"):
            states = {state for _, state, _ in anchors if (int(order(state), 16) % 3 == 0) == (split == "heldout")}
            available = sorted((a for a in by_density[density] if a[1] in states), key=order)
            selected = []
            for candidate in available:
                if all(road(a[2], candidate[2]) > 60 for a in selected):
                    selected.append(candidate)
                if len(selected) == 12:
                    break
            if not selected:
                continue
            for i, service in enumerate(PROFILE):
                for replica in range(2):
                    pin, state, p = selected[(i+replica*5) % len(selected)]
                    fmt = ("pin", "district", "city", "latlon")[(i+replica*2) % 4]
                    location = pin
                    if fmt == "district":
                        choices = [(d, center) for d, (region, center) in district_points.items()
                                   if region == state]
                        if choices:
                            location, p = min(choices, key=lambda x: (road(p, x[1]), x[0]))
                        else:
                            fmt = "pin"
                    if fmt == "city":
                        choices = [x for x in city_points if road(p, x[1]) <= 20 and set(cities[x[0]]) == {state}]
                        if choices:
                            location, p = min(choices, key=lambda x: (road(p, x[1]), x[0]))
                        else:
                            fmt = "latlon"
                    if fmt == "latlon":
                        location = f"{p[0]:.7f},{p[1]:.7f}"
                        p = tuple(float(x) for x in location.split(","))
                    n = sum(road(p, f) <= 25 for f in places if abs(p[0]-f[0]) <= .17 and abs(p[1]-f[1]) <= .3)
                    queries.append(dict(query_id=f"{split}-{density}-{i}-{replica}", service=service,
                                        location=location, coordinates=p, split=split, anchor_pin=pin, state=state,
                                        location_format=fmt, k=5, local_facilities_25km=n,
                                        density="dense" if n >= 10 else "sparse" if n <= 2 else "middle",
                                        settlement_proxy="urban-like" if n >= 10 else "rural-like" if n <= 2 else "unclassified",
                                        time_critical=PROFILE[service][1]))
    for i, city in enumerate(sorted((c for c in cities if len(cities[c]) > 1 and c not in districts), key=order)[:6]):
        queries.append(dict(query_id=f"ambiguous-{i}", service=list(PROFILE)[i], location=city, k=5,
                            split="diagnostic", location_format="city", clarification=sorted(cities[city])))
    if complete:
        for service, (radius, critical, _) in sorted(PROFILE.items(), key=lambda x: x[1][0]):
            if radius > 200:
                continue
            for pin, state, p in sorted(by_density["sparse"], key=order):
                if all(road(p, f) > radius for f in places):
                    queries.append(dict(query_id=f"no-coverage-{service}", service=service, location=pin,
                                        coordinates=p, k=5, split="diagnostic", density="sparse",
                                        state=state, location_format="pin", time_critical=critical,
                                        expected_fallback=True))
                    break
    # Avoid duplicate exact requests across sampling strata.
    return list({key(**request(q)): q for q in queries}.values())


def pool(queries, facilities, log=None):
    records = {r["unique_id"]: r for r in facilities}
    method = log_responses(log) if log else {}
    for query in queries:
        if query.get("clarification") or query.get("expected_fallback") is True:
            continue
        nearby = local(query, facilities)
        arms = baselines({**query, "k": max(8, query["k"])}, nearby)
        arms["method"] = method.get(key(**request(query))) or {}
        ids = {item["unique_id"] for arm in arms.values() for item in arm.get("results", [])}
        ids.update(r["unique_id"] for r, _ in sorted(nearby, key=lambda x: order(x[0]["unique_id"]))[:3])
        for uid in sorted(ids, key=lambda uid: order((query["query_id"], uid))):
            row = records[uid]
            yield dict(query_id=query["query_id"], service=query["service"], unique_id=uid,
                       record=row, distance_km=road(query["coordinates"], point(row)) if point(row) else None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for field in ("facilities", "pins", "out", "log"):
        parser.add_argument(f"--{field}", type=Path, required=field != "log")
    parser.add_argument("--complete-inventory", action="store_true")
    args = parser.parse_args()
    facilities = read(args.facilities)
    queries = build_queries(read(args.pins), facilities, args.complete_inventory)
    args.out.mkdir(parents=True, exist_ok=True)
    write(args.out/"queries.jsonl", queries)
    write(args.out/"judge_packets.jsonl", pool(queries, facilities, read(args.log) if args.log else None))
