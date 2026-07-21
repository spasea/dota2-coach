import { createHash } from 'node:crypto';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import type {
  ClientConfigYamlSources,
  ClientRole,
  TrustedClientIdentity,
  TrustedClientRegistry,
} from './config.types.js';
import { ConfigurationError } from './configuration-error.js';

const clientIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const clientsDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    clients: z
      .record(
        clientIdSchema,
        z
          .object({
            default_role: z.number().int().min(1).max(5),
          })
          .strict()
      )
      .refine((clients) => Object.keys(clients).length > 0),
  })
  .strict();

const credentialsDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    client_credentials: z
      .record(
        clientIdSchema,
        z
          .object({
            gsi_token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
            discord_user_id: z.string().regex(/^\d{17,20}$/),
            coach_alias: z.string().trim().min(1).max(64),
          })
          .strict()
      )
      .refine((credentials) => Object.keys(credentials).length > 0),
  })
  .strict();

type ConfigurationDocumentSource = 'clients' | 'credentials';

function parseDocument(yaml: string, source: ConfigurationDocumentSource): unknown {
  try {
    return parseYaml(yaml);
  } catch {
    throw new ConfigurationError({ source, stage: 'syntax' });
  }
}

function digestToken(gsiToken: string): string {
  return createHash('sha256').update(gsiToken, 'utf8').digest('base64url');
}

export function parseClientConfig(sources: ClientConfigYamlSources): TrustedClientRegistry {
  const clientsResult = clientsDocumentSchema.safeParse(parseDocument(sources.clientsYaml, 'clients'));

  if (!clientsResult.success) {
    throw new ConfigurationError({ source: 'clients', stage: 'validation' });
  }

  const credentialsResult = credentialsDocumentSchema.safeParse(parseDocument(sources.credentialsYaml, 'credentials'));

  if (!credentialsResult.success) {
    throw new ConfigurationError({ source: 'credentials', stage: 'validation' });
  }

  const clients = clientsResult.data.clients;
  const credentials = credentialsResult.data.client_credentials;
  const clientIds = Object.keys(clients);

  if (
    clientIds.length !== Object.keys(credentials).length ||
    clientIds.some((clientId) => credentials[clientId] === undefined)
  ) {
    throw new ConfigurationError({ source: 'combined', stage: 'validation' });
  }

  const identitiesByTokenDigest = new Map<string, TrustedClientIdentity>();
  const discordUserIds = new Set<string>();

  for (const clientId of clientIds) {
    const client = clients[clientId];
    const credential = credentials[clientId];

    if (client === undefined || credential === undefined) {
      throw new ConfigurationError({ source: 'combined', stage: 'validation' });
    }

    const tokenDigest = digestToken(credential.gsi_token);

    if (identitiesByTokenDigest.has(tokenDigest) || discordUserIds.has(credential.discord_user_id)) {
      throw new ConfigurationError({ source: 'combined', stage: 'validation' });
    }

    const identity: TrustedClientIdentity = Object.freeze({
      clientId,
      discordUserId: credential.discord_user_id,
      coachAlias: credential.coach_alias,
      defaultRole: client.default_role as ClientRole,
    });

    identitiesByTokenDigest.set(tokenDigest, identity);
    discordUserIds.add(credential.discord_user_id);
  }

  return Object.freeze({
    resolveToken: (gsiToken: string) => identitiesByTokenDigest.get(digestToken(gsiToken)) ?? null,
    resolveDiscordUserId: () => null,
  });
}
