import { jest } from '@jest/globals';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const script = require('./createAdmin.mjs');

describe('createAdmin script', () => {
  it('should be importable', () => {
    expect(script).toBeDefined();
  });
});
