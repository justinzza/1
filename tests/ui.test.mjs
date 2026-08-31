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
  const market = element(); market.value = 'US';
  const category = element(), date = element(), count = element(), empty = element(), reset = element();
  const input = element(); input.closest = () => ({ querySelector: () => ({ textContent: '测试本机清单' }) });
  const nodes = { '#market-filter': market, '#category-filter': category, '#date-filter': date, '#story-count': count, '#filter-empty': empty, '#reset-filters': reset, '#event-list': element({ currentEventKeys: report.new_event_keys.concat(report.updated_event_keys).join('\n') }), main: element({ reportDate: report.report_date || 'bootstrap' }) };
  const doc = { querySelector: sel => nodes[sel] || null, querySelectorAll: sel => ({ '#event-list .story': stories, '[data-filter]': filters, 'a[href^="#evt-"]': [], '.actions input[type="checkbox"]': [input] })[sel] || [], getElementById: id => stories.find(story => story.id === id) };
  const win = { location: { hash }, addEventListener() {}, localStorage: { getItem(key) { if (blocked) throw new Error('denied'); return storage.get(key); }, setItem(key, value) { if (blocked) throw new Error('denied'); storage.set(key, value); }, removeItem(key) { if (blocked) throw new Error('denied'); storage.delete(key); } } };
  vm.runInNewContext(script, { document: doc, window: win });
  return { stories, filters, market, category, date, count, empty, reset, input, storage };
}
test('US default, all markets, categories, dates, priorities, and empty state agree', () => {
  const f = fixture();
  assert.equal(f.count.textContent, String(registry.events.filter(e => e.marketplaces.includes('US') || e.marketplaces.includes('GLOBAL')).length));
  f.market.change('all'); assert.equal(f.count.textContent, String(registry.events.length));
  f.category.change('ads'); assert.equal(f.count.textContent, '0'); assert.equal(f.empty.hidden, false);
  f.reset.click(); assert.equal(f.empty.hidden, Number(f.count.textContent) > 0);
  f.filters.find(b => b.dataset.filter === 'P0').click();
  assert.equal(f.count.textContent, String(registry.events.filter(e => e.priority === 'P0' && (e.marketplaces.includes('US') || e.marketplaces.includes('GLOBAL'))).length));
  f.reset.click(); f.date.change('latest');
  assert.equal(f.count.textContent, String(registry.events.filter(e => [...report.new_event_keys, ...report.updated_event_keys].includes(e.event_key) && (e.marketplaces.includes('US') || e.marketplaces.includes('GLOBAL'))).length));
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
