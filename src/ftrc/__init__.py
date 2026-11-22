"""Find the Right Care: shared helpers for the repo's scripts.

The pipeline itself lives in ``notebooks/find_care_v5.ipynb`` (a Databricks notebook). This small package only
holds what the local scripts share: repo paths, Databricks settings from the environment, and the conversion of the
notebook into Databricks "SOURCE" text so it can be executed locally or uploaded as a library copy.
"""

from ftrc.notebook import NOTEBOOK, load_notebook, notebook_code, notebook_source
from ftrc.paths import ROOT
from ftrc.settings import databricks_host, databricks_token, warehouse_id

__all__ = [
    "NOTEBOOK",
    "ROOT",
    "databricks_host",
    "databricks_token",
    "load_notebook",
    "notebook_code",
    "notebook_source",
    "warehouse_id",
]
