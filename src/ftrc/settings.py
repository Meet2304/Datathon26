"""Databricks connection settings, read from the environment (or a ``.env`` file loaded by the caller).

Nothing here has a default workspace: copy ``.env.example`` to ``.env`` and fill it in. Tokens are never written to disk
by these helpers and must never be committed.
"""

import os
from pathlib import Path


def load_dotenv(path: Path | None = None) -> None:
    """Minimal ``.env`` loader (KEY=VALUE lines). Existing environment variables win."""
    from ftrc.paths import ROOT

    path = path or ROOT / ".env"
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _require(name: str, hint: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} is not set. {hint} (see .env.example)")
    return value


def databricks_host(override: str | None = None) -> str:
    """Workspace URL, e.g. https://dbc-xxxxxxxx-xxxx.cloud.databricks.com (no trailing slash)."""
    load_dotenv()
    return (override or _require("DATABRICKS_HOST", "Set it to your workspace URL")).rstrip("/")


def databricks_token(token_file: str | None = None) -> str:
    """Personal access token from ``--token-file`` or ``$DATABRICKS_TOKEN``."""
    if token_file:
        return Path(token_file).read_text().strip()
    load_dotenv()
    return _require("DATABRICKS_TOKEN", "Pass --token-file or export a personal access token")


def warehouse_id(override: str | None = None) -> str:
    """SQL warehouse id (``$DATABRICKS_WAREHOUSE_ID``; ``$DATABRICKS_WAREHOUSE`` is accepted for older scripts)."""
    load_dotenv()
    value = override or os.environ.get("DATABRICKS_WAREHOUSE_ID") or os.environ.get("DATABRICKS_WAREHOUSE")
    if not value:
        raise SystemExit("DATABRICKS_WAREHOUSE_ID is not set (see .env.example)")
    return value
