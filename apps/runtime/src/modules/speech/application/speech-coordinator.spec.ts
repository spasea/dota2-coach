import { describe, expect, it, jest } from '@jest/globals';

import type { SpeechAudioArtifact } from '../domain/speech-job.js';
import {
  createSpeechCoordinator,
  type CreateSpeechCoordinatorDependencies,
  type SpeechCoordinatorOptions,
  type SpeechEvent,
} from './speech-coordinator.js';
import type { SynthesizeSpeech, VoiceOutput } from './speech-ports.js';

const artifact: SpeechAudioArtifact = Object.freeze({
  bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
  contentType: 'audio/wav',
  sampleRateHz: 48_000,
});

const defaultOptions: SpeechCoordinatorOptions = Object.freeze({
  jobTtlMs: 20_000,
  ttsTimeoutMs: 7_000,
  voiceReadyTimeoutMs: 3_000,
  playbackTimeoutMs: 15_000,
  consecutiveFailuresBeforeTextOnly: 2,
  recoveryProbeIntervalMs: 5_000,
  queueCapacity: 10,
});

interface ScheduledTask {
  readonly delayMs: number;
  readonly task: () => void;
  cancelled: boolean;
}

function createTestContext(
  input: {
    readonly options?: Partial<SpeechCoordinatorOptions>;
    readonly synthesizeSpeech?: SynthesizeSpeech;
    readonly voiceOutput?: VoiceOutput;
    readonly recoverSpeechDelivery?: CreateSpeechCoordinatorDependencies['recoverSpeechDelivery'];
  } = {}
) {
  let now = 0;
  let nextJobId = 0;
  const events: SpeechEvent[] = [];
  const scheduledTasks: ScheduledTask[] = [];
  const synthesizeSpeech =
    input.synthesizeSpeech ?? jest.fn<SynthesizeSpeech>().mockImplementation(() => Promise.resolve(artifact));
  const voiceOutput: VoiceOutput = input.voiceOutput ?? {
    waitUntilReady: jest.fn<VoiceOutput['waitUntilReady']>().mockResolvedValue(undefined),
    play: jest.fn<VoiceOutput['play']>().mockResolvedValue(undefined),
    stop: jest.fn<VoiceOutput['stop']>().mockResolvedValue(undefined),
  };
  const recoverSpeechDelivery =
    input.recoverSpeechDelivery ??
    jest.fn<CreateSpeechCoordinatorDependencies['recoverSpeechDelivery']>().mockResolvedValue('ready');
  const coordinator = createSpeechCoordinator(
    { ...defaultOptions, ...input.options },
    {
      synthesizeSpeech,
      voiceOutput,
      recoverSpeechDelivery,
      monotonicNow: () => now,
      createJobId: () => `speech-job-${++nextJobId}`,
      scheduleTask: (delayMs, task) => {
        const scheduledTask = { delayMs, task, cancelled: false };
        scheduledTasks.push(scheduledTask);
        return () => {
          scheduledTask.cancelled = true;
        };
      },
      recordEvent: (event) => {
        events.push(event);
      },
    }
  );

  return {
    coordinator,
    events,
    recoverSpeechDelivery,
    scheduledTasks,
    setNow: (value: number) => {
      now = value;
    },
    synthesizeSpeech,
    voiceOutput,
    runScheduledTask: (delayMs: number) => {
      const scheduledTask = scheduledTasks.find((candidate) => !candidate.cancelled && candidate.delayMs === delayMs);

      expect(scheduledTask).toBeDefined();
      scheduledTask?.task();
    },
  };
}

function manualInput(text = 'Ручная проверка.') {
  return {
    requestId: 'manual-request-01',
    source: 'manual' as const,
    speaker: 'aidar' as const,
    text,
  };
}

function lostInput(text = 'Fire, защищай нижнюю башню.') {
  return {
    requestId: 'lost-request-01',
    source: 'lost' as const,
    speaker: 'baya' as const,
    text,
  };
}

async function settleCoordinator(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function abortablePending(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('bounded operation aborted')), {
      once: true,
    });
  });
}

describe('Speech coordinator', () => {
  it('accepts jobs only while started and returns immutable admission results', async () => {
    const { coordinator } = createTestContext();

    expect(coordinator.enqueue(manualInput())).toEqual({ status: 'stopped' });

    coordinator.start();
    const accepted = coordinator.enqueue(manualInput());

    expect(accepted).toEqual({ status: 'queued', jobId: 'speech-job-1' });
    expect(Object.isFrozen(accepted)).toBe(true);

    await coordinator.stop();
    expect(coordinator.enqueue(manualInput())).toEqual({ status: 'stopped' });
  });

  it('uses one FIFO for Lost and manual jobs without overlapping synthesis', async () => {
    const firstSynthesis = deferred<SpeechAudioArtifact>();
    const synthesizedTexts: string[] = [];
    const synthesizeSpeech: SynthesizeSpeech = (input) => {
      synthesizedTexts.push(input.text);
      return synthesizedTexts.length === 1 ? firstSynthesis.promise : Promise.resolve(artifact);
    };
    const { coordinator, voiceOutput } = createTestContext({ synthesizeSpeech });

    coordinator.start();
    expect(coordinator.enqueue(lostInput())).toMatchObject({ status: 'queued' });
    expect(coordinator.enqueue(manualInput())).toMatchObject({ status: 'queued' });
    await settleCoordinator();

    expect(synthesizedTexts).toEqual(['Fire, защищай нижнюю башню.']);

    firstSynthesis.resolve(artifact);
    await settleCoordinator();

    expect(synthesizedTexts).toEqual(['Fire, защищай нижнюю башню.', 'Ручная проверка.']);
    expect(voiceOutput.play).toHaveBeenCalledTimes(2);
  });

  it('enforces queue capacity synchronously without starting another worker', () => {
    const { coordinator, synthesizeSpeech } = createTestContext({
      options: { queueCapacity: 1 },
    });

    coordinator.start();

    expect(coordinator.enqueue(manualInput('Первый.'))).toMatchObject({ status: 'queued' });
    expect(coordinator.enqueue(lostInput('Второй.'))).toEqual({ status: 'queue_full' });
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('expires waiting jobs before synthesis without counting a delivery failure', async () => {
    const firstSynthesis = deferred<SpeechAudioArtifact>();
    const synthesizeSpeech = jest
      .fn<SynthesizeSpeech>()
      .mockImplementationOnce(() => firstSynthesis.promise)
      .mockImplementation(() => Promise.resolve(artifact));
    const { coordinator, events, setNow } = createTestContext({ synthesizeSpeech });

    coordinator.start();
    coordinator.enqueue(manualInput('Первый.'));
    coordinator.enqueue(lostInput('Устаревший.'));
    await settleCoordinator();

    setNow(20_001);
    firstSynthesis.resolve(artifact);
    await settleCoordinator();

    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        code: 'SPEECH_DELIVERY_EXPIRED',
        requestId: 'lost-request-01',
      })
    );
    expect(coordinator.enqueue(manualInput('Еще один.'))).toMatchObject({ status: 'queued' });
  });

  it('rechecks expiration after synthesis and before voice delivery', async () => {
    const synthesis = deferred<SpeechAudioArtifact>();
    const synthesizeSpeech: SynthesizeSpeech = () => synthesis.promise;
    const context = createTestContext({ synthesizeSpeech });

    context.coordinator.start();
    context.coordinator.enqueue(manualInput());
    await settleCoordinator();
    context.setNow(20_001);
    synthesis.resolve(artifact);
    await settleCoordinator();

    expect(context.voiceOutput.waitUntilReady).not.toHaveBeenCalled();
    expect(context.events).toContainEqual(expect.objectContaining({ code: 'SPEECH_DELIVERY_EXPIRED' }));
  });

  it.each([
    ['synthesis', 7_000],
    ['voice_readiness', 3_000],
    ['playback', 15_000],
  ] as const)('applies an independent deadline to %s', async (stage, deadlineMs) => {
    const synthesizeSpeech: SynthesizeSpeech = (input) =>
      stage === 'synthesis' ? abortablePending(input.signal) : Promise.resolve(artifact);
    const voiceOutput: VoiceOutput = {
      waitUntilReady: (signal) => (stage === 'voice_readiness' ? abortablePending(signal) : Promise.resolve()),
      play: ({ signal }) => (stage === 'playback' ? abortablePending(signal) : Promise.resolve()),
      stop: jest.fn<VoiceOutput['stop']>().mockResolvedValue(undefined),
    };
    const context = createTestContext({ synthesizeSpeech, voiceOutput });

    context.coordinator.start();
    context.coordinator.enqueue(manualInput());
    await settleCoordinator();
    context.runScheduledTask(deadlineMs);
    await settleCoordinator();

    expect(context.events).toContainEqual(
      expect.objectContaining({
        code: 'SPEECH_DELIVERY_TIMED_OUT',
        failureStage: stage,
      })
    );
    expect(context.synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failed job and continues with the next eligible job', async () => {
    const synthesizeSpeech = jest
      .fn<SynthesizeSpeech>()
      .mockRejectedValueOnce(new Error('bounded synthesis failure'))
      .mockResolvedValue(artifact);
    const { coordinator, events } = createTestContext({ synthesizeSpeech });

    coordinator.start();
    coordinator.enqueue(manualInput('Сломанный.'));
    coordinator.enqueue(lostInput('Следующий.'));
    await settleCoordinator();

    expect(synthesizeSpeech).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        code: 'SPEECH_DELIVERY_FAILED',
        requestId: 'manual-request-01',
        failureStage: 'synthesis',
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        code: 'SPEECH_DELIVERY_COMPLETED',
        requestId: 'lost-request-01',
      })
    );
  });

  it('performs playback cleanup once before continuing the drain', async () => {
    const play = jest
      .fn<VoiceOutput['play']>()
      .mockRejectedValueOnce(new Error('bounded player failure'))
      .mockResolvedValue(undefined);
    const stop = jest.fn<VoiceOutput['stop']>().mockResolvedValue(undefined);
    const voiceOutput: VoiceOutput = {
      waitUntilReady: () => Promise.resolve(),
      play,
      stop,
    };
    const { coordinator } = createTestContext({ voiceOutput });

    coordinator.start();
    coordinator.enqueue(manualInput('Первый.'));
    coordinator.enqueue(lostInput('Второй.'));
    await settleCoordinator();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('resets consecutive delivery failures after completed playback', async () => {
    const synthesizeSpeech = jest
      .fn<SynthesizeSpeech>()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(artifact)
      .mockRejectedValueOnce(new Error('second non-consecutive failure'))
      .mockResolvedValue(artifact);
    const { coordinator } = createTestContext({ synthesizeSpeech });

    coordinator.start();
    coordinator.enqueue(manualInput('Ошибка один.'));
    coordinator.enqueue(lostInput('Успех.'));
    coordinator.enqueue(manualInput('Ошибка два.'));
    await settleCoordinator();

    expect(coordinator.enqueue(lostInput('Все еще доступно.'))).toMatchObject({
      status: 'queued',
    });
  });

  it('does not count waiting expiration or queue-full admission as delivery failures', async () => {
    const synthesizeSpeech = jest
      .fn<SynthesizeSpeech>()
      .mockRejectedValueOnce(new Error('only delivery failure'))
      .mockResolvedValue(artifact);
    const context = createTestContext({
      options: { queueCapacity: 1 },
      synthesizeSpeech,
    });

    context.coordinator.start();
    expect(context.coordinator.enqueue(manualInput('Устареет.'))).toMatchObject({
      status: 'queued',
    });
    expect(context.coordinator.enqueue(lostInput('Переполнение.'))).toEqual({
      status: 'queue_full',
    });
    context.setNow(20_001);
    await settleCoordinator();

    expect(context.coordinator.enqueue(manualInput('Одна ошибка.'))).toMatchObject({
      status: 'queued',
    });
    await settleCoordinator();

    expect(context.coordinator.enqueue(lostInput('Контур остается доступен.'))).toMatchObject({
      status: 'queued',
    });
  });

  it('opens text-only after two consecutive failures and recovers outside the drain', async () => {
    const synthesizeSpeech = jest
      .fn<SynthesizeSpeech>()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValue(artifact);
    const context = createTestContext({ synthesizeSpeech });

    context.coordinator.start();
    context.coordinator.enqueue(manualInput('Ошибка один.'));
    context.coordinator.enqueue(lostInput('Ошибка два.'));
    await settleCoordinator();

    expect(context.coordinator.enqueue(manualInput('Недоступно.'))).toEqual({
      status: 'text_only',
    });
    expect(context.recoverSpeechDelivery).not.toHaveBeenCalled();
    expect(context.scheduledTasks).toContainEqual(expect.objectContaining({ delayMs: 5_000, cancelled: false }));

    context.runScheduledTask(5_000);
    await settleCoordinator();

    expect(context.recoverSpeechDelivery).toHaveBeenCalledTimes(1);
    expect(context.events).toContainEqual(
      expect.objectContaining({ code: 'SPEECH_CIRCUIT_RECOVERED', circuitState: 'closed' })
    );
    expect(context.coordinator.enqueue(manualInput('Снова доступно.'))).toMatchObject({
      status: 'queued',
    });
  });

  it('keeps text-only and schedules another probe after unavailable recovery', async () => {
    const recoverSpeechDelivery = jest
      .fn<CreateSpeechCoordinatorDependencies['recoverSpeechDelivery']>()
      .mockResolvedValue('unavailable');
    const synthesizeSpeech = jest.fn<SynthesizeSpeech>().mockRejectedValue(new Error('delivery unavailable'));
    const context = createTestContext({ recoverSpeechDelivery, synthesizeSpeech });

    context.coordinator.start();
    context.coordinator.enqueue(manualInput('Ошибка один.'));
    context.coordinator.enqueue(lostInput('Ошибка два.'));
    await settleCoordinator();
    context.runScheduledTask(5_000);
    await settleCoordinator();

    expect(context.coordinator.enqueue(manualInput())).toEqual({ status: 'text_only' });
    expect(context.scheduledTasks.filter((task) => task.delayMs === 5_000 && !task.cancelled)).toHaveLength(1);
  });

  it('aborts the active operation, clears waiting jobs, and stops voice on shutdown', async () => {
    let activeSignal: AbortSignal | undefined;
    const synthesizeSpeech: SynthesizeSpeech = (input) => {
      activeSignal = input.signal;
      return abortablePending(input.signal);
    };
    const context = createTestContext({ synthesizeSpeech });

    context.coordinator.start();
    context.coordinator.enqueue(manualInput('Активный.'));
    context.coordinator.enqueue(lostInput('Ожидающий.'));
    await settleCoordinator();

    const stopped = context.coordinator.stop();
    await stopped;

    expect(activeSignal?.aborted).toBe(true);
    expect(context.voiceOutput.stop).toHaveBeenCalledTimes(1);
    expect(context.synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(context.coordinator.enqueue(manualInput())).toEqual({ status: 'stopped' });
  });

  it('records bounded events without speech text, identity, tokens, or audio bytes', async () => {
    const sensitiveText = 'Fire, секретная рекомендация.';
    const { coordinator, events } = createTestContext();

    coordinator.start();
    coordinator.enqueue(lostInput(sensitiveText));
    await settleCoordinator();

    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain(sensitiveText);
    expect(serializedEvents).not.toContain('discordUserId');
    expect(serializedEvents).not.toContain('bearer');
    expect(serializedEvents).not.toContain('82,73,70,70');
    expect(events).toContainEqual(
      expect.objectContaining({
        requestId: 'lost-request-01',
        source: 'lost',
        speaker: 'baya',
      })
    );
  });
});
