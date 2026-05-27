/* chart-chooser.js — a client-side wizard that mirrors the chart-chooser skill's
 * six-stage decision logic and lands on 1–3 branded recommendations.
 * No backend: all logic runs in the browser from chooser/chart-chooser.json.
 */
(function () {
  "use strict";

  function siteRoot() {
    var el = document.querySelector('link[href*="site_libs/"], script[src*="site_libs/"]');
    if (el) { var u = el.href || el.src; return u.slice(0, u.indexOf("site_libs/")); }
    return new URL(".", document.baseURI).href;
  }
  var ROOT = (window.NCDPIVega && window.NCDPIVega.root) || siteRoot();

  var DATA = null;
  var state = { answers: {}, flags: {}, step: 0, order: [] };

  var root = document.getElementById("chart-chooser-root");
  if (!root) return;

  fetch(ROOT + "chooser/chart-chooser.json")
    .then(function (r) { return r.json(); })
    .then(function (d) { DATA = d; start(); })
    .catch(function (e) {
      root.innerHTML = '<p role="alert">The Chart Chooser could not load. Please refresh.</p>';
      if (window.console) console.error("[chart-chooser]", e);
    });

  // ---- band → representative category count -----------------------------
  var BAND_COUNT = { one: 1, few: 4, many: 10, lots: 20 };

  // ---- which questions to ask, given answers so far ---------------------
  function questionApplies(q) {
    if (q.id === "categories") {
      return Array.isArray(q.askWhen) &&
        (q.askWhen.indexOf(state.answers.dataShape) > -1 || q.askWhen.indexOf(state.answers.purpose) > -1);
    }
    if (q.id === "delivery") {
      var c = state.answers.categories;
      return c === "many" || c === "lots";
    }
    return true;
  }

  function start() {
    state = { answers: {}, flags: {}, step: 0 };
    render();
  }

  function nextQuestion() {
    // find the next applicable question after current answers
    for (var i = 0; i < DATA.questions.length; i++) {
      var q = DATA.questions[i];
      if (state.answers[q.id] === undefined && questionApplies(q)) return q;
    }
    return null;
  }

  function answeredCount() {
    return DATA.questions.filter(function (q) { return state.answers[q.id] !== undefined; }).length;
  }

  // ---- rendering --------------------------------------------------------
  function render() {
    var q = nextQuestion();
    if (!q) { renderResults(); return; }
    var total = DATA.questions.filter(questionApplies).length;
    var stepNum = answeredCount() + 1;

    var html = '<div class="cc-progress">Step ' + stepNum + " of " + total + "</div>";
    html += '<fieldset class="cc-question"><legend>' + esc(q.title) + "</legend>";
    if (q.help) html += '<p class="cc-help">' + esc(q.help) + "</p>";
    html += '<div class="cc-options">';
    q.options.forEach(function (o) {
      html += '<button type="button" class="cc-option" data-q="' + q.id + '" data-v="' + esc(String(o.value)) + '"'
        + (o.flag ? ' data-flag="' + o.flag + '"' : "") + ">"
        + '<span class="cc-opt-label">' + esc(o.label) + "</span>"
        + (o.desc ? '<span class="cc-opt-desc">' + esc(o.desc) + "</span>" : "")
        + "</button>";
    });
    html += "</div></fieldset>";
    if (state.answers && Object.keys(state.answers).length) {
      html += '<div class="cc-controls"><button type="button" class="cc-back">← Back</button>'
        + '<button type="button" class="cc-restart">Start over</button></div>';
    }
    root.innerHTML = html;
    wire();
  }

  function wire() {
    Array.prototype.forEach.call(root.querySelectorAll(".cc-option"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-q");
        var v = b.getAttribute("data-v");
        if (id === "audience") v = parseInt(v, 10);
        state.answers[id] = v;
        if (b.getAttribute("data-flag")) state.flags[b.getAttribute("data-flag")] = true;
        render();
      });
    });
    var back = root.querySelector(".cc-back");
    if (back) back.addEventListener("click", stepBack);
    var restart = root.querySelector(".cc-restart");
    if (restart) restart.addEventListener("click", start);
  }

  function stepBack() {
    // remove the most recently answered applicable question
    var answered = DATA.questions.filter(function (q) { return state.answers[q.id] !== undefined; });
    if (!answered.length) return;
    var last = answered[answered.length - 1];
    delete state.answers[last.id];
    if (last.id === "dataShape") state.flags.survey = false;
    if (last.id === "purpose") state.flags.delta = false;
    render();
  }

  // ---- the six-stage filter (mirrors decision-tree.md) ------------------
  function recommend() {
    var a = state.answers;
    var repCount = BAND_COUNT[a.categories] || 1;
    var colorOverload = a.categories === "many" || a.categories === "lots";

    // Survey override: curated routing regardless of stated purpose.
    if (state.flags.survey || a.dataShape === "survey") {
      var survey = ["diverging_stacked"];
      // separate bars (use grouped_bar as the common-baseline stand-in) for 4+ levels
      survey.push("grouped_bar");
      if (a.audience === 3) survey.push("box");
      return {
        charts: dedupe(survey).map(byId).filter(Boolean).slice(0, 3),
        messages: ["survey"]
      };
    }

    var pool = DATA.taxonomy.slice();
    // Stage 1: data shape
    pool = pool.filter(function (c) { return c.shapes.indexOf(a.dataShape) > -1; });
    // Stage 2: purpose
    var byPurpose = pool.filter(function (c) { return c.purpose.indexOf(a.purpose) > -1; });
    if (byPurpose.length) pool = byPurpose; // if purpose empties the set, keep shape-only as fallback
    // Stage 3: audience tier
    pool = pool.filter(function (c) { return c.minTier <= a.audience; });
    // Stage 4 + hard constraints: category/color/segment rules
    pool = pool.filter(function (c) {
      if (c.maxCategories && repCount > c.maxCategories) return false;       // e.g. pie >5, bar >15
      if (c.maxSeries && repCount > c.maxSeries) return false;               // line >5 series
      if (c.id === "line" && a.dataShape !== "over_time") return false;      // never line for non-time
      return true;
    });

    // Assemble: rank by (purpose is the chart's primary purpose, then tier, then taxonomy order)
    var idx = {}; DATA.taxonomy.forEach(function (c, i) { idx[c.id] = i; });
    pool.sort(function (x, y) {
      var px = x.purpose[0] === a.purpose ? 0 : 1, py = y.purpose[0] === a.purpose ? 0 : 1;
      if (px !== py) return px - py;
      if (x.minTier !== y.minTier) return x.minTier - y.minTier;
      return idx[x.id] - idx[y.id];
    });

    var picks = [];
    // When there are too many categories, lead with small multiples / highlight-one.
    if (colorOverload) {
      var sm = pool.filter(function (c) { return c.id === "small_multiples"; })[0] || byId("small_multiples");
      if (sm && sm.shapes.indexOf(a.dataShape) > -1) picks.push(sm);
    }
    pool.forEach(function (c) { if (picks.indexOf(c) === -1) picks.push(c); });

    // Ensure at least one tier-1 (familiar) option is present if any exists.
    if (!picks.some(function (c) { return c.minTier === 1; })) {
      var basic = pool.filter(function (c) { return c.minTier === 1; })[0];
      if (basic) picks.unshift(basic);
    }
    picks = dedupe(picks.map(function (c) { return c.id; })).map(byId).filter(Boolean).slice(0, 3);

    // Fallback: nothing matched the shape∩purpose∩tier — recommend by purpose alone.
    if (!picks.length) {
      picks = DATA.taxonomy
        .filter(function (c) { return c.purpose.indexOf(a.purpose) > -1 && c.minTier <= a.audience; })
        .slice(0, 2);
    }

    // Messages
    var msgs = [];
    if (colorOverload) { msgs.push("colorLimit"); msgs.push(a.delivery === "dashboard" ? "highlightOne" : "smallMultiples"); }
    if (state.flags.delta || a.purpose === "deviation") msgs.push("delta");
    if (a.dataShape === "over_time") msgs.push("covidGap");
    return { charts: picks, messages: dedupe(msgs) };
  }

  function byId(id) { return DATA.taxonomy.filter(function (c) { return c.id === id; })[0]; }
  function dedupe(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  // ---- results UI -------------------------------------------------------
  function renderResults() {
    var res = recommend();
    var a = state.answers;
    var html = '<div class="cc-results">';
    html += '<div class="cc-summary"><strong>Your answers:</strong> '
      + summaryText() + ' <button type="button" class="cc-restart">Start over</button></div>';

    html += "<h2>" + (res.charts.length === 1 ? "Recommended chart" : "Recommended charts") + "</h2>";

    if (!res.charts.length) {
      html += "<p>No clean match — try a different goal, or widen the audience.</p>";
    }

    res.charts.forEach(function (c, i) {
      var roleLabel = i === 0 ? "Best fit" : (c.minTier >= 3 ? "Advanced option" : "Alternative");
      html += '<article class="cc-card">';
      html += '<div class="cc-card-head"><h3>' + esc(c.name) + "</h3>"
        + '<span class="cc-tag">' + roleLabel + "</span></div>";
      html += "<p>" + esc(c.why) + "</p>";
      if (c.spec) {
        html += '<div class="ncdpi-vega" data-spec="' + esc(c.spec) + '"></div>';
      } else {
        html += '<p class="cc-noexample">A worked NCDPI example is coming for this chart — see the guidance below.</p>';
      }
      if (c.tips && c.tips.length) {
        html += "<p class=\"cc-tips-h\"><strong>How to build it well</strong></p><ul class=\"cc-tips\">";
        c.tips.forEach(function (t) { html += "<li>" + esc(t) + "</li>"; });
        html += "</ul>";
      }
      if (c.watch) html += '<p class="cc-watch"><strong>Watch out:</strong> ' + esc(c.watch) + "</p>";
      if (a.audience === 3 && c.evidence) html += '<p class="cc-evidence"><strong>Why it works:</strong> ' + esc(c.evidence) + "</p>";
      if (c.page) html += '<p class="cc-more"><a href="' + relink(c.page) + '">More on ' + esc(c.name) + " →</a></p>";
      html += "</article>";
    });

    if (res.messages && res.messages.length) {
      html += '<div class="cc-notes"><h2>Before you build</h2>';
      res.messages.forEach(function (m) {
        if (DATA.messages[m]) html += '<div class="ncdpi-callout tip">' + esc(DATA.messages[m]) + "</div>";
      });
      html += "</div>";
    }
    html += "</div>";
    root.innerHTML = html;

    var restart = root.querySelector(".cc-restart");
    if (restart) restart.addEventListener("click", start);

    // render the live branded examples we just inserted
    renderExamples();
  }

  function renderExamples() {
    var tries = 0;
    (function go() {
      if (window.NCDPIVega && window.NCDPIVega.render) { window.NCDPIVega.render(); return; }
      if (tries++ < 40) setTimeout(go, 100);
    })();
  }

  function relink(page) {
    // pages live at site root; resolve against ROOT for sub-path safety
    return ROOT + page;
  }

  function summaryText() {
    var a = state.answers, parts = [];
    var q = function (id) { return DATA.questions.filter(function (x) { return x.id === id; })[0]; };
    var lab = function (id, val) {
      var qq = q(id); if (!qq) return val;
      var o = qq.options.filter(function (x) { return String(x.value) === String(val); })[0];
      return o ? o.label : val;
    };
    if (a.dataShape) parts.push(lab("dataShape", a.dataShape));
    if (a.purpose) parts.push(lab("purpose", a.purpose));
    if (a.audience) parts.push(lab("audience", a.audience));
    if (a.categories) parts.push(lab("categories", a.categories) + " categories");
    if (a.delivery) parts.push(lab("delivery", a.delivery));
    return parts.map(esc).join(" · ");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
