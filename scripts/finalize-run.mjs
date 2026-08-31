import fs from 'node:fs';
import { finalizeRun } from '../lib/checkpoints.mjs';
const [statePath, runPath, outputPath] = process.argv.slice(2);
if (!statePath || !runPath || !outputPath || outputPath === statePath || outputPath === runPath) throw new Error('Usage: node scripts/finalize-run.mjs state.json run.json /temporary/next-state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
const next = finalizeRun(state, run);
fs.writeFileSync(outputPath, JSON.stringify(next, null, 2) + '\n');
console.log(JSON.stringify({ status: next.last_run_status, last_successful_run_at: next.last_successful_run_at, output: outputPath }));
