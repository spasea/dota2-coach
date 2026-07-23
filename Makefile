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
	LOCAL_UID="$$(id -u)" LOCAL_GID="$$(id -g)" \
		$(COMPOSE) run --rm --build tts-lock

smoke-tts:
	$(COMPOSE) exec tts python scripts/smoke.py

test-runtime:
	$(COMPOSE) exec runtime sh -c "npm run check"
