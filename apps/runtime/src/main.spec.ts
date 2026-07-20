import { describe, expect, it } from '@jest/globals';

import * as runtimeEntryPoint from './main.js';

describe('runtime toolchain', () => {
  it('resolves the TypeScript ESM entry point through its emitted extension', () => {
    expect(runtimeEntryPoint).toEqual({});
  });
});
