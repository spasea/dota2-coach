export type ClientIdentity = Readonly<{
  clientId: string;
  discordUserId: string;
  coachAlias: string;
  defaultRole: 1 | 2 | 3 | 4 | 5;
}>;
