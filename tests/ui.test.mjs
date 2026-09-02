import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { renderPage } from '../lib/render.mjs';
const registry = JSON.parse(fs.readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const report = JSON.parse(fs.readFileSync(new URL('../data/report.json', import.meta.url), 'utf8'));
const html = renderPage(registry, report);
const script = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function element(data = {}, names = []) {
  const classes = new Set(names);
  return { dataset: data, hidden: false, handlers: {}, attrs: {}, textContent: '', value: 'all', classList: { contains: name => classes.has(name), toggle(name, flag) { flag ? classes.add(name) : classes.delete(name); } }, addEventListener(name, callback) { this.handlers[name] = callback; }, setAttribute(name, value) { this.attrs[name] = value; }, click() { this.handlers.click?.(); }, change(value) { this.value = value; this.handlers.change?.(); } };
}
function fixture(storage = new Map(), blocked = false, hash = '') {
  const stories = registry.events.map(ev => { const s = element({ eventKey: ev.event_key, marketplaces: ev.marketplaces.join(' '), dates: ev.history_dates.join(' '), priority: ev.priority, category: ev.category }, ['story']); s.id = ev.id; s.scrollIntoView = () => {}; return s; });
  const filters = ['all', 'P0', 'P1', 'P2'].map(priority => element({ filter: priority }));
  const views = ['latest', 'all'].map(view => element({ view }));
  const market = element(); market.value = 'US';
  const category = element(), date = element(), count = element(), empty = element(), reset = element();
  const input = element(); input.closest = () => ({ querySelector: () => ({ textContent: '测试本机清单' }) });
  const nodes = { '#market-filter': market, '#category-filter': category, '#date-filter': date, '#story-count': count, '#filter-empty': empty, '#reset-filters': reset, '#event-list': element({ currentEventKeys: report.new_event_keys.concat(report.updated_event_keys).join('\n') }), main: element({ reportDate: report.report_date || 'bootstrap' }) };
  const doc = { querySelector: sel => nodes[sel] || null, querySelectorAll: sel => ({ '#event-list .story': stories, '[data-filter]': filters, '[data-view]': views, 'a[href^="#evt-"]': [], '.actions input[type="checkbox"]': [input] })[sel] || [], getElementById: id => stories.find(story => story.id === id) };
  const win = { location: { hash }, addEventListener() {}, localStorage: { getItem(key) { if (blocked) throw new Error('denied'); return storage.get(key); }, setItem(key, value) { if (blocked) throw new Error('denied'); storage.set(key, value); }, removeItem(key) { if (blocked) throw new Error('denied'); storage.delete(key); } } };
  vm.runInNewContext(script, { document: doc, window: win });
  return { stories, filters, views, market, category, date, count, empty, reset, input, storage };
}
test('latest US changes are the default while archive filters remain complete', () => {
  const f = fixture();
  const current = new Set([...report.new_event_keys, ...report.updated_event_keys]);
  assert.equal(f.date.value, 'latest');
  assert.equal(f.count.textContent, String(registry.events.filter(e => current.has(e.event_key) && (e.marketplaces.includes('US') || e.marketplaces.includes('GLOBAL'))).length));
  f.market.change('all'); assert.equal(f.count.textContent, String(current.size));
  f.category.change('ads');
  const adsCount = registry.events.filter(e => current.has(e.event_key) && e.category === 'ads').length;
  assert.equal(f.count.textContent, String(adsCount)); assert.equal(f.empty.hidden, adsCount > 0);
  f.date.change('all');
  assert.equal(f.count.textContent, String(registry.events.filter(e => e.category === 'ads').length));
  f.date.change('1900-01-01'); assert.equal(f.count.textContent, '0'); assert.equal(f.empty.hidden, false);
  f.reset.click(); assert.equal(f.date.value, 'latest'); assert.equal(f.empty.hidden, Number(f.count.textContent) > 0);
  f.filters.find(b => b.dataset.filter === 'P0').click();
  assert.equal(f.count.textContent, String(registry.events.filter(e => current.has(e.event_key) && e.priority === 'P0' && (e.marketplaces.includes('US') || e.marketplaces.includes('GLOBAL'))).length));
  f.views.find(button => button.dataset.view === 'all').click();
  assert.equal(f.date.value, 'all');
  assert.equal(f.count.textContent, String(registry.events.filter(e => e.priority === 'P0' && (e.marketplaces.includes('US') || e.marketplaces.includes('GLOBAL'))).length));
});
test('deep links reveal the single original event despite filters', () => {
  const foreign = registry.events.find(e => !e.marketplaces.includes('US') && !e.marketplaces.includes('GLOBAL'));
  const f = fixture(new Map(), false, '#' + foreign.id);
  assert.equal(f.market.value, 'all');
  assert.equal(f.stories.find(s => s.id === foreign.id).hidden, false);
});
test('checklist survives reload and storage denial does not crash', () => {
  const f = fixture(); f.input.checked = true; f.input.handlers.change();
  assert.equal(fixture(f.storage).input.checked, true);
  const noStorage = fixture(new Map(), true); noStorage.input.checked = true; noStorage.input.handlers.change();
  assert(noStorage.count.textContent);
});
test('static page references existing assets and state branch cannot deploy', () => {
  for (const match of html.matchAll(/(?:src|href)="\.\/([^\"]+)"/g)) assert(fs.existsSync(new URL('../' + match[1], import.meta.url)));
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.git.deploymentEnabled['radar-state'], false);
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length);
  assert(!/oapi\.dingtalk|api\.dingtalk/i.test(script + html));
});
test('daily briefing stays removed even when future reports contain category notes', () => {
  const withNotes = { ...report, category_notes: { ai: '公开核验范围内无重要增量 <不等于全源无新增>' } };
  const page = renderPage(registry, withNotes);
  assert(!/DAILY BRIEFING|daily-summary|category-summary|category-note|id="daily"|href="#daily"/.test(page));
  assert(!page.includes('公开核验范围内无重要增量'));
  assert(page.includes('KEY CHANGES'));
  assert(page.includes('id="news"'));
  assert(page.includes('id="actions"'));
  assert(page.includes('id="category-filter"'));
  assert(page.includes('COVERAGE · 实际检查范围'));
  assert(page.indexOf('id="actions"') < page.indexOf('id="news"'));
  assert(page.includes('data-view="latest"'));
  assert(page.includes('class="mobile-nav"'));
  assert(page.includes('（北京时间）'));
  assert.equal((page.match(/data-event-key=/g) || []).length, registry.events.length);
  assert.throws(() => renderPage(registry, { ...report, category_notes: { invalid: '错误栏目' } }), /Invalid category/);
});
test('all rendered section links point to existing anchors', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert(ids.has(match[1]), `Missing anchor ${match[1]}`);
});

test('Canada and Mexico collection scope and filters preserve latest and archive views', () => {
  assert(html.includes('加拿大 Amazon.ca'));
  assert(html.includes('墨西哥 Amazon.com.mx'));
  for (const [market, label] of [['CA', '加拿大站（CA）'], ['MX', '墨西哥站（MX）']]) {
    assert(html.includes(`<option value="${market}">${label}</option>`));
    const f = fixture();
    f.market.change(market);
    const current = new Set([...report.new_event_keys, ...report.updated_event_keys]);
    const latestExpected = registry.events.filter(event => current.has(event.event_key) && event.marketplaces.includes(market)).length;
    assert.equal(f.count.textContent, String(latestExpected));
    assert.equal(f.empty.hidden, latestExpected > 0);
    f.date.change('all');
    const archiveExpected = registry.events.filter(event => event.marketplaces.includes(market)).length;
    assert.equal(f.count.textContent, String(archiveExpected));
    assert.equal(f.empty.hidden, archiveExpected > 0);
    f.stories.forEach(story => assert.equal(story.hidden, !story.dataset.marketplaces.split(' ').includes(market)));
  }
  const sources = JSON.parse(fs.readFileSync(new URL('../config/sources.json', import.meta.url), 'utf8'));
  assert.equal(sources.marketplace_focus, 'US');
  assert.deepEqual(sources.marketplaces, ['US', 'CA', 'MX']);
  const ids = new Set(sources.sources.map(source => source.id));
  assert.equal(ids.size, sources.sources.length);
  for (const market of ['ca', 'mx']) {
    for (const name of ['amazon_seller_news', 'relevant_regulators', 'industry_wechat', 'amazon_category_competitors']) {
      assert(ids.has(`${name}_${market}`));
    }
    const group = sources.sources.find(source => source.id === `industry_wechat_${market}`);
    assert(group.include_source_ids.length > 0);
    assert(group.include_source_ids.every(id => ids.has(id)));
  }
});
