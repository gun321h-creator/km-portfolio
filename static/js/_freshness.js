/* V3 PICK 3 — freshness pulse dot age computer
   Owned by Agent C. Do NOT edit from other agents.
   Design spec: docs/superpowers/specs/2026-06-09-dashboard-v3-picks-1-2-3-design.md §6.2

   For each .mm-section-sticky[data-fresh-iso] element:
   1. Reads the ISO 8601 UTC timestamp from data-fresh-iso
   2. Computes age in seconds
   3. Sets data-age="green|amber|red|unknown" on an injected .mm-freshness-dot
   Runs on load + every 30s so dots update while the tab stays open.
*/
(function () {
  "use strict";

  function age(iso) {
    if (!iso) return "unknown";
    var ageSec = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(ageSec)) return "unknown";
    if (ageSec < 60) return "green";
    if (ageSec < 300) return "amber";
    return "red";
  }

  function refresh() {
    document.querySelectorAll(".mm-section-sticky[data-fresh-iso]").forEach(function (el) {
      var dot = el.querySelector(".mm-freshness-dot");
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "mm-freshness-dot";
        dot.setAttribute("aria-hidden", "true");
        el.prepend(dot);
      }
      dot.dataset.age = age(el.dataset.freshIso);
    });
  }

  /* Run on DOMContentLoaded if not yet ready, otherwise immediately */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }

  setInterval(refresh, 30000);
})();
