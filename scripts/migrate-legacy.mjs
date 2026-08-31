// One-time, deterministic structural migration. This does not verify news claims.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEvent, validateRegistry, CATEGORIES } from '../lib/events.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (fs.existsSync(path.join(root, 'data/events.json'))) throw new Error('Migration already exists; never replace the event ledger with legacy data');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const now = new Date().toISOString();
const clean = text => (text || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
const cards = [...html.matchAll(/<article class="story[^\"]*" data-priority="([^\"]+)"[^>]*>([\s\S]*?)<\/article>/g)].map((match, index) => {
  const raw = match[2];
  const date = [...html.slice(0, match.index).matchAll(/data-panel="([^\"]+)"/g)].at(-1)[1];
  return { index, date, priority: match[1], title: clean(/<h3>([\s\S]*?)<\/h3>/.exec(raw)?.[1]), summary: clean(/<p>([\s\S]*?)<\/p>/.exec(raw)?.[1]), time: clean(/<time>([\s\S]*?)<\/time>/.exec(raw)?.[1]), impact: clean(/<dt>运营影响<\/dt><dd>([\s\S]*?)<\/dd>/.exec(raw)?.[1]), action: clean(/<dt>建议动作<\/dt><dd>([\s\S]*?)<\/dd>/.exec(raw)?.[1]), sources: [...raw.matchAll(/<a href="([^\"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => {
    const url = m[1].replace(/&amp;/g, '&');
    const officialDomain = /(^|\.)amazon\.(com|in)$/.test(new URL(url).hostname);
    return { url, publisher: clean(m[2]).replace(/\s*→$/, ''), kind: officialDomain ? 'unverified' : 'aggregator', claimed_kind: officialDomain ? 'official_or_seller_post_unverified' : 'industry', published_at: null, verified_at: null, supports_event: false, authority_confirmed: false };
  }) };
});
if (cards.length !== 11) throw new Error(`Expected the supplied 11 legacy cards, found ${cards.length}; review before migration`);
const definitions = [
  { indexes: [0, 9], subject_key: 'amazon-fba-inventory-removal', action_key: 'settings-deadline-2026', marketplaces: ['US'], effective_date: null, deadline: '2026-08-28', title: '美国站 FBA 库存自动移除设置（旧版线索）' },
  { indexes: [1, 10], subject_key: 'amazon-eu-fba-import-details', action_key: 'require-mrn-eori-2026', marketplaces: ['EU'], effective_date: '2026-09-01' },
  { indexes: [2], subject_key: 'amazon-rheinberg-fulfillment-center', action_key: 'facility-expansion-2026', marketplaces: ['DE'], effective_date: null },
  { indexes: [3], subject_key: 'amazon-accelerate-2026', action_key: 'early-bird-registration-deadline', marketplaces: ['US', 'GLOBAL'], effective_date: null, deadline: '2026-08-29', category: 'ai', title: 'Amazon Accelerate 2026 早鸟报名截止（旧版线索）' },
  { indexes: [4], subject_key: 'amazon-seller-account-section-3', action_key: 'seller-review-reports-2026-08', marketplaces: ['US'], effective_date: null },
  { indexes: [5], subject_key: 'amazon-europe-fba-delivery-window', action_key: 'international-window-seven-days-2026', marketplaces: ['GB', 'DE', 'FR', 'IT', 'ES'], effective_date: '2026-09-01' },
  { indexes: [6], subject_key: 'amazon-india-cancellation-fee', action_key: 'tiered-order-value-fee-2026', marketplaces: ['IN'], effective_date: '2026-08-17', title: '印度站取消费分级计费（旧版线索）', summary: '旧版称8月17日起，非买家请求取消及超时未确认订单按订单额收取2%–10%取消费并叠加18% GST。本次未取得原文核实。' },
  { indexes: [6], subject_key: 'amazon-india-closing-fee', action_key: 'increase-closing-fee-2026', marketplaces: ['IN'], effective_date: '2026-09-07', title: '印度站部分成交费上调（旧版线索）', summary: '旧版称9月7日起部分成交费每件上调₹1或₹3。该变化与8月17日取消费调整分开建档；本次未取得原文核实。' },
  { indexes: [7], subject_key: 'amazon-us-mfn-fulfillment', action_key: 'official-qa-session-2026-08', marketplaces: ['US'], effective_date: null },
  { indexes: [8], subject_key: 'amazon-mechanical-turk', action_key: 'reported-service-closure-2026', marketplaces: ['GLOBAL'], effective_date: '2026-09-30', category: 'ai', summary: '旧版转述MTurk将于9月30日关闭，但只提供行业快讯列表页，未提供可核验的具体文章或官方公告。此消息未获确认，不得据此认定服务关闭。' },
  { indexes: [9], subject_key: 'amazon-fba-inventory-removal', action_key: 'settings-deadline-2026', marketplaces: ['JP'], effective_date: null, deadline: '2026-08-31', title: '日本站 FBA 库存移除设置（旧版线索）', summary: '旧版称日本站重点涉及270天以上超龄库存，8月31日前需复查移除设置；本次未核实范围、时限或处置机制。美国站变化已独立建档。' },
];
const events = definitions.map(def => {
  const first = cards[def.indexes[0]];
  const sources = [...new Map(def.indexes.flatMap(i => cards[i].sources).map(s => [s.url, s])).values()];
  return normalizeEvent({ ...def, indexes: undefined, title: def.title || first.title, summary: def.summary || first.summary, impact: first.impact || '旧版事项的适用范围与影响仍需官方原文复核；不能直接套用到美国站。', action: first.action ? `先核实当前官方要求；原建议为：${first.action}` : '查找直接支持该事项的公开原文，确认站点、日期和适用条件后再采取动作。', priority: first.priority, category: def.category || 'policy', original_published_at: null, original_date_note: def.indexes.map(i => `旧版${cards[i].date}卡片原时间标记：${cards[i].time}。`).join('') + '这些标记混有报道、发现与临期提醒时间，未将其冒充原始发布日期。', first_seen_at: now, last_material_update_at: now, verification_status: 'historical_unverified', history_dates: [...new Set(def.indexes.map(i => cards[i].date))], legacy_cards: def.indexes.map(i => ({ source_card: i + 1, display_date: cards[i].date, title: cards[i].title })), key_aliases: [], revisions: [], sources });
});
const registry = { schema_version: 1, content_updated_at: null, migration: { at: now, source_report_date: '2026-08-31', original_card_count: 11, compound_cards_split: 2, duplicate_occurrences_merged: 2, canonical_event_count: events.length, source_archive: 'archive/legacy-source-20260831.txt', news_reverified: false }, events };
validateRegistry(registry);
const report = { schema_version: 1, status: 'bootstrap', report_date: null, content_updated_at: null, new_event_keys: [], updated_event_keys: [], counts: { new: 0, updated: 0, merged: 0, deduplicated: 0 }, top_changes: [], category_coverage: Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, 'not_checked'])), coverage_note: '本次完成源码接线和历史事件去重，尚未完成新闻全来源复核。首轮任务须从8月28日起补查，包含8月29日、30日；旧网页的“无新增”不是已验证的成功基准。', action_items: [{ title: '旧版政策先复核再执行', detail: '已把不同站点与不同生效日分开，重复事项合并；请以查到的适用站点官方原文为准。', due: '执行前' }] };
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.mkdirSync(path.join(root, 'archive'), { recursive: true });
fs.writeFileSync(path.join(root, 'archive/legacy-source-20260831.txt'), html);
fs.writeFileSync(path.join(root, 'data/events.json'), JSON.stringify(registry, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'data/report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(registry.migration));
