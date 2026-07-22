const MESSAGE = 'Discord interaction behavior is not implemented.';

export function discordInteractionNotImplemented(): never {
  throw new Error(MESSAGE);
}

export function rejectDiscordInteractionNotImplemented(): Promise<never> {
  return Promise.reject(new Error(MESSAGE));
}
