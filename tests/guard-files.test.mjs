import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHook, tempDir } from './helpers.mjs';

test('guard-files asks when an edit weakens a test', () => {
  const dir = tempDir();
  const file = join(dir, 'cart.test.js');
  writeFileSync(file, "test('a', () => {\n  expect(1).toBe(1);\n  expect(2).toBe(2);\n});\n");
  const edit = (old_string, new_string) =>
    runHook('guard-files.mjs', { tool_name: 'Edit', tool_input: { file_path: file, old_string, new_string }, cwd: dir }).decision;
  assert.equal(edit('  expect(2).toBe(2);\n', ''), 'ask');
  assert.equal(edit("test('a'", "test.skip('a'"), 'ask');
  assert.equal(edit('expect(2).toBe(2)', 'expect(2).toBe(3)'), null);

  const spec = join(dir, 'order_spec.rb');
  writeFileSync(spec, "it 'works' do\n  expect(order).to be_valid\nend\n");
  const write = (content) => runHook('guard-files.mjs', { tool_name: 'Write', tool_input: { file_path: spec, content }, cwd: dir }).decision;
  assert.equal(write("xit 'works' do\n  expect(order).to be_valid\nend\n"), 'ask');
  assert.equal(write("it 'works' do\n  expect(order).to be_valid\n  expect(order.total).to eq(10)\nend\n"), null);

  const newTest = join(dir, 'new.test.js');
  assert.equal(runHook('guard-files.mjs', { tool_name: 'Write', tool_input: { file_path: newTest, content: 'test.skip("x", () => {})' }, cwd: dir }).decision, null);
});

test('guard-files asks before writing real-looking secrets', () => {
  const write = (file_path, content) => runHook('guard-files.mjs', { tool_name: 'Write', tool_input: { file_path, content }, cwd: tmpdir() }).decision;
  assert.equal(write('/app/config.js', 'const key = "AKIAABCDEFGHIJKLMNOP";'), 'ask');
  assert.equal(write('/app/config/initializers/stripe.rb', 'API_KEY = "s3cr3t-value-123456"'), 'ask');
  assert.equal(write('/app/config/initializers/stripe.rb', 'API_KEY = ENV.fetch("STRIPE_API_KEY")'), null);
  assert.equal(write('/app/.env.example', 'API_KEY="your-api-key-here"'), null);
  assert.equal(write('/app/spec/factories/users.rb', 'password { "password1234567" }\npassword: "password1234567"'), null);
});
