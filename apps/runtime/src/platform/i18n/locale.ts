export const SUPPORTED_COACH_LOCALES = ['ru'] as const;

export type CoachLocale = (typeof SUPPORTED_COACH_LOCALES)[number];
