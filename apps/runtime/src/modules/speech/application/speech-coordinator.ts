import type { SpeechJob, SpeechJobStatus, SpeechSource } from '../domain/speech-job.js';
import type { SpeechSpeaker } from '../domain/speech-speaker.js';
import type { RecoverSpeechDelivery, ScheduleSpeechTask, SynthesizeSpeech, VoiceOutput } from './speech-ports.js';

export type EnqueueSpeechInput = Readonly<{
  requestId: string;
  source: SpeechSource;
  speaker: SpeechSpeaker;
  text: string;
}>;

export type EnqueueSpeechResult =
  | Readonly<{ status: 'queued'; jobId: string }>
  | Readonly<{ status: 'queue_full' }>
  | Readonly<{ status: 'text_only' }>
  | Readonly<{ status: 'stopped' }>;

export type SpeechFailureStage =
  'admission' | 'tts_readiness' | 'synthesis' | 'tts_protocol' | 'voice_readiness' | 'playback' | 'cleanup';

export type SpeechEventCode =
  | 'SPEECH_JOB_QUEUED'
  | 'SPEECH_JOB_SYNTHESIZING'
  | 'SPEECH_JOB_PLAYING'
  | 'SPEECH_DELIVERY_COMPLETED'
  | 'SPEECH_DELIVERY_EXPIRED'
  | 'SPEECH_DELIVERY_FAILED'
  | 'SPEECH_DELIVERY_TIMED_OUT'
  | 'SPEECH_CIRCUIT_OPENED'
  | 'SPEECH_CIRCUIT_RECOVERED';

export type SpeechEvent = Readonly<{
  code: SpeechEventCode;
  requestId?: string;
  speechJobId?: string;
  source?: SpeechSource;
  speaker?: SpeechSpeaker;
  status?: SpeechJobStatus | 'expired' | 'skipped_text_only';
  failureStage?: SpeechFailureStage;
  latencyMs?: number;
  queueDepth?: number;
  circuitState?: 'closed' | 'open' | 'recovering';
}>;

export type SpeechCoordinatorOptions = Readonly<{
  jobTtlMs: number;
  ttsTimeoutMs: number;
  voiceReadyTimeoutMs: number;
  playbackTimeoutMs: number;
  consecutiveFailuresBeforeTextOnly: number;
  recoveryProbeIntervalMs: number;
  queueCapacity: number;
}>;

export type CreateSpeechCoordinatorDependencies = Readonly<{
  synthesizeSpeech: SynthesizeSpeech;
  voiceOutput: VoiceOutput;
  recoverSpeechDelivery: RecoverSpeechDelivery;
  monotonicNow: () => number;
  createJobId: () => string;
  scheduleTask: ScheduleSpeechTask;
  recordEvent: (event: SpeechEvent) => void;
}>;

export type SpeechCoordinator = Readonly<{
  start: () => void;
  enqueue: (input: EnqueueSpeechInput) => EnqueueSpeechResult;
  stop: () => Promise<void>;
}>;

type CoordinatorLifecycle = 'stopped' | 'running';
type CircuitState = 'closed' | 'open' | 'recovering';
const deadlineFailureMarker = Symbol('speech-deadline-failure');

type DeadlineFailure = Error &
  Readonly<{
    marker: typeof deadlineFailureMarker;
    stage: SpeechFailureStage;
  }>;

export function createSpeechCoordinator(
  options: SpeechCoordinatorOptions,
  dependencies: CreateSpeechCoordinatorDependencies
): SpeechCoordinator {
  let lifecycle: CoordinatorLifecycle = 'stopped';
  let circuitState: CircuitState = 'closed';
  let waitingJobs: readonly SpeechJob[] = [];
  let drainScheduled = false;
  let drainPromise: Promise<void> | null = null;
  let activeJob: SpeechJob | null = null;
  let activeStageController: AbortController | null = null;
  let consecutiveDeliveryFailures = 0;
  let cancelRecoveryTask: (() => void) | null = null;
  let recoveryController: AbortController | null = null;
  let recoveryPromise: Promise<void> | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const recordJobEvent = (
    code: SpeechEventCode,
    job: SpeechJob,
    details: Omit<SpeechEvent, 'code' | 'requestId' | 'speechJobId' | 'source' | 'speaker'> = {}
  ): void => {
    dependencies.recordEvent(
      Object.freeze({
        code,
        requestId: job.requestId,
        speechJobId: job.id,
        source: job.source,
        speaker: job.speaker,
        ...details,
      })
    );
  };

  const expireJob = (job: SpeechJob): void => {
    recordJobEvent('SPEECH_DELIVERY_EXPIRED', job, {
      status: 'expired',
      latencyMs: dependencies.monotonicNow() - job.createdAt,
      queueDepth: waitingJobs.length,
    });
  };

  const stopVoiceSafely = async (job: SpeechJob | null): Promise<void> => {
    try {
      await dependencies.voiceOutput.stop();
    } catch {
      if (job !== null) {
        recordJobEvent('SPEECH_DELIVERY_FAILED', job, {
          status: 'failed',
          failureStage: 'cleanup',
          latencyMs: dependencies.monotonicNow() - job.createdAt,
        });
      }
    }
  };

  const scheduleRecovery = (): void => {
    if (lifecycle !== 'running' || circuitState !== 'open' || cancelRecoveryTask !== null) {
      return;
    }

    cancelRecoveryTask = dependencies.scheduleTask(options.recoveryProbeIntervalMs, () => {
      const completedTask = cancelRecoveryTask;
      cancelRecoveryTask = null;
      completedTask?.();
      const currentRecovery = recoverDelivery();
      recoveryPromise = currentRecovery;
      void currentRecovery.then(
        () => {
          if (recoveryPromise === currentRecovery) {
            recoveryPromise = null;
          }
        },
        () => {
          if (recoveryPromise === currentRecovery) {
            recoveryPromise = null;
          }
        }
      );
    });
  };

  const openCircuit = (): void => {
    if (circuitState !== 'closed') {
      return;
    }

    circuitState = 'open';
    const skippedJobs = waitingJobs;
    waitingJobs = [];

    for (const skippedJob of skippedJobs) {
      recordJobEvent('SPEECH_DELIVERY_FAILED', skippedJob, {
        status: 'skipped_text_only',
        failureStage: 'admission',
        queueDepth: waitingJobs.length,
        circuitState: 'open',
      });
    }

    dependencies.recordEvent(
      Object.freeze({
        code: 'SPEECH_CIRCUIT_OPENED',
        circuitState: 'open',
        queueDepth: 0,
      })
    );
    scheduleRecovery();
  };

  const recordDeliveryFailure = (job: SpeechJob, stage: SpeechFailureStage, timedOut: boolean): boolean => {
    consecutiveDeliveryFailures += 1;
    recordJobEvent(timedOut ? 'SPEECH_DELIVERY_TIMED_OUT' : 'SPEECH_DELIVERY_FAILED', job, {
      status: timedOut ? 'timed_out' : 'failed',
      failureStage: stage,
      latencyMs: dependencies.monotonicNow() - job.createdAt,
    });

    return consecutiveDeliveryFailures >= options.consecutiveFailuresBeforeTextOnly;
  };

  const runWithDeadline = async <Result>(
    stage: SpeechFailureStage,
    timeoutMs: number,
    operation: (signal: AbortSignal) => Promise<Result>
  ): Promise<Result> => {
    const controller = new AbortController();
    activeStageController = controller;
    let cancelDeadline = (): void => undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      cancelDeadline = dependencies.scheduleTask(timeoutMs, () => {
        reject(createDeadlineFailure(stage));
        controller.abort();
      });
    });

    try {
      return await Promise.race([operation(controller.signal), deadline]);
    } finally {
      cancelDeadline();

      if (activeStageController === controller) {
        activeStageController = null;
      }
    }
  };

  const deliverJob = async (queuedJob: SpeechJob): Promise<void> => {
    let job: SpeechJob = Object.freeze({
      ...queuedJob,
      status: 'synthesizing',
    });
    activeJob = job;
    recordJobEvent('SPEECH_JOB_SYNTHESIZING', job, {
      status: job.status,
      queueDepth: waitingJobs.length,
    });

    let failureStage: SpeechFailureStage = 'synthesis';

    try {
      const synthesizedArtifact = await runWithDeadline('synthesis', options.ttsTimeoutMs, (signal) =>
        dependencies.synthesizeSpeech({
          requestId: job.id,
          speaker: job.speaker,
          text: job.text,
          signal,
        })
      );

      if (lifecycle !== 'running') {
        return;
      }

      if (dependencies.monotonicNow() >= job.expiresAt) {
        expireJob(job);
        return;
      }

      failureStage = 'voice_readiness';
      await runWithDeadline('voice_readiness', options.voiceReadyTimeoutMs, dependencies.voiceOutput.waitUntilReady);

      if (lifecycle !== 'running') {
        return;
      }

      failureStage = 'playback';
      job = Object.freeze({ ...job, status: 'playing' as const });
      activeJob = job;
      recordJobEvent('SPEECH_JOB_PLAYING', job, { status: job.status });
      await runWithDeadline('playback', options.playbackTimeoutMs, (signal) =>
        dependencies.voiceOutput.play({ artifact: synthesizedArtifact, signal })
      );

      if (lifecycle !== 'running') {
        return;
      }

      consecutiveDeliveryFailures = 0;
      job = Object.freeze({ ...job, status: 'completed' as const });
      activeJob = job;
      recordJobEvent('SPEECH_DELIVERY_COMPLETED', job, {
        status: job.status,
        latencyMs: dependencies.monotonicNow() - job.createdAt,
      });
    } catch (error) {
      if (lifecycle !== 'running') {
        return;
      }

      const timedOut = isDeadlineFailure(error);
      const shouldOpenCircuit = recordDeliveryFailure(job, timedOut ? error.stage : failureStage, timedOut);

      if (failureStage === 'playback') {
        await stopVoiceSafely(job);
      }

      if (shouldOpenCircuit && lifecycle === 'running') {
        openCircuit();
      }
    } finally {
      activeJob = null;
    }
  };

  const drainQueue = async (): Promise<void> => {
    while (lifecycle === 'running' && circuitState === 'closed' && waitingJobs.length > 0) {
      const job = waitingJobs[0];

      if (job === undefined) {
        return;
      }

      waitingJobs = waitingJobs.slice(1);

      if (dependencies.monotonicNow() >= job.expiresAt) {
        expireJob(job);
        continue;
      }

      await deliverJob(job);
    }
  };

  const scheduleDrain = (): void => {
    if (
      drainScheduled ||
      drainPromise !== null ||
      lifecycle !== 'running' ||
      circuitState !== 'closed' ||
      waitingJobs.length === 0
    ) {
      return;
    }

    drainScheduled = true;
    void Promise.resolve().then(() => {
      drainScheduled = false;

      if (drainPromise !== null || lifecycle !== 'running' || circuitState !== 'closed' || waitingJobs.length === 0) {
        return;
      }

      const currentDrain = drainQueue();
      drainPromise = currentDrain;
      void currentDrain.finally(() => {
        if (drainPromise === currentDrain) {
          drainPromise = null;
        }

        scheduleDrain();
      });
    });
  };

  async function recoverDelivery(): Promise<void> {
    if (lifecycle !== 'running' || circuitState !== 'open') {
      return;
    }

    circuitState = 'recovering';
    const controller = new AbortController();
    recoveryController = controller;

    let recoveryResult: 'ready' | 'unavailable';

    try {
      recoveryResult = await dependencies.recoverSpeechDelivery(controller.signal);
    } catch {
      recoveryResult = 'unavailable';
    } finally {
      if (recoveryController === controller) {
        recoveryController = null;
      }
    }

    if (lifecycle !== 'running') {
      return;
    }

    if (recoveryResult === 'ready') {
      circuitState = 'closed';
      consecutiveDeliveryFailures = 0;
      dependencies.recordEvent(
        Object.freeze({
          code: 'SPEECH_CIRCUIT_RECOVERED',
          circuitState: 'closed',
          queueDepth: waitingJobs.length,
        })
      );
      scheduleDrain();
      return;
    }

    circuitState = 'open';
    scheduleRecovery();
  }

  const start = (): void => {
    if (lifecycle === 'running' || shutdownPromise !== null) {
      return;
    }

    lifecycle = 'running';
    scheduleDrain();
  };

  const enqueue = (input: EnqueueSpeechInput): EnqueueSpeechResult => {
    if (lifecycle !== 'running') {
      return Object.freeze({ status: 'stopped' });
    }

    if (circuitState !== 'closed') {
      return Object.freeze({ status: 'text_only' });
    }

    if (waitingJobs.length >= options.queueCapacity) {
      return Object.freeze({ status: 'queue_full' });
    }

    const createdAt = dependencies.monotonicNow();
    const job = Object.freeze({
      id: dependencies.createJobId(),
      requestId: input.requestId,
      source: input.source,
      speaker: input.speaker,
      text: input.text,
      createdAt,
      expiresAt: createdAt + options.jobTtlMs,
      status: 'queued' as const,
    });

    waitingJobs = [...waitingJobs, job];
    recordJobEvent('SPEECH_JOB_QUEUED', job, {
      status: job.status,
      queueDepth: waitingJobs.length,
    });
    scheduleDrain();

    return Object.freeze({ status: 'queued', jobId: job.id });
  };

  const stop = (): Promise<void> => {
    if (shutdownPromise !== null) {
      return shutdownPromise;
    }

    lifecycle = 'stopped';
    waitingJobs = [];
    activeStageController?.abort();
    recoveryController?.abort();
    cancelRecoveryTask?.();
    cancelRecoveryTask = null;
    const currentDrain = drainPromise;
    const currentRecovery = recoveryPromise;
    const jobBeingStopped = activeJob;

    shutdownPromise = (async () => {
      await stopVoiceSafely(jobBeingStopped);

      if (currentDrain !== null) {
        await currentDrain;
      }

      if (currentRecovery !== null) {
        await currentRecovery;
      }
    })();

    return shutdownPromise;
  };

  return Object.freeze({ start, enqueue, stop });
}

function isDeadlineFailure(error: unknown): error is DeadlineFailure {
  return typeof error === 'object' && error !== null && 'marker' in error && error.marker === deadlineFailureMarker;
}

function createDeadlineFailure(stage: SpeechFailureStage): DeadlineFailure {
  return Object.assign(new Error('Speech stage deadline exceeded.'), {
    marker: deadlineFailureMarker,
    stage,
  } as const);
}
