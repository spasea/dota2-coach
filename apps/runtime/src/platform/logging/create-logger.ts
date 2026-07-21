import pino, { type Logger } from 'pino';

import type { RuntimeLogLevel } from '../config/parse-runtime-settings.js';

export function createLogger(logLevel: RuntimeLogLevel): Logger {
  return pino({ level: logLevel });
}
