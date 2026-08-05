/* ==========================================================================
   ncdpi-ds.js — NCDPI Design System behaviors (optional third file)
   ==========================================================================
   Plain vanilla JS, no dependencies, no build step (D3). Only two behaviors
   exist, both progressive enhancements — the CSS renders usable static
   fallbacks without this file:

   1. TABS (.ncdpi-tabs) — WAI-ARIA tabs pattern.
      Markup contract:
        <div class="ncdpi-tabs" data-ncdpi-tabs>
          <div class="ncdpi-tabs__list" aria-label="...">
            <button class="ncdpi-tabs__tab" data-panel="id-1">Label</button>
            ...
          </div>
          <div class="ncdpi-tabs__panel" id="id-1">...</div>
          ...
        </div>
      The script wires role=tablist/tab/tabpanel, aria-selected, roving
      tabindex, Left/Right/Home/End keys, and hides non-active panels.
      Without JS: no roles are claimed and all panels stay visible (a
      heading-and-sections read), which is the correct degraded state —
      never claim ARIA semantics the behavior can't back.

   2. DISMISSIBLE CALLOUT — any <button data-ncdpi-dismiss> inside a
      .ncdpi-callout removes the callout. Focus moves back to the callout's
      previous sibling heading or body start so keyboard users aren't
      dropped at the page top.
   ========================================================================== */

(function () {
  "use strict";

  /* ---- tabs ---------------------------------------------------------- */

  function initTabs(root) {
    var list = root.querySelector(".ncdpi-tabs__list");
    var tabs = Array.prototype.slice.call(
      root.querySelectorAll(".ncdpi-tabs__tab"));
    if (!list || tabs.length === 0) return;

    list.setAttribute("role", "tablist");

    var panels = tabs.map(function (tab) {
      var panel = document.getElementById(tab.getAttribute("data-panel"));
      return panel || null;
    });

    function select(idx, focus) {
      tabs.forEach(function (tab, i) {
        var active = i === idx;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
        if (panels[i]) panels[i].hidden = !active;
      });
      if (focus) tabs[idx].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.setAttribute("role", "tab");
      tab.id = tab.id || tab.getAttribute("data-panel") + "-tab";
      if (panels[i]) {
        panels[i].setAttribute("role", "tabpanel");
        panels[i].setAttribute("aria-labelledby", tab.id);
        panels[i].tabIndex = 0; /* panel itself is focusable (APG) */
        tab.setAttribute("aria-controls", panels[i].id);
      }
      tab.addEventListener("click", function () { select(i, false); });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next !== null) {
          e.preventDefault();
          select(next, true);
        }
      });
    });

    select(0, false);
  }

  /* ---- dismissible callout ------------------------------------------- */

  function initDismiss(btn) {
    btn.addEventListener("click", function () {
      var callout = btn.closest(".ncdpi-callout");
      if (!callout) return;
      var neighbor = callout.previousElementSibling || callout.parentElement;
      callout.remove();
      if (neighbor && typeof neighbor.focus === "function") {
        if (!neighbor.hasAttribute("tabindex")) neighbor.tabIndex = -1;
        neighbor.focus();
      }
    });
  }

  function init() {
    document.querySelectorAll("[data-ncdpi-tabs]").forEach(initTabs);
    document.querySelectorAll("[data-ncdpi-dismiss]").forEach(initDismiss);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
