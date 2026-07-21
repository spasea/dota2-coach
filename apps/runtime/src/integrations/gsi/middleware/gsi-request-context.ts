import type { Response } from 'express';

import type { ClientIdentity, ClientSnapshot } from '../../../modules/match/public.js';

export type ParsedGsiRequest = Readonly<{
  stage: 'parsed';
  gsiToken?: string;
  snapshot: ClientSnapshot;
}>;

export type AuthenticatedGsiRequest = Readonly<{
  stage: 'authenticated';
  identity: ClientIdentity;
  snapshot: ClientSnapshot;
}>;

export type GsiRequestContext = ParsedGsiRequest | AuthenticatedGsiRequest;

interface GsiLocals {
  gsiRequestContext?: GsiRequestContext;
}

export function getGsiRequestContext(response: Response): GsiRequestContext {
  const context = (response.locals as GsiLocals).gsiRequestContext;

  if (context === undefined) {
    throw new Error('GSI request middleware must initialize request context.');
  }

  return context;
}

export function setGsiRequestContext(response: Response, context: GsiRequestContext): void {
  (response.locals as GsiLocals).gsiRequestContext = context;
}
