import type { ContextUnavailableStatus } from '../domain/context.js';
import type { Role } from '../domain/client-identity.js';
import { createActiveRequesterResolver, type ActiveRequesterDependencies } from './resolve-active-requester.js';

export type SetRequesterRoleOverrideCommand = Readonly<{
  discordUserId: string;
  role: Role;
}>;

export type SetRequesterRoleOverrideResult =
  Readonly<{ status: 'updated'; effectiveRole: Role }> | Readonly<{ status: ContextUnavailableStatus }>;

export type SetRequesterRoleOverride = (command: SetRequesterRoleOverrideCommand) => SetRequesterRoleOverrideResult;

type SetRequesterRoleOverrideDependencies = ActiveRequesterDependencies;

export function createSetRequesterRoleOverride(
  dependencies: SetRequesterRoleOverrideDependencies
): SetRequesterRoleOverride {
  const resolveActiveRequester = createActiveRequesterResolver(dependencies);

  return (command) => {
    const requesterResult = resolveActiveRequester(command.discordUserId);

    if (requesterResult.status !== 'ready') {
      return requesterResult;
    }

    const { requester, activeState } = requesterResult;

    const otherOverrides = activeState.roleOverrides.filter((entry) => entry.clientId !== requester.identity.clientId);
    const roleOverrides = [
      ...otherOverrides,
      Object.freeze({ clientId: requester.identity.clientId, role: command.role }),
    ];
    roleOverrides.sort((left, right) => left.clientId.localeCompare(right.clientId));
    dependencies.activeMatchStore.replaceActive(
      Object.freeze({ ...activeState, roleOverrides: Object.freeze(roleOverrides) })
    );

    return Object.freeze({ status: 'updated', effectiveRole: command.role });
  };
}
