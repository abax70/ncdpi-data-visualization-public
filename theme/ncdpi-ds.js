/* ==========================================================================
   ncdpi-ds.js — NCDPI Design System behaviors (optional third file)
   ==========================================================================
   Plain vanilla JS, no dependencies, no build step (D3). Three behaviors,
   all progressive enhancements — the CSS renders usable static fallbacks
   without this file:

   1. TABS (.ncdpi-tabs) — WAI-ARIA tabs pattern.
      Markup contract:
        <div class="ncdpi-tabs" data-ncdpi-tabs>
          <div class="ncdpi-tabs__list" aria-label="...">
            <button type="button" class="ncdpi-tabs__tab" data-panel="id-1">Label</button>
            ...
          </div>
          <div class="ncdpi-tabs__panel" id="id-1">...</div>
          ...
        </div>
      The script wires role=tablist/tab/tabpanel, aria-selected, roving
      tabindex, Left/Right/Home/End keys, and hides non-active panels
      (hidden="until-found" where supported, so find-in-page still reaches
      them and selects the matching tab; plain hidden elsewhere).
      Without JS: no roles are claimed and all panels stay visible (a
      heading-and-sections read), which is the correct degraded state —
      never claim ARIA semantics the behavior can't back.

   2. DISMISSIBLE CALLOUT — any <button data-ncdpi-dismiss> inside a
      .ncdpi-callout removes the callout. Focus moves back to the callout's
      previous sibling heading or body start so keyboard users aren't
      dropped at the page top.

   3. NATIVE-VALIDATION ARIA SYNC — for .ncdpi-input controls inside a
      .ncdpi-field that use HTML constraints (required, min/max, pattern):
      mirrors the CSS :user-invalid state into aria-invalid and wires the
      field's .ncdpi-field__error--native message into aria-describedby
      only while invalid. Without this file the border still turns red
      and the message still shows; only the screen-reader state is lost.
   ========================================================================== */

(function () {
  "use strict";

  /* ---- tabs ---------------------------------------------------------- */

  /* Inactive panels use hidden="until-found" where the browser supports it
     (verified 2026-10-08 in Chromium 149, Firefox 151, WebKit 26.5): they
     look hidden, but the browser's find-in-page can still search their
     text, and a match fires `beforematch` on the panel, which selects its
     tab. Older browsers get plain `hidden`, the pre-2026-10 behavior. */
  var UNTIL_FOUND = "onbeforematch" in HTMLElement.prototype;

  function hidePanel(panel) {
    if (UNTIL_FOUND) panel.setAttribute("hidden", "until-found");
    else panel.hidden = true;
    /* An until-found panel keeps a (zero-height) box, and Chromium then
       exposes it as an EMPTY named tabpanel ("Counties tab panel") that a
       screen reader in browse mode lands on (verified 2026-10-08 via the
       accessibility tree). aria-hidden prunes it; find-in-page searches
       rendered text and ignores ARIA, so matching still works. */
    panel.setAttribute("aria-hidden", "true");
  }

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
        if (!panels[i]) return;
        if (active) {
          panels[i].hidden = false;
          panels[i].removeAttribute("aria-hidden");
          panels[i].tabIndex = 0; /* active panel is focusable (APG) */
        } else {
          hidePanel(panels[i]);
          /* An until-found panel still has a layout box, so drop it from
             the tab order explicitly rather than trusting the hiding. */
          panels[i].removeAttribute("tabindex");
        }
      });
      if (focus) tabs[idx].focus();
    }

    /* Find-in-page matched text inside a hidden panel: select its tab
       before the browser reveals it, so tab state and panel stay in sync.
       beforematch bubbles, so one listener on the widget covers every
       panel. */
    root.addEventListener("beforematch", function (e) {
      var idx = panels.indexOf(e.target);
      if (idx !== -1) select(idx, false);
    });

    tabs.forEach(function (tab, i) {
      /* A <button> with no type is a SUBMIT button: tabs placed inside a
         <form> would submit it on every click. Force type="button". */
      if (tab.tagName === "BUTTON") tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.id = tab.id || tab.getAttribute("data-panel") + "-tab";
      if (panels[i]) {
        panels[i].setAttribute("role", "tabpanel");
        panels[i].setAttribute("aria-labelledby", tab.id);
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

  /* ---- native-validation ARIA sync ------------------------------------ */

  /* CSS :user-invalid paints the error state, but browsers don't mirror it
     into ARIA, so a screen reader would never hear "invalid". After each
     blur / focus / input / change / invalid event on a .ncdpi-input inside
     a .ncdpi-field, copy the visual state across:
       - aria-invalid="true" while the control matches :user-invalid;
       - the id of its .ncdpi-field__error--native message added to
         aria-describedby only while invalid. The message is display:none
         when valid, but the accessible-name rules still read hidden text
         that describedby points at directly, so a permanently wired id
         would announce "Error: ..." on a perfectly good value.
     Leaves alone: fields with .ncdpi-field--error (JS-set errors own their
     own state) and any aria-invalid it didn't set itself. Listeners sit on
     the document (capture phase, since focus/blur/invalid don't bubble),
     so fields added later are covered with no extra wiring.
     Pattern: modern-web-guidance accessibility/accessible-error-announcement. */
  var managed = new WeakSet();

  function syncValidity(e) {
    var el = e.target;
    if (!el.matches || !el.matches(".ncdpi-field .ncdpi-input")) return;
    var field = el.closest(".ncdpi-field");
    if (field.classList.contains("ncdpi-field--error")) return;
    /* on input, only re-check a field already flagged, so the error clears
       the moment it's fixed but never appears mid-typing */
    if (e.type === "input" && el.getAttribute("aria-invalid") !== "true") return;

    var invalid = el.matches(":user-invalid");
    var msg = field.querySelector(".ncdpi-field__error--native");
    var ids = (el.getAttribute("aria-describedby") || "").split(/\s+/)
      .filter(function (id) { return id && (!msg || id !== msg.id); });

    if (invalid) {
      el.setAttribute("aria-invalid", "true");
      managed.add(el);
      if (msg && msg.id) ids.push(msg.id);
    } else if (managed.has(el)) {
      el.removeAttribute("aria-invalid");
    }
    if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
    else el.removeAttribute("aria-describedby");
  }

  /* A form reset clears :user-invalid (border and message go away) but
     fires no event on the controls, so without this the ARIA state went
     stale: aria-invalid="true" and the hidden message still announced on a
     field that looks fine (found in the 2026-10-08 review, reproduced in
     all three engines). `reset` fires BEFORE the values reset, so wait one
     tick, then re-sync every managed control in the form. Script that sets
     .value directly should dispatch a "change" event for the same reason. */
  function onReset(e) {
    var form = e.target;
    if (!form || !form.elements) return;
    setTimeout(function () {
      Array.prototype.forEach.call(form.elements, function (el) {
        if (managed.has(el)) syncValidity({ target: el, type: "reset" });
      });
    }, 0);
  }

  function initValiditySync() {
    /* :user-invalid is Baseline since late 2023; without it there is no
       visual error state either, so there's nothing to mirror */
    if (!window.CSS || !CSS.supports("selector(:user-invalid)")) return;
    ["blur", "focus", "invalid", "reset"].forEach(function (type) {
      document.addEventListener(type, type === "reset" ? onReset : syncValidity, true);
    });
    ["input", "change"].forEach(function (type) {
      document.addEventListener(type, syncValidity);
    });
  }

  function init() {
    document.querySelectorAll("[data-ncdpi-tabs]").forEach(initTabs);
    document.querySelectorAll("[data-ncdpi-dismiss]").forEach(initDismiss);
    initValiditySync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
