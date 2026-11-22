"""The pipeline notebook is the single source of truth: it must stay clean, parse, and keep the hooks scripts rely on."""

import ast

from ftrc import load_notebook, notebook_code, notebook_source


def test_notebook_is_databricks_python_without_outputs():
    nb = load_notebook()
    assert "application/vnd.databricks.v1+notebook" in nb["metadata"]
    code = [c for c in nb["cells"] if c["cell_type"] == "code"]
    assert len(code) >= 20
    # Outputs would leak workspace data into git and make diffs unreadable.
    assert all(not c.get("outputs") for c in code), "clear notebook outputs before committing"


def test_every_code_cell_parses():
    for i, cell in enumerate(notebook_code()):
        ast.parse(cell, filename=f"cell {i}")


def test_source_conversion_is_valid_python():
    src = notebook_source()
    assert src.startswith("# Databricks notebook source\n")
    compile(src, "find_care_v5.ipynb", "exec")


def test_hooks_used_by_evaluation_deploy_are_present():
    # evaluation/deploy_eval.py patches these two snippets to make a library copy of the notebook.
    src = notebook_source()
    assert '    dbutils.notebook.exit(json.dumps(_lite, default=str)[:900000])  # noqa: F821' in src
    assert 'resp = find_care(W["service"], W["location"], int(W["k"]))\nshow(resp)' in src


def test_regression_fixtures_cover_every_v5_fix():
    # PLAN_V5 §6: the build hard-fails if any fixture fails, so make sure they are all still there.
    src = "\n".join(notebook_code())
    for case in [f"F{i}" for i in range(1, 13)]:
        assert f'("{case}",' in src, f"fixture {case} missing"
