# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:0.11.16 AS uv

FROM python:3.11.15-slim-bookworm AS python-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

FROM python-base AS base

ENV UV_PROJECT_ENVIRONMENT=/opt/venv

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

FROM python-base AS model

COPY --chmod=0444 .artifacts/tts/v5_5_ru.pt /opt/dota2-coach/models/v5_5_ru.pt

RUN test "$(wc -c < /opt/dota2-coach/models/v5_5_ru.pt)" = "145420684" \
    && echo "50081637b602126ee06cb3bc8a744d25651d2da149ee8864b9a379bfdd934437  /opt/dota2-coach/models/v5_5_ru.pt" \
        | sha256sum --check --strict -

FROM base AS runtime-dependencies

COPY apps/tts/pyproject.toml apps/tts/uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --group runtime --no-install-project

FROM runtime-dependencies AS development

COPY apps/tts/ ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --group runtime

COPY --from=model /opt/dota2-coach/models /opt/dota2-coach/models

ENV PATH="/opt/venv/bin:${PATH}" \
    TTS_CONFIG_PATH=/etc/dota2-coach/tts.yaml

CMD ["python", "-m", "tts_service.main"]

FROM runtime-dependencies AS runtime-build

COPY apps/tts/ ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --group runtime --no-editable

FROM python-base AS runtime

RUN groupadd --system tts \
    && useradd --system --gid tts --no-create-home tts

COPY --from=runtime-build /opt/venv /opt/venv
COPY --from=model /opt/dota2-coach/models /opt/dota2-coach/models
COPY apps/tts/THIRD_PARTY_NOTICES.md /licenses/THIRD_PARTY_NOTICES.md

ENV PATH="/opt/venv/bin:${PATH}" \
    TTS_CONFIG_PATH=/etc/dota2-coach/tts.yaml

USER tts

EXPOSE 8080

CMD ["python", "-m", "tts_service.main"]
