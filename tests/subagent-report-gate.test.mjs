import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHook } from './helpers.mjs';

const stop = (payload) => runHook('subagent-report-gate.mjs', { hook_event_name: 'SubagentStop', ...payload });

test('subagent-report-gate asks for the report when the final message is empty, at most twice', () => {
  const agent_id = `a-${Date.now()}`;
  const first = stop({ agent_id, last_assistant_message: '' });
  assert.equal(first.code, 2);
  assert.match(first.stderr, /final report/);
  assert.equal(stop({ agent_id, last_assistant_message: '  \n', stop_hook_active: true }).code, 0, 'already continuing');
  assert.equal(stop({ agent_id, last_assistant_message: '' }).code, 2);
  assert.equal(stop({ agent_id, last_assistant_message: '' }).code, 0, 'cap reached');
});

test('subagent-report-gate lets a subagent with a report stop, and resets its count', () => {
  const agent_id = `b-${Date.now()}`;
  assert.equal(stop({ agent_id, last_assistant_message: '' }).code, 2);
  assert.equal(stop({ agent_id, last_assistant_message: '## Report\ndone' }).code, 0);
  assert.equal(stop({ agent_id, last_assistant_message: '' }).code, 2, 'count was reset');
});

test('subagent-report-gate never blocks without the fields it needs', () => {
  assert.equal(stop({ agent_id: `c-${Date.now()}` }).code, 0, 'field absent (older harness)');
  assert.equal(stop({ last_assistant_message: '' }).code, 0, 'no agent id');
});
