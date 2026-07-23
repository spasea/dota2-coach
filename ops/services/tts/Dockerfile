# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:0.11.16 AS uv

FROM python:3.11.15-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /app

COPY --from=uv /uv /usr/local/bin/uv

FROM base AS test-dependencies

COPY apps/tts/pyproject.toml apps/tts/uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --group test --no-install-project

FROM test-dependencies AS test

COPY apps/tts/ ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --group test

ENV PATH="/opt/venv/bin:${PATH}"

CMD ["sh", "scripts/check.sh"]
