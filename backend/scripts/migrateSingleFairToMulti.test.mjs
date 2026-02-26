import { jest } from '@jest/globals';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const script = require('./migrateSingleFairToMulti.mjs');

describe('migrateSingleFairToMulti script', () => {
  it('should be importable', () => {
    expect(script).toBeDefined();
  });
});
