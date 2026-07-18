// portfolio.js v1.2 -- IDE Inspector behaviour (multi-page navigation)
// Spec: docs/superpowers/specs/2026-05-24-portfolio-v1.2-multipage-design.md
// Vanilla ES2020 module, no framework, no build step.
// Each behaviour is a small named function called once on DOMContentLoaded.
// All features degrade gracefully when their DOM/data is absent.
//
// v1.2 changes (C1):
//  - `wireActiveSync` + IntersectionObserver removed: each "tab" is now a
//    real route; the server emits `active` on the matching tab/sidebar row
//    based on `current_page_id` (see portfolio_base.html).
//  - `wirePalette` rebuilt around a literal PALETTE_ITEMS list of route
//    URLs + nested anchors (not scraped from the sidebar). `jump()` now
//    does `window.location.href = url` instead of scrolling.
//  - `wireSourceModal` reads `body[data-page]` and fetches
//    `/portfolio-source.json?page=<id>` so the modal shows the current
//    page's JSON slice, not the full file.

"use strict";

const SS_TREE_KEY = "portfolio.v1.1.treestate";
// Chevron glyphs declared once via String.fromCharCode so this source file
// stays pure ASCII. CHEV_DOWN = U+25BE down-pointing triangle, CHEV_RIGHT = U+25B8.
const CHEV_DOWN = String.fromCharCode(0x25BE);
const CHEV_RIGHT = String.fromCharCode(0x25B8);

// v1.2 polish C3 -- fuzzy palette ranking + recently-visited.
// Recents stored in sessionStorage (mirrors SS_TREE_KEY pattern above) so
// the badge resets per browser session -- same lifetime as tree-state.
const SS_RECENT_KEY = "portfolio.v1.2.recent";
const RECENT_MAX = 3;

// Score how well `query` matches `label`. Higher = better.
// 0 = no match (any query char missing in order). Word-boundary chars
// (/ _ . -) earn a big bonus so "edu" prefers "education/" over a deep
// nested match. Consecutive matches earn a smaller bonus.
function fuzzyScore(query, label) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const s = label.toLowerCase();
  let qi = 0, score = 0, prevMatchPos = -2;
  for (let si = 0; si < s.length && qi < q.length; si++) {
    if (s[si] === q[qi]) {
      score += 10;
      if (si - prevMatchPos === 1) score += 5;          // consecutive
      if (si === 0 || /[\/_.\-]/.test(s[si - 1])) score += 8; // word boundary
      prevMatchPos = si;
      qi++;
    }
  }
  if (qi < q.length) return 0;  // not all query chars matched in order
  // Penalize long labels slightly so shorter matches beat long ones.
  return score - Math.floor(s.length / 4);
}

function readRecent() {
  try {
    const v = JSON.parse(sessionStorage.getItem(SS_RECENT_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function pushRecent(url) {
  try {
    let r = readRecent();
    r = r.filter(u => u !== url);  // dedupe
    r.unshift(url);
    if (r.length > RECENT_MAX) r = r.slice(0, RECENT_MAX);
    sessionStorage.setItem(SS_RECENT_KEY, JSON.stringify(r));
  } catch { /* sessionStorage may be disabled */ }
}

function wireFileTree() {
  const rows = document.querySelectorAll(".filetree .ft-row[data-target]");
  rows.forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-target");
      const sec = document.querySelector(id);
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function readTreeState() {
  try {
    const v = JSON.parse(sessionStorage.getItem(SS_TREE_KEY) || "{}");
    return (v !== null && typeof v === "object" && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
}
function writeTreeState(state) {
  try { sessionStorage.setItem(SS_TREE_KEY, JSON.stringify(state)); }
  catch { /* sessionStorage may be disabled */ }
}

function wireChevrons() {
  const state = readTreeState();
  document.querySelectorAll(".filetree .chev[data-folder]").forEach(chev => {
    const key = chev.getAttribute("data-folder");
    const collapsed = state[key] === false;
    const folder = chev.closest(".folder");
    if (!folder) return;
    if (collapsed) {
      folder.classList.remove("open");
      chev.setAttribute("aria-expanded", "false");
    }
    chev.textContent = collapsed ? CHEV_RIGHT : CHEV_DOWN;

    if (chev.dataset.wired) return;
    chev.dataset.wired = "1";

    chev.addEventListener("click", (e) => {
      e.stopPropagation();
      const folder = chev.closest(".folder");
      if (!folder) return;
      const open = folder.classList.toggle("open");
      chev.setAttribute("aria-expanded", String(open));
      chev.textContent = open ? CHEV_DOWN : CHEV_RIGHT;
      const s = readTreeState();
      s[key] = open;
      writeTreeState(s);
    });
  });
}

function wireTabs() {
  document.querySelectorAll(".tabs .tab[data-target]").forEach(tab => {
    if (tab.dataset.wired) return;
    tab.dataset.wired = "1";
    tab.addEventListener("click", () => {
      const sec = document.querySelector(tab.getAttribute("data-target"));
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// v1.2 (C1): `wireActiveSync` + IntersectionObserver removed. The server
// now decides `active` on tabs + sidebar rows based on `current_page_id`
// (see portfolio_base.html), so client-side scroll-sync is unnecessary.

// Cross-page navigation targets used by the command palette. One literal
// list (not scraped from the sidebar) so the palette can offer nested
// anchors like `education#vmi` that don't appear as their own sidebar row.
// v2.0 Gilded Circuit: labels renamed from the retired file-metaphor
// (README.md / about.md / ...) to plain page names. URLs unchanged.
const PALETTE_ITEMS = [
  { label: "Home",                 url: "/portfolio" },
  { label: "About",                url: "/portfolio/about" },
  { label: "Education",            url: "/portfolio/education" },
  { label: "Education / VMI",            url: "/portfolio/education#vmi" },
  { label: "Education / CU Boulder",     url: "/portfolio/education#cu-boulder" },
  { label: "Education / RTA Cadet",      url: "/portfolio/education#rta-cadet" },
  { label: "Education / Latest term",    url: "/portfolio/education#edu-latest" },
  { label: "Projects",             url: "/portfolio/projects" },
  { label: "Projects / Dashboard",       url: "/portfolio/projects#dashboard" },
  { label: "Projects / LINE bot",        url: "/portfolio/projects#line-bot" },
  { label: "Projects / Quant research",  url: "/portfolio/projects#quant" },
  { label: "Contact",              url: "/portfolio/contact" },
];

function wirePalette() {
  const palette = document.querySelector(".palette");
  const input = palette && palette.querySelector(".palette-input");
  const results = palette && palette.querySelector(".palette-results");
  const kbdHintBtn = document.querySelector(".titlebar .kbd-hint");
  if (!palette || !input || !results) return;
  if (palette.dataset.wired) return;
  palette.dataset.wired = "1";

  // v1.2: search items come from the literal PALETTE_ITEMS list above so
  // we can offer nested anchors (`education#vmi`) that aren't sidebar rows.
  const items = PALETTE_ITEMS.slice();

  function render(filter) {
    // v1.2 polish C3: fuzzy ranking + recently-visited bubbling.
    // No filter -> recent pages first (MRU), then remaining items in
    // declared order. With a filter -> rank by fuzzyScore descending.
    const f = (filter || "").toLowerCase();
    const recent = new Set(readRecent());
    let matched;
    if (!f) {
      const recentOrdered = readRecent()
        .map(u => items.find(it => it.url === u))
        .filter(Boolean);
      const recentUrls = new Set(recentOrdered.map(it => it.url));
      const rest = items.filter(it => !recentUrls.has(it.url));
      matched = recentOrdered.concat(rest);
    } else {
      matched = items
        .map(it => ({ it, score: fuzzyScore(f, it.label) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.it);
    }
    results.innerHTML = "";
    matched.slice(0, 12).forEach((it, ix) => {
      const li = document.createElement("li");
      if (!f && recent.has(it.url)) {
        const tag = document.createElement("span");
        tag.className = "palette-recent-tag";
        tag.textContent = "recent";
        li.appendChild(tag);
        li.appendChild(document.createTextNode(it.label));
      } else {
        li.textContent = it.label;
      }
      li.dataset.url = it.url;
      if (ix === 0) li.classList.add("active");
      li.addEventListener("click", () => { jump(it.url); });
      results.appendChild(li);
    });
  }
  function jump(url) {
    // v1.2: navigate to the real route instead of scrolling. The browser
    // handles hash anchors (`#vmi`) automatically on load.
    close();
    window.location.href = url;
  }
  function open() {
    // Mutual exclusion: close cheatsheet AND source-modal if either is open.
    // Prevents dual-overlay Escape/outside-click conflicts (B4-class review
    // note from C1; extended in C4 to cover the new view-source modal).
    const cs = document.querySelector(".cheatsheet");
    if (cs && !cs.hidden) cs.hidden = true;
    const sm = document.querySelector(".source-modal");
    if (sm && !sm.hidden) sm.hidden = true;
    palette.hidden = false;
    input.value = ""; render("");
    setTimeout(() => input.focus(), 0);
  }
  function close() { palette.hidden = true; }

  input.addEventListener("input", () => render(input.value));
  input.addEventListener("keydown", (e) => {
    const lis = Array.from(results.children);
    const ai = lis.findIndex(li => li.classList.contains("active"));
    if (e.key === "ArrowDown") { e.preventDefault();
      if (ai >= 0) lis[ai].classList.remove("active");
      const next = lis[Math.min(ai + 1, lis.length - 1)];
      if (next) next.classList.add("active");
    } else if (e.key === "ArrowUp") { e.preventDefault();
      if (ai >= 0) lis[ai].classList.remove("active");
      const prev = lis[Math.max(ai - 1, 0)];
      if (prev) prev.classList.add("active");
    } else if (e.key === "Enter") { e.preventDefault();
      const active = results.querySelector("li.active");
      if (active) jump(active.dataset.url);
    } else if (e.key === "Escape") { e.preventDefault(); close(); }
  });

  document.addEventListener("click", (e) => {
    if (!palette.hidden && !palette.contains(e.target) && e.target !== kbdHintBtn) close();
  });
  if (kbdHintBtn) kbdHintBtn.addEventListener("click", open);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault(); open();
    } else if (e.key === "Escape" && !palette.hidden) {
      e.preventDefault(); close();
    }
  });
}

function wireDeployClick() {
  const btn = document.querySelector(".statusbar .deploy");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";
  let pop = null;
  let onDocClick = null;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (onDocClick) {
      document.removeEventListener("click", onDocClick);
      onDocClick = null;
    }
    if (pop) { pop.remove(); pop = null; return; }
    const iso = btn.getAttribute("data-deploy-iso") || "unknown";
    pop = document.createElement("div");
    pop.className = "deploy-pop";
    pop.textContent = "Deployed at " + iso;
    Object.assign(pop.style, {
      position: "fixed", bottom: "32px", right: "16px",
      background: "#171310", border: "1px solid rgba(212,169,71,0.4)",
      color: "#EDE4D3", padding: "8px 12px", borderRadius: "2px",
      fontFamily: "ui-monospace, monospace", fontSize: "11px",
      zIndex: "200", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    });
    pop.addEventListener("click", (ev) => ev.stopPropagation());
    document.body.appendChild(pop);
    setTimeout(() => {
      onDocClick = () => {
        if (pop) { pop.remove(); pop = null; }
        if (onDocClick) document.removeEventListener("click", onDocClick);
        onDocClick = null;
      };
      document.addEventListener("click", onDocClick);
    }, 0);
  });
}

function wireCheatsheet() {
  const cs = document.querySelector(".cheatsheet");
  if (!cs || cs.dataset.wired) return;
  cs.dataset.wired = "1";
  // Mutual exclusion: only one overlay (palette vs cheatsheet) open at a time.
  // Without this, a single Escape closes BOTH, and clicks inside one can close
  // the other via the doc-click handlers. See B4-class review note.
  function open()  {
    const palette = document.querySelector(".palette");
    if (palette && !palette.hidden) palette.hidden = true;
    // C4 extension: close source-modal too -- all three overlays are
    // mutually exclusive (palette, cheatsheet, view-source).
    const sm = document.querySelector(".source-modal");
    if (sm && !sm.hidden) sm.hidden = true;
    cs.hidden = false;
  }
  function close() { cs.hidden = true; }
  document.addEventListener("keydown", (e) => {
    const inEditable = ["INPUT", "TEXTAREA"].includes(e.target.tagName);
    if (e.key === "?" && !e.ctrlKey && !e.metaKey && !inEditable) {
      e.preventDefault(); cs.hidden ? open() : close();
    } else if (e.key === "Escape" && !cs.hidden) {
      e.preventDefault(); close();
    }
  });
  // Inside-click guard: prevent inner clicks bubbling to other doc-click
  // handlers (the !cs.contains check below already keeps the cheatsheet open
  // on self-clicks, but stopPropagation defends siblings that may exist).
  cs.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", (e) => {
    if (!cs.hidden && !cs.contains(e.target)) close();
  });
}

async function wireCommitGrid() {
  const mount = document.querySelector(".commit-grid-mount[data-src]");
  if (!mount) return;
  if (mount.dataset.wired) return;
  mount.dataset.wired = "1";
  let data;
  try {
    const r = await fetch(mount.dataset.src);
    if (!r.ok) return;
    data = await r.json();
  } catch { return; }
  if (!Array.isArray(data) || !data.length) return;

  // Bucket commit counts 0..4
  const bucket = (n) => n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 7 ? 3 : 4;
  // Layout note (v1.1): cells are placed SEQUENTIALLY (col = i/7, row = i%7),
  // not weekday-aligned. A GitHub-style heatmap would set row = Date.getDay()
  // with leading blank cells. Deferred to v1.2 -- cosmetic-only; tooltip
  // already shows the correct date so screen-reader UX is unaffected.
  const CELL = 11, GAP = 2, COLS = Math.ceil(data.length / 7);
  const W = COLS * (CELL + GAP), H = 7 * (CELL + GAP);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "commit-grid");
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  data.forEach((d, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", String(col * (CELL + GAP)));
    rect.setAttribute("y", String(row * (CELL + GAP)));
    rect.setAttribute("width", String(CELL));
    rect.setAttribute("height", String(CELL));
    // rx matches the rounded-pill look declared by portfolio.css cg-* rules.
    rect.setAttribute("rx", "1.5");
    rect.setAttribute("class", "cg-" + bucket(d.commits || 0));
    rect.setAttribute("data-date", d.date);
    const t = document.createElementNS(svgNS, "title");
    t.textContent = `${d.date} -- ${d.commits} commit${d.commits === 1 ? "" : "s"}`;
    rect.appendChild(t);
    svg.appendChild(rect);
  });
  mount.appendChild(svg);
}

async function wireSourceModal() {
  const btn = document.querySelector(".tabs .tab-source");
  const modal = document.querySelector(".source-modal");
  if (!btn || !modal) return;
  if (modal.dataset.wired) return;
  modal.dataset.wired = "1";
  const code = modal.querySelector(".source-code");
  const closeBtn = modal.querySelector(".modal-close");
  const copyBtn = modal.querySelector(".modal-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const text = code ? code.textContent || "" : "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      } catch {
        // Clipboard API may be unavailable on insecure context. Fail silent.
      }
    });
  }
  let loaded = false;
  async function open() {
    // Mutual exclusion: close palette AND cheatsheet first. Mirrors the
    // pattern wirePalette/wireCheatsheet use for each other, extended in C4
    // so all three overlays are guaranteed-non-overlapping.
    const palette = document.querySelector(".palette");
    if (palette && !palette.hidden) palette.hidden = true;
    const cs = document.querySelector(".cheatsheet");
    if (cs && !cs.hidden) cs.hidden = true;
    if (!loaded && code) {
      try {
        // v1.2 (C1): include `?page=<id>` so the modal shows the JSON
        // slice for THIS page (B2 added `?page=` query slicing).
        // body[data-page] is set by portfolio_base.html from
        // `current_page_id`. Empty string -> omit query -> full file
        // (backward compat with v1.1; T-Q2 covers that branch).
        const pageId = document.body.dataset.page || "";
        const url = pageId
          ? `/portfolio-source.json?page=${encodeURIComponent(pageId)}`
          : "/portfolio-source.json";
        const r = await fetch(url);
        if (r.ok) {
          code.textContent = await r.text();
          // Cache only on success. On 400/503/404 we leave `loaded=false`
          // so the next open() retries the fetch -- per B2 review S2.
          loaded = true;
        }
      } catch {/* leave empty -- modal still opens with empty <code> */}
    }
    modal.hidden = false;
  }
  function close() { modal.hidden = true; }
  btn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  // Inside-click guard: prevent inner clicks bubbling to the doc-click
  // outside-close handler below (same pattern as wireCheatsheet).
  modal.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) { e.preventDefault(); close(); }
  });
  document.addEventListener("click", (e) => {
    if (!modal.hidden && !modal.contains(e.target) && e.target !== btn) close();
  });
}

function wireNowPlayingClick() {
  const btn = document.querySelector(".statusbar .now-playing");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";
  let pop = null;
  let onDocClick = null;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Clean up any prior outside-click listener before re-toggling
    // (follows the wireDeployClick pattern -- prevents listener leak).
    if (onDocClick) {
      document.removeEventListener("click", onDocClick);
      onDocClick = null;
    }
    if (pop) { pop.remove(); pop = null; return; }
    const since = btn.dataset.since || "";
    pop = document.createElement("div");
    pop.className = "now-pop";
    pop.textContent = (btn.textContent || "").trim() +
                      (since ? " (since " + since + ")" : "");
    Object.assign(pop.style, {
      position: "fixed", bottom: "32px", left: "16px",
      background: "#171310", border: "1px solid rgba(212,169,71,0.4)",
      color: "#EDE4D3", padding: "8px 12px", borderRadius: "2px",
      fontFamily: "ui-monospace, monospace", fontSize: "11px",
      zIndex: "200", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    });
    pop.addEventListener("click", (ev) => ev.stopPropagation());
    document.body.appendChild(pop);
    setTimeout(() => {
      onDocClick = () => {
        if (pop) { pop.remove(); pop = null; }
        if (onDocClick) document.removeEventListener("click", onDocClick);
        onDocClick = null;
      };
      document.addEventListener("click", onDocClick);
    }, 0);
  });
}

// v1.2 polish (C1): Vim-/GitHub-style page navigation.
// `g` then a letter -> jump to the corresponding /portfolio sub-page.
// `g` alone is harmless; a 1.2s timeout cancels a pending `g` if no
// follow-up key arrives. Single-listener guard via body.dataset.vimWired
// keeps the test suite (which re-imports portfolio.js) from doubling up.
function wireVimNav() {
  if (document.body.dataset.vimWired) return;
  document.body.dataset.vimWired = "1";

  const ROUTES = {
    h: "/portfolio",
    a: "/portfolio/about",
    e: "/portfolio/education",
    p: "/portfolio/projects",
    c: "/portfolio/contact",
  };
  let pending = false;
  let pendingTimer = null;

  function isEditableTarget(t) {
    return ["INPUT", "TEXTAREA"].includes(t.tagName) ||
           t.isContentEditable;
  }

  document.addEventListener("keydown", (e) => {
    // Don't trigger while typing in palette input.
    if (isEditableTarget(e.target)) return;
    // Don't trigger while a modifier other than shift is held.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Don't fight Cmd-K, ?, Esc, etc. -- only single bare letters.
    if (e.key === "g" && !pending) {
      pending = true;
      pendingTimer = setTimeout(() => { pending = false; }, 1200);
      return;
    }
    if (pending && ROUTES[e.key]) {
      e.preventDefault();
      clearTimeout(pendingTimer);
      pending = false;
      window.location.href = ROUTES[e.key];
    } else if (pending) {
      // Any other key cancels.
      clearTimeout(pendingTimer);
      pending = false;
    }
  });
}

function init() {
  // v1.2 polish C3: record current page so the palette can show "recent"
  // entries on next visit. Must run BEFORE wirePalette() so the first
  // render after Cmd-K reflects the freshly-pushed URL too.
  pushRecent(window.location.pathname + window.location.hash);
  wireFileTree();
  wireChevrons();
  wireTabs();
  wirePalette();
  wireDeployClick();
  wireCheatsheet();
  wireCommitGrid();
  wireSourceModal();
  wireNowPlayingClick();
  wireVimNav();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
