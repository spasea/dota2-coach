import { describe, expect, it, jest } from '@jest/globals';

import type { SpeechAudioArtifact } from '../../../modules/speech/public.js';
import {
  createDiscordVoiceAdapter,
  type DiscordAudioPlayer,
  type DiscordAudioResource,
  type DiscordVoiceAdapterDependencies,
  type DiscordVoiceChannel,
  type DiscordVoiceConnection,
  type DiscordVoiceSubscription,
} from './discord-voice-adapter.js';

const guildId = '123456789012345678';
const voiceChannelId = '234567890123456789';
const artifact: SpeechAudioArtifact = Object.freeze({
  bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
  contentType: 'audio/wav',
  sampleRateHz: 48_000,
});

describe('Discord voice adapter', () => {
  it('resolves the exact normal guild voice channel with View, Connect, and Speak before joining once', async () => {
    const fixture = createVoiceFixture();
    const signal = new AbortController().signal;

    await expect(fixture.adapter.recover(signal)).resolves.toBe('ready');

    expect(fixture.resolveVoiceChannel).toHaveBeenCalledWith(guildId, voiceChannelId);
    expect(fixture.operations).toEqual([
      'resolve_voice_channel',
      'join_voice_channel',
      'create_audio_player',
      'subscribe_player',
      'wait_connection_ready',
    ]);
    expect(fixture.joinVoiceChannel).toHaveBeenCalledTimes(1);
    expect(fixture.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(fixture.subscribe).toHaveBeenCalledTimes(1);
  });

  it('creates one WAV resource and completes only after Playing followed by Idle', async () => {
    const fixture = createVoiceFixture();
    const signal = new AbortController().signal;

    await fixture.adapter.recover(signal);
    fixture.operations.length = 0;
    await fixture.adapter.play({ artifact, signal });

    expect(fixture.createWavResource).toHaveBeenCalledWith(artifact);
    expect(fixture.operations).toEqual([
      'create_wav_resource',
      'player_play',
      'wait_player_playing',
      'wait_player_idle',
    ]);
  });

  it.each([
    [
      'a different guild',
      Object.freeze({
        guildId: '999999999999999999',
        channelId: voiceChannelId,
        kind: 'guild_voice' as const,
        permissions: Object.freeze(['view_channel' as const, 'connect' as const, 'speak' as const]),
      }),
    ],
    [
      'an unsupported channel kind',
      Object.freeze({
        guildId,
        channelId: voiceChannelId,
        kind: 'unsupported' as const,
        permissions: Object.freeze(['view_channel' as const, 'connect' as const, 'speak' as const]),
      }),
    ],
    [
      'missing voice permissions',
      Object.freeze({
        guildId,
        channelId: voiceChannelId,
        kind: 'guild_voice' as const,
        permissions: Object.freeze(['view_channel' as const, 'connect' as const]),
      }),
    ],
  ])('keeps voice unavailable for %s without allocating player resources', async (_caseName, channel) => {
    const fixture = createVoiceFixture({ channel });

    await expect(fixture.adapter.recover(new AbortController().signal)).resolves.toBe('unavailable');
    expect(fixture.resolveVoiceChannel).toHaveBeenCalledWith(guildId, voiceChannelId);
    expect(fixture.joinVoiceChannel).not.toHaveBeenCalled();
    expect(fixture.createAudioPlayer).not.toHaveBeenCalled();
  });

  it('stops and releases player, subscription, and connection after playback failure and shutdown', async () => {
    const fixture = createVoiceFixture({ playbackError: new Error('private player failure') });
    const signal = new AbortController().signal;

    await fixture.adapter.recover(signal);
    await expect(fixture.adapter.play({ artifact, signal })).rejects.toBeDefined();
    await fixture.adapter.stop();
    await fixture.adapter.destroy();

    expect(fixture.operations).toEqual([
      'resolve_voice_channel',
      'join_voice_channel',
      'create_audio_player',
      'subscribe_player',
      'wait_connection_ready',
      'create_wav_resource',
      'player_play',
      'wait_player_playing',
      'player_stop',
      'unsubscribe_player',
      'connection_destroy',
    ]);
  });
});

function createVoiceFixture(
  options: Readonly<{
    playbackError?: Error;
    channel?: DiscordVoiceChannel;
  }> = {}
) {
  const operations: string[] = [];
  const channel: DiscordVoiceChannel =
    options.channel ??
    Object.freeze({
      guildId,
      channelId: voiceChannelId,
      kind: 'guild_voice',
      permissions: Object.freeze(['view_channel' as const, 'connect' as const, 'speak' as const]),
    });
  const resource: DiscordAudioResource = Object.freeze({ kind: 'wav' });
  const player: DiscordAudioPlayer = Object.freeze({
    play: () => {
      operations.push('player_play');
    },
    waitUntilPlaying: () => {
      operations.push('wait_player_playing');
      return options.playbackError === undefined ? Promise.resolve() : Promise.reject(options.playbackError);
    },
    waitUntilIdle: () => {
      operations.push('wait_player_idle');
      return Promise.resolve();
    },
    stop: () => {
      operations.push('player_stop');
    },
  });
  const unsubscribe = jest.fn<DiscordVoiceSubscription['unsubscribe']>().mockImplementation(() => {
    operations.push('unsubscribe_player');
  });
  const subscription: DiscordVoiceSubscription = Object.freeze({ unsubscribe });
  const subscribe = jest.fn<DiscordVoiceConnection['subscribe']>().mockImplementation(() => {
    operations.push('subscribe_player');
    return subscription;
  });
  const connection: DiscordVoiceConnection = Object.freeze({
    waitUntilReady: () => {
      operations.push('wait_connection_ready');
      return Promise.resolve();
    },
    subscribe,
    destroy: () => {
      operations.push('connection_destroy');
    },
  });
  const resolveVoiceChannel = jest
    .fn<DiscordVoiceAdapterDependencies['resolveVoiceChannel']>()
    .mockImplementation(() => {
      operations.push('resolve_voice_channel');
      return Promise.resolve(channel);
    });
  const joinVoiceChannel = jest.fn<DiscordVoiceAdapterDependencies['joinVoiceChannel']>().mockImplementation(() => {
    operations.push('join_voice_channel');
    return connection;
  });
  const createAudioPlayer = jest.fn<DiscordVoiceAdapterDependencies['createAudioPlayer']>().mockImplementation(() => {
    operations.push('create_audio_player');
    return player;
  });
  const createWavResource = jest.fn<DiscordVoiceAdapterDependencies['createWavResource']>().mockImplementation(() => {
    operations.push('create_wav_resource');
    return resource;
  });
  const adapter = createDiscordVoiceAdapter(
    Object.freeze({ guildId, voiceChannelId }),
    Object.freeze({
      resolveVoiceChannel,
      joinVoiceChannel,
      createAudioPlayer,
      createWavResource,
    })
  );

  return {
    adapter,
    createAudioPlayer,
    createWavResource,
    joinVoiceChannel,
    operations,
    resolveVoiceChannel,
    subscribe,
  };
}
