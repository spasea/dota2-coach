# Local Discord runtime operations

The tracked development configuration keeps Discord disabled, so the normal runtime and health check need no bot
token or external Discord connection.

```bash
docker compose -f ops/dev/docker-compose.yml config
docker compose -f ops/dev/docker-compose.yml up --build runtime
```

## Enable Discord and create the control panel

1. Copy `ops/dev/secrets/runtime/discord-credentials.example.yaml` to
   `ops/dev/secrets/runtime/discord-credentials.local.yaml` and replace the placeholder token. Local secret files are
   ignored by Git.
2. Change `ops/dev/config/runtime/discord.yaml` to an enabled document without `control_message_id`:

   ```yaml
   schema_version: 1

   discord:
     enabled: true
     guild_id: "123456789012345678"
     text_channel_id: "234567890123456789"
     action_debounce_ms: 5000
   ```

3. Set these local `.env` values:

   ```dotenv
   DISCORD_CREDENTIALS_PATH=/run/secrets/dota2-coach/discord-credentials.local.yaml
   DISCORD_CREATE_PANEL=true
   ```

4. Run the one-shot process without the development file watcher:

   ```bash
   docker compose --env-file ops/dev/.env -f ops/dev/docker-compose.yml run --rm --no-deps runtime npx tsx src/main.ts
   ```

On success, copy `controlMessageId` from the `DISCORD_PANEL_CREATED` log into the public configuration as
`control_message_id`. Then set `DISCORD_CREATE_PANEL=false` and start the normal service. Normal serving validates and
reuses that pinned message; it does not create or mutate the panel.

The bot needs only View Channel, Read Message History, Send Messages, and Manage Messages (for pinning) in the
configured text channel. Provisioning exits without binding the HTTP port. Normal startup exposes HTTP readiness only
after Discord login and panel validation succeed.
