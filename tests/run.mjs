// `npm test`: runs tests/*.test.mjs only. A bare `node --test` searches the whole
// repo, and Node 22.18+ runs .ts files, so it would pick up
// plugins/kit-mods/tests/*.test.ts, which only `claude plugin test` can run
// (`npm run test:mods`). An explicit file list works the same on Node 18 to 24,
// where a directory or glob argument doesn't.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join(dir, f));
const run = spawnSync(process.execPath, ['--test', ...files, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(run.status ?? 1);
