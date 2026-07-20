import { Router } from 'express';

import type { RecordClientSnapshot } from '../../modules/match/public.js';
import type { TrustedClientRegistry } from '../../platform/config/config.types.js';

export type GsiRouterDependencies = Readonly<{
  recordClientSnapshot: RecordClientSnapshot;
  trustedClientRegistry: TrustedClientRegistry;
}>;

export function createGsiRouter(dependencies: GsiRouterDependencies): Router {
  void dependencies;

  return Router();
}
