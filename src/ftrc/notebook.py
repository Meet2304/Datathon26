"""Read the pipeline notebook and turn it into Databricks SOURCE text.

``notebooks/find_care_v5.ipynb`` is the single source of truth for the pipeline. Scripts that used to read a ``.py``
copy now call :func:`notebook_source` instead, so the notebook and what runs locally can never drift apart.
"""

import json
from pathlib import Path

from ftrc.paths import NOTEBOOKS

NOTEBOOK = NOTEBOOKS / "find_care_v5.ipynb"
CELL_SEP = "\n\n# COMMAND ----------\n\n"


def load_notebook(path: Path = NOTEBOOK) -> dict:
    return json.loads(Path(path).read_text())


def _cells(nb: dict) -> list[tuple[str, str]]:
    return [(c["cell_type"], "".join(c["source"])) for c in nb["cells"]]


def notebook_code(path: Path = NOTEBOOK) -> list[str]:
    """The code cells, in order."""
    return [src for kind, src in _cells(load_notebook(path)) if kind == "code"]


def notebook_source(path: Path = NOTEBOOK) -> str:
    """Databricks SOURCE format: markdown cells become ``# MAGIC %md`` comments, cells are split by COMMAND markers.

    The result is valid Python (markdown is comments), so it can be ``exec``-ed on local Spark or imported into a
    workspace with ``format=SOURCE, language=PYTHON``.
    """
    out = ["# Databricks notebook source"]
    for kind, src in _cells(load_notebook(path)):
        if kind == "markdown":
            lines = ("%md\n" + src).split("\n")
            src = "\n".join(f"# MAGIC {line}" if line else "# MAGIC" for line in lines)
        out.append(src)
    return CELL_SEP.join(out) + "\n"
