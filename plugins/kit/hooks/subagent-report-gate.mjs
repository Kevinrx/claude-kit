// SubagentStop: a subagent that ends its turn with an empty final message hands the caller
// nothing (a known harness failure, anthropics/claude-code#47936). Ask it once to send its
// report. Never loops: honours stop_hook_active and caps blocks per agent.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './lib.mjs';

const MAX_BLOCKS = 2;

main((input) => {
  if (!('last_assistant_message' in input)) return; // older harness without the field: never block on a guess
  const id = String(input.agent_id ?? '').replace(/[^\w-]/g, '');
  if (!id) return;
  const counterFile = join(tmpdir(), `kit-subagent-gate-${id}`);
  if (String(input.last_assistant_message ?? '').trim()) {
    rmSync(counterFile, { force: true });
    return;
  }
  if (input.stop_hook_active) return;
  const blocks = existsSync(counterFile) ? Number(readFileSync(counterFile, 'utf8')) || 0 : 0;
  if (blocks >= MAX_BLOCKS) return;
  writeFileSync(counterFile, String(blocks + 1));
  process.stderr.write('Your turn ended without a final report. Send your complete report now as your only message.\n');
  process.exit(2);
});
