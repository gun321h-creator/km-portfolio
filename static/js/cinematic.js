/**
 * BOT/dashboard/static/js/cinematic.js
 *
 * PURPOSE: Cinematic Flow — motion controller for the IC Markets dashboard.
 *   Drives 3D tilt, magnetic CTA drift, scroll-fade IO fallback, and
 *   soft View Transitions on [data-vt-link] anchors.
 *   Works alongside sage_premium.js (tactile cards, countUp, ⌘K) — no
 *   shared state, no global namespace collision.
 *
 * BROWSER SUPPORT:
 *   Pointer Events  — all modern browsers (Chrome/FF/Safari/Edge).
 *   View Transitions API — Chrome 126+, Safari 18+. FF: falls back to normal nav.
 *   animation-timeline   — Chrome 115+, Safari 17.2+. FF: IO fallback below.
 *   requestAnimationFrame — universal.
 *
 * REDUCED-MOTION: All effects disabled early if
 *   matchMedia('(prefers-reduced-motion: reduce)').matches.
 *
 * TOUCH: Tilt + magnetic skip when pointerType === 'touch' to avoid
 *   accidental activation while scrolling.
 *
 * DATA ATTRIBUTES (CSS counterparts in cinematic.css):
 *   data-tilt                     — 3D tilt on pointer hover
 *   data-tilt-max="N"             — max rotation degrees (default 6)
 *   data-magnetic                 — button drifts toward cursor
 *   data-magnetic-strength="N"    — drift fraction 0–1 (default 0.25)
 *   data-scroll-fade              — scroll reveal (IO fallback only)
 *   data-scroll-delay="N"         — stagger index 0–9 (→ 0.06s × N delay)
 *   data-vt-link                  — intercept click for startViewTransition
 *
 * DOES NOT TOUCH: /office (Phaser canvas), /ny-session (owns its own JS).
 */

(function CinematicFlow() {
  'use strict';

  /* ─────────────────────────────────────────
     0. REDUCED-MOTION GUARD
     ───────────────────────────────────────── */

  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  // If motion is reduced, we still wire up view-transition links (they're
  // navigation, not decoration) but skip all visual transform effects.


  /* ─────────────────────────────────────────
     UTILITIES
     ───────────────────────────────────────── */

  /**
   * Clamp a value between min and max.
   * @param {number} v
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  /**
   * Get an element's bounding box centre in viewport coords.
   * Cached for the duration of a pointer event sequence.
   * @param {Element} el
   * @returns {{ cx: number, cy: number, w: number, h: number }}
   */
  function getRect(el) {
    const r = el.getBoundingClientRect();
    return {
      cx: r.left + r.width  / 2,
      cy: r.top  + r.height / 2,
      w:  r.width,
      h:  r.height,
    };
  }


  /* ─────────────────────────────────────────
     1. 3D TILT
     ───────────────────────────────────────── */

  function initTilt() {
    if (reducedMotion) return;

    const elements = document.querySelectorAll('[data-tilt]');
    if (!elements.length) return;

    elements.forEach(function (el) {
      const maxDeg = parseFloat(el.dataset.tiltMax) || 6;
      let rafId    = null;
      let pending  = null; // { x, y } normalised

      function applyTilt() {
        rafId = null;
        if (!pending) return;
        const { nx, ny } = pending;
        pending = null;

        // perspective() on the element itself — no wrapper required
        el.style.transform =
          'perspective(800px) ' +
          'rotateX(' + (-ny * maxDeg).toFixed(2) + 'deg) ' +
          'rotateY(' + ( nx * maxDeg).toFixed(2) + 'deg)';
      }

      el.addEventListener('pointermove', function (e) {
        // Skip touch — scroll intent
        if (e.pointerType === 'touch') return;

        const rect = getRect(el);
        const nx = clamp((e.clientX - rect.cx) / (rect.w / 2), -1, 1);
        const ny = clamp((e.clientY - rect.cy) / (rect.h / 2), -1, 1);
        pending = { nx, ny };

        if (!rafId) {
          rafId = requestAnimationFrame(applyTilt);
        }
      });

      el.addEventListener('pointerleave', function () {
        // Cancel any pending frame
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        pending = null;
        el.style.transform = '';
      });

      // Also reset on focus loss (keyboard navigation)
      el.addEventListener('blur', function () {
        el.style.transform = '';
      });
    });
  }


  /* ─────────────────────────────────────────
     2. MAGNETIC CTA
     ───────────────────────────────────────── */

  function initMagnetic() {
    if (reducedMotion) return;

    const elements = document.querySelectorAll('[data-magnetic]');
    if (!elements.length) return;

    const RADIUS = 80; // px — activation zone

    elements.forEach(function (el) {
      const strength = parseFloat(el.dataset.magneticStrength) || 0.25;
      let rafId   = null;
      let pending = null; // { dx, dy }

      function applyMagnetic() {
        rafId = null;
        if (!pending) return;
        const { dx, dy } = pending;
        pending = null;

        el.style.transform =
          'translate(' + (dx * strength).toFixed(2) + 'px, ' +
                         (dy * strength).toFixed(2) + 'px)';
      }

      // Listen on the document so we catch cursors entering from outside
      function onPointerMove(e) {
        if (e.pointerType === 'touch') return;

        const rect = getRect(el);
        const dx   = e.clientX - rect.cx;
        const dy   = e.clientY - rect.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > RADIUS) {
          // Outside zone — reset if we were previously attracted
          if (el.style.transform) {
            el.style.transform = '';
          }
          return;
        }

        pending = { dx, dy };
        if (!rafId) {
          rafId = requestAnimationFrame(applyMagnetic);
        }
      }

      function onPointerLeave() {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        pending = null;
        // CSS transition in cinematic.css springs the element back
        el.style.transform = '';
      }

      document.addEventListener('pointermove', onPointerMove, { passive: true });
      el.addEventListener('pointerleave', onPointerLeave);

      // Cleanup helper exposed on element for potential teardown
      el._cinematicCleanup = function () {
        document.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerleave', onPointerLeave);
        if (rafId) cancelAnimationFrame(rafId);
      };
    });
  }


  /* ─────────────────────────────────────────
     3. SCROLL-FADE IO FALLBACK
     Only runs when animation-timeline: scroll() is NOT supported,
     AND reduced-motion is off.
     ───────────────────────────────────────── */

  function initScrollFadeFallback() {
    // If native scroll-driven animation is supported, CSS already handles it.
    const nativeSupport = CSS && CSS.supports &&
      CSS.supports('animation-timeline: scroll()');

    if (nativeSupport) return;
    if (reducedMotion) {
      // Motion is reduced — ensure elements are visible regardless
      document.querySelectorAll('[data-scroll-fade]').forEach(function (el) {
        el.classList.add('is-revealed');
      });
      return;
    }

    const elements = document.querySelectorAll('[data-scroll-fade]');
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const el    = entry.target;
            const delay = parseInt(el.dataset.scrollDelay, 10) || 0;

            if (delay > 0) {
              el.style.transitionDelay = (delay * 0.06).toFixed(2) + 's';
            }

            el.classList.add('is-revealed');
            observer.unobserve(el); // once revealed, stop watching
          }
        });
      },
      {
        // Trigger when 10% of the element enters the viewport
        threshold: 0.10,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    elements.forEach(function (el) {
      observer.observe(el);
    });
  }


  /* ─────────────────────────────────────────
     4. VIEW TRANSITIONS — SOFT OPT-IN LINKS
     For <a data-vt-link href="..."> elements that want the manual
     startViewTransition path (e.g. in-page partial nav, modal dismiss).
     @view-transition { navigation: auto } in CSS already handles
     normal <a> clicks automatically in Chrome 126+ — this handler is
     for SPECIAL CASES where you want programmatic control.
     ───────────────────────────────────────── */

  function initViewTransitionLinks() {
    const supported = 'startViewTransition' in document;

    document.querySelectorAll('a[data-vt-link]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return; // skip anchors

        // Skip modifier clicks (open in new tab etc.)
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        if (!supported) return; // let browser do default navigation

        e.preventDefault();
        document.startViewTransition(function () {
          window.location.href = href;
        });
      });
    });
  }


  /* ─────────────────────────────────────────
     5. PAGE ENTRY — add cinematic-enter class
     on first cold load (no prior VT history).
     ───────────────────────────────────────── */

  function initPageEntry() {
    if (reducedMotion) return;

    // Only add the class if this wasn't a VT-driven navigation.
    // document.startViewTransition is not yet running on first page load
    // so checking navigation.currentEntry type is the reliable signal.
    //
    // Safest heuristic: add class unless the Performance Navigation API
    // says we're a browser back/forward (type === 'back_forward').
    const navType = (
      window.performance &&
      window.performance.getEntriesByType &&
      window.performance.getEntriesByType('navigation')[0]
    );
    const isBackForward = navType && navType.type === 'back_forward';

    if (!isBackForward) {
      document.body.classList.add('cinematic-enter');

      // Remove after animation completes so subsequent CSS transitions
      // on body aren't accidentally re-triggered.
      document.body.addEventListener('animationend', function onEnd(e) {
        if (e.animationName === 'cinematic-page-enter') {
          document.body.classList.remove('cinematic-enter');
          document.body.removeEventListener('animationend', onEnd);
        }
      });
    }
  }


  /* ─────────────────────────────────────────
     6. DYNAMIC ELEMENT SUPPORT
     If sage_premium.js or other code creates [data-tilt]/[data-magnetic]
     elements after DOMContentLoaded (e.g. via fetch + innerHTML),
     dispatch a custom event to re-init:
       document.dispatchEvent(new CustomEvent('cinematic:reinit'));
     ───────────────────────────────────────── */

  document.addEventListener('cinematic:reinit', function () {
    // Re-run init functions; they are safe to call multiple times
    // (existing listeners persist; new elements get new listeners).
    initTilt();
    initMagnetic();
    initScrollFadeFallback();
    initViewTransitionLinks();
  });


  /* ─────────────────────────────────────────
     BOOT
     ───────────────────────────────────────── */

  function boot() {
    initTilt();
    initMagnetic();
    initScrollFadeFallback();
    initViewTransitionLinks();
    initPageEntry();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // DOMContentLoaded already fired (script loaded defer/async or inline at end)
    boot();
  }

})(); // CinematicFlow IIFE
