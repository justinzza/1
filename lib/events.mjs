import { createHash } from 'node:crypto';

export const CATEGORIES = {
  policy: '亚马逊政策与规则变化',
  ads: '广告功能、投放机制与流量趋势',
  ai: 'AI 工具与亚马逊运营方法',
  opportunities: '类目趋势与关键词机会',
  competitors: '竞品价格、促销、排名及页面变化',
};
export const SOURCE_PRIORITY = { official: 0, regulator: 0, industry_original: 1, aggregator: 2, wechat: 3, seller_forum: 3, unverified: 4 };
export const stableJSON = (value) => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, 'en'))) : v);
export const digest = (value) => createHash('sha256').update(stableJSON(value)).digest('hex');
const clone = (v) => structuredClone(v);
const fail = (message) => { throw new Error(message); };
const text = (value, field) => typeof value === 'string' && value.trim() ? value.trim() : fail(`Missing ${field}`);

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}
export const shanghaiDate = value => new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
export function canonicalURL(value) {
  const u = new URL(value);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) fail('Sources must use public HTTP(S) links without credentials');
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'msclkid', 'mons_sel_locale'].includes(key.toLowerCase())) u.searchParams.delete(key);
  }
  // Keep article identity parameters, including WeChat __biz/mid/idx/sn.
  u.searchParams.sort();
  u.hostname = u.hostname.toLowerCase();
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}
function slug(value, field) {
  const v = text(value, field).normalize('NFKC').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) fail(`${field} must be a stable lowercase slug`);
  return v;
}
export function makeEventKey(event) {
  const markets = [...new Set(event.marketplaces || [])].sort();
  if (!markets.length || markets.some(m => !/^[A-Z0-9-]+$/.test(m))) fail('Invalid marketplaces');
  if (event.effective_date !== null && !validDate(event.effective_date)) fail('effective_date must be ISO date or null');
  return [slug(event.subject_key, 'subject_key'), slug(event.action_key, 'action_key'), markets.join('+'), event.effective_date || 'unknown'].join('|');
}
const normalizedTitle = title => title.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
const keys = event => [event.event_key, ...(event.key_aliases || [])];
const identity = event => [event.subject_key, event.action_key, [...event.marketplaces].sort().join('+')].join('|');
const sameMarkets = (a, b) => stableJSON([...a.marketplaces].sort()) === stableJSON([...b.marketplaces].sort());
const compatibleDate = (a, b) => !a.effective_date || !b.effective_date || a.effective_date === b.effective_date;

function normalizeSource(source) {
  const result = clone(source);
  result.url = text(source.url, 'source.url');
  result.canonical_url = canonicalURL(result.url);
  result.publisher = text(source.publisher, 'source.publisher');
  if (!(source.kind in SOURCE_PRIORITY)) fail(`Invalid source kind: ${source.kind}`);
  if (source.published_at !== null && !validDate(source.published_at) && !validTime(source.published_at)) fail('Invalid source published_at');
  if (source.verified_at !== null && !validTime(source.verified_at)) fail('Invalid source verified_at');
  if (['official', 'regulator'].includes(source.kind) && (!source.verified_at || source.supports_event !== true || source.authority_confirmed !== true)) fail('Official evidence needs verified_at, supports_event and authority_confirmed; a domain alone is insufficient');
  return result;
}
export function evidenceLabel(event) {
  if (event.verification_status === 'historical_unverified') return '历史记录 · 待复核';
  if (event.sources.some(s => ['official', 'regulator'].includes(s.kind) && s.supports_event && s.authority_confirmed && s.verified_at)) return '官方确认';
  if (event.sources.some(s => ['industry_original', 'aggregator', 'wechat', 'seller_forum'].includes(s.kind))) return '行业线索';
  return '待核实';
}
export function primarySource(event) {
  const sorted = [...event.sources].sort((a, b) => SOURCE_PRIORITY[a.kind] - SOURCE_PRIORITY[b.kind] || a.canonical_url.localeCompare(b.canonical_url));
  const previous = event.sources.find(s => s.canonical_url === event.primary_source_url);
  return previous && SOURCE_PRIORITY[previous.kind] === SOURCE_PRIORITY[sorted[0].kind] ? previous : sorted[0];
}
export function normalizeEvent(input, { existing = false } = {}) {
  const event = clone(input);
  event.subject_key = slug(event.subject_key, 'subject_key');
  event.action_key = slug(event.action_key, 'action_key');
  event.marketplaces = [...new Set(event.marketplaces || [])].sort();
  const currentKey = makeEventKey(event);
  event.event_key = existing ? text(event.event_key, 'event_key') : currentKey;
  event.key_aliases = [...new Set(event.key_aliases || [])].filter(k => k !== event.event_key).sort();
  if (existing && !keys(event).includes(currentKey)) fail('Current canonical key must be the stable event_key or an alias');
  event.id = existing ? text(event.id, 'id') : `evt-${digest(event.event_key).slice(0, 16)}`;
  if (!/^evt-[a-f0-9]{16}$/.test(event.id)) fail('Invalid event id');
  for (const field of ['title', 'summary', 'impact', 'action', 'original_date_note']) event[field] = text(event[field], field);
  if (!(event.category in CATEGORIES)) fail(`Unknown category: ${event.category}`);
  if (!['P0', 'P1', 'P2'].includes(event.priority)) fail('Invalid priority');
  if (!['historical_unverified', 'reviewed'].includes(event.verification_status)) fail('Invalid verification_status');
  if (event.original_published_at !== null && !validDate(event.original_published_at) && !validTime(event.original_published_at)) fail('Invalid original_published_at');
  for (const field of ['first_seen_at', 'last_material_update_at']) if (!validTime(event[field])) fail(`Invalid ${field}`);
  if (!Array.isArray(event.sources) || !event.sources.length) fail('At least one source is required');
  event.sources = event.sources.map(normalizeSource);
  if (new Set(event.sources.map(s => s.canonical_url)).size !== event.sources.length) fail('Duplicate source URL inside an event');
  event.primary_source_url = primarySource(event).canonical_url;
  event.revisions ||= [];
  event.history_dates = [...new Set(event.history_dates || [])].sort();
  if (event.history_dates.some(d => !validDate(d))) fail('Invalid history_dates');
  return event;
}
export function validateRegistry(registry) {
  if (registry.schema_version !== 1 || !Array.isArray(registry.events)) fail('Invalid registry schema');
  const allKeys = new Set();
  const ids = new Set();
  for (const input of registry.events) {
    const event = normalizeEvent(input, { existing: true });
    if (ids.has(event.id)) fail(`Duplicate id ${event.id}`);
    ids.add(event.id);
    for (const key of keys(event)) {
      if (allKeys.has(key)) fail(`Duplicate event key or alias: ${key}`);
      allKeys.add(key);
    }
  }
  return true;
}

export function comparisonSnapshot(registry) {
  validateRegistry(registry);
  return { digest: digest(registry), events: registry.events.map(e => ({ event_key: e.event_key, key_aliases: e.key_aliases, title: e.title, subject_key: e.subject_key, action_key: e.action_key, marketplaces: e.marketplaces, effective_date: e.effective_date, sources: e.sources.map(s => s.canonical_url) })) };
}
export function findMatches(events, candidate) {
  const key = makeEventKey(candidate);
  const sourceURLs = new Set(candidate.sources.map(s => s.canonical_url));
  return events.map(e => ({ event: e, axes: {
    event_key: keys(e).includes(key),
    title: normalizedTitle(e.title) === normalizedTitle(candidate.title) && sameMarkets(e, candidate) && compatibleDate(e, candidate),
    identity: identity(e) === identity(candidate) && compatibleDate(e, candidate),
    source: e.sources.some(s => sourceURLs.has(s.canonical_url)),
    effective_date: Boolean(e.effective_date && e.effective_date === candidate.effective_date),
  } })).filter(m => Object.values(m.axes).some(Boolean));
}
const materialFields = ['title', 'summary', 'impact', 'action', 'category', 'priority', 'marketplaces', 'effective_date', 'deadline', 'original_published_at', 'original_date_note', 'verification_status'];
function materialDigest(event) {
  const primary = primarySource(event);
  return digest({ ...Object.fromEntries(materialFields.map(f => [f, event[f] ?? null])), evidence: evidenceLabel(event), primary: [primary.canonical_url, primary.kind] });
}
function mergeSources(oldSources, additions) {
  const byURL = new Map(oldSources.map(s => [s.canonical_url, clone(s)]));
  for (const source of additions) {
    const old = byURL.get(source.canonical_url);
    if (!old || SOURCE_PRIORITY[source.kind] < SOURCE_PRIORITY[old.kind]) byURL.set(source.canonical_url, source);
    // A later check timestamp alone is not a content change.
  }
  return [...byURL.values()];
}

export function applyBatch(registry, batch) {
  validateRegistry(registry);
  if (batch.base_digest !== digest(registry)) fail('Stale comparison baseline; reload main and repeat all four comparisons');
  if (!validTime(batch.checked_at)) fail('Invalid checked_at');
  if (!Array.isArray(batch.candidates)) fail('candidates must be an array');
  const next = clone(registry);
  const counts = { new: 0, updated: 0, merged: 0, deduplicated: 0 };
  const decisions = [];
  const newKeys = new Set(), updatedKeys = new Set();
  for (const item of batch.candidates) {
    const review = item.dedupe_review;
    if (!review || review.compared_digest !== batch.base_digest || review.title_semantics_reviewed !== true || review.batch_semantics_reviewed !== true || !review.reason?.trim()) fail('A documented title-semantic review against the entire baseline and this batch is required');
    const candidate = normalizeEvent(item.event);
    if (candidate.verification_status !== 'reviewed') fail('New submissions must be reviewed; use the one-time migration for unverified historical data');
    if (!candidate.sources.some(s => s.verified_at && s.supports_event === true)) fail('At least one publicly checked source must directly support the event');
    const matches = findMatches(next.events, candidate);
    const strong = matches.filter(m => m.axes.event_key || m.axes.identity);
    let existing = review.matches_event_key ? next.events.find(e => keys(e).includes(review.matches_event_key)) : null;
    if (review.matches_event_key && !existing) fail('Semantic match target does not exist');
    if (!existing && strong.length === 1) existing = strong[0].event;
    if (strong.some(m => existing && m.event.id !== existing.id) || (!existing && strong.length > 1)) fail('Ambiguous duplicate matches require an explicit reconciliation, not a new card');
    const suspicious = matches.filter(m => !existing || m.event.id !== existing.id).filter(m => m.axes.source || m.axes.title || (m.axes.effective_date && identity(m.event) === identity(candidate)));
    if (suspicious.length && !review.distinct_event_reason?.trim()) fail('Shared source or changed effective date needs a distinct-event explanation or an existing-card match');
    if (!existing) {
      candidate.first_seen_at = batch.checked_at;
      candidate.last_material_update_at = batch.checked_at;
      candidate.history_dates = [shanghaiDate(batch.checked_at)];
      next.events.push(candidate);
      newKeys.add(candidate.event_key);
      decisions.push({ event_key: candidate.event_key, action: 'new', review: review.reason });
      continue;
    }
    const before = materialDigest(existing);
    const sourcesBefore = digest(existing.sources);
    existing.sources = mergeSources(existing.sources, candidate.sources);
    if (!keys(existing).includes(candidate.event_key)) existing.key_aliases.push(candidate.event_key);
    if (item.material_update === true) {
      if (!item.update_reason?.trim()) fail('Substantive update requires an explanation');
      const previous = Object.fromEntries(materialFields.map(f => [f, existing[f] ?? null]));
      for (const field of materialFields) if (Object.hasOwn(candidate, field)) existing[field] = candidate[field];
      // Subject/action and original identity remain stable; date changes get aliases.
      const alias = makeEventKey({ ...existing, subject_key: existing.subject_key, action_key: existing.action_key });
      if (!keys(existing).includes(alias)) existing.key_aliases.push(alias);
      existing.revisions.push({ at: batch.checked_at, reason: item.update_reason, previous });
    }
    existing.primary_source_url = primarySource(existing).canonical_url;
    const after = materialDigest(existing);
    if (before !== after) {
      existing.last_material_update_at = batch.checked_at;
      existing.history_dates = [...new Set([...existing.history_dates, shanghaiDate(batch.checked_at)])].sort();
      if (!newKeys.has(existing.event_key)) updatedKeys.add(existing.event_key);
    } else {
      if (item.material_update === true) existing.revisions.pop();
      counts.deduplicated += 1;
    }
    if (sourcesBefore !== digest(existing.sources)) counts.merged += 1;
    decisions.push({ event_key: existing.event_key, action: before === after ? 'duplicate' : 'update', axes: matches.find(m => m.event.id === existing.id)?.axes || {}, review: review.reason });
  }
  counts.new = newKeys.size;
  counts.updated = updatedKeys.size;
  const materialChanged = counts.new + counts.updated > 0;
  validateRegistry(next);
  if (materialChanged) next.content_updated_at = batch.checked_at;
  return { registry: next, material_changed: materialChanged, metadata_changed: digest(next) !== digest(registry), counts, new_event_keys: [...newKeys], updated_event_keys: [...updatedKeys], decisions };
}
