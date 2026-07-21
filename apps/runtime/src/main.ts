import { createRuntime } from './bootstrap/create-runtime.js';
import { ConfigurationError } from './platform/config/configuration-error.js';
import { createLogger } from './platform/logging/create-logger.js';

const bootstrapLogger = createLogger('info');

async function startRuntime(): Promise<void> {
  const runtime = await createRuntime(process.env);

  await runtime.start();

  let shutdownStarted = false;
  const shutdown = () => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    void runtime.stop().catch(() => {
      bootstrapLogger.error({ code: 'RUNTIME_SHUTDOWN_ERROR' }, 'runtime shutdown failed');
      process.exitCode = 1;
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

void startRuntime().catch((error: unknown) => {
  const errorContext =
    error instanceof ConfigurationError
      ? { code: error.code, source: error.source, stage: error.stage }
      : { code: 'RUNTIME_STARTUP_ERROR' };

  bootstrapLogger.fatal(errorContext, 'runtime startup failed');
  process.exitCode = 1;
});
