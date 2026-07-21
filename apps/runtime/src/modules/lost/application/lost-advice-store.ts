import type { LostAdviceMemory } from '../domain/recommendation.js';

export type LostAdviceStore = Readonly<{
  get: (clientId: string) => LostAdviceMemory | null;
  save: (memory: LostAdviceMemory) => void;
}>;
