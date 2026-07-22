import type { RecommendLostAction } from '../../modules/lost/public.js';
import type { MonotonicClock } from '../../platform/time/monotonic-clock.js';

type LostConsoleDebugObservation = Readonly<{
  clientId: string;
  discordUserId: string;
  matchId: string | null;
}>;

type LostConsoleDebugSchedule = Readonly<{
  matchId: string | null;
  nextOutputAt: number;
}>;

type CreateLostConsoleDebugInput = Readonly<{
  enabled: boolean;
  intervalMs: number;
  monotonicNow: MonotonicClock;
  recommendLostAction: RecommendLostAction;
  reportFailure: () => void;
  writeOutput: (output: string) => void;
}>;

export function createLostConsoleDebug(
  input: CreateLostConsoleDebugInput
): (observation: LostConsoleDebugObservation) => void {
  if (!input.enabled) {
    return () => undefined;
  }

  const schedulesByClient = new Map<string, LostConsoleDebugSchedule>();

  return (observation) => {
    const now = input.monotonicNow();
    const schedule = schedulesByClient.get(observation.clientId);

    if (schedule?.matchId !== observation.matchId) {
      schedulesByClient.set(
        observation.clientId,
        Object.freeze({ matchId: observation.matchId, nextOutputAt: now + input.intervalMs })
      );
      return;
    }
    if (now < schedule.nextOutputAt) {
      return;
    }

    schedulesByClient.set(
      observation.clientId,
      Object.freeze({ matchId: observation.matchId, nextOutputAt: now + input.intervalMs })
    );

    try {
      const result = input.recommendLostAction({ discordUserId: observation.discordUserId });

      if (result.status === 'unavailable') {
        input.writeOutput(
          [`[lost-debug] client=${observation.clientId}`, `status=unavailable reason=${result.reason}`].join('\n')
        );
        return;
      }

      const { recommendation } = result;
      input.writeOutput(
        [
          `[lost-debug] client=${observation.clientId}`,
          `status=recommended action=${recommendation.action} confidence=${recommendation.confidence} coverage=${recommendation.coverage}`,
          `title: ${recommendation.textTitle}`,
          `body: ${recommendation.textBody}`,
          `voice: ${recommendation.voiceText}`,
        ].join('\n')
      );
    } catch {
      input.reportFailure();
    }
  };
}
