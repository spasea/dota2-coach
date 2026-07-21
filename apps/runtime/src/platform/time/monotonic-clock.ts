import { performance } from 'node:perf_hooks';

export type MonotonicClock = () => number;

export function readMonotonicMilliseconds(): number {
  return performance.now();
}
