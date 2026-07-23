import type { SpeechConfiguration, SpeechConfigYamlSources } from './config.types.js';

export function parseSpeechConfig(sources: SpeechConfigYamlSources): SpeechConfiguration {
  void sources;
  throw new Error('Speech configuration parsing is not implemented.');
}
