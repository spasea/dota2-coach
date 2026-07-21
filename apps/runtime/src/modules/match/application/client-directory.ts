import type { ClientIdentity } from '../domain/client-identity.js';

export type ClientDirectory = Readonly<{
  resolveDiscordUserId: (discordUserId: string) => ClientIdentity | null;
}>;
