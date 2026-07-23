export const speechSpeakers = Object.freeze(['aidar', 'baya', 'kseniya', 'xenia', 'eugene'] as const);

export type SpeechSpeaker = (typeof speechSpeakers)[number];
