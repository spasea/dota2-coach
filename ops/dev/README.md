# Local Discord runtime operations

The tracked development configuration enables Discord text, Discord voice, TTS, and the protected manual speech
endpoint. Local credential files are ignored by Git.

```bash
cp ops/dev/secrets/runtime/discord-credentials.example.yaml \
  ops/dev/secrets/runtime/discord-credentials.local.yaml
cp ops/dev/secrets/runtime/speech-credentials.example.yaml \
  ops/dev/secrets/runtime/speech-credentials.local.yaml
```

Replace both placeholders before starting the stack. The Discord bot needs:

- View Channel, Read Message History, Send Messages, and Manage Messages in the configured text channel;
- View Channel, Connect, and Speak in the configured normal guild voice channel.

The configured text and voice channels must belong to the configured guild. Stage channels are not supported.

```bash
docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml config
docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml up --build runtime tts
```

The runtime joins voice asynchronously after Discord text/panel validation. HTTP readiness, GSI, and Lost text remain
available while TTS is warming up, absent, or temporarily unavailable. TTS port `8080` is private to the Compose
network and is not published to the host.

## Create or replace the Discord control panel

1. Temporarily remove `control_message_id` from `ops/dev/config/runtime/discord.yaml`.
2. Set this local `.env` value:

   ```dotenv
   DISCORD_CREATE_PANEL=true
   ```

3. Run the one-shot process without the development file watcher:

   ```bash
   docker compose --env-file ops/dev/.env \
     --project-directory ops/dev \
     -f ops/dev/docker-compose.yml \
     run --rm --no-deps runtime npx tsx src/main.ts
   ```

On success, copy `controlMessageId` from the `DISCORD_PANEL_CREATED` log into the public configuration as
`control_message_id`. Then set `DISCORD_CREATE_PANEL=false` and start the normal service. Normal serving validates and
reuses that pinned message; it does not create or mutate the panel. Provisioning remains text-only: it neither loads
speech configuration nor joins voice.

## Manual speech smoke

Read the Bearer token from the ignored speech credentials file and submit:

```bash
curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer ${MANUAL_SPEECH_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"speaker":"aidar","text":"Проверка ручного синтеза речи."}' \
  http://127.0.0.1:3000/internal/speech-jobs
```

A healthy speech path returns `202` with an opaque job ID. While recovery is text-only, the same valid request returns
the stable `503 SPEECH_UNAVAILABLE` response.
