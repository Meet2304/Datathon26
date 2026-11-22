# Common tasks. Everything runs inside the uv-managed environment (.venv), so no global installs are needed.
# Java 17 is required only for the local Spark targets (macOS: brew install openjdk@17).
JAVA_HOME ?= $(shell /usr/libexec/java_home -v 17 2>/dev/null || echo /opt/homebrew/opt/openjdk@17)
export JAVA_HOME

.PHONY: help setup lint test test-fast pipeline-local pilot deploy-pipeline eval-deploy app-build app-run app-deploy clean

help:            ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

setup:           ## create .venv with every dependency group and install the git hooks
	uv sync --all-groups
	uv run pre-commit install

lint:            ## ruff over Python, notebooks and tests
	uv run ruff check .

test:            ## full test suite, including the local Spark run of the notebook (~20 s)
	uv run pytest

test-fast:       ## tests without Spark
	uv run pytest -m "not spark"

pipeline-local:  ## run the pipeline notebook on local Spark over the 15 pilot facilities -> .local_spark/
	uv run python scripts/run_local_pipeline.py

pilot:           ## regenerate the eval-bench pilot report (eval_bench/data/pilot/report)
	uv run python eval_bench/pilot.py

deploy-pipeline: ## upload the notebook to Databricks and run it on serverless (needs .env)
	uv run python scripts/deploy_pipeline.py

eval-deploy:     ## run the full evaluation on Databricks: make eval-deploy STAGE=all
	uv run python evaluation/deploy_eval.py --stage $(or $(STAGE),all)

app-build:       ## build the React front end into app/static (needs Node 20+)
	cd app/frontend && npm ci && npm run build

app-run:         ## run the app locally against your workspace (http://localhost:8000)
	cd app && DATABRICKS_AUTH_TYPE=external-browser FTRC_LOG=0 uv run --group app python app.py

app-deploy:      ## deploy the app to Databricks Apps
	cd app && uv run --group app python deploy_app.py

clean:           ## remove local build/run artefacts
	rm -rf .local_spark .pytest_cache .ruff_cache spark-warehouse metastore_db derby.log
	find . -name __pycache__ -type d -prune -not -path './.venv/*' -exec rm -rf {} +
