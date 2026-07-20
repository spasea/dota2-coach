export type ClientIdentity = Readonly<{
  clientId: string;
  discordUserId: string;
  coachAlias: string;
  defaultRole: 1 | 2 | 3 | 4 | 5;
}>;

export type ClientSnapshot = Readonly<Record<string, unknown>>;

export type LatestClientState = Readonly<{
  identity: ClientIdentity;
  receivedAt: string;
  snapshot: ClientSnapshot;
}>;
