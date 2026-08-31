import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBatch, comparisonSnapshot, validateRegistry, digest, shanghaiDate } from '../lib/events.mjs';
import { renderPage } from '../lib/render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const registryPath = path.join(root, 'data/events.json');
const reportPath = path.join(root, 'data/report.json');
const [command, batchPath, outputArg] = process.argv.slice(2);
const registry = read(registryPath);
validateRegistry(registry);
if (command === 'snapshot') {
  console.log(JSON.stringify(comparisonSnapshot(registry), null, 2));
} else if (command === 'check') {
  const html = renderPage(registry, read(reportPath));
  if (html !== fs.readFileSync(path.join(root, 'index.html'), 'utf8')) throw new Error('index.html differs from the validated event data; regenerate before publishing');
  console.log(JSON.stringify({ valid: true, events: registry.events.length, digest: digest(registry) }));
} else if (command === 'render') {
  fs.writeFileSync(path.join(root, 'index.html'), renderPage(registry, read(reportPath)));
  console.log('Rendered index.html from validated events and report.');
} else if (command === 'stage') {
  if (!batchPath || !outputArg) throw new Error('Usage: node scripts/radar.mjs stage /path/to/batch.json /path/to/temporary-output');
  const output = path.resolve(outputArg);
  if (output === root || output.startsWith(root + path.sep)) throw new Error('Stage outside the source root; do not overwrite or publish partially checked files');
  const batch = read(path.resolve(batchPath));
  const result = applyBatch(registry, batch);
  const report = { ...batch.report, schema_version: 1, report_date: shanghaiDate(batch.checked_at), content_updated_at: batch.checked_at, new_event_keys: result.new_event_keys, updated_event_keys: result.updated_event_keys, counts: result.counts };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ...result, registry: undefined }, null, 2) + '\n');
  if (result.material_changed) {
    const html = renderPage(result.registry, report);
    fs.writeFileSync(path.join(output, 'events.json'), JSON.stringify(result.registry, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'index.html'), html);
  } else if (result.metadata_changed) {
    // Store this in radar-state, not main. Publish source-only merges with the next real content update.
    fs.writeFileSync(path.join(output, 'deferred-registry.json'), JSON.stringify(result.registry, null, 2) + '\n');
  }
  console.log(JSON.stringify({ material_changed: result.material_changed, metadata_changed: result.metadata_changed, counts: result.counts, output }));
} else {
  throw new Error('Use snapshot, check, render, or stage.');
}
