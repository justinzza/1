(() => {
  'use strict';
  const stories = [...document.querySelectorAll('#event-list .story')];
  const priorityButtons = [...document.querySelectorAll('[data-filter]')];
  const marketButtons = [...document.querySelectorAll('[data-market-filter]')];
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  const search = document.querySelector('#search-input');
  const category = document.querySelector('#category-filter');
  const date = document.querySelector('#date-filter');
  const count = document.querySelector('#story-count');
  const empty = document.querySelector('#filter-empty');
  const current = new Set((document.querySelector('#event-list')?.dataset.currentEventKeys || '').split('\n').filter(Boolean));
  let priority = 'all';
  let market = 'all';
  function applyFilters() {
    let visible = 0;
    const query = (search?.value || '').trim().toLowerCase();
    for (const story of stories) {
      const markets = story.dataset.marketplaces.split(' ');
      const dates = story.dataset.dates.split(' ');
      const marketMatches = market === 'all' || markets.includes(market);
      const categoryMatches = category.value === 'all' || category.value === story.dataset.category;
      const dateMatches = date.value === 'all' || (date.value === 'latest' ? current.has(story.dataset.eventKey) : dates.includes(date.value));
      const searchMatches = !query || story.dataset.search.includes(query) || story.textContent.toLowerCase().includes(query);
      story.hidden = !(marketMatches && categoryMatches && dateMatches && searchMatches && (priority === 'all' || story.dataset.priority === priority));
      if (!story.hidden) visible += 1;
    }
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible > 0;
    priorityButtons.forEach(button => {
      const selected = button.dataset.filter === priority;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    marketButtons.forEach(button => {
      const selected = button.dataset.marketFilter === market;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    viewButtons.forEach(button => {
      const selected = button.dataset.view === date.value;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function reset(marketValue = 'all', dateValue = current.size ? 'latest' : 'all') {
    market = marketValue;
    category.value = 'all';
    date.value = dateValue;
    priority = 'all';
    if (search) search.value = '';
    applyFilters();
  }
  [category, date].forEach(select => select?.addEventListener('change', applyFilters));
  search?.addEventListener('input', applyFilters);
  document.querySelector('#clear-search')?.addEventListener('click', () => {
    if (search) search.value = '';
    applyFilters();
    search?.focus();
  });
  priorityButtons.forEach(button => button.addEventListener('click', () => { priority = button.dataset.filter; applyFilters(); }));
  marketButtons.forEach(button => button.addEventListener('click', () => { market = button.dataset.marketFilter; applyFilters(); }));
  viewButtons.forEach(button => button.addEventListener('click', () => { date.value = button.dataset.view; applyFilters(); }));
  document.querySelector('#reset-filters')?.addEventListener('click', () => reset());
  function revealHash() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (target?.classList.contains('story') && target.hidden) reset('all', 'all');
    target?.scrollIntoView?.({ block: 'start' });
  }
  document.querySelectorAll('a[href^="#evt-"]').forEach(link => link.addEventListener('click', () => {
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (target?.hidden) reset('all', 'all');
  }));
  window.addEventListener('hashchange', revealHash);
  const reportDate = document.querySelector('main')?.dataset.reportDate || 'undated';
  document.querySelectorAll('.actions input[type="checkbox"]').forEach(input => {
    const label = input.closest('label')?.querySelector('b')?.textContent.trim();
    if (!label) return;
    const key = `amazon-ops-radar:checklist:v1:${reportDate}:${label}`;
    try { input.checked = window.localStorage.getItem(key) === '1'; } catch { /* Optional local storage. */ }
    input.addEventListener('change', () => {
      try {
        if (input.checked) window.localStorage.setItem(key, '1');
        else window.localStorage.removeItem(key);
      } catch { /* Keep the page usable when storage is blocked. */ }
    });
  });
  if (category && date) {
    date.value = current.size ? 'latest' : 'all';
    applyFilters();
  }
  revealHash();
})();
