"""End to end: run the notebook on local Spark over the 15 pilot facilities (slow, needs Java 17).

Run with `uv sync --group spark` and `uv run pytest -m spark`. The notebook itself asserts the 12 regression
fixtures; the harness asserts the 4 pilot checks; this test also checks the responses match the recorded ones.
"""

import importlib.util
import json
import os
import shutil
import subprocess
import sys

import pytest

from ftrc import ROOT

pytestmark = pytest.mark.spark

VOLATILE = {"query_id", "ts", "elapsed_ms", "latency_ms"}


def _java_available() -> bool:
    java_home = os.environ.get("JAVA_HOME")
    return bool((java_home and os.path.exists(os.path.join(java_home, "bin", "java"))) or shutil.which("java"))


def _strip(o):
    if isinstance(o, dict):
        return {k: _strip(v) for k, v in o.items() if k not in VOLATILE}
    if isinstance(o, list):
        return [_strip(x) for x in o]
    return o


@pytest.mark.skipif(importlib.util.find_spec("pyspark") is None, reason="pyspark not installed (uv sync --group spark)")
@pytest.mark.skipif(not _java_available(), reason="Java 17 not found (set JAVA_HOME)")
def test_local_pipeline_matches_recorded_pilot(tmp_path):
    work = tmp_path / "spark"
    proc = subprocess.run([sys.executable, str(ROOT / "scripts" / "run_local_pipeline.py"), str(work)],
                          capture_output=True, text=True, timeout=1200)
    assert proc.returncode == 0, proc.stdout[-3000:] + proc.stderr[-3000:]

    summary = json.loads((work / "summary.json").read_text())
    assert all(summary["pilot_checks"].values()), summary["pilot_checks"]

    new = json.loads((work / "pilot_responses.json").read_text())
    old = json.loads((ROOT / "results" / "pipeline" / "local_pilot_responses.json").read_text())
    assert _strip(new) == _strip(old)
