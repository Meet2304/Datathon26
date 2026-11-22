import ast
import sys

import pytest

from ftrc import ROOT, notebook_code

APP = ROOT / "app"


@pytest.fixture(scope="session")
def notebook_constants() -> dict:
    """Top-level literal assignments (PROFILE, SERVICES, ...) from the notebook's code cells, without running Spark."""
    found = {}
    for cell in notebook_code():
        for node in ast.parse(cell).body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                try:
                    found[node.targets[0].id] = ast.literal_eval(node.value)
                except ValueError:
                    pass
    return found


@pytest.fixture(scope="session")
def app_core():
    sys.path.insert(0, str(APP))
    try:
        import find_care_core
    finally:
        sys.path.remove(str(APP))
    return find_care_core
