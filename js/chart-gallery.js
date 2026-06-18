/* chart-gallery.js — render EVERY chooser example on one page, grouped by purpose.
 *
 * Driven by chooser/chart-chooser.json (the same file the Chart Chooser wizard
 * reads), so the gallery can never drift from the chooser: a new taxonomy entry
 * shows up here automatically, and a broken/missing example shows up as a
 * visible "no example" card. This is both a visitor-facing browse-all view and
 * the review harness for eyeballing all specs at once (e.g. conventions audits).
 */
(function () {
  "use strict";

  function siteRoot() {
    var el = document.querySelector('link[href*="site_libs/"], script[src*="site_libs/"]');
    if (el) { var u = el.href || el.src; return u.slice(0, u.indexOf("site_libs/")); }
    return new URL(".", document.baseURI).href;
  }
  var ROOT = (window.NCDPIVega && window.NCDPIVega.root) || siteRoot();

  var root = document.getElementById("chart-gallery-root");
  if (!root) return;

  fetch(ROOT + "chooser/chart-chooser.json")
    .then(function (r) { return r.json(); })
    .then(build)
    .catch(function (e) {
      root.innerHTML = '<p role="alert">The gallery could not load. Please refresh.</p>';
      if (window.console) console.error("[chart-gallery]", e);
    });

  function build(DATA) {
    // group taxonomy entries by their PRIMARY purpose (purpose[0]),
    // in the canonical purpose order from the JSON
    var groups = {};
    DATA.taxonomy.forEach(function (c) {
      var p = c.purpose[0];
      (groups[p] = groups[p] || []).push(c);
    });
    var order = Object.keys(DATA.purposes).filter(function (p) { return groups[p]; });

    // how many charts carry each purpose ANYWHERE in their tag list (primary,
    // secondary, or tertiary) — the count the filter buttons act on.
    var anyCount = {};
    DATA.taxonomy.forEach(function (c) {
      c.purpose.forEach(function (p) { anyCount[p] = (anyCount[p] || 0) + 1; });
    });
    var filterOrder = Object.keys(DATA.purposes).filter(function (p) { return anyCount[p]; });

    // filter bar — click a purpose to show every chart tagged with it (primary OR
    // secondary OR tertiary), so a Ranking-tagged chart filed under Comparison still
    // surfaces. "All" resets. Fixes "lose your place scrolling" by letting you narrow.
    var html = '<div class="cg-filterbar" role="group" aria-label="Filter charts by purpose">';
    html += '<button type="button" class="cg-filter is-active" data-filter="all" aria-pressed="true">All</button>';
    html += filterOrder.map(function (p) {
      var name = esc(DATA.purposes[p]);
      // aria-label carries the full "(N charts)"; the visible count span is decorative
      // (aria-hidden) so screen readers hear "Comparison, 5 charts" not "Comparison 5".
      return '<button type="button" class="cg-filter" data-filter="' + esc(p) + '"'
        + ' aria-pressed="false" aria-label="' + name + ' (' + anyCount[p] + ' charts)">'
        + name + ' <span class="cg-filter-n" aria-hidden="true">' + anyCount[p] + '</span></button>';
    }).join("");
    html += "</div>";

    // jump nav
    html += '<nav class="cg-jumpnav" aria-label="Gallery sections"><strong>Jump to:</strong> ';
    html += order.map(function (p) {
      return '<a href="#gallery-' + p + '">' + esc(DATA.purposes[p]) + " (" + groups[p].length + ")</a>";
    }).join(" · ");
    html += "</nav>";

    order.forEach(function (p) {
      html += '<section class="cg-group" data-group="' + esc(p) + '">';
      html += '<h2 id="gallery-' + p + '">' + esc(DATA.purposes[p]) + "</h2>";
      groups[p].forEach(function (c) { html += card(c, DATA); });
      html += "</section>";
    });

    root.innerHTML = html;
    wireFilters(DATA);
    renderExamples();
  }

  // Show only cards whose purpose list includes the active filter; hide group
  // sections that end up empty. "all" shows everything.
  function wireFilters(DATA) {
    var btns = root.querySelectorAll(".cg-filter");
    var cards = root.querySelectorAll(".cc-card");
    var groupsEls = root.querySelectorAll(".cg-group");
    Array.prototype.forEach.call(btns, function (btn) {
      btn.addEventListener("click", function () {
        var f = btn.getAttribute("data-filter");
        Array.prototype.forEach.call(btns, function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        Array.prototype.forEach.call(cards, function (card) {
          var purposes = (card.getAttribute("data-purposes") || "").split(" ");
          card.hidden = !(f === "all" || purposes.indexOf(f) !== -1);
        });
        // hide a group heading if every card under it is hidden
        Array.prototype.forEach.call(groupsEls, function (g) {
          var visible = g.querySelectorAll(".cc-card:not([hidden])").length;
          g.hidden = visible === 0;
        });
      });
    });
  }

  function card(c, DATA) {
    var html = '<article class="cc-card" id="type-' + esc(c.id) + '" data-purposes="' + esc(c.purpose.join(" ")) + '">';
    html += '<div class="cc-card-head"><h3>' + esc(c.name) + "</h3>";
    // purpose tags: the primary (filled) + each secondary/tertiary as "ALSO:" chips.
    html += '<span class="cg-tags">';
    html += '<span class="cg-tag cg-tag-primary">' + esc(DATA.purposes[c.purpose[0]] || c.purpose[0]) + "</span>";
    html += c.purpose.slice(1).map(function (p) {
      return '<span class="cg-tag cg-tag-also">' + esc((DATA.purposes[p] || p).toUpperCase()) + "</span>";
    }).join("");
    html += "</span>";
    html += "</div>";
    // the spec/image file behind the example — handy for review and audits
    var src = c.spec || c.image;
    if (src) {
      html += '<p class="cg-spec"><code><a href="' + ROOT + esc(src) + '">' + esc(src) + "</a></code></p>";
    }
    if (c.spec) {
      html += '<div class="ncdpi-vega" data-spec="' + esc(c.spec) + '"></div>';
    } else if (c.image) {
      html += '<img class="cc-example-img" src="' + ROOT + esc(c.image) + '" alt="'
        + esc(c.imageAlt || ("Example " + c.name)) + '" style="max-width:100%;height:auto;">';
    } else {
      html += '<p class="cc-noexample" role="alert">No worked example wired up for this type yet.</p>';
    }
    if (c.watch) html += '<p class="cc-watch"><strong>Watch out:</strong> ' + esc(c.watch) + "</p>";
    if (c.page) html += '<p class="cc-more"><a href="' + ROOT + esc(c.page) + '">More on ' + esc(c.name) + " →</a></p>";
    html += "</article>";
    return html;
  }

  function renderExamples() {
    var tries = 0;
    (function go() {
      if (window.NCDPIVega && window.NCDPIVega.render) { window.NCDPIVega.render(); return; }
      if (tries++ < 40) setTimeout(go, 100);
    })();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
