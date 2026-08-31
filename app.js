(() => {
  "use strict";

  const dateTabs = [...document.querySelectorAll("[data-date]")];
  const panels = [...document.querySelectorAll("[data-panel]")];
  const filters = [...document.querySelectorAll("[data-filter]")];
  let activeFilter = filters.find((button) => button.classList.contains("active"))?.dataset.filter || "all";

  function updateCount(panel) {
    const count = panel.querySelector("[data-story-count]");
    const visible = [...panel.querySelectorAll(".story")].filter((story) => !story.hidden).length;
    if (count) count.textContent = String(visible);
  }

  function applyFilter() {
    const activePanel = panels.find((panel) => panel.classList.contains("active"));
    if (!activePanel) return;
    const stories = [...activePanel.querySelectorAll(".story")];
    stories.forEach((story) => {
      story.hidden = activeFilter !== "all" && story.dataset.priority !== activeFilter;
    });
    updateCount(activePanel);
    const emptyMessage = activePanel.querySelector("[data-filter-empty]");
    if (emptyMessage) emptyMessage.hidden = stories.length === 0 || stories.some((story) => !story.hidden);
  }

  function selectDate(date) {
    if (!panels.some((panel) => panel.dataset.panel === date)) return;
    dateTabs.forEach((button) => {
      const selected = button.dataset.date === date;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === date));
    applyFilter();
  }

  panels.forEach((panel) => {
    updateCount(panel);
    if (panel.querySelector(".story") && !panel.querySelector("[data-filter-empty]")) {
      const message = document.createElement("p");
      message.dataset.filterEmpty = "";
      message.className = "filter-empty";
      message.textContent = "该日期下没有符合当前优先级的情报。";
      message.hidden = true;
      message.setAttribute("role", "status");
      panel.append(message);
    }
  });

  dateTabs.forEach((button) => button.addEventListener("click", () => selectDate(button.dataset.date)));
  filters.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === activeFilter));
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      filters.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      applyFilter();
    });
  });

  // Reveal a hidden date panel before the browser follows an archive anchor.
  function revealHashPanel(hash) {
    if (!hash || hash === "#") return;
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    const panel = target?.closest("[data-panel]");
    if (panel) selectDate(panel.dataset.panel);
  }
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => revealHashPanel(link.getAttribute("href")));
  });
  window.addEventListener("hashchange", () => revealHashPanel(window.location.hash));

  // Preserve checklist state on this device; storage denial must not break the page.
  const reportDate = document.querySelector("main")?.dataset.reportDate || "undated";
  document.querySelectorAll('.actions input[type="checkbox"]').forEach((input) => {
    const label = input.closest("label")?.querySelector("b")?.textContent.trim();
    if (!label) return;
    const key = `amazon-ops-radar:checklist:v1:${reportDate}:${label}`;
    try { input.checked = window.localStorage.getItem(key) === "1"; } catch { /* Storage is optional. */ }
    input.addEventListener("change", () => {
      try {
        if (input.checked) window.localStorage.setItem(key, "1");
        else window.localStorage.removeItem(key);
      } catch { /* Keep the current page usable without persistent storage. */ }
    });
  });

  const initial = panels.find((panel) => panel.classList.contains("active")) || panels[0];
  if (initial) selectDate(initial.dataset.panel);
  revealHashPanel(window.location.hash);
})();
