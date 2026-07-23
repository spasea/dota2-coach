.PHONY: fetch-tts-model lock-tts smoke-tts test test-runtime test-tts

COMPOSE := docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml
TTS_MODEL_PATH := .artifacts/tts/v5_5_ru.pt
TTS_MODEL_SHA256 := 50081637b602126ee06cb3bc8a744d25651d2da149ee8864b9a379bfdd934437
TTS_MODEL_SIZE := 145420684
TTS_MODEL_URL := https://drive.usercontent.google.com/download?id=1NWCgDckBnIsCaZ7Tc9pBNllj8jT1Tp5o&export=download&confirm=t

fetch-tts-model:
	@set -eu; \
	model_path="$(TTS_MODEL_PATH)"; \
	partial_path="$${model_path}.part"; \
	mkdir -p .artifacts/tts; \
	trap 'rm -f "$$partial_path"' EXIT; \
	curl --fail --location \
		--retry 3 \
		--retry-all-errors \
		--connect-timeout 10 \
		--max-time 900 \
		--output "$$partial_path" \
		"$(TTS_MODEL_URL)"; \
	actual_size="$$(wc -c < "$$partial_path" | tr -d '[:space:]')"; \
	if [ "$$actual_size" != "$(TTS_MODEL_SIZE)" ]; then \
		echo "Unexpected TTS model size: $$actual_size" >&2; \
		exit 1; \
	fi; \
	actual_sha256="$$(shasum -a 256 "$$partial_path" | awk '{print $$1}')"; \
	if [ "$$actual_sha256" != "$(TTS_MODEL_SHA256)" ]; then \
		echo "Unexpected TTS model SHA-256: $$actual_sha256" >&2; \
		exit 1; \
	fi; \
	mv "$$partial_path" "$$model_path"; \
	echo "TTS model ready: $$model_path ($$actual_size bytes, sha256=$$actual_sha256)"

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
