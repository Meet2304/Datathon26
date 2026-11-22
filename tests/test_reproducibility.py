"""Committed results must be regenerable byte-for-byte from committed inputs.

Each test copies the inputs to a temporary tree, reruns the script there, and compares with what is in git.
"""

import filecmp
import os
import shutil
import subprocess
import sys

import pytest

from ftrc import ROOT
from ftrc.paths import EVAL_BENCH

EXP = ROOT / "experiments" / "llm_vs_regex"


def _run(args, cwd):
    env = {**os.environ, "PYTHONHASHSEED": "0"}
    subprocess.run([sys.executable, *args], cwd=cwd, env=env, check=True, capture_output=True, text=True)


def test_eval_bench_pilot_reproduces(tmp_path):
    shutil.copytree(EVAL_BENCH, tmp_path / "eval_bench", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(EXP, tmp_path / "experiments" / "llm_vs_regex")
    _run(["eval_bench/pilot.py"], cwd=tmp_path)
    cmp = filecmp.dircmp(EVAL_BENCH / "data" / "pilot", tmp_path / "eval_bench" / "data" / "pilot")
    report = filecmp.dircmp(EVAL_BENCH / "data" / "pilot" / "report", tmp_path / "eval_bench" / "data" / "pilot" / "report")
    assert not cmp.diff_files and not report.diff_files, (cmp.diff_files, report.diff_files)
    assert not cmp.left_only and not report.left_only


@pytest.mark.parametrize("run", ["run1", "run2"])
def test_llm_arm_rescoring_reproduces(tmp_path, run):
    shutil.copytree(EXP, tmp_path / "exp")
    _run([str(EXP / "score_features.py"), str(tmp_path / "exp"), f"llm_features_{run}.csv", f"llm_evidence_{run}.csv", f"llm_{run}"],
         cwd=tmp_path)
    for name in (f"features_llm_{run}.csv", f"evidence_llm_{run}.csv", f"ranking_llm_{run}.csv", f"quotecheck_llm_{run}.txt"):
        assert filecmp.cmp(EXP / name, tmp_path / "exp" / name, shallow=False), name
