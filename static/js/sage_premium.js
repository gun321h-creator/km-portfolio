/**
 * BOT/dashboard/static/js/sage_premium.js
 *
 * Sage Premium UI layer — client-side enhancements:
 *   1. countUp animation for [data-countup] elements
 *   2. Inline SVG sparkline renderer for [data-spark] elements
 *   4. Stagger-in reveal for known container selectors
 *   5. Auto countUp on .wealth-stat-value / .sm-score / .sme-tier
 *   6. Theme toggle keyboard shortcut (T key)
 *
 * Vanilla JS, ES2020+. No bundler.
 * Author note: น้องหน้า — 2026-06-08
 */

(function SagePremium() {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     Helpers
  ───────────────────────────────────────────────────────────── */

  /** True if the user has requested reduced motion. */
  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Inject a <script> tag if the given global identifier is not already
   * defined on window.
   * @param {string} src
   * @param {string} globalName  — window[globalName] to check before loading
   * @returns {Promise<void>}
   */
  function loadScript(src, globalName) {
    return new Promise((resolve, reject) => {
      if (globalName && window[globalName]) { resolve(); return; }
      // Check by id to avoid double-injection across HMR / partial renders
      const id = 'sp-cdn-' + globalName;
      if (document.getElementById(id)) {
        // Already injected; wait for it to finish
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing && existing.dataset.loaded) { resolve(); return; }
        // Poll briefly
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          if (window[globalName]) { clearInterval(poll); resolve(); }
          if (attempts > 40)      { clearInterval(poll); resolve(); } // give up gracefully
        }, 50);
        return;
      }
      const el = document.createElement('script');
      el.id  = id;
      el.src = src;
      el.defer = true;
      el.onload  = () => { el.dataset.loaded = '1'; resolve(); };
      el.onerror = () => { console.warn('[sage_premium] failed to load', src); resolve(); }; // non-fatal
      document.head.appendChild(el);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     1.  countUp — [data-countup] attributes
  ───────────────────────────────────────────────────────────── */

  async function initCountUp() {
    const targets = document.querySelectorAll('[data-countup]:not([data-countup-done])');
    if (!targets.length) return;

    await loadScript(
      'https://cdn.jsdelivr.net/npm/countup.js@2.8.0/dist/countUp.umd.js',
      'CountUp'
    );

    if (!window.CountUp) return; // CDN failed — degrade silently

    targets.forEach(el => {
      const raw = el.getAttribute('data-countup');
      const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
      if (isNaN(num)) return;

      el.setAttribute('data-countup-done', '1');

      if (prefersReducedMotion()) {
        // Just display the final value without animation
        return;
      }

      const opts = {
        startVal:  0,
        duration:  1.2,
        decimalPlaces: parseInt(el.dataset.decimals || '0', 10),
        prefix:    el.dataset.prefix  || '',
        suffix:    el.dataset.suffix  || '',
        separator: ',',
        useGrouping: true,
      };

      try {
        const cu = new window.CountUp(el, num, opts);
        if (!cu.error) cu.start();
      } catch (e) {
        // Degrade silently — element keeps its server-rendered value
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     2.  Sparkline renderer — [data-spark]
  ───────────────────────────────────────────────────────────── */

  function renderSparklines() {
    const targets = document.querySelectorAll('[data-spark]:not([data-spark-done])');
    targets.forEach(el => {
      el.setAttribute('data-spark-done', '1');

      const raw = el.getAttribute('data-spark') || '';
      const values = raw.split(',').map(Number).filter(n => !isNaN(n));
      if (values.length < 2) return;

      const W = el.clientWidth || 100;
      const H = 32;
      const pad = 2; // vertical padding so stroke isn't clipped

      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;

      // Map each value to (x, y) in SVG space
      const pts = values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (W - pad * 2);
        const y = H - pad - ((v - min) / range) * (H - pad * 2);
        return [x, y];
      });

      // Build a smooth quadratic bezier path through the points
      function buildPath(points) {
        if (points.length === 0) return '';
        let d = `M ${points[0][0]},${points[0][1]}`;
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpx = (prev[0] + curr[0]) / 2;
          d += ` Q ${cpx},${prev[1]} ${curr[0]},${curr[1]}`;
        }
        return d;
      }

      const linePath = buildPath(pts);

      // Area path: line path + close to bottom
      const areaPath = linePath
        + ` L ${pts[pts.length - 1][0]},${H}`
        + ` L ${pts[0][0]},${H} Z`;

      // Direction class
      const last  = values[values.length - 1];
      const first = values[0];
      const dirClass = last > first ? 'is-up' : last < first ? 'is-down' : '';

      // Build SVG
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.classList.add('sage-spark');
      if (dirClass) svg.classList.add(dirClass);

      const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      area.setAttribute('d', areaPath);
      area.classList.add('area');

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', linePath);
      line.classList.add('line');

      svg.appendChild(area);
      svg.appendChild(line);

      // If reduced motion: skip CSS dash animation; just render statically
      if (prefersReducedMotion()) {
        line.style.strokeDasharray  = 'none';
        line.style.strokeDashoffset = '0';
        area.style.opacity = '1';
        area.style.animation = 'none';
      }

      el.innerHTML = '';
      el.appendChild(svg);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     4.  Stagger-in: auto-apply to known selectors
  ───────────────────────────────────────────────────────────── */

  function initStaggerIn() {
    const SELECTORS = [
      '[data-stagger-in]',
      '.wealth-summary-row',
      '.sage-stagger-in',
    ];

    SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.classList.add('sage-stagger-in');
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     5.  Auto countUp on known numeric display elements
  ───────────────────────────────────────────────────────────── */

  // Matches optional leading $, +/-, digits with commas, optional decimal,
  // optional trailing %.  Rejects any string with letters (e.g. "N/A", "—").
  const NUMBER_RE = /^[\$\+\-]?[\d,]+\.?\d*[%]?$/;

  async function initAutoCountUp() {
    const targets = document.querySelectorAll(
      '.wealth-stat-value, .sm-score, .sme-tier'
    );

    // Filter to genuine number elements not already attributed
    const eligible = Array.from(targets).filter(el => {
      if (el.hasAttribute('data-countup-done')) return false;
      if (el.hasAttribute('data-countup'))      return false; // will be handled by initCountUp
      const text = el.textContent.trim();
      return NUMBER_RE.test(text);
    });

    if (!eligible.length) return;

    await loadScript(
      'https://cdn.jsdelivr.net/npm/countup.js@2.8.0/dist/countUp.umd.js',
      'CountUp'
    );

    if (!window.CountUp) return;

    eligible.forEach(el => {
      const text = el.textContent.trim();
      const prefix  = text.startsWith('$') ? '$' : text.startsWith('+') ? '+' : '';
      const suffix  = text.endsWith('%') ? '%' : '';
      const cleaned = text.replace(/[\$\+\-,%]/g, '');
      const num     = parseFloat(cleaned);
      if (isNaN(num)) return;

      el.setAttribute('data-countup-done', '1');

      if (prefersReducedMotion()) return;

      // Determine decimal places from the original string
      const dotIdx = cleaned.indexOf('.');
      const decimals = dotIdx >= 0 ? cleaned.length - dotIdx - 1 : 0;

      try {
        const cu = new window.CountUp(el, num, {
          startVal:     0,
          duration:     1.2,
          decimalPlaces: decimals,
          prefix,
          suffix,
          separator:    ',',
          useGrouping:  true,
        });
        if (!cu.error) cu.start();
      } catch (e) {
        // Degrade silently
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     6.  Theme toggle
  ───────────────────────────────────────────────────────────── */

  /**
   * Fallback toggle (2-state) only used if terminal_mode.js failed to load.
   * terminal_mode.js (3-state cycle: sage → linear → terminal) owns the real
   * binding via window.MMThemeToggle. We defer to it whenever present.
   */
  function toggleTheme() {
    if (window.MMThemeToggle && typeof window.MMThemeToggle.cycle === 'function') {
      window.MMThemeToggle.cycle();
      return;
    }
    // Last-resort 2-state fallback
    const html    = document.documentElement;
    const current = html.dataset.theme || 'sage';
    const next    = current === 'terminal' ? 'sage' : 'terminal';
    html.dataset.theme = next;
    try { localStorage.setItem('mmTheme', next); } catch (e) { /* storage blocked */ }
  }

  /** Restore persisted theme preference on load (defers to terminal_mode.js if present). */
  function restoreTheme() {
    if (window.MMThemeToggle && window.MMThemeToggle.bind) return;  // owned by terminal_mode.js
    try {
      const saved = localStorage.getItem('mmTheme');
      if (saved && saved !== document.documentElement.dataset.theme) {
        document.documentElement.dataset.theme = saved;
      }
    } catch (e) { /* storage blocked */ }
  }

  function bindThemeToggle() {
    // terminal_mode.js owns the click + T-key handlers via window.MMThemeToggle.
    // We bind ONLY as fallback if terminal_mode.js did not register itself.
    if (window.MMThemeToggle && window.MMThemeToggle.bind) return;

    const btn = document.getElementById('mm-theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
    document.addEventListener('keydown', e => {
      if (e.key !== 't' && e.key !== 'T') return;
      const tag = (document.activeElement || {}).tagName || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (document.activeElement && document.activeElement.isContentEditable) return;
      toggleTheme();
    });
  }

  /* ─────────────────────────────────────────────────────────────
     Boot
  ───────────────────────────────────────────────────────────── */

  function boot() {
    restoreTheme();
    bindThemeToggle();
    initStaggerIn();
    renderSparklines();

    // Async initialisation — non-blocking; failures are silent
    initCountUp().catch(() => {});
    initAutoCountUp().catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // defer=true means this runs after the DOM is ready, but guard anyway
    boot();
  }

})();
