"""Well-known paths inside the repository."""

from pathlib import Path


def _find_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "pyproject.toml").is_file() and (parent / "notebooks").is_dir():
            return parent
    raise RuntimeError(f"Could not find the repository root above {here}")


ROOT = _find_root()
NOTEBOOKS = ROOT / "notebooks"
EXPERIMENTS = ROOT / "experiments"
PILOT_FACILITIES = EXPERIMENTS / "llm_vs_regex" / "facilities_15.json"
EVAL_BENCH = ROOT / "eval_bench"
EVALUATION = ROOT / "evaluation"
RESULTS = ROOT / "results"
