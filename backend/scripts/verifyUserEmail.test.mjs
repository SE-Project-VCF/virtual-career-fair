import { jest } from '@jest/globals';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const script = require('./verifyUserEmail.mjs');

describe('verifyUserEmail script', () => {
  it('should be importable', () => {
    expect(script).toBeDefined();
  });
});
