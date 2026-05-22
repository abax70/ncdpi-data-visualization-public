/* color-render.js — render brand colour swatches and the searchable lookup
 * table from the generated theme/color-data.json (sourced from the brand CSV).
 *
 *   <div data-swatches="Groups: 6"></div>      one palette as chips
 *   <div data-swatches="Sequence to Good"></div> all matching palettes
 *   <div id="color-lookup"></div>              searchable full table
 */
(function () {
  "use strict";
  function siteRoot() {
    var el = document.querySelector('link[href*="site_libs/"], script[src*="site_libs/"]');
    if (el) { var u = el.href || el.src; return u.slice(0, u.indexOf("site_libs/")); }
    return new URL(".", document.baseURI).href;
  }
  var ROOT = (window.NCDPIVega && window.NCDPIVega.root) || siteRoot();

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function readable(hex) {
    var c = (hex || "").replace("#", ""); if (c.length !== 6) return "#000";
    var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1A2128" : "#FFFFFF";
  }

  fetch(ROOT + "theme/color-data.json").then(function (r) { return r.json(); }).then(function (rows) {
    rows = rows.filter(function (x) { return x.hex; });

    // swatch grids
    Array.prototype.forEach.call(document.querySelectorAll("[data-swatches]"), function (host) {
      var filter = host.getAttribute("data-swatches");
      var match = rows.filter(function (x) { return x.palette && x.palette.indexOf(filter) === 0; });
      host.classList.add("swatch-grid");
      host.innerHTML = match.map(function (x) {
        return '<div class="swatch"><div class="chip" style="background:' + esc(x.hex) + ';color:' + readable(x.hex) + '">'
          + esc(x.element || "") + '</div><div class="meta"><div class="name">' + esc(x.palette) + '</div>'
          + '<div class="hex">' + esc(x.hex) + "</div></div></div>";
      }).join("");
    });

    // lookup table
    var look = document.getElementById("color-lookup");
    if (look) {
      var inp = document.createElement("input");
      inp.type = "search"; inp.placeholder = "Filter by palette, element, or hex…"; inp.className = "form-control"; inp.style.maxWidth = "420px"; inp.style.marginBottom = "0.8rem";
      var tbl = document.createElement("table"); tbl.className = "table table-sm";
      function draw(q) {
        q = (q || "").toLowerCase();
        var body = rows.filter(function (x) {
          return !q || (x.palette + " " + x.element + " " + x.hex + " " + x.component).toLowerCase().indexOf(q) > -1;
        }).map(function (x) {
          return "<tr><td><span style=\"display:inline-block;width:18px;height:18px;border-radius:3px;border:1px solid #DEDEDE;vertical-align:middle;background:"
            + esc(x.hex) + "\"></span></td><td>" + esc(x.component) + "</td><td>" + esc(x.palette) + "</td><td>" + esc(x.element)
            + '</td><td><code>' + esc(x.hex) + "</code></td></tr>";
        }).join("");
        tbl.innerHTML = "<thead><tr><th></th><th>Component</th><th>Palette</th><th>Element</th><th>Hex</th></tr></thead><tbody>" + body + "</tbody>";
      }
      inp.addEventListener("input", function () { draw(inp.value); });
      draw("");
      look.appendChild(inp); look.appendChild(tbl);
    }
  }).catch(function (e) { if (window.console) console.error("[color-render]", e); });
})();
