import type { CoachLocale } from '../../../platform/i18n/locale.js';
import type { LostTranslator } from '../application/lost-translator.js';
import { createRussianLostTranslator } from './russian-lost-translator.js';

const translatorFactories = Object.freeze({
  ru: createRussianLostTranslator,
}) satisfies Readonly<Record<CoachLocale, () => LostTranslator>>;

export function createLostTranslator(locale: CoachLocale): LostTranslator {
  return translatorFactories[locale]();
}
