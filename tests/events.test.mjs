import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalURL, makeEventKey, normalizeEvent, validateRegistry, applyBatch, digest, shanghaiDate } from '../lib/events.mjs';
import { emptyState, finalizeRun } from '../lib/checkpoints.mjs';
import { renderPage } from '../lib/render.mjs';

const at = '2026-08-31T09:00:00+08:00';
const source = (url = 'https://example.com/article/1') => ({ url, publisher: 'Example industry report', kind: 'industry_original', published_at: '2026-08-30', verified_at: at, supports_event: true, authority_confirmed: false });
const event = (change = {}) => normalizeEvent({ subject_key: 'amazon-fba-fees', action_key: 'annual-change-2026', marketplaces: ['US'], effective_date: '2026-09-01', title: 'FBA费用调整', summary: '明确的测试事项，不作为新闻。', category: 'policy', priority: 'P1', impact: '测试影响', action: '测试建议', original_published_at: '2026-08-30', original_date_note: 'Test only', first_seen_at: at, last_material_update_at: at, history_dates: ['2026-08-30'], verification_status: 'reviewed', sources: [source()], key_aliases: [], revisions: [], ...change });
const registry = (events = [event()]) => ({ schema_version: 1, content_updated_at: at, events });
const item = (base, evt, extra = {}) => ({ event: evt, dedupe_review: { compared_digest: digest(base), title_semantics_reviewed: true, batch_semantics_reviewed: true, matches_event_key: null, reason: 'Compared all prior titles, identities, source links and effective dates.' }, material_update: false, ...extra });
const batch = (base, candidates) => ({ base_digest: digest(base), checked_at: at, candidates });

test('event keys normalize marketplace order and retain unknown dates', () => {
  assert.equal(makeEventKey(event({ marketplaces: ['US', 'CA'], effective_date: null })), 'amazon-fba-fees|annual-change-2026|CA+US|unknown');
  assert.throws(() => makeEventKey({ ...event(), effective_date: '2026-02-31' }));
  assert.equal(shanghaiDate('2026-08-31T23:00:00Z'), '2026-09-01');
});
test('source tracking normalization preserves WeChat article identity', () => {
  assert.equal(canonicalURL('https://example.com/a?utm_source=x&id=3#part'), 'https://example.com/a?id=3');
  assert.notEqual(canonicalURL('https://mp.weixin.qq.com/s?__biz=a&mid=1&idx=1&sn=x'), canonicalURL('https://mp.weixin.qq.com/s?__biz=a&mid=2&idx=1&sn=x'));
  assert.throws(() => canonicalURL('javascript:alert(1)'));
});
test('exact duplicates are a complete no-op and do not refresh timestamps', () => {
  const base = registry();
  const result = applyBatch(base, batch(base, [item(base, event())]));
  assert.equal(result.material_changed, false);
  assert.equal(result.metadata_changed, false);
  assert.equal(result.counts.deduplicated, 1);
  assert.equal(digest(base), digest(result.registry));
});
test('syndicated different titles merge sources without publishing old news', () => {
  const base = registry();
  const result = applyBatch(base, batch(base, [item(base, event({ title: '新标题快讯：FBA费用变化', sources: [source('https://example.net/other')] }))]));
  assert.equal(result.registry.events.length, 1);
  assert.equal(result.registry.events[0].title, base.events[0].title);
  assert.equal(result.registry.events[0].sources.length, 2);
  assert.equal(result.counts.merged, 1);
  assert.equal(result.material_changed, false);
  assert.equal(result.metadata_changed, true);
});
test('official source promotion updates the same card', () => {
  const base = registry();
  const s = { ...source('https://sellercentral.amazon.com/news/example'), kind: 'official', authority_confirmed: true };
  const result = applyBatch(base, batch(base, [item(base, event({ sources: [s] }))]));
  assert.equal(result.registry.events.length, 1);
  assert.equal(result.registry.events[0].id, base.events[0].id);
  assert.equal(result.counts.updated, 1);
  assert.equal(result.material_changed, true);
});
test('date corrections keep the event identity and add aliases', () => {
  const base = registry([event({ effective_date: null })]);
  const candidate = item(base, event(), { material_update: true, update_reason: 'Official effective date is now available.' });
  candidate.dedupe_review.matches_event_key = base.events[0].event_key;
  const result = applyBatch(base, batch(base, [candidate]));
  const updated = result.registry.events[0];
  assert.equal(updated.event_key, base.events[0].event_key);
  assert(updated.key_aliases.includes(makeEventKey(event())));
  assert.equal(updated.revisions.length, 1);
  const again = applyBatch(result.registry, batch(result.registry, [item(result.registry, event())]));
  assert.equal(again.material_changed, false);
  assert.equal(again.registry.events.length, 1);
});
test('cross-language semantic match targets the existing event', () => {
  const base = registry();
  const candidate = item(base, event({ subject_key: 'amazon-us-fulfillment', action_key: 'fee-update', title: 'Fees updated for fulfillment' }));
  candidate.dedupe_review.matches_event_key = base.events[0].event_key;
  const result = applyBatch(base, batch(base, [candidate]));
  assert.equal(result.registry.events.length, 1);
  assert(result.registry.events[0].key_aliases.includes(candidate.event.event_key));
  assert.equal(result.material_changed, false);
});
test('shared articles can contain separate events but need explicit review', () => {
  const base = registry();
  const candidate = item(base, event({ subject_key: 'amazon-cancellation-fees', action_key: 'different-change' }));
  assert.throws(() => applyBatch(base, batch(base, [candidate])), /distinct-event/);
  candidate.dedupe_review.distinct_event_reason = 'One article describes two independent fee changes.';
  assert.equal(applyBatch(base, batch(base, [candidate])).counts.new, 1);
});
test('ambiguous/stale/missing semantic reviews and duplicate aliases fail closed', () => {
  const base = registry();
  assert.throws(() => applyBatch(base, { ...batch(base, []), base_digest: 'stale' }), /Stale/);
  assert.throws(() => applyBatch(base, batch(base, [{ event: event() }])), /semantic/);
  assert.throws(() => validateRegistry(registry([event(), event()])), /Duplicate/);
  assert.throws(() => event({ sources: [{ ...source(), kind: 'official' }] }), /Official evidence/);
});
test('same-batch duplicates create one card, one new count', () => {
  const base = registry([]);
  const result = applyBatch(base, batch(base, [item(base, event()), item(base, event())]));
  assert.equal(result.registry.events.length, 1);
  assert.equal(result.counts.new, 1);
  assert.equal(result.counts.deduplicated, 1);
});

const run = state => ({ id: 'run-20260831-test', base_state_digest: digest(state), started_at: at, finished_at: '2026-08-31T09:05:00+08:00', material_changed: false, publication: { status: 'not_needed' }, sources: [{ id: 'official', status: 'checked', window_start: state.bootstrap_window_start, checked_through: at, note: 'Checked public original pages.', evidence: [{ url: 'https://example.com/news', note: 'Checked the stated window.' }] }] });
test('no-change check advances records without needing a publication', () => {
  const state = emptyState(['official'], at);
  const next = finalizeRun(state, run(state));
  assert.equal(next.last_run_status, 'no_change');
  assert.equal(next.last_successful_run_at, at);
  assert.equal(next.last_verified_publication, null);
});
test('failed production verification never advances successful cursors', () => {
  const state = emptyState(['official'], at);
  const next = finalizeRun(state, { ...run(state), material_changed: true, publication: { status: 'failed' } });
  assert.equal(next.last_successful_run_at, null);
  assert.equal(next.sources.official.last_successful_check_at, null);
  assert.equal(next.last_run_status, 'publication_unverified');
});
test('partial coverage retains failed source cursor and global baseline', () => {
  const state = emptyState(['official', 'wechat'], at);
  const r = run(state);
  r.sources.push({ id: 'wechat', status: 'blocked', note: 'Login required; no bypass attempted.' });
  const next = finalizeRun(state, r);
  assert.equal(next.last_run_status, 'partial');
  assert.equal(next.last_successful_run_at, null);
  assert.equal(next.sources.official.last_successful_check_at, at);
  assert.equal(next.sources.wechat.last_successful_check_at, null);
});
test('no-change attempts cannot silently publish, and pending failures block no-change', () => {
  const state = emptyState(['official'], at);
  assert.throws(() => finalizeRun(state, { ...run(state), publication: { status: 'verified' } }), /must not publish/);
  const failed = finalizeRun(state, { ...run(state), material_changed: true });
  assert.throws(() => finalizeRun(failed, { ...run(failed), id: 'run-retry-test' }), /pending publication/);
});
test('migrated data render once, escape HTML, and do not claim news success', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
  const report = JSON.parse(fs.readFileSync(new URL('../data/report.json', import.meta.url), 'utf8'));
  assert(data.events.length >= data.migration.canonical_event_count);
  assert.equal(data.migration.duplicate_occurrences_merged, 2);
  const html = renderPage(data, report);
  const ids = [...html.matchAll(/\bid="([^\"]+)"/g)].map(m => m[1]);
  const eventKeys = [...html.matchAll(/data-event-key="([^\"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(eventKeys.length, new Set(eventKeys).size);
  assert.equal(eventKeys.length, data.events.length);
  if (report.status === 'bootstrap') {
    assert(html.includes('尚未完成本期核验'));
    assert(!html.includes('昨日无重大可靠更新'));
  }
  data.events[0].summary = '<script>alert("x")</script>';
  assert(!renderPage(data, report).includes('<script>alert'));
});
