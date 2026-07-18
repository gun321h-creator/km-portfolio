/* BOT/dashboard/static/js/spark_util.js
 *
 * MMSpark — tiny inline-SVG sparkline primitive for KPI-card anatomy.
 *
 *   window.MMSpark.render(el, values, {width, height, stroke, strokeWidth, dot})
 *
 * Builds a decorative <svg><polyline> via createElementNS (numeric-only —
 * NEVER innerHTML, so it is XSS-safe even on untrusted values). Normalises the
 * series into the box and marks the endpoint. Degrades SILENTLY (renders
 * nothing, returns null) on < 2 finite points. The SVG is aria-hidden — the
 * real number/delta must live in adjacent readable text.
 *
 * stroke defaults to `currentColor`, so colour the host element (e.g. add an
 * `.up`/`.down` class from _kpi.css) and the line follows.
 *
 * Vanilla JS, ES5-safe, self-contained IIFE. No CDN, no deps.
 * Author: น้องหน้า — 2026-07-02
 */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";

  function round2(n) { return Math.round(n * 100) / 100; }

  /**
   * Render a sparkline into `el` from a numeric `values` array.
   * @param {Element} el         host element (content is cleared first)
   * @param {Array}   values     numbers (non-finite entries are dropped)
   * @param {Object=} opts       {width,height,stroke,strokeWidth,dot}
   * @returns {SVGElement|null}   the svg, or null when it degraded
   */
  function render(el, values, opts) {
    if (!el || typeof el.appendChild !== "function") return null;
    opts = opts || {};

    /* numeric-only sanitize — drop anything non-finite */
    var nums = [];
    if (values && values.length) {
      for (var i = 0; i < values.length; i++) {
        var n = Number(values[i]);
        if (isFinite(n)) nums.push(n);
      }
    }

    /* clear any prior render — no innerHTML, DOM only */
    while (el.firstChild) el.removeChild(el.firstChild);

    /* degrade silently on too few points */
    if (nums.length < 2) return null;

    var w = Number(opts.width) || 64;
    var h = Number(opts.height) || 18;
    var sw = Number(opts.strokeWidth) || 1.5;
    var pad = sw + 0.5;                    /* keep the stroke off the edges */
    var stroke = opts.stroke || "currentColor";

    var innerW = Math.max(0, w - pad * 2);
    var innerH = Math.max(0, h - pad * 2);

    var min = nums[0], max = nums[0];
    for (var k = 1; k < nums.length; k++) {
      if (nums[k] < min) min = nums[k];
      if (nums[k] > max) max = nums[k];
    }
    var range = max - min;
    var stepX = nums.length > 1 ? innerW / (nums.length - 1) : 0;

    var pts = [];
    for (var j = 0; j < nums.length; j++) {
      var x = pad + j * stepX;
      var y = (range <= 0)
        ? h / 2                                          /* flat line, centered */
        : pad + innerH * (1 - (nums[j] - min) / range);  /* higher value = higher */
      pts.push(round2(x) + "," + round2(y));
    }

    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "mm-spark-svg");
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    var poly = document.createElementNS(SVGNS, "polyline");
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", stroke);
    poly.setAttribute("stroke-width", String(sw));
    poly.setAttribute("stroke-linejoin", "round");
    poly.setAttribute("stroke-linecap", "round");
    poly.setAttribute("points", pts.join(" "));
    svg.appendChild(poly);

    /* endpoint marker (skippable via dot:false) */
    if (opts.dot !== false) {
      var last = pts[pts.length - 1].split(",");
      var dot = document.createElementNS(SVGNS, "circle");
      dot.setAttribute("cx", last[0]);
      dot.setAttribute("cy", last[1]);
      dot.setAttribute("r", String(Math.max(1.2, sw)));
      dot.setAttribute("fill", stroke);
      svg.appendChild(dot);
    }

    el.appendChild(svg);
    return svg;
  }

  window.MMSpark = window.MMSpark || { render: render };
})();
