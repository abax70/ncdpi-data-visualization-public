/* color-render.js — render brand color swatches, step pickers, and the searchable
 * lookup table from the generated theme/color-data.json (sourced from the brand CSV).
 *
 *   <div data-swatches="Groups: 6"></div>                         one palette as chips
 *   <div data-swatches="Groups: 2" data-swatches-exclude="Total/Avg"></div>
 *   <div data-step-picker="sequence"></div>   To Good / To Bad / To Neutral × 2–5 steps
 *   <div data-step-picker="diverging"></div>  3 / 5 / 7 / 9 steps, number-line order
 *   <div id="color-lookup"></div>                                 searchable full table
 *
 * Accessibility: swatch chips carry NO overlaid text (text on a color fill can't be
 * guaranteed to meet WCAG contrast). The element name + hex sit BELOW the chip on the
 * white card instead.
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

  // One swatch: a plain color block, with the element name + hex BELOW it (no text on color).
  function swatchHTML(row) {
    return '<div class="swatch"><div class="chip" style="background:' + esc(row.hex) + '"></div>'
      + '<div class="meta"><div class="name">' + esc(row.element || row.palette) + '</div>'
      + '<div class="hex">' + esc(row.hex) + '</div></div></div>';
  }

  // Step-picker presets. Palette names are matched as "<family>: <n> Steps".
  var PICKERS = {
    sequence: {
      families: [["Sequence to Good", "To Good"], ["Sequence to Bad", "To Bad"],
                 ["Sequence to Neutral", "To Neutral"]],
      steps: [2, 3, 4, 5], step: 5
    },
    diverging: {
      families: [["Diverging", "Diverging"]],
      steps: [3, 5, 7, 9], step: 5
    }
  };

  function buttonGroup(role, items, current, label) {
    var html = label ? '<span class="sp-label">' + esc(label) + '</span>' : '';
    html += '<div class="sp-group" role="group"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '>';
    items.forEach(function (it) {
      html += '<button type="button" data-role="' + role + '" data-val="' + esc(String(it[0])) + '"'
        + ' aria-pressed="' + (String(it[0]) === String(current)) + '">' + esc(it[1]) + '</button>';
    });
    return html + '</div>';
  }

  function buildPicker(host, cfg, rows) {
    host.classList.add("step-picker");
    var state = { family: cfg.families[0][0], step: cfg.step };

    var controls = document.createElement("div");
    controls.className = "sp-controls";
    var html = "";
    if (cfg.families.length > 1) html += buttonGroup("family", cfg.families, state.family, "Direction");
    html += buttonGroup("steps", cfg.steps.map(function (s) { return [s, s + " steps"]; }), state.step, "Steps");
    controls.innerHTML = html;

    var grid = document.createElement("div");
    grid.className = "sp-swatches swatch-grid";

    function render() {
      var name = state.family + ": " + state.step + " Steps";
      var match = rows.filter(function (x) { return x.palette === name; });
      grid.innerHTML = match.length
        ? match.map(swatchHTML).join("")
        : '<p style="color:#525A60;font-style:italic">No palette for this combination.</p>';
    }

    controls.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("button[data-role]");
      if (!btn) return;
      var role = btn.getAttribute("data-role"), val = btn.getAttribute("data-val");
      if (role === "steps") { state.step = +val; } else { state.family = val; }
      Array.prototype.forEach.call(btn.parentNode.querySelectorAll("button"), function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      render();
    });

    host.appendChild(controls);
    host.appendChild(grid);
    render();
  }

  function buildLookup(look, rows) {
    var inp = document.createElement("input");
    inp.type = "search";
    inp.placeholder = "Filter by palette, element, or hex…";
    inp.className = "form-control";
    inp.style.maxWidth = "420px";
    inp.style.marginBottom = "0.8rem";

    var tbl = document.createElement("table");
    tbl.className = "table table-sm";

    function draw(q) {
      q = (q || "").toLowerCase();
      var body = rows.filter(function (x) {
        return !q || (x.palette + " " + x.element + " " + x.hex + " " + x.component).toLowerCase().indexOf(q) > -1;
      }).map(function (x) {
        return "<tr><td>" + esc(x.component) + "</td><td>" + esc(x.palette) + "</td><td>" + esc(x.element)
          + '</td><td><code>' + esc(x.hex) + "</code></td>"
          + '<td><span style="display:inline-block;width:18px;height:18px;border-radius:3px;border:1px solid #DEDEDE;vertical-align:middle;background:'
          + esc(x.hex) + '"></span></td></tr>';
      }).join("");
      tbl.innerHTML = "<thead><tr><th>Component</th><th>Palette</th><th>Element</th><th>Hex</th><th></th></tr></thead><tbody>"
        + body + "</tbody>";
    }

    inp.addEventListener("input", function () { draw(inp.value); });
    draw("");
    look.appendChild(inp);
    look.appendChild(tbl);
  }

  fetch(ROOT + "theme/color-data.json").then(function (r) { return r.json(); }).then(function (rows) {
    rows = rows.filter(function (x) { return x.hex; });

    // Static swatch grids — with optional element exclusion (e.g. show Total/Avg once).
    Array.prototype.forEach.call(document.querySelectorAll("[data-swatches]"), function (host) {
      var filter = host.getAttribute("data-swatches");
      var exclude = (host.getAttribute("data-swatches-exclude") || "")
        .split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var match = rows.filter(function (x) {
        return x.palette && x.palette.indexOf(filter) === 0 && exclude.indexOf(x.element) === -1;
      });
      host.classList.add("swatch-grid");
      host.innerHTML = match.map(swatchHTML).join("");
    });

    // Interactive step pickers.
    Array.prototype.forEach.call(document.querySelectorAll("[data-step-picker]"), function (host) {
      buildPicker(host, PICKERS[host.getAttribute("data-step-picker")] || PICKERS.sequence, rows);
    });

    // Searchable lookup table.
    var look = document.getElementById("color-lookup");
    if (look) buildLookup(look, rows);
  }).catch(function (e) { if (window.console) console.error("[color-render]", e); });
})();
