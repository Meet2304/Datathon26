# Databricks notebook source
"""Import alongside bench.py, export.py, build.py, and checks.py in a workspace folder."""
from pathlib import Path

from bench import read, run, write
from build import build_queries, pool
from checks import run_cases, stability
from export import SCHEMA, export


def select(sql):
    return (row.asDict(recursive=True) for row in spark.sql(sql).toLocalIterator())


def prepare(directory):
    directory = Path(directory)
    export(select, directory)
    facilities = read(directory/"facilities.jsonl")
    queries = build_queries(read(directory/"pins.jsonl"), facilities, complete=True)
    write(directory/"queries.jsonl", queries)
    log = select(f"SELECT query_id, ts, request_json, response_json FROM {SCHEMA}.gold_query_log") if spark.catalog.tableExists(f"{SCHEMA}.gold_query_log") else None
    write(directory/"judge_packets.jsonl", pool(queries, facilities, log))


def evaluate(directory, *, find_care=None, shadow=None, weighted=None, weights=None):
    directory = Path(directory)
    log = None
    if not find_care and spark.catalog.tableExists(f"{SCHEMA}.gold_query_log"):
        log = select(f"SELECT query_id, ts, request_json, response_json FROM {SCHEMA}.gold_query_log")
    queries = read(directory/"queries.jsonl")
    out = directory/"report"
    run(queries, read(directory/"facilities.jsonl"), read(directory/"references.jsonl"), out,
        find_care=find_care, log=log)
    if shadow:
        write(out/"case_results.jsonl", run_cases(read(directory/"cases.jsonl"), read(directory/"shadow_sources.jsonl"), shadow))
    if weighted:
        write(out/"stability.jsonl", stability((q for q in queries if not q.get("clarification")), weighted, weights))
