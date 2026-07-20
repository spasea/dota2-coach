export type ClientRole = 1 | 2 | 3 | 4 | 5;

export type TrustedClientIdentity = Readonly<{
  clientId: string;
  discordUserId: string;
  coachAlias: string;
  defaultRole: ClientRole;
}>;

export type TrustedClientRegistry = Readonly<{
  resolveToken: (bearerToken: string) => TrustedClientIdentity | null;
}>;

export type ClientConfigYamlSources = Readonly<{
  clientsYaml: string;
  credentialsYaml: string;
}>;

export type ClientConfigPaths = Readonly<{
  clientConfigPath: string;
  clientCredentialsPath: string;
}>;

export type ReadConfigText = (path: string) => Promise<string>;
