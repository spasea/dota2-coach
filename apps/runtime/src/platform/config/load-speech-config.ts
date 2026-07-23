import type { ReadConfigText, SpeechConfiguration } from './config.types.js';
import { ConfigurationError } from './configuration-error.js';
import { completeSpeechConfig, parseSpeechPublicConfig, type ParsedSpeechPublicConfig } from './parse-speech-config.js';
import type { SpeechProcessSettings } from './parse-speech-process-settings.js';

export async function loadSpeechConfig(
  settings: SpeechProcessSettings,
  readConfigText: ReadConfigText
): Promise<SpeechConfiguration> {
  const configYaml = await readSpeechSource(settings.speechConfigPath, 'speech', readConfigText);
  const publicConfig = parseSpeechPublicConfig(configYaml);

  if (!requiresCredentials(publicConfig)) {
    if (settings.speechCredentialsPath !== null) {
      throw new ConfigurationError({ source: 'speech_combined', stage: 'validation' });
    }

    return completeSpeechConfig(publicConfig, undefined);
  }

  if (settings.speechCredentialsPath === null) {
    throw new ConfigurationError({ source: 'speech_combined', stage: 'validation' });
  }

  const credentialsYaml = await readSpeechSource(settings.speechCredentialsPath, 'speech_credentials', readConfigText);

  return completeSpeechConfig(publicConfig, credentialsYaml);
}

function requiresCredentials(publicConfig: ParsedSpeechPublicConfig): publicConfig is Extract<
  ParsedSpeechPublicConfig,
  { enabled: true }
> & {
  manual: { enabled: true };
} {
  return publicConfig.enabled && publicConfig.manual.enabled;
}

async function readSpeechSource(
  path: string,
  source: 'speech' | 'speech_credentials',
  readConfigText: ReadConfigText
): Promise<string> {
  try {
    return await readConfigText(path);
  } catch {
    throw new ConfigurationError({ source, stage: 'source' });
  }
}
