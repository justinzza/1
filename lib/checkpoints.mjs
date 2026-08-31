import { digest, validTime, canonicalURL } from './events.mjs';
export const PRODUCTION_URL = 'https://amazon-ops-radar-vercel.vercel.app/';
export function emptyState(sourceIDs, createdAt) {
  if (!validTime(createdAt)) throw new Error('Invalid created_at');
  return { schema_version: 1, created_at: createdAt, bootstrap_window_start: '2026-08-28T00:00:00+08:00', pending_backfill_dates: ['2026-08-29', '2026-08-30'], last_successful_run_at: null, last_run_id: null, last_verified_publication: null, pending_publication: null, deferred_metadata: null, sources: Object.fromEntries(sourceIDs.map(id => [id, { last_successful_check_at: null, last_attempt_at: null, last_status: 'not_checked', backfill_complete: false }])) };
}
export function finalizeRun(state, run) {
  if (state.schema_version !== 1 || run.base_state_digest !== digest(state)) throw new Error('Stale run state; reload before finalization');
  if (!validTime(run.started_at) || !validTime(run.finished_at) || Date.parse(run.finished_at) < Date.parse(run.started_at)) throw new Error('Invalid run interval');
  if (!/^[a-z0-9-]+$/.test(run.id) || state.last_run_id === run.id) throw new Error('Invalid or already finalized run id');
  const statuses = new Set(['checked', 'not_applicable', 'public_search_only', 'blocked', 'failed', 'not_checked']);
  if (!Array.isArray(run.sources)) throw new Error('Missing source coverage');
  const byID = new Map(run.sources.map(source => [source.id, source]));
  if (byID.size !== run.sources.length || Object.keys(state.sources).some(id => !byID.has(id)) || run.sources.some(s => !Object.hasOwn(state.sources, s.id))) throw new Error('Record every configured source exactly once');
  const next = structuredClone(state);
  const fullCoverage = run.sources.every(s => ['checked', 'not_applicable'].includes(s.status));
  let publishVerified = !run.material_changed;
  if (run.material_changed) {
    const p = run.publication;
    publishVerified = p?.status === 'verified' && p.github_status === 'success' && /^[a-f0-9]{40}$/.test(p.commit_sha || '') && /^[a-f0-9]{64}$/.test(p.expected_digest || '') && p.expected_digest === p.observed_digest && p.url === PRODUCTION_URL && validTime(p.verified_at);
    if (publishVerified) {
      next.last_verified_publication = p;
      next.pending_publication = null;
    } else next.pending_publication = { run_id: run.id, started_at: run.started_at, publication: run.publication || null, source_results: run.sources, note: 'Do not advance successful cursors. Verify this publication or retry the staged batch before new work.' };
  } else {
    if (run.publication?.status !== 'not_needed') throw new Error('No material changes must not publish or refresh the website');
    if (state.pending_publication) throw new Error('Resolve pending publication before declaring no change');
  }
  for (const source of run.sources) {
    if (!statuses.has(source.status) || !source.note?.trim()) throw new Error('Invalid source status or missing explanation');
    const completed = ['checked', 'not_applicable'].includes(source.status);
    if (completed) {
      if (!validTime(source.checked_through) || Date.parse(source.checked_through) > Date.parse(run.finished_at) || Date.parse(source.checked_through) < Date.parse(run.started_at)) throw new Error('Invalid per-source checked_through');
      if (!Array.isArray(source.evidence) || !source.evidence.length) throw new Error('Successful checks require traceable evidence, not just a success flag');
      const expectedStart = state.sources[source.id].last_successful_check_at || state.bootstrap_window_start;
      if (!validTime(source.window_start) || Date.parse(source.window_start) > Date.parse(expectedStart) || Date.parse(source.window_start) > Date.parse(source.checked_through)) throw new Error('Source window leaves an unchecked gap');
      for (const proof of source.evidence) { canonicalURL(proof.url); if (!proof.note?.trim()) throw new Error('Evidence needs an explanation'); }
    }
    const cursor = next.sources[source.id];
    cursor.last_attempt_at = run.finished_at;
    cursor.last_status = source.status;
    if (publishVerified && completed) {
      if (cursor.last_successful_check_at && Date.parse(source.checked_through) < Date.parse(cursor.last_successful_check_at)) throw new Error('Do not move a successful cursor backwards');
      cursor.last_successful_check_at = source.checked_through;
      if (Date.parse(source.window_start) <= Date.parse(state.bootstrap_window_start) && Date.parse(source.checked_through) >= Date.parse('2026-08-31T00:00:00+08:00')) cursor.backfill_complete = true;
    }
  }
  if (fullCoverage && publishVerified) {
    if (next.last_successful_run_at && Date.parse(run.started_at) < Date.parse(next.last_successful_run_at)) throw new Error('Do not move the global cursor backwards');
    next.last_successful_run_at = run.started_at;
    // Backfill is cleared only when the task supplies checked coverage for the initial window.
    if (run.backfill_complete === true) {
      if (!Object.values(next.sources).every(s => s.backfill_complete === true)) throw new Error('Backfill has not been checked for every source');
      next.pending_backfill_dates = [];
    }
  }
  next.last_run_id = run.id;
  next.last_run_status = !publishVerified ? 'publication_unverified' : fullCoverage ? (run.material_changed ? 'published' : 'no_change') : 'partial';
  if (Object.hasOwn(run, 'deferred_metadata')) next.deferred_metadata = run.deferred_metadata;
  return next;
}
