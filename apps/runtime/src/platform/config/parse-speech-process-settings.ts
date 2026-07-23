export type SpeechProcessSettings = Readonly<{
  speechConfigPath: string;
  speechCredentialsPath: string | null;
}>;

export function parseSpeechProcessSettings(
  environment: Readonly<Record<string, string | undefined>>
): SpeechProcessSettings {
  void environment;
  throw new Error('Speech process settings parsing is not implemented.');
}
