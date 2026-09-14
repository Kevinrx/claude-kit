import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHook } from './helpers.mjs';

test('hooks never fail on garbage input', () => {
  for (const hook of ['guard-commands.mjs', 'guard-files.mjs', 'stop-gate.mjs', 'session-context.mjs', 'subagent-report-gate.mjs']) {
    assert.equal(runHook(hook, 'not json').code, 0, hook);
  }
});
