/* design-tokens-render.js — render the Design System docs pages from the GENERATED
 * token artifacts (theme/design-tokens.json + theme/contrast-grid.json, both built
 * by tools/build_design_tokens.py from design-system/tokens.json), so the docs can
 * never drift from the tokens.
 *
 *   <div data-ds="brand"></div>          First in Flight primitive swatches
 *   <div data-ds="gray-ramp"></div>      warm-gray ramp strip with grade labels
 *   <div data-ds="semantic-fills"></div> fill + on-* pair cards
 *   <div data-ds="semantic-text"></div>  text/link/border/focus tokens in situ
 *   <div data-ds="type"></div>           type-scale specimen
 *   <div data-ds="space"></div>          spacing scale bars
 *   <div data-ds="radius"></div>         radius squares
 *   <div data-ds="shadow"></div>         elevation cards
 *   <div data-ds="contrast-grid"></div>  the validated contrast grid
 *
 * Accessibility note (mirrors color-render.js): we do NOT overlay text on color
 * fills — EXCEPT the semantic pair cards and the contrast grid, where showing the
 * on-X text on its X fill is exactly the guarantee being documented, and every such
 * pair is machine-validated by the build script before it can ship.
 */
(function () {
  "use strict";

  function siteRoot() {
    var el = document.querySelector('link[href*="site_libs/"], script[src*="site_libs/"]');
    if (el) { var u = el.href || el.src; return u.slice(0, u.indexOf("site_libs/")); }
    return new URL(".", document.baseURI).href;
  }
  var ROOT = (window.NCDPIVega && window.NCDPIVega.root) || siteRoot();

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---- token helpers ------------------------------------------------------

  var BY_PATH = {};   // "color.brand.primary" -> token row

  function tok(path) { return BY_PATH[path] || null; }
  function val(path) { var t = tok(path); return t ? t.value : ""; }

  function metaHTML(label, hex, cssVar) {
    return '<div class="meta"><div class="name">' + esc(label) + '</div>'
      + (hex ? '<div class="hex">' + esc(hex) + '</div>' : '')
      + (cssVar ? '<div class="ds-var"><code>' + esc(cssVar) + '</code></div>' : '')
      + '</div>';
  }

  // ---- section renderers --------------------------------------------------

  function renderBrand(el, rows) {
    var html = ['<div class="swatch-grid ds-swatch-row">'];
    rows.forEach(function (r) {
      var name = r.path.split(".").pop();
      html.push('<div class="swatch"><div class="chip" style="background:' + esc(r.value) + '"></div>'
        + metaHTML(name, r.value, r.cssVar) + '</div>');
    });
    html.push('</div>');
    el.innerHTML = html.join("");
  }

  function renderGrayRamp(el, rows) {
    var html = ['<div class="ds-ramp" role="img" aria-label="Warm-gray ramp, twelve grades from near-white (grade 1) to near-black (grade 90)">'];
    rows.forEach(function (r) {
      var grade = r.path.split(".").pop();
      html.push('<div class="ds-ramp-step"><div class="ds-ramp-chip" style="background:' + esc(r.value) + '"></div>'
        + '<div class="ds-ramp-grade">' + esc(grade) + '</div>'
        + '<div class="ds-ramp-hex">' + esc(r.value) + '</div></div>');
    });
    html.push('</div>');
    el.innerHTML = html.join("");
  }

  var FILL_PAIRS = [
    ["surface", "on-surface"], ["surface-raised", "on-surface-raised"],
    ["surface-sunken", "on-surface-sunken"], ["surface-brand", "on-surface-brand"],
    ["surface-info", "on-surface-info"], ["surface-accent", "on-surface-accent"],
    ["accent", "on-accent"]
  ];

  function semTok(name) { return tok("color.semantic." + name); }

  function renderSemanticFills(el) {
    var html = ['<div class="ds-pair-grid">'];
    FILL_PAIRS.forEach(function (p) {
      var fill = semTok(p[0]), on = semTok(p[1]);
      if (!fill || !on) return;
      html.push('<div class="ds-pair">'
        + '<div class="ds-pair-demo" style="background:' + esc(fill.value) + ';color:' + esc(on.value) + '">'
        + 'Aa <span class="ds-pair-demo-name">' + esc(p[1]) + '</span></div>'
        + '<div class="ds-pair-meta">'
        + '<div class="ds-pair-tok"><span class="name">' + esc(p[0]) + '</span> <span class="hex">' + esc(fill.value) + '</span> <code>' + esc(fill.cssVar) + '</code></div>'
        + '<div class="ds-pair-tok"><span class="name">' + esc(p[1]) + '</span> <span class="hex">' + esc(on.value) + '</span> <code>' + esc(on.cssVar) + '</code></div>'
        + (fill.description ? '<p class="ds-pair-note">' + esc(fill.description) + '</p>' : '')
        + '</div></div>');
    });
    html.push('</div>');
    el.innerHTML = html.join("");
  }

  function renderSemanticText(el) {
    var surface = val("color.semantic.surface");
    var rows = [
      ["text-primary", "Body text — the warm near-black ink.", {}],
      ["text-secondary", "Secondary text — captions, help text, muted notes.", {}],
      ["text-heading", "Headings speak the brand navy.", { weight: 700, size: "24px" }],
      ["link", "Links use Secondary Dark — passes on white and the warm surface.", { underline: true }],
      ["link-hover", "Link hover state — darkens to the primary navy.", { underline: true }]
    ];
    var html = ['<div class="ds-text-list" style="background:' + esc(surface) + '">'];
    rows.forEach(function (r) {
      var t = semTok(r[0]);
      if (!t) return;
      var style = 'color:' + esc(t.value) + ';'
        + (r[2].weight ? 'font-weight:' + r[2].weight + ';' : '')
        + (r[2].size ? 'font-size:' + r[2].size + ';' : '')
        + (r[2].underline ? 'text-decoration:underline;' : '');
      html.push('<div class="ds-text-row"><span class="ds-text-demo" style="' + style + '">' + esc(r[1]) + '</span>'
        + '<span class="ds-text-tok"><span class="hex">' + esc(t.value) + '</span> <code>' + esc(t.cssVar) + '</code></span></div>');
    });
    // border + focus, shown as non-text samples
    var bs = semTok("border-subtle"), bg2 = semTok("border-strong"), fc = semTok("focus");
    html.push('<div class="ds-text-row"><span class="ds-text-demo"><span class="ds-border-demo" style="border-bottom:1px solid ' + esc(bs.value) + '"></span> border-subtle (decorative)</span>'
      + '<span class="ds-text-tok"><span class="hex">' + esc(bs.value) + '</span> <code>' + esc(bs.cssVar) + '</code></span></div>');
    html.push('<div class="ds-text-row"><span class="ds-text-demo"><span class="ds-border-demo" style="border-bottom:2px solid ' + esc(bg2.value) + '"></span> border-strong (form inputs, ≥3:1)</span>'
      + '<span class="ds-text-tok"><span class="hex">' + esc(bg2.value) + '</span> <code>' + esc(bg2.cssVar) + '</code></span></div>');
    html.push('<div class="ds-text-row"><span class="ds-text-demo"><span class="ds-focus-demo" style="outline:3px solid ' + esc(fc.value) + '">Tab stop</span></span>'
      + '<span class="ds-text-tok"><span class="hex">' + esc(fc.value) + '</span> <code>' + esc(fc.cssVar) + '</code></span></div>');
    html.push('</div>');
    el.innerHTML = html.join("");
  }

  var TYPE_ROWS = [
    ["h1", "bold", "heading"], ["h2", "bold", "heading"], ["h3", "bold", "heading"],
    ["h4", "bold", "heading"], ["h5", "bold", "heading"], ["h6", "bold", "heading"],
    ["body", "regular", "body"], ["small", "regular", "small"]
  ];

  function renderType(el) {
    var fam = val("font.family.ui");
    var html = ['<div class="ds-type-list">'];
    TYPE_ROWS.forEach(function (r) {
      var size = val("type.size." + r[0]);
      var weight = val("font.weight." + r[1]);
      var lh = val("type.line-height." + r[2]);
      html.push('<div class="ds-type-row">'
        + '<div class="ds-type-spec"><span class="name">' + esc(r[0]) + '</span> ' + esc(size) + ' / ' + esc(String(lh)) + ' · ' + esc(String(weight)) + '</div>'
        + '<div class="ds-type-demo" style="font-family:' + esc(fam) + ';font-size:' + esc(size) + ';font-weight:' + esc(String(weight)) + ';line-height:' + esc(String(lh)) + '">'
        + 'Every student deserves a clear picture</div></div>');
    });
    html.push('</div>');
    el.innerHTML = html.join("");
  }

  function renderSpace(el, rows) {
    var html = ['<div class="ds-space-list">'];
    rows.forEach(function (r) {
      var name = r.path.split(".").pop();
      html.push('<div class="ds-space-row"><span class="ds-space-name"><code>' + esc(name) + '</code> ' + esc(r.value) + '</span>'
        + '<span class="ds-space-bar" style="width:' + esc(r.value) + '"></span></div>');
    });
    html.push('</div>');
    el.innerHTML = html.join("");
  }

  function renderRadius(el, rows) {
    var html = ['<div class="ds-radius-row">'];
    rows.forEach(function (r) {
      var name = r.path.split(".").pop();
      html.push('<div class="ds-radius-item"><div class="ds-radius-chip" style="border-radius:' + esc(r.value) + '"></div>'
        + metaHTML(name + " · " + r.value, null, r.cssVar) + '</div>');
    });
    html.push('</div>');
    el.innerHTML = html.join("");
  }

  function renderShadow(el, rows) {
    var html = ['<div class="ds-shadow-row">'];
    rows.forEach(function (r) {
      var name = r.path.split(".").pop();
      html.push('<div class="ds-shadow-item"><div class="ds-shadow-chip" style="box-shadow:' + esc(r.value) + '"></div>'
        + metaHTML(name, null, r.cssVar) + '</div>');
    });
    html.push('</div>');
    el.innerHTML = html.join("");
  }

  function renderContrastGrid(el, grid) {
    var html = ['<table class="ds-grid-table"><thead><tr>'
      + '<th scope="col">Sample</th><th scope="col">Foreground</th><th scope="col">Background</th>'
      + '<th scope="col">Ratio</th><th scope="col">Requires</th><th scope="col">Result</th></tr></thead><tbody>'];
    grid.claims.forEach(function (c) {
      var sample = c.kind === "text"
        ? '<span class="ds-grid-sample" style="background:' + esc(c.bgHex) + ';color:' + esc(c.fgHex) + '">Aa</span>'
        : '<span class="ds-grid-sample" style="background:' + esc(c.bgHex) + '"><span class="ds-grid-swatch" style="background:' + esc(c.fgHex) + '"></span></span>';
      html.push('<tr>'
        + '<td>' + sample + '</td>'
        + '<td><code>' + esc(c.fg) + '</code> <span class="hex">' + esc(c.fgHex) + '</span></td>'
        + '<td><code>' + esc(c.bg) + '</code> <span class="hex">' + esc(c.bgHex) + '</span></td>'
        + '<td>' + esc(c.ratio.toFixed(2)) + ':1</td>'
        + '<td>' + esc(c.threshold.toFixed(1)) + ':1 ' + (c.kind === "text" ? "(text)" : "(non-text)") + '</td>'
        + '<td>' + (c.pass ? '<span class="ds-pass">Pass</span>' : '<span class="ds-fail">FAIL</span>') + '</td>'
        + '</tr>');
    });
    html.push('</tbody></table>');
    el.innerHTML = html.join("");
  }

  // ---- boot ---------------------------------------------------------------

  function byPrefix(rows, prefix) {
    return rows.filter(function (r) { return r.path.indexOf(prefix) === 0; });
  }

  function boot() {
    var targets = document.querySelectorAll("[data-ds]");
    if (!targets.length) return;
    var needGrid = document.querySelector('[data-ds="contrast-grid"]');

    var fetches = [fetch(ROOT + "theme/design-tokens.json").then(function (r) { return r.json(); })];
    if (needGrid) fetches.push(fetch(ROOT + "theme/contrast-grid.json").then(function (r) { return r.json(); }));

    Promise.all(fetches).then(function (results) {
      var rows = results[0].tokens;
      var grid = results[1];
      rows.forEach(function (r) { BY_PATH[r.path] = r; });

      targets.forEach(function (el) {
        var kind = el.getAttribute("data-ds");
        if (kind === "brand") renderBrand(el, byPrefix(rows, "color.brand."));
        else if (kind === "gray-ramp") {
          var grays = byPrefix(rows, "color.gray.");
          grays.sort(function (a, b) { return +a.path.split(".").pop() - +b.path.split(".").pop(); });
          renderGrayRamp(el, grays);
        }
        else if (kind === "semantic-fills") renderSemanticFills(el);
        else if (kind === "semantic-text") renderSemanticText(el);
        else if (kind === "type") renderType(el);
        else if (kind === "space") renderSpace(el, byPrefix(rows, "space."));
        else if (kind === "radius") renderRadius(el, byPrefix(rows, "radius."));
        else if (kind === "shadow") renderShadow(el, byPrefix(rows, "shadow."));
        else if (kind === "contrast-grid" && grid) renderContrastGrid(el, grid);
      });
    }).catch(function (err) {
      targets.forEach(function (el) {
        el.innerHTML = '<p class="ds-load-error">Could not load token data (' + esc(err.message) + '). '
          + 'Re-run <code>python tools/build_design_tokens.py</code> and rebuild the site.</p>';
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
