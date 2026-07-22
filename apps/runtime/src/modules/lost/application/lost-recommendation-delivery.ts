import type { Role } from '../../match/public.js';

export type LostRecommendationAudience = Readonly<{
  kind: 'individual';
  displayName: string;
}>;

export type LostRecommendationDelivery = Readonly<{
  audience: LostRecommendationAudience;
  effectiveRole: Role;
}>;
