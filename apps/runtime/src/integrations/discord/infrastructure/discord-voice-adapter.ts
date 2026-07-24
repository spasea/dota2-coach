import type { SpeechAudioArtifact, VoiceOutput } from '../../../modules/speech/public.js';

export type DiscordVoicePermission = 'view_channel' | 'connect' | 'speak';

export type DiscordVoiceChannel = Readonly<{
  guildId: string;
  channelId: string;
  kind: 'guild_voice' | 'unsupported';
  permissions: readonly DiscordVoicePermission[];
}>;

export type DiscordAudioResource = Readonly<{
  kind: 'wav';
}>;

export type DiscordAudioPlayer = Readonly<{
  play: (resource: DiscordAudioResource) => void;
  waitUntilPlaying: (signal: AbortSignal) => Promise<void>;
  waitUntilIdle: (signal: AbortSignal) => Promise<void>;
  stop: () => void;
}>;

export type DiscordVoiceSubscription = Readonly<{
  unsubscribe: () => void;
}>;

export type DiscordVoiceConnection = Readonly<{
  waitUntilReady: (signal: AbortSignal) => Promise<void>;
  subscribe: (player: DiscordAudioPlayer) => DiscordVoiceSubscription;
  destroy: () => void;
}>;

export type DiscordVoiceAdapterOptions = Readonly<{
  guildId: string;
  voiceChannelId: string;
}>;

export type DiscordVoiceAdapterDependencies = Readonly<{
  resolveVoiceChannel: (guildId: string, channelId: string) => Promise<DiscordVoiceChannel>;
  joinVoiceChannel: (channel: DiscordVoiceChannel) => DiscordVoiceConnection;
  createAudioPlayer: () => DiscordAudioPlayer;
  createWavResource: (artifact: SpeechAudioArtifact) => DiscordAudioResource;
}>;

export type DiscordVoiceAdapter = VoiceOutput &
  Readonly<{
    recover: (signal: AbortSignal) => Promise<'ready' | 'unavailable'>;
    destroy: () => Promise<void>;
  }>;

export function createDiscordVoiceAdapter(
  options: DiscordVoiceAdapterOptions,
  dependencies: DiscordVoiceAdapterDependencies
): DiscordVoiceAdapter {
  void options;
  void dependencies;
  const unavailable = (): Promise<never> => Promise.reject(new Error('Discord voice adapter is not implemented.'));

  return Object.freeze({
    recover: () => Promise.resolve('unavailable' as const),
    waitUntilReady: unavailable,
    play: unavailable,
    stop: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  });
}
