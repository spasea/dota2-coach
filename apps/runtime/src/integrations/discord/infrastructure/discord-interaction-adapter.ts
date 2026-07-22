import { MessageFlags, type MessageComponentInteraction } from 'discord.js';

import type {
  DiscordInteractionResponder,
  HandleDiscordButton,
  HandleDiscordButtonCommand,
} from '../application/handle-discord-button.js';
import type { DiscordTranslator } from '../application/discord-message.js';
import type { DiscordButtonObservation } from '../discord.types.js';

export type DiscordInteractionSource = Readonly<{
  requestId: string;
  componentKind: DiscordButtonObservation['componentKind'];
  guildId: string | null;
  channelId: string | null;
  messageId: string;
  discordUserId: string;
  customId: string;
  replyEphemeral: (content: string) => Promise<void>;
  deferEphemeral: () => Promise<void>;
  editEphemeral: (content: string) => Promise<void>;
}>;

export function toDiscordInteractionSource(interaction: MessageComponentInteraction): DiscordInteractionSource {
  return Object.freeze({
    requestId: interaction.id,
    componentKind: interaction.isButton() ? 'button' : 'unsupported',
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: interaction.message.id,
    discordUserId: interaction.user.id,
    customId: interaction.customId,
    replyEphemeral: async (content) => {
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    },
    deferEphemeral: async () => {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    },
    editEphemeral: async (content) => {
      await interaction.editReply({
        content,
        allowedMentions: { parse: [] },
      });
    },
  });
}

export function createDiscordButtonCommand(
  source: DiscordInteractionSource,
  translator: DiscordTranslator
): HandleDiscordButtonCommand {
  const interaction: DiscordButtonObservation = Object.freeze({
    requestId: source.requestId,
    componentKind: source.componentKind,
    guildId: source.guildId,
    channelId: source.channelId,
    messageId: source.messageId,
    discordUserId: source.discordUserId,
    customId: source.customId,
  });
  const responder: DiscordInteractionResponder = Object.freeze({
    replyEphemeral: (message) => source.replyEphemeral(translator(message)),
    deferEphemeral: source.deferEphemeral,
    editEphemeral: (message) => source.editEphemeral(translator(message)),
  });

  return Object.freeze({ interaction, responder });
}

export async function dispatchDiscordInteraction(
  source: DiscordInteractionSource,
  translator: DiscordTranslator,
  handleButton: HandleDiscordButton,
  reportFailure: () => void
): Promise<void> {
  try {
    await handleButton(createDiscordButtonCommand(source, translator));
  } catch {
    try {
      reportFailure();
    } catch {
      return;
    }
  }
}
