import { Readable } from 'node:stream';

import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer as createSdkAudioPlayer,
  createAudioResource as createSdkAudioResource,
  entersState,
  joinVoiceChannel as joinSdkVoiceChannel,
  type AudioPlayer as SdkAudioPlayer,
  type AudioResource as SdkAudioResource,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits, type Client, type VoiceChannel } from 'discord.js';

import type { SpeechAudioArtifact, VoiceOutput } from '../../../modules/speech/public.js';

export type DiscordVoicePermission = 'view_channel' | 'connect' | 'speak';

const requiredVoicePermissions: readonly (readonly [DiscordVoicePermission, bigint])[] = Object.freeze([
  ['view_channel', PermissionFlagsBits.ViewChannel] as const,
  ['connect', PermissionFlagsBits.Connect] as const,
  ['speak', PermissionFlagsBits.Speak] as const,
]);

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
  let connection: DiscordVoiceConnection | null = null;
  let player: DiscordAudioPlayer | null = null;
  let subscription: DiscordVoiceSubscription | null = null;

  return Object.freeze({
    recover: async (signal) => {
      if (connection !== null) {
        try {
          await connection.waitUntilReady(signal);
          return 'ready';
        } catch {
          try {
            subscription?.unsubscribe();
          } catch {
            // Recovery will recreate every owned voice resource after partial cleanup.
          }

          try {
            connection.destroy();
          } catch {
            // Recovery remains unavailable when the stale connection is already destroyed.
          }

          subscription = null;
          player = null;
          connection = null;
          return 'unavailable';
        }
      }

      let candidateConnection: DiscordVoiceConnection | null = null;
      let candidateSubscription: DiscordVoiceSubscription | null = null;

      try {
        const channel = await dependencies.resolveVoiceChannel(options.guildId, options.voiceChannelId);
        if (!isSupportedVoiceChannel(channel, options)) {
          return 'unavailable';
        }

        candidateConnection = dependencies.joinVoiceChannel(channel);
        const candidatePlayer = dependencies.createAudioPlayer();
        candidateSubscription = candidateConnection.subscribe(candidatePlayer);
        await candidateConnection.waitUntilReady(signal);

        connection = candidateConnection;
        player = candidatePlayer;
        subscription = candidateSubscription;
        return 'ready';
      } catch {
        try {
          candidateSubscription?.unsubscribe();
        } catch {
          // Recovery failure remains bounded when partial subscription cleanup fails.
        }

        try {
          candidateConnection?.destroy();
        } catch {
          // Recovery failure remains bounded when partial connection cleanup fails.
        }

        return 'unavailable';
      }
    },
    waitUntilReady: async (signal) => {
      if (connection === null) {
        throw new Error('Discord voice connection is unavailable.');
      }

      await connection.waitUntilReady(signal);
    },
    play: async ({ artifact, signal }) => {
      if (player === null) {
        throw new Error('Discord audio player is unavailable.');
      }

      const resource = dependencies.createWavResource(artifact);
      player.play(resource);
      await player.waitUntilPlaying(signal);
      await player.waitUntilIdle(signal);
    },
    stop: () => {
      player?.stop();
      return Promise.resolve();
    },
    destroy: () => {
      try {
        subscription?.unsubscribe();
      } catch {
        // Connection cleanup is still attempted after subscription cleanup failure.
      }

      try {
        connection?.destroy();
      } catch {
        // Destroy is idempotent even when the SDK connection was already destroyed.
      }

      subscription = null;
      player = null;
      connection = null;
      return Promise.resolve();
    },
  });
}

function isSupportedVoiceChannel(channel: DiscordVoiceChannel, options: DiscordVoiceAdapterOptions): boolean {
  const permissions = new Set(channel.permissions);

  return (
    channel.guildId === options.guildId &&
    channel.channelId === options.voiceChannelId &&
    channel.kind === 'guild_voice' &&
    permissions.has('view_channel') &&
    permissions.has('connect') &&
    permissions.has('speak')
  );
}

export function createDiscordVoiceAdapterDependencies(client: Client): DiscordVoiceAdapterDependencies {
  let resolvedChannel: VoiceChannel | null = null;
  const sdkPlayers = new WeakMap<DiscordAudioPlayer, SdkAudioPlayer>();
  const sdkResources = new WeakMap<DiscordAudioResource, SdkAudioResource>();

  return Object.freeze({
    resolveVoiceChannel: async (guildId, channelId) => {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (channel?.type !== ChannelType.GuildVoice) {
        resolvedChannel = null;
        return Object.freeze({
          guildId,
          channelId,
          kind: 'unsupported' as const,
          permissions: Object.freeze([]),
        });
      }

      const botMember = guild.members.me ?? (await guild.members.fetchMe());
      const channelPermissions = channel.permissionsFor(botMember);
      const permissions: readonly DiscordVoicePermission[] = Object.freeze(
        requiredVoicePermissions
          .filter(([, permission]) => channelPermissions.has(permission))
          .map(([permission]) => permission)
      );
      resolvedChannel = channel;

      return Object.freeze({
        guildId: guild.id,
        channelId: channel.id,
        kind: 'guild_voice' as const,
        permissions,
      });
    },
    joinVoiceChannel: (channel) => {
      if (resolvedChannel?.guildId !== channel.guildId || resolvedChannel?.id !== channel.channelId) {
        throw new Error('Discord voice channel was not resolved by this adapter.');
      }

      const sdkConnection = joinSdkVoiceChannel({
        channelId: resolvedChannel.id,
        guildId: resolvedChannel.guildId,
        adapterCreator: resolvedChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });

      return Object.freeze({
        waitUntilReady: async (signal) => {
          await entersState(sdkConnection, VoiceConnectionStatus.Ready, signal);
        },
        subscribe: (player) => {
          const sdkPlayer = sdkPlayers.get(player);
          if (sdkPlayer === undefined) {
            throw new Error('Discord audio player was not created by this adapter.');
          }

          const sdkSubscription = sdkConnection.subscribe(sdkPlayer);
          if (sdkSubscription === undefined) {
            throw new Error('Discord voice player subscription failed.');
          }

          return Object.freeze({
            unsubscribe: () => {
              sdkSubscription.unsubscribe();
            },
          });
        },
        destroy: () => {
          sdkConnection.destroy();
        },
      });
    },
    createAudioPlayer: () => {
      const sdkPlayer = createSdkAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Stop,
        },
      });
      sdkPlayer.on('error', () => {
        // A stage waiter maps the SDK error to the bounded speech failure contract.
      });
      const player: DiscordAudioPlayer = Object.freeze({
        play: (resource) => {
          const sdkResource = sdkResources.get(resource);
          if (sdkResource === undefined) {
            throw new Error('Discord WAV resource was not created by this adapter.');
          }

          sdkPlayer.play(sdkResource);
        },
        waitUntilPlaying: async (signal) => {
          await waitForSdkPlayerState(sdkPlayer, AudioPlayerStatus.Playing, signal);
        },
        waitUntilIdle: async (signal) => {
          await waitForSdkPlayerState(sdkPlayer, AudioPlayerStatus.Idle, signal);
        },
        stop: () => {
          sdkPlayer.stop(true);
        },
      });
      sdkPlayers.set(player, sdkPlayer);
      return player;
    },
    createWavResource: (artifact) => {
      const bytes = Buffer.from(artifact.bytes.buffer, artifact.bytes.byteOffset, artifact.bytes.byteLength);
      const sdkResource = createSdkAudioResource(Readable.from([bytes]), {
        inputType: StreamType.Arbitrary,
      });
      const resource: DiscordAudioResource = Object.freeze({ kind: 'wav' });
      sdkResources.set(resource, sdkResource);
      return resource;
    },
  });
}

function waitForSdkPlayerState(player: SdkAudioPlayer, status: AudioPlayerStatus, signal: AbortSignal): Promise<void> {
  if (player.playable.length === 0) {
    return Promise.reject(new Error('Discord audio subscription is unavailable.'));
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      player.off('error', handleFailure);
      player.off('unsubscribe', handleFailure);
    };
    const handleFailure = () => {
      cleanup();
      reject(new Error('Discord audio playback failed.'));
    };

    player.once('error', handleFailure);
    player.once('unsubscribe', handleFailure);
    void entersState(player, status, signal).then(
      () => {
        cleanup();
        resolve();
      },
      () => {
        cleanup();
        reject(new Error('Discord audio playback failed.'));
      }
    );
  });
}
