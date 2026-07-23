.PHONY: lock-tts smoke-tts test test-runtime test-tts

COMPOSE := docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml

test:
	@tts_status=0; runtime_status=0; \
	$(MAKE) test-tts || tts_status=$$?; \
	$(MAKE) test-runtime || runtime_status=$$?; \
	if [ $$tts_status -ne 0 ] || [ $$runtime_status -ne 0 ]; then \
		exit 1; \
	fi

test-tts:
	$(COMPOSE) run --rm --build tts-test

lock-tts:
	docker run --rm \
		--user "$$(id -u):$$(id -g)" \
		--env UV_CACHE_DIR=/tmp/uv-cache \
		--volume "$(CURDIR)/apps/tts:/app" \
		--workdir /app \
		ghcr.io/astral-sh/uv:0.11.16 \
		/uv lock

smoke-tts:
	$(COMPOSE) exec tts python scripts/smoke.py

test-runtime:
	$(COMPOSE) exec runtime sh -c "npm run check"
