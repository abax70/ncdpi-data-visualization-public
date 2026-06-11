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

    // jump nav
    var html = '<nav class="cg-jumpnav" aria-label="Gallery sections"><strong>Jump to:</strong> ';
    html += order.map(function (p) {
      return '<a href="#gallery-' + p + '">' + esc(DATA.purposes[p]) + " (" + groups[p].length + ")</a>";
    }).join(" · ");
    html += "</nav>";

    order.forEach(function (p) {
      html += '<h2 id="gallery-' + p + '">' + esc(DATA.purposes[p]) + "</h2>";
      groups[p].forEach(function (c) { html += card(c, DATA); });
    });

    root.innerHTML = html;
    renderExamples();
  }

  function card(c, DATA) {
    var html = '<article class="cc-card" id="type-' + esc(c.id) + '">';
    html += '<div class="cc-card-head"><h3>' + esc(c.name) + "</h3>";
    // secondary purposes as context tags
    if (c.purpose.length > 1) {
      html += '<span class="cc-tag">also: ' + c.purpose.slice(1).map(function (p) {
        return esc(DATA.purposes[p] || p);
      }).join(", ") + "</span>";
    }
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
