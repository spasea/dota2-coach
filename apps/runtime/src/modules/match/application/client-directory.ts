import type { ClientIdentity } from '../domain/latest-client-state.js';

export type ClientDirectory = Readonly<{
  resolveDiscordUserId: (discordUserId: string) => ClientIdentity | null;
}>;
