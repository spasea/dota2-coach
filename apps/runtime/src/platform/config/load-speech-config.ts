import type { ReadConfigText, SpeechConfiguration } from './config.types.js';
import type { SpeechProcessSettings } from './parse-speech-process-settings.js';

export function loadSpeechConfig(
  settings: SpeechProcessSettings,
  readConfigText: ReadConfigText
): Promise<SpeechConfiguration> {
  void settings;
  void readConfigText;
  return Promise.reject(new Error('Speech configuration loading is not implemented.'));
}
