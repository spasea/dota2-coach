import { z } from 'zod';

import { ConfigurationError } from './configuration-error.js';

const speechProcessSettingsSchema = z.object({
  SPEECH_CONFIG_PATH: z.string().trim().min(1),
  SPEECH_CREDENTIALS_PATH: z.string().trim().min(1).optional(),
});

export type SpeechProcessSettings = Readonly<{
  speechConfigPath: string;
  speechCredentialsPath: string | null;
}>;

export function parseSpeechProcessSettings(
  environment: Readonly<Record<string, string | undefined>>
): SpeechProcessSettings {
  const result = speechProcessSettingsSchema.safeParse(environment);

  if (!result.success) {
    throw new ConfigurationError({ source: 'process', stage: 'validation' });
  }

  return Object.freeze({
    speechConfigPath: result.data.SPEECH_CONFIG_PATH,
    speechCredentialsPath: result.data.SPEECH_CREDENTIALS_PATH ?? null,
  });
}
