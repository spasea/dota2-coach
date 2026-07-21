export type Role = 1 | 2 | 3 | 4 | 5;

export type ClientIdentity = Readonly<{
  clientId: string;
  discordUserId: string;
  coachAlias: string;
  defaultRole: Role;
}>;
