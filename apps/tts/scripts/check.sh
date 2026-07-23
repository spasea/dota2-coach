#!/bin/sh
set -eu

uv run --frozen --no-sync ruff format --check .
uv run --frozen --no-sync ruff check .
uv run --frozen --no-sync mypy src tests
uv run --frozen --no-sync pytest
