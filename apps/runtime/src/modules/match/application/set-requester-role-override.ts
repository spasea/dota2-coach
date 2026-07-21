import type { ContextUnavailableStatus } from '../domain/context.js';
import type { Role } from '../domain/client-identity.js';
import type { ActiveMatchStore } from './active-match-store.js';
import type { ClientDirectory } from './client-directory.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';

export type SetRequesterRoleOverrideCommand = Readonly<{
  discordUserId: string;
  role: Role;
}>;

export type SetRequesterRoleOverrideResult =
  Readonly<{ status: 'updated'; effectiveRole: Role }> | Readonly<{ status: ContextUnavailableStatus }>;

export type SetRequesterRoleOverride = (command: SetRequesterRoleOverrideCommand) => SetRequesterRoleOverrideResult;

type SetRequesterRoleOverrideDependencies = Readonly<{
  activeMatchStore: ActiveMatchStore;
  clientDirectory: ClientDirectory;
  freshnessMs: number;
  latestStateStore: NormalizedLatestStateStore;
  monotonicNow: () => number;
}>;

export function createSetRequesterRoleOverride(
  dependencies: SetRequesterRoleOverrideDependencies
): SetRequesterRoleOverride {
  void dependencies;
  return () => Object.freeze({ status: 'client_not_found' });
}
