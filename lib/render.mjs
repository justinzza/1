import { CATEGORIES, validateRegistry, evidenceLabel, primarySource, validDate, validTime, digest } from './events.mjs';

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dateText = value => value ? e(value.slice(0, 10)) : '尚未核实';
const beijingTime = value => {
  if (!value) return '新闻成功运行基准尚未建立';
  const shifted = new Date(Date.parse(value) + 8 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 16).replace('T', ' ')}（北京时间）`;
};
const array = (value, name) => { if (!Array.isArray(value)) throw new Error(`${name} must be an array`); return value; };

export function validateReport(registry, report) {
  if (report.schema_version !== 1 || !['bootstrap', 'complete', 'partial'].includes(report.status)) throw new Error('Invalid report status');
  if (report.status !== 'bootstrap' && (!validDate(report.report_date) || !validTime(report.content_updated_at))) throw new Error('Report needs a real report date and content update time');
  if (report.status === 'bootstrap' && (report.report_date !== null || report.content_updated_at !== null)) throw new Error('Bootstrap is not a successful news run');
  const byKey = new Map(registry.events.map(event => [event.event_key, event]));
  const changed = [...array(report.new_event_keys, 'new_event_keys'), ...array(report.updated_event_keys, 'updated_event_keys')];
  if (new Set(changed).size !== changed.length) throw new Error('Changed event lists must be unique and disjoint');
  for (const key of changed) if (!byKey.has(key) || byKey.get(key).verification_status !== 'reviewed') throw new Error('Current report can only contain checked events');
  if (report.counts?.new !== report.new_event_keys.length || report.counts?.updated !== report.updated_event_keys.length) throw new Error('Report counts do not match changed events');
  for (const field of ['new', 'updated', 'merged', 'deduplicated']) if (!Number.isInteger(report.counts[field]) || report.counts[field] < 0) throw new Error('Invalid report count');
  const top = array(report.top_changes, 'top_changes');
  if (top.length > 3 || new Set(top).size !== top.length || top.some(key => !changed.includes(key))) throw new Error('Top changes must be unique changed events, at most three');
  if (report.status !== 'bootstrap' && changed.length && !top.length) throw new Error('Choose the actual most important changes');
  for (const category of Object.keys(CATEGORIES)) {
    const coverage = report.category_coverage?.[category];
    if (!['complete', 'partial', 'not_checked'].includes(coverage)) throw new Error('Each category needs an explicit coverage status');
    if (report.status === 'complete' && coverage !== 'complete') throw new Error('Incomplete coverage cannot be labelled complete');
  }
  if (!report.coverage_note?.trim()) throw new Error('Coverage limitations must be documented');
  for (const [key, note] of Object.entries(report.category_notes || {})) {
    if (!(key in CATEGORIES) || typeof note !== 'string' || !note.trim()) throw new Error('Invalid category coverage note');
  }
  for (const action of array(report.action_items, 'action_items')) {
    if (!action.title?.trim() || !action.detail?.trim()) throw new Error('Action items need a title and detail');
    if (action.event_key && !byKey.has(action.event_key)) throw new Error('Unknown action event key');
  }
  return true;
}

function card(event) {
  const label = evidenceLabel(event);
  const historical = event.verification_status === 'historical_unverified';
  const industry = event.sources.some(s => ['industry_original', 'aggregator', 'wechat', 'seller_forum'].includes(s.kind));
  const source = primarySource(event);
  const day = event.history_dates.at(-1) || event.first_seen_at.slice(0, 10);
  return `<article class="story${historical ? ' historical' : ''}" id="${e(event.id)}" data-event-key="${e(event.event_key)}" data-priority="${e(event.priority)}" data-category="${e(event.category)}" data-marketplaces="${e(event.marketplaces.join(' '))}" data-dates="${e(event.history_dates.join(' '))}">
<div class="story-mark">${e(event.marketplaces[0] === 'GLOBAL' ? '全' : event.marketplaces[0])}</div><div class="story-main"><div class="story-meta"><span class="pill ${e(event.priority.toLowerCase())}">${e(event.priority)}</span><span>${e(event.marketplaces.join(' / '))} · ${e(CATEGORIES[event.category])}</span><span class="evidence ${historical ? 'unverified' : label === '官方确认' ? 'confirmed' : 'clue'}">${e(label)}</span>${historical && industry ? '<span class="evidence clue">行业线索</span>' : ''}<time datetime="${e(day)}">收录 / 更新 ${e(day)}</time></div>
<h3>${e(event.title)}</h3>${historical ? '<p class="historical-notice">来自旧版页面，尚未重新核验。下述日期与说法不能作为当前官方政策依据。</p>' : ''}<p class="story-summary">${e(event.summary)}</p>
<div class="event-dates"><span>原始发布：${dateText(event.original_published_at)}</span><span>生效日期：${dateText(event.effective_date)}${historical && event.effective_date ? '（旧版说法）' : ''}</span>${event.deadline ? `<span class="deadline">办理截止：${e(event.deadline)}${historical ? '（待核实）' : ''}</span>` : ''}</div><div class="story-foot"><span>主来源：${e(source.publisher)}</span>${event.sources.map(s => `<a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(s.publisher)} ↗</a>`).join('')}</div>
<details class="story-more"><summary>展开运营影响、行动建议与核验记录</summary><dl><div><dt>运营影响${historical ? '（待核实）' : ''}</dt><dd>${e(event.impact)}</dd></div><div><dt>可执行动作${historical ? '（先核验）' : ''}</dt><dd>${e(event.action)}</dd></div></dl><div class="event-audit"><b>事件标识与核验记录</b><p><code>${e(event.event_key)}</code></p><p>${e(event.original_date_note)}</p><p>首次发现：${e(event.first_seen_at)}；最后实质更新：${e(event.last_material_update_at)}${historical ? '（导入时间，不是新闻发布时间）' : ''}</p>${event.revisions.length ? `<ol>${event.revisions.map(r => `<li>${e(r.at)} — ${e(r.reason)}</li>`).join('')}</ol>` : ''}</div></details></div></article>`;
}

export function renderPage(registry, report) {
  validateRegistry(registry);
  validateReport(registry, report);
  const byKey = new Map(registry.events.map(event => [event.event_key, event]));
  const changedKeys = [...report.new_event_keys, ...report.updated_event_keys];
  const changedEvents = changedKeys.map(key => byKey.get(key));
  const currentP0 = changedEvents.filter(event => event.priority === 'P0').length;
  const reportDay = report.report_date ? Date.parse(`${report.report_date}T00:00:00Z`) : NaN;
  const dueSoon = Number.isFinite(reportDay) ? registry.events.filter(event => event.deadline && (() => {
    const due = Date.parse(`${event.deadline}T00:00:00Z`);
    return due >= reportDay && due <= reportDay + 7 * 86400000;
  })()).length : 0;
  const title = report.status === 'bootstrap' ? '事件库已整理，等待首次完整核验' : `${e(report.report_date)} 增量情报`;
  const dates = [...new Set(registry.events.flatMap(event => event.history_dates))].sort().reverse();
  const markets = [...new Set(['CA', 'MX', ...registry.events.flatMap(event => event.marketplaces)])].sort();
  const marketNames = { CA: '加拿大站（CA）', MX: '墨西哥站（MX）' };
  const top = report.top_changes.length ? `<div class="top-change-list">${report.top_changes.map((key, index) => { const event = byKey.get(key); return `<article><span class="change-number">0${index + 1}</span><div><p class="change-meta"><b class="pill ${e(event.priority.toLowerCase())}">${e(event.priority)}</b> ${e(event.marketplaces.join(' / '))} · ${e(CATEGORIES[event.category])}</p><h3><a href="#${e(event.id)}">${e(event.title)}</a></h3><p>${e(event.impact)}</p></div></article>`; }).join('')}</div>` : '<p>尚无经过本期核验的变化，不用历史新闻补足三条。</p>';
  const contentHash = digest({ registry, report });
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="美国 Amazon.com、加拿大 Amazon.ca、墨西哥 Amazon.com.mx 运营增量情报：官方优先、单一事件卡片、可追溯来源与行动建议。"><meta name="referrer" content="strict-origin-when-cross-origin"><meta property="og:title" content="亚马逊运营雷达"><title>亚马逊运营雷达</title><link rel="stylesheet" href="./styles.css"></head>
<body><main id="top" data-report-date="${e(report.report_date || 'bootstrap')}" data-release="event-ledger-v1" data-content-digest="${contentHash}">
<header class="topbar"><a class="brand" href="#top"><span class="brandmark">R</span><span>运营雷达</span></a><nav><a class="active" href="#changes">重点变化</a><a href="#actions">今日行动</a><a href="#news">事件档案</a></nav><div class="top-actions"><span class="status ${e(report.status)}"><i></i>${report.status === 'bootstrap' ? '全源核验待运行' : report.status === 'partial' ? '部分来源待核验' : '最近一期已核验'}</span><div class="avatar">AM</div></div></header>
<section class="ticker"><span>US 优先 · CA / MX</span><p>${title}</p><time>更新 ${e(beijingTime(report.content_updated_at))}</time></section>
<div class="shell"><section class="hero"><div><p class="eyebrow">AMAZON OPERATIONS INTELLIGENCE</p><h1>亚马逊运营雷达</h1><p class="sub">收录范围：美国 Amazon.com、加拿大 Amazon.ca、墨西哥 Amazon.com.mx，美国站优先。新增站点的实际核验进度以覆盖说明为准。同一事件只保留一张卡片；新信息更新原记录。行业消息明确标注，无法核实的不作为官方政策。</p></div><div class="date"><strong>${report.report_date ? e(report.report_date.slice(-2)) : '—'}</strong><span>${report.report_date ? e(report.report_date.slice(0, 7)) : '等待完整核验'}<br>Amazon.com</span></div></section>
<section class="alert-card" id="coverage"><div class="coverage-head"><div><p class="eyebrow">COVERAGE · 实际检查范围</p><h2>${title}</h2></div><span class="coverage-badge ${e(report.status)}">${report.status === 'complete' ? '完整核验' : report.status === 'partial' ? '部分覆盖' : '等待核验'}</span></div><details><summary>查看本期覆盖说明与运行记录</summary><p>${e(report.coverage_note)}</p><p class="run-stats">运行记录：新增 ${report.counts.new} · 实质更新 ${report.counts.updated} · 来源合并 ${report.counts.merged} · 排除重复 ${report.counts.deduplicated}</p></details></section>
<section class="metrics" aria-label="本期运营指标"><article><span>${changedKeys.length}</span><p>本期变化</p><small>${report.counts.new} 新增 · ${report.counts.updated} 更新</small></article><article class="${currentP0 ? 'critical' : ''}"><span>${currentP0}</span><p>本期 P0</p><small>优先处理高影响事项</small></article><article class="${dueSoon ? 'warning' : ''}"><span>${dueSoon}</span><p>7日内截止</p><small>按事件办理截止日期</small></article><article><span>3站</span><p>US · CA · MX</p><small>${report.status === 'complete' ? '本期完整覆盖' : '查看实际覆盖说明'}</small></article></section>
<section class="section top-changes" id="changes"><div class="section-head"><div><p class="eyebrow">KEY CHANGES</p><h2>今日最重要的${report.top_changes.length || 0}项变化</h2></div><a class="section-link" href="#actions">转到行动清单 ↓</a></div>${top}</section>
<section class="section actions" id="actions"><div class="section-head"><div><p class="eyebrow">EXECUTION LIST</p><h2>今日行动清单</h2></div><span class="action-tip">勾选仅保存在当前设备</span></div>${report.action_items.length ? report.action_items.map(a => `<label><input type="checkbox"><span><b>${e(a.title)}</b><small>${e(a.detail)}</small></span><em>${e(a.due || '核验后')}</em></label>`).join('') : '<p>本期没有需要新增执行的事项。</p>'}</section>
<section class="section" id="news"><div class="section-head"><div><p class="eyebrow">ONE EVENT · ONE RECORD</p><h2>事件档案</h2></div><p class="visible-count" role="status">显示 <b id="story-count">${registry.events.length}</b> / ${registry.events.length} 条</p></div>
<div class="archive-shortcuts" aria-label="档案视图"><button type="button" class="active" data-view="latest" aria-pressed="true">本期变化</button><button type="button" data-view="all" aria-pressed="false">全部历史档案</button></div>
<div class="filters"><label>站点<select id="market-filter"><option value="US">美国站及全球</option><option value="all">所有站点</option><option value="GLOBAL">仅全球事件</option><option value="US_ONLY">仅美国站</option>${markets.filter(m => !['US', 'GLOBAL'].includes(m)).map(m => `<option value="${e(m)}">${e(marketNames[m] || m)}</option>`).join('')}</select></label><label>栏目<select id="category-filter"><option value="all">全部栏目</option>${Object.entries(CATEGORIES).map(([k, name]) => `<option value="${e(k)}">${e(name)}</option>`).join('')}</select></label><label>收录 / 更新日期<select id="date-filter"><option value="latest" selected>本期新增或更新</option><option value="all">全部日期</option>${dates.map(d => `<option value="${e(d)}">${e(d)}</option>`).join('')}</select></label></div>
<div class="filters priority-filters" aria-label="优先级"><button type="button" class="active" data-filter="all" aria-pressed="true">全部优先级</button>${['P0', 'P1', 'P2'].map(p => `<button type="button" data-filter="${p}" aria-pressed="false">${p}</button>`).join('')}<button type="button" id="reset-filters">重置筛选</button></div><p class="archive-note">历史资料只展示一次。标为“待复核”的记录不是本期确认信息；日期来自旧版时会单独说明。</p>
<div id="event-list" data-current-event-keys="${e(changedKeys.join('\n'))}">${[...registry.events].sort((a, b) => b.last_material_update_at.localeCompare(a.last_material_update_at) || a.id.localeCompare(b.id)).map(card).join('\n')}</div><p id="filter-empty" class="filter-empty" hidden>没有符合筛选条件的事件。</p><noscript><p>启用 JavaScript 后可以筛选；事件内容无需 JavaScript 即可阅读。</p></noscript></section>
<footer><p>官方原文优先 · 公开来源限定 · 不以旧闻凑数</p><a href="#top">返回顶部 ↑</a></footer></div><nav class="mobile-nav" aria-label="移动端快捷导航"><a href="#changes">重点</a><a href="#actions">行动</a><a href="#news">档案</a></nav></main><script src="./app.js"></script></body></html>\n`;
}
