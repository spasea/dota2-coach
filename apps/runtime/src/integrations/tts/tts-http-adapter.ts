import type { SynthesizeSpeech } from '../../modules/speech/public.js';

export type TtsHttpAdapterOptions = Readonly<{
  baseUrl: string;
  maxAudioBytes: number;
}>;

export type TtsHttpAdapterDependencies = Readonly<{
  fetch: typeof globalThis.fetch;
}>;

export function createTtsHttpAdapter(
  options: TtsHttpAdapterOptions,
  dependencies: TtsHttpAdapterDependencies
): SynthesizeSpeech {
  void options;
  void dependencies;

  return () => Promise.reject(new Error('TTS HTTP adapter is not implemented.'));
}
