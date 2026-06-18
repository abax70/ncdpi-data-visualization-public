/* chart-loader.js - render every NCDPI-branded Vega-Lite example on the page.
 *
 * Usage in a .qmd page:
 *   <div class="ncdpi-vega" data-spec="charts/comparison__bar.vl.json"></div>
 *
 * For each such div we:
 *   1. fetch the spec JSON,
 *   2. inject the shared NCDPI theme (theme/ncdpi-vega.json) as `config`,
 *   3. resolve the spec's data URL against the site root,
 *   4. embed with vega-embed.
 *
 * Site-root resolution: GitHub Pages serves this project under a sub-path
 * (https://abax70.github.io/NCDPI-Data-Visualization/) but `quarto preview`
 * serves it at "/". We derive the root from Quarto's own site_libs asset, which
 * Quarto always emits with a correct page-relative path at any depth - far more
 * reliable than guessing "../" counts.
 */
(function () {
  "use strict";

  function siteRoot() {
    var el = document.querySelector('link[href*="site_libs/"], script[src*="site_libs/"]');
    if (el) {
      var url = el.href || el.src;
      return url.slice(0, url.indexOf("site_libs/"));
    }
    // fallbacks
    var self = document.currentScript || document.querySelector("script[data-ncdpi-loader]");
    if (self && self.src) return self.src.replace(/js\/chart-loader\.js.*$/, "");
    return new URL(".", document.baseURI).href;
  }

  var ROOT = siteRoot();
  var themePromise = fetch(ROOT + "theme/ncdpi-vega.json")
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; });

  function resolve(url) {
    if (/^(https?:)?\/\//.test(url) || url.charAt(0) === "/") return url;
    return ROOT + url.replace(/^\.\//, "").replace(/^\.\.\//, "");
  }

  function renderOne(el, theme) {
    if (el.dataset.rendered) return;
    el.dataset.rendered = "1";
    var specUrl = resolve(el.dataset.spec);
    fetch(specUrl)
      .then(function (r) { return r.json(); })
      .then(function (spec) {
        if (spec.data && spec.data.url) spec.data.url = resolve(spec.data.url);
        spec.config = Object.assign({}, theme, spec.config || {});
        if (spec.width == null && spec.autosize == null && !spec.facet && !spec.repeat) {
          spec.width = "container";
        }
        // tooltip:false suppresses Vega-Lite's auto-generated (unformatted) tooltips
        // across every gallery/chooser chart. Tooltip behavior doesn't vary by chart
        // type, so it's taught generically on the chart-elements page instead of being
        // demoed (badly) on 28 specs. The per-spec "tooltip" encodings are now inert;
        // left in place as dead config rather than editing 26 files.
        return vegaEmbed(el, spec, { actions: false, renderer: "svg", tooltip: false }).then(function (result) {
          // Convention 7: render the spec's source note (usermeta.source) as a
          // caption below the chart. Inserted only after a successful embed, and
          // only once (guards against chooser/gallery re-renders).
          var src = spec.usermeta && spec.usermeta.source;
          var sib = el.nextElementSibling;
          if (src && !(sib && sib.classList && sib.classList.contains("ncdpi-chart-source"))) {
            var note = document.createElement("p");
            note.className = "ncdpi-chart-source";
            note.textContent = src;
            el.insertAdjacentElement("afterend", note);
          }
          return result;
        });
      })
      .catch(function (err) {
        el.innerHTML =
          '<p role="alert" style="color:#B33A12;font-style:italic">Chart could not be loaded.</p>';
        if (window.console) console.error("[ncdpi-vega] failed:", specUrl, err);
      });
  }

  function renderAll() {
    var nodes = document.querySelectorAll(".ncdpi-vega[data-spec]");
    if (!nodes.length) return;
    themePromise.then(function (theme) {
      Array.prototype.forEach.call(nodes, function (el) { renderOne(el, theme); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAll);
  } else {
    renderAll();
  }

  // expose for the chart-chooser, which injects example divs after page load
  window.NCDPIVega = {
    root: ROOT,
    theme: themePromise,
    render: renderAll
  };
})();
