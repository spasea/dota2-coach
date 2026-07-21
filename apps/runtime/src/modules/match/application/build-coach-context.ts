import type { BuildCoachContextResult } from '../domain/context.js';
import type { ActiveMatchStore } from './active-match-store.js';
import type { ClientDirectory } from './client-directory.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';

export type BuildCoachContextQuery = Readonly<{
  discordUserId: string;
}>;

export type BuildCoachContext = (query: BuildCoachContextQuery) => BuildCoachContextResult;

type BuildCoachContextDependencies = Readonly<{
  activeMatchStore: ActiveMatchStore;
  clientDirectory: ClientDirectory;
  freshnessMs: number;
  latestStateStore: NormalizedLatestStateStore;
  monotonicNow: () => number;
}>;

export function createBuildCoachContext(dependencies: BuildCoachContextDependencies): BuildCoachContext {
  void dependencies;
  return () => Object.freeze({ status: 'client_not_found' });
}
