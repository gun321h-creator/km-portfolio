/**
 * BOT/dashboard/static/js/polish_pack.js
 *
 * Polish Pack 5-in-1 — shared utility layer for the IC Markets dashboard.
 *
 * Provides:
 *   1. Lazy CDN loaders (NumberFlow vanilla, Toastify-JS, canvas-confetti)
 *   2. Auto-promote [data-mm-flow] elements to <number-flow> web components
 *   3. Shimmer auto-apply on [data-loading="true"] / [aria-busy="true"]
 *   4. Pulse-halo auto-apply on live indicator dots
 *   5. window.MM helpers: toast / success / warn / error / celebrate
 *   6. 3-state theme toggle wiring (Sage / Linear / Terminal)
 *      — defers to terminal_mode.js if window.MMThemeToggle.bind exists
 *
 * CDN versions:
 *   @number-flow/vanilla  0.5.4  https://cdn.jsdelivr.net/npm/@number-flow/vanilla@0.5.4/dist/index.min.js
 *   toastify-js           1.12.0 https://cdn.jsdelivr.net/npm/toastify-js@1.12.0/src/toastify.min.js
 *   canvas-confetti       1.9.3  https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js
 *
 * Browser support: ES2020+, Chrome 90+, Firefox 90+, Safari 15+.
 * Reduced-motion: number-flow auto-promotion and confetti are skipped; toasts remain.
 *
 * Vanilla JS. ES2020+. defer. Self-contained IIFE.
 * Author: น้องหน้า — 2026-06-08
 */

(function PolishPack() {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────────────────────────── */

  const CDN_NUMBER_FLOW = 'https://cdn.jsdelivr.net/npm/@number-flow/vanilla@0.5.4/dist/index.min.js';
  const CDN_TOASTIFY_JS  = 'https://cdn.jsdelivr.net/npm/toastify-js@1.12.0/src/toastify.min.js';
  const CDN_TOASTIFY_CSS = 'https://cdn.jsdelivr.net/npm/toastify-js@1.12.0/src/toastify.css';
  const CDN_CONFETTI     = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';

  const LS_KEY = 'mmTheme';

  /* Theme index mapping — must match data-active-idx and CSS translateX rules in polish_pack.css */
  const THEME_ORDER = ['sage', 'linear', 'terminal'];

  /* Celebrate confetti palette (sage-amber brand colours) */
  const CONFETTI_COLORS = ['#E8836B', '#D4A53B', '#4A9D6E', '#5E8FB8', '#C8554D'];


  /* ─────────────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────────────── */

  /** True when prefers-reduced-motion is active. */
  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Inject a <script> tag exactly once.
   * @param {string} src
   * @param {string} globalCheck  — name of window property to check; skip load if truthy
   * @returns {Promise<void>}
   */
  function loadScript(src, globalCheck) {
    return new Promise((resolve) => {
      if (globalCheck && window[globalCheck]) { resolve(); return; }

      const existingId = 'pp-cdn-' + globalCheck;
      if (document.getElementById(existingId)) {
        /* Already injected — poll for it to define the global */
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          if ((globalCheck && window[globalCheck]) || attempts > 60) {
            clearInterval(poll);
            resolve();
          }
        }, 50);
        return;
      }

      const el = document.createElement('script');
      el.id    = existingId;
      el.src   = src;
      el.defer = true;
      el.onload  = () => { el.dataset.loaded = '1'; resolve(); };
      el.onerror = () => {
        console.warn('[polish_pack] CDN load failed:', src, '— degrading gracefully');
        resolve(); /* non-fatal */
      };
      document.head.appendChild(el);
    });
  }

  /**
   * Inject a <link rel="stylesheet"> exactly once.
   * @param {string} href
   */
  function loadCSS(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const el = document.createElement('link');
    el.rel  = 'stylesheet';
    el.href = href;
    document.head.appendChild(el);
  }


  /* ─────────────────────────────────────────────────────────────
     1.  LAZY CDN LOADERS
         (called on demand from MM.toast / initNumberFlow / MM.celebrate)
  ───────────────────────────────────────────────────────────── */

  /* Toastify — loaded on first MM.toast() call */
  let _toastifyLoadPromise = null;
  function ensureToastify() {
    if (_toastifyLoadPromise) return _toastifyLoadPromise;
    loadCSS(CDN_TOASTIFY_CSS);
    _toastifyLoadPromise = loadScript(CDN_TOASTIFY_JS, 'Toastify');
    return _toastifyLoadPromise;
  }

  /* NumberFlow — loaded during DOMContentLoaded if [data-mm-flow] found */
  let _numberFlowLoadPromise = null;
  function ensureNumberFlow() {
    if (_numberFlowLoadPromise) return _numberFlowLoadPromise;
    /* @number-flow/vanilla registers <number-flow> custom element on load */
    _numberFlowLoadPromise = loadScript(CDN_NUMBER_FLOW, '__numberFlowLoaded__');
    return _numberFlowLoadPromise;
  }

  /* canvas-confetti — loaded on first MM.celebrate() call */
  let _confettiLoadPromise = null;
  function ensureConfetti() {
    if (_confettiLoadPromise) return _confettiLoadPromise;
    _confettiLoadPromise = loadScript(CDN_CONFETTI, 'confetti');
    return _confettiLoadPromise;
  }


  /* ─────────────────────────────────────────────────────────────
     2.  AUTO-PROMOTE [data-mm-flow] → <number-flow>
  ───────────────────────────────────────────────────────────── */

  async function initNumberFlow() {
    const targets = document.querySelectorAll('[data-mm-flow]:not([data-mm-flow-done])');
    if (!targets.length) return;

    /* Skip animation (but still render numeric text) when motion is reduced */
    if (prefersReducedMotion()) {
      targets.forEach(el => {
        /* Just make sure the number is visible as plain text */
        const raw = el.getAttribute('data-mm-flow') || el.textContent.trim();
        const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
        if (!isNaN(num) && el.getAttribute('data-mm-flow')) {
          el.textContent = raw; /* ensure attribute value is displayed */
        }
        el.setAttribute('data-mm-flow-done', '1');
      });
      return;
    }

    await ensureNumberFlow();

    /* Give the custom-element registry a tick to define <number-flow> */
    await new Promise(r => setTimeout(r, 0));

    /* Verify the element was registered */
    if (!customElements || !customElements.get('number-flow')) {
      /* CDN failed — elements keep their plain-text content */
      console.warn('[polish_pack] number-flow custom element not registered — degrading to plain text');
      return;
    }

    targets.forEach(el => {
      el.setAttribute('data-mm-flow-done', '1');

      /* Resolve the numeric value:
         - attribute value takes priority (allows pre-setting the target)
         - falls back to the element's current textContent */
      const attrVal = el.getAttribute('data-mm-flow');
      const rawNum  = (attrVal && attrVal.trim()) ? attrVal : el.textContent.trim();
      const num     = parseFloat(rawNum.replace(/[^0-9.\-]/g, ''));
      if (isNaN(num)) return;

      try {
        /* Create the <number-flow> element */
        const nf = document.createElement('number-flow');
        nf.setAttribute('value', String(num));

        /* Preserve prefix/suffix from data attributes if present */
        const prefix = el.dataset.mmFlowPrefix || '';
        const suffix = el.dataset.mmFlowSuffix || '';
        if (prefix) nf.setAttribute('format', JSON.stringify({ style: 'decimal' }));

        /* Copy class names so .mm-num-flow typography applies */
        nf.classList.add('mm-num-flow');

        /* Wrap: replace element content with the web component */
        if (prefix || suffix) {
          el.textContent = prefix;
          el.appendChild(nf);
          if (suffix) {
            const sfxSpan = document.createElement('span');
            sfxSpan.textContent = suffix;
            el.appendChild(sfxSpan);
          }
        } else {
          el.innerHTML = '';
          el.appendChild(nf);
        }
      } catch (e) {
        /* Degrade silently — element keeps its server-rendered value */
        console.warn('[polish_pack] number-flow init error on element:', el, e);
      }
    });
  }


  /* ─────────────────────────────────────────────────────────────
     3.  SHIMMER AUTO-APPLY via MutationObserver
  ───────────────────────────────────────────────────────────── */

  function applyShimmer(el) {
    const isLoading = el.getAttribute('data-loading') === 'true'
                   || el.getAttribute('aria-busy') === 'true';
    el.classList.toggle('mm-shim', isLoading);
  }

  function initShimmerObserver() {
    /* Apply on existing elements first */
    document.querySelectorAll('[data-loading], [aria-busy]').forEach(applyShimmer);

    /* Watch for attribute changes */
    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type !== 'attributes') return;
        const { attributeName, target } = m;
        if (attributeName === 'data-loading' || attributeName === 'aria-busy') {
          applyShimmer(/** @type {Element} */ (target));
        }
      });
    });

    observer.observe(document.body, {
      attributes:    true,
      attributeFilter: ['data-loading', 'aria-busy'],
      subtree:       true,
    });
  }


  /* ─────────────────────────────────────────────────────────────
     4.  PULSE-HALO AUTO-APPLY on live dots
  ───────────────────────────────────────────────────────────── */

  function applyPulseHalos() {
    const LIVE_SELECTORS = [
      '.dot.live',
      '[data-live]',
      '.pulse-dot',
      '#fwd-cells .cell-dot:not(.is-warn):not(.is-bad)',
    ].join(', ');

    try {
      document.querySelectorAll(LIVE_SELECTORS).forEach(el => {
        el.classList.add('mm-pulse-halo', 'is-live');
      });
    } catch (e) {
      /* Malformed selector on unusual DOM — safe to skip */
    }
  }


  /* ─────────────────────────────────────────────────────────────
     5.  window.MM HELPERS
  ───────────────────────────────────────────────────────────── */

  /* Guard: don't clobber an existing window.MM (e.g. set by another script) */
  window.MM = window.MM || {};

  /**
   * Show a Toastify toast notification.
   * @param {string} msg
   * @param {Object} [opts]  — merged into Toastify options
   */
  MM.toast = async function (msg, opts = {}) {
    await ensureToastify();
    if (!window.Toastify) {
      console.warn('[polish_pack] Toastify unavailable — toast:', msg);
      return;
    }

    const defaults = {
      text:      msg,
      duration:  4000,
      close:     true,
      gravity:   'bottom',
      position:  'right',
      stopOnFocus: true,
      style:     {},  /* inline styles delegated to polish_pack.css */
    };

    try {
      window.Toastify({ ...defaults, ...opts }).showToast();
    } catch (e) {
      console.warn('[polish_pack] Toastify.showToast error:', e);
    }
  };

  /**
   * Success toast (green left border).
   * @param {string} msg
   */
  MM.success = (msg) => MM.toast(msg, { className: 'toastify-success', duration: 3000 });

  /**
   * Warning toast (amber left border).
   * @param {string} msg
   */
  MM.warn = (msg) => MM.toast(msg, { className: 'toastify-warn', duration: 5000 });

  /**
   * Error toast (red left border).
   * @param {string} msg
   */
  MM.error = (msg) => MM.toast(msg, { className: 'toastify-error', duration: 6000 });

  /**
   * canvas-confetti celebration burst.
   * Silently skipped when prefers-reduced-motion is active.
   * @param {Object} [opts]  — merged into confetti options
   */
  MM.celebrate = async function (opts = {}) {
    if (prefersReducedMotion()) return;

    await ensureConfetti();
    if (!window.confetti) {
      /* CDN failed — skip silently */
      return;
    }

    const defaults = {
      particleCount: 80,
      spread:        60,
      origin:        { y: 0.65 },
      colors:        CONFETTI_COLORS,
    };

    try {
      window.confetti({ ...defaults, ...opts });
    } catch (e) {
      /* Degrade silently */
    }
  };


  /* ─────────────────────────────────────────────────────────────
     6.  3-STATE THEME TOGGLE
         Coordinates with terminal_mode.js:
         If window.MMThemeToggle.bind exists (defined by terminal_mode.js),
         we DEFER the click handler installation to that module.
         We still own initial state restore and the 3-button aria wiring.
  ───────────────────────────────────────────────────────────── */

  /**
   * Apply a theme by name.
   * Updates: <html data-theme>, localStorage, button aria-checked,
   *          container data-active-idx, dispatches mm:themechange.
   * @param {string} theme — 'sage' | 'linear' | 'terminal'
   */
  function applyTheme(theme) {
    const validTheme = THEME_ORDER.includes(theme) ? theme : 'sage';
    const idx = THEME_ORDER.indexOf(validTheme);

    /* 1. Apply to document */
    document.documentElement.dataset.theme = validTheme;

    /* 2. Persist */
    try { localStorage.setItem(LS_KEY, validTheme); } catch (_) {}

    /* 3. Update 3-button pill UI */
    const container = document.getElementById('mm-theme-toggle');
    if (container) {
      container.dataset.activeIdx = String(idx);
      container.querySelectorAll('button[data-theme-val]').forEach(btn => {
        const isActive = btn.dataset.themeVal === validTheme;
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });
    }

    /* 4. Dispatch custom event for other modules to react */
    try {
      document.dispatchEvent(
        new CustomEvent('mm:themechange', { detail: { theme: validTheme }, bubbles: true })
      );
    } catch (_) {}
  }

  /**
   * Install click handlers on the 3-button toggle.
   * Skipped if terminal_mode.js has already claimed the toggle
   * (detected via a brand-new property we expose for coordination).
   */
  function bindThemeToggle() {
    const container = document.getElementById('mm-theme-toggle');
    if (!container) return;

    /* Coordination flag: terminal_mode.js sets window.MMThemeToggle = { bind: true }
       before calling its own init() so we know it claimed the button.
       If present, skip installing a second listener. */
    if (window.MMThemeToggle && window.MMThemeToggle.bind) return;

    /* Mark that polish_pack is the owner of this toggle */
    window.MMThemeToggle = { bind: true, owner: 'polish_pack' };

    /* 3-button form: each button has data-theme-val */
    container.querySelectorAll('button[data-theme-val]').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.themeVal);
      });
    });

    /* Legacy single-button form (old toggle from sage_premium.css era):
       clicking cycles through the 3 themes in order. */
    if (!container.querySelector('button[data-theme-val]')) {
      container.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme || 'sage';
        const nextIdx = (THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length;
        applyTheme(THEME_ORDER[nextIdx]);
      });
    }

    /* Keyboard: T key cycles themes (only when not typing) */
    document.addEventListener('keydown', e => {
      if (e.key !== 't' && e.key !== 'T') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (document.activeElement || {}).tagName || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (document.activeElement && document.activeElement.isContentEditable) return;

      const current = document.documentElement.dataset.theme || 'sage';
      const nextIdx = (THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length;
      applyTheme(THEME_ORDER[nextIdx]);
    });
  }

  /**
   * Restore saved theme on page load.
   * Also updates the 3-button pill UI to reflect current state.
   */
  function restoreTheme() {
    let saved;
    try { saved = localStorage.getItem(LS_KEY); } catch (_) {}

    /* If terminal_mode.js already ran and set a theme, don't overwrite — just
       sync the 3-button aria state. */
    const current = document.documentElement.dataset.theme || 'sage';
    const effective = (saved && THEME_ORDER.includes(saved)) ? saved : current;

    /* Apply (syncs aria + index without fighting terminal_mode.js if it
       already set data-theme via its own restoreTheme call) */
    applyTheme(effective);
  }

  /**
   * Listen for mm:themechange events from terminal_mode.js so we can
   * keep the 3-button pill in sync when terminal_mode.js owns the toggle.
   */
  function listenForExternalThemeChanges() {
    document.addEventListener('mm:themechange', e => {
      const theme = e.detail && e.detail.theme;
      if (!theme) return;
      /* Update pill only — avoid recursive applyTheme dispatch */
      const idx = THEME_ORDER.indexOf(theme);
      if (idx < 0) return;
      const container = document.getElementById('mm-theme-toggle');
      if (!container) return;
      container.dataset.activeIdx = String(idx);
      container.querySelectorAll('button[data-theme-val]').forEach(btn => {
        btn.setAttribute('aria-checked', btn.dataset.themeVal === theme ? 'true' : 'false');
      });
    });
  }


  /* ─────────────────────────────────────────────────────────────
     7.  INITIAL STATE ON LOAD
  ───────────────────────────────────────────────────────────── */

  function applyInitialTheme() {
    /* Read persisted preference — default 'sage' */
    let saved = 'sage';
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw && THEME_ORDER.includes(raw)) saved = raw;
    } catch (_) {}

    applyTheme(saved);
  }


  /* ─────────────────────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────────────────────── */

  function boot() {
    /* Theme state (runs first, before paint) */
    applyInitialTheme();
    restoreTheme();
    listenForExternalThemeChanges();
    bindThemeToggle();

    /* DOM enhancements */
    initNumberFlow().catch(() => {});
    initShimmerObserver();
    applyPulseHalos();

    /* Pre-load Toastify CSS early (avoids FOUC on first toast) */
    loadCSS(CDN_TOASTIFY_CSS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    /* defer=true means DOM is already ready; guard for inline use */
    boot();
  }

})(); /* PolishPack IIFE */
