/* map-maker.js — NCDPI Map-Maker (Phases 1–2).
 *
 * Turns a user-supplied district/county/region CSV into an on-brand NC map,
 * with PNG export. A numeric value column becomes a binned choropleth; a
 * text value column becomes a categorical (colored-group) map — "these 27
 * counties have program A, these 42 program B" (SUB-003-03).
 *
 * Privacy architecture: EVERYTHING runs client-side. The user's file is read
 * with FileReader in their own browser and is never transmitted anywhere —
 * there is no server to send it to. (The soft PII gate lands in Phase 2;
 * Phase 1 carries the row-count sanity check.)
 *
 * Expects the page to provide:
 *   <div id="map-maker-root"></div>
 * plus vega/vega-lite/vega-embed already loaded (the site injects them on
 * every page via _includes/chart-scripts.html; the test harness pins the
 * same versions).
 *
 * Site-root resolution copies chart-loader.js: derive ROOT from this
 * script's own src so paths work on the live sub-path, local preview, and
 * the map-maker/test-mvp.html harness alike.
 */
(function () {
  "use strict";

  // ---------- site root + shared brand theme ----------

  function siteRoot() {
    var self = document.currentScript || document.querySelector("script[data-ncdpi-mapmaker]");
    if (self && self.src) return self.src.replace(/js\/map-maker\.js.*$/, "");
    var el = document.querySelector('link[href*="site_libs/"], script[src*="site_libs/"]');
    return el ? (el.href || el.src).replace(/site_libs\/.*$/, "") : "";
  }
  var ROOT = siteRoot();

  // Brand sequential palettes (from site/theme/color-data.json — Sequence to
  // Good / Bad / Neutral, 3–5 steps). Hardcoded rather than fetched: these are
  // stable brand constants and the palette JSON isn't keyed for lookup.
  // If the brand CSV changes, re-copy from color-data.json.
  var PALETTES = {
    good: {
      3: ["#A9BEC6", "#6D9CAC", "#077890"],
      4: ["#B6C6CC", "#8BAEB9", "#5C93A6", "#077890"],
      5: ["#BECBCF", "#9DB8C1", "#7AA3B1", "#508EA2", "#077890"]
    },
    bad: {
      3: ["#E2A996", "#D37355", "#B33A12"],
      4: ["#E3B6A8", "#DC8F76", "#CD6544", "#B33A12"],
      5: ["#E4BEB2", "#E09F89", "#D77F62", "#C85D3A", "#B33A12"]
    },
    neutral: {
      3: ["#B2BFD3", "#85A2C8", "#5085BC"],
      4: ["#BDC7D6", "#9CB0CD", "#799AC5", "#5085BC"],
      5: ["#C4CBD7", "#A9B9D1", "#8EA7CA", "#7196C3", "#5085BC"]
    }
  };
  // Brand diverging palettes (rust below, grey mid, teal above), same source.
  // Odd step counts only — the grey middle bin straddles the reference value.
  var DIVERGING = {
    3: ["#B33A12", "#DEDEDE", "#077890"],
    5: ["#B33A12", "#C88C78", "#DEDEDE", "#86A4AE", "#077890"],
    7: ["#B33A12", "#C26F54", "#D1BCB5", "#DEDEDE", "#B9C4C7", "#6593A1", "#077890"],
    9: ["#B33A12", "#BE6143", "#CC9F91", "#D5CBC8", "#DEDEDE", "#CACFD1", "#9AB0B7", "#548B9C", "#077890"]
  };
  // Brand categorical palette ("Groups: 2–6" in color-data.json; the
  // Total/Avg navy is deliberately excluded — it means "summary", not a
  // category). Categories take these in frequency order, largest group first.
  var GROUPS = {
    2: ["#5085BC", "#FF9015"],
    3: ["#5085BC", "#FF9015", "#922880"],
    4: ["#5085BC", "#FF9015", "#922880", "#3D803F"],
    5: ["#5085BC", "#FF9015", "#922880", "#3D803F", "#D3B10B"],
    6: ["#5085BC", "#FF9015", "#922880", "#3D803F", "#D3B10B", "#BE7EB3"]
  };
  // color-groups.qmd: five is the practical max, six the grudging ceiling.
  var MAX_CATEGORIES = 6;
  // The per-category picker offers brand colors only: the six Groups hues
  // plus the Data Highlight navy and neutral grey. Greying most groups and
  // navy-ing one IS the highlight map (Convention 5 / color-highlights).
  var CATEGORY_COLORS = [
    { hex: "#5085BC", label: "Blue" },
    { hex: "#FF9015", label: "Orange" },
    { hex: "#922880", label: "Purple" },
    { hex: "#3D803F", label: "Green" },
    { hex: "#D3B10B", label: "Gold" },
    { hex: "#BE7EB3", label: "Light purple" },
    { hex: "#003A70", label: "Navy — highlight" },
    { hex: "#B7B9BB", label: "Grey — background" }
  ];
  // Red-green CVD collapse pairs among the brand colors offered above.
  // Measured session 35 with a Vienot (1999) dichromacy simulation +
  // CIEDE2000: under deuteranopia the Cat 2 orange #FF9015 simulates to
  // #BEBE00 and the Cat 5 gold #D3B10B to #BDBD00 — the SAME color, not
  // merely a similar one (dE00 0.3; 3.9 under protanopia). Blue vs light
  // purple is a milder protanopia collapse (6.9). Both pairs appear in the
  // DEFAULT assignment at 5 and 6 categories, which is the whole reason this
  // warning exists: on a categorical map, hue is the sole carrier of group
  // identity — there are no positions or labels doing the identifying the way
  // there are on a bar chart.
  //
  // Deliberately scoped to red-green deficiency: it affects ~8% of men and is
  // the exact case foundations/color-groups.qmd's accessibility callout
  // promises the palette handles. Tritanopia also collapses blue/green, but
  // it affects ~0.01% of people and firing on it would warn on the ordinary
  // 4-category map for a vanishingly rare condition.
  var CVD_COLLAPSE_PAIRS = [
    { a: "#FF9015", b: "#D3B10B", label: "orange and gold" },
    { a: "#5085BC", b: "#BE7EB3", label: "blue and light purple" }
  ];

  // Which assigned category colors collide for a red-green colorblind reader.
  // Runs against the colors actually in play, so recoloring a group via the
  // picker clears the warning instead of leaving a stale scold on screen.
  function cvdCollisions(cats) {
    var byHex = {};
    cats.forEach(function (c) { byHex[String(c.color).toUpperCase()] = c.name; });
    var hits = [];
    CVD_COLLAPSE_PAIRS.forEach(function (p) {
      var na = byHex[p.a], nb = byHex[p.b];
      if (na && nb) hits.push({ names: [na, nb], label: p.label });
    });
    return hits;
  }

  var NO_DATA_FILL = "#F0F0F0";   // matches the site's exemplar choropleth
  var SOURCE_GREY = "#525A60";    // C7 source-note color

  // The three geographies the app can map. Each carries its TopoJSON layer
  // (built by tools/build_map_geo.py, Phase 0), the feature property the
  // user's rows join to, and the vocabulary the UI uses to talk about it.
  var GEOS = {
    district: {
      noun: "district", plural: "districts", described: "school districts",
      count: 115,
      url: "data/nc-school-districts.topojson", feature: "districts",
      lookupField: "properties.LEA",
      tooltipField: "properties.LEA_Name", tooltipTitle: "District"
    },
    county: {
      noun: "county", plural: "counties", described: "counties",
      count: 100,
      url: "data/nc-counties.topojson", feature: "counties",
      lookupField: "properties.county_code",
      tooltipField: "properties.county", tooltipTitle: "County"
    },
    region: {
      noun: "SBE region", plural: "SBE regions",
      described: "State Board of Education regions",
      count: 8,
      url: "data/nc-sbe-regions.topojson", feature: "regions",
      lookupField: "properties.region_num",
      tooltipField: "properties.region", tooltipTitle: "Region"
    }
  };

  // ---------- tiny CSV parser (quoted fields, commas, CRLF) ----------

  function parseCSV(text) {
    var rows = [], row = [], field = "", inQuotes = false, i = 0, c;
    text = text.replace(/^﻿/, ""); // strip BOM (Excel loves these)
    while (i < text.length) {
      c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
        if (c === '"') { inQuotes = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    // drop fully-empty trailing rows
    rows = rows.filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
    if (rows.length < 2) return null;
    var header = rows[0].map(function (h) { return h.trim(); });
    return {
      columns: header,
      rows: rows.slice(1).map(function (r) {
        var o = {};
        header.forEach(function (h, j) { o[h] = (r[j] === undefined ? "" : r[j]).trim(); });
        return o;
      })
    };
  }

  // ---------- district matching ----------

  // Normalize a district name for matching: lowercase, strip punctuation,
  // drop generic suffix words so "Alamance-Burlington Schools", "ALAMANCE
  // BURLINGTON" and "Alamance-Burlington School System" all meet in the middle.
  function normName(s) {
    var t = String(s).toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(public|school|schools|system|board of education)\b/g, " ")
      .replace(/\s+/g, " ").trim();
    return t;
  }

  // Looser second tier: also drop geography words, so "Winston Salem Forsyth"
  // or "Chapel Hill-Carrboro" (no "City Schools") still land. Only consulted
  // when the strict tier misses; verified collision-free across all 115
  // official + short names (2026-07-07), and the build-time guard below drops
  // any alias that ever becomes ambiguous.
  function normLoose(s) {
    return normName(s).replace(/\b(county|city|graded|district)\b/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  var crosswalk = null;      // [{lea, lea_name_short, lea_name, county, region, region_num}]
  var nameIndex = null;      // strict tier: normalized name -> lea
  var looseIndex = null;     // loose tier: geo words removed -> lea
  var countyIndex = null;    // normalized county name -> county_code (1..100, alphabetical)
  var countyCodes = null;    // set of valid county codes
  var regionIndex = null;    // normalized region name -> region_num (1..8)
  var regionNums = null;     // set of valid region numbers

  function buildNameIndex(xw, normalizer) {
    var idx = {}, collided = {};
    function add(alias, lea) {
      var key = normalizer(alias);
      if (!key) return;
      if (key in idx && idx[key] !== lea) { collided[key] = true; return; }
      idx[key] = lea;
    }
    xw.forEach(function (d) {
      add(d.lea_name, d.lea);
      add(d.lea_name_short, d.lea);
      // "X County Schools" is often written just "X County" or "X"
      add(d.lea_name_short + " county", d.lea);
    });
    Object.keys(collided).forEach(function (k) { delete idx[k]; });
    return idx;
  }

  function matchDistrict(s) {
    if (/^\d+$/.test(s)) {               // numeric code, "10" or zero-padded "010"
      var code = parseInt(s, 10);
      return crosswalk.some(function (d) { return d.lea === code; }) ? code : null;
    }
    var strict = normName(s);
    if (strict in nameIndex) return nameIndex[strict];
    var loose = normLoose(s);
    return (loose in looseIndex) ? looseIndex[loose] : null;
  }

  function normCounty(s) {
    return normName(s).replace(/\bcounty\b/g, " ").replace(/\s+/g, " ").trim();
  }

  // Counties join on the DPI county code (1..100, alphabetical). Numeric
  // cells: a bare 1..100 is that code; NC county FIPS codes are the odd
  // numbers 001..199 with code = (FIPS+1)/2, accepted as "37157" or "157"
  // (values 101..199 can't be a DPI code, so the odd ones read as FIPS).
  function matchCounty(s) {
    if (/^\d+$/.test(s)) {
      var n = parseInt(s, 10);
      if (n >= 37001 && n <= 37199) {
        // Full FIPS "37xxx" is unambiguous — always convert, even when the
        // county part is ≤ 100 (e.g. 37067 Forsyth). Reading it as a DPI
        // code here was a real bug: 37067 mapped to county code 67, the
        // wrong county. NC county FIPS parts are the odd numbers 1..199;
        // an even part is not a NC county.
        n -= 37000;
        return (n % 2 === 1 && countyCodes[(n + 1) / 2]) ? (n + 1) / 2 : null;
      }
      if (n > 100 && n <= 199 && n % 2 === 1) n = (n + 1) / 2; // bare FIPS "157"
      return countyCodes[n] ? n : null;
    }
    var key = normCounty(s);
    return (key in countyIndex) ? countyIndex[key] : null;
  }

  // Regions join on region_num (1..8). Accepts the number, the canonical
  // name in any casing/punctuation, or "Region 5"-style labels.
  function matchRegion(s) {
    var t = normName(s).replace(/\bregion\b/g, " ").replace(/\s+/g, " ").trim();
    if (/^\d+$/.test(t)) {
      var n = parseInt(t, 10);
      return regionNums[n] ? n : null;
    }
    return (t in regionIndex) ? regionIndex[t] : null;
  }

  // Match one cell value to the selected geography's join key. Returns the
  // integer key (LEA / county code / region number) or null.
  function matchValue(v) {
    var s = String(v).trim();
    if (!s) return null;
    if (state.geo === "county") return matchCounty(s);
    if (state.geo === "region") return matchRegion(s);
    return matchDistrict(s);
  }

  // ---------- state + rendering ----------

  var state = {
    geo: "district",    // which GEOS entry the rows join to
    table: null,        // parsed user CSV
    joinCol: null, measureCol: null,
    // "numeric" (binned choropleth) or "categorical" (colored groups) —
    // derived from the selected value column, never asked directly.
    mode: "numeric",
    catColors: {},      // user color overrides: category norm -> hex
    catsFor: null,      // value column the overrides belong to
    matches: null,      // {byKey: {key: value}, matched, unmatched, dup, stats, categories}
    valence: "good", steps: 5,
    // The reference-point (anchoring) wizard — Tableau's "full color range"
    // question made explicit. "data": darkest = the data max (compare
    // districts). "goal": darkest = a target the user names (distance to
    // goal). "reference": diverge around a reference value (grey straddles
    // it) — the state-average comparison, which is the same reference-point
    // question and therefore lives in this one flow.
    anchor: "data",
    goal: 100,          // goal-anchored: the value the darkest step means
    center: null,       // reference-anchored: the diverging midpoint
    statsFor: null,     // measure column the goal/center defaults came from
    title: "", subtitle: "", source: "", legendTitle: "",
    view: null          // live vega view, for export
  };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function $(id) { return document.getElementById(id); }

  // Category normalization: casing/whitespace variants ("Hybrid", "hybrid",
  // " hybrid ") are the same category. The canonical display spelling is
  // picked later (most common wins).
  function catNorm(s) {
    return String(s).replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Profile a column: is it numeric (≥80% of non-empty cells parse), how
  // dense is it, and how many distinct normalized values does it hold?
  function columnProfile(table, col) {
    var nonEmpty = 0, numeric = 0, distinct = {};
    table.rows.forEach(function (r) {
      var v = r[col];
      if (v === "" || v === undefined) return;
      nonEmpty++;
      if (isFinite(Number(v))) numeric++;
      distinct[catNorm(v)] = true;
    });
    return {
      nonEmpty: nonEmpty,
      isNumeric: nonEmpty > 0 && numeric >= nonEmpty * 0.8,
      distinct: Object.keys(distinct).length
    };
  }

  // Auto-detect: the join column is whichever column matches the most
  // geographies; the value column is the first dense mostly-numeric other
  // column, else the text column with the tightest small set of repeated
  // labels (a program/status column — the categorical case).
  //
  // ⚠️ A SECOND column can also resolve to geographies. A district export
  // routinely carries both a name and an LEA code, and our own starter
  // spreadsheet ships "District, LEA Code, Value". Such a column is a second
  // *identifier*, never the measure — and because it is numeric it used to
  // win the measure slot outright, drawing a confident binned choropleth
  // colored by district ID while silently ignoring the user's real data.
  // (Found session 35 by driving the shipped starter through the app; the
  // counties starter has one identifier column, which is why nothing caught
  // it.) So score every column's geography hits once, then disqualify any
  // non-join column that resolves nearly as well as the join column does.
  function detectColumns(table) {
    var hitsBy = {}, best = null, bestHits = 0;
    table.columns.forEach(function (col) {
      var hits = 0;
      table.rows.forEach(function (r) { if (matchValue(r[col]) !== null) hits++; });
      hitsBy[col] = hits;
      if (hits > bestHits) { bestHits = hits; best = col; }
    });
    // A genuine measure resolves to few or no geographies. The 0.9 bar keeps
    // an ordinary numeric column eligible even when some of its values
    // coincidentally look like DPI codes (a count of 1–100, say), while a
    // parallel identifier — which resolves essentially every row, like the
    // join column — is excluded.
    function isSecondIdentifier(col) {
      return bestHits > 0 && hitsBy[col] >= bestHits * 0.9;
    }
    var measure = null, catCandidate = null, catDistinct = Infinity, firstOther = null;
    table.columns.forEach(function (col) {
      if (col === best) return;
      if (isSecondIdentifier(col)) return;
      if (firstOther === null) firstOther = col;
      var p = columnProfile(table, col);
      if (p.nonEmpty < table.rows.length * 0.8) return;
      if (p.isNumeric) { if (!measure) measure = col; return; }
      if (p.distinct >= 2 && p.distinct <= 12 && p.distinct < catDistinct) {
        catCandidate = col; catDistinct = p.distinct;
      }
    });
    // Fall back to the first non-identifier column rather than leaving this
    // null: an unset <select> silently defaults to its first option, which is
    // the join column, and mapping a column against itself is never right.
    // On the starter's still-empty Value column this yields the honest
    // "0 of 115 matched — (no value)" report instead of a bogus map.
    return { join: best, measure: measure || catCandidate || firstOther, hits: bestHits };
  }

  // Group matched category values: collapse normalized variants, pick the
  // most common spelling as the display name, order by frequency (largest
  // first, ties alphabetical), and assign colors — user overrides first,
  // then the Groups ramp for the category count.
  function buildCategories(byKey) {
    var groups = {};   // norm -> {count, spellings: {raw: n}}
    Object.keys(byKey).forEach(function (k) {
      var raw = byKey[k], norm = catNorm(raw);
      var g = groups[norm] || (groups[norm] = { count: 0, spellings: {} });
      g.count++;
      g.spellings[raw] = (g.spellings[raw] || 0) + 1;
    });
    var list = Object.keys(groups).map(function (norm) {
      var g = groups[norm];
      var name = Object.keys(g.spellings).sort(function (a, b) {
        return g.spellings[b] - g.spellings[a] || (a < b ? -1 : 1);
      })[0];
      return { norm: norm, name: name, count: g.count };
    });
    list.sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
    var ramp = GROUPS[Math.min(Math.max(list.length, 2), MAX_CATEGORIES)];
    list.forEach(function (c, i) {
      c.color = state.catColors[c.norm] || ramp[i % ramp.length];
    });
    return list;
  }

  function computeMatches() {
    var isCat = state.mode === "categorical";
    var byKey = {}, unmatched = [], dup = [];
    state.table.rows.forEach(function (r) {
      var key = matchValue(r[state.joinCol]);
      if (key === null) { unmatched.push(r[state.joinCol]); return; }
      if (byKey.hasOwnProperty(key)) { dup.push(r[state.joinCol]); return; }
      if (isCat) {
        var raw = String(r[state.measureCol] === undefined ? "" : r[state.measureCol]).replace(/\s+/g, " ").trim();
        if (raw === "") { unmatched.push(r[state.joinCol] + " (no value)"); return; }
        byKey[key] = raw;
      } else {
        var val = Number(r[state.measureCol]);
        if (r[state.measureCol] === "" || !isFinite(val)) { unmatched.push(r[state.joinCol] + " (no numeric value)"); return; }
        byKey[key] = val;
      }
    });
    // Numeric: stats feed the wizard (goal/center defaults + card captions).
    // Categorical: the category list plays that role; stats stays null,
    // which is also what keeps the anchor-card previews dormant.
    var stats = null, categories = null;
    if (isCat) {
      categories = buildCategories(byKey);
    } else {
      var vals = Object.keys(byKey).map(function (k) { return byKey[k]; });
      if (vals.length) {
        var sum = vals.reduce(function (a, b) { return a + b; }, 0);
        stats = {
          min: Math.min.apply(null, vals),
          max: Math.max.apply(null, vals),
          mean: Math.round((sum / vals.length) * 10) / 10
        };
      }
    }
    state.matches = { byKey: byKey, matched: Object.keys(byKey).length, unmatched: unmatched, dup: dup, stats: stats, categories: categories };
  }

  // Round the data range out so that (a) the bounds are readable numbers and
  // (b) the span divides evenly by the bin count — every bin boundary lands
  // on a clean multiple, so the legend can label all of them (C14: label both
  // ends; color-sequences page: even color steps imply even bins).
  function niceDomain(values, nBins) {
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) { min -= 1; max += 1; }
    var raw = (max - min) / nBins;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var units = [1, 2, 5, 10, 20, 50, 100].map(function (u) { return u * mag; });
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var start = Math.floor(min / u) * u;
      if (start + nBins * u >= max) {
        // strip float noise (0.30000000000000004 -> 0.3)
        var end = Math.round((start + nBins * u) * 1e6) / 1e6;
        return [Math.round(start * 1e6) / 1e6, end];
      }
    }
    return [min, max]; // unreachable, but never return undefined
  }

  // Every bin boundary, for explicit legend labels (ends included).
  function binBoundaries(domain, nBins) {
    var out = [], step = (domain[1] - domain[0]) / nBins;
    for (var i = 0; i <= nBins; i++) {
      out.push(Math.round((domain[0] + i * step) * 1e6) / 1e6);
    }
    return out;
  }

  // Goal-anchored domain: the TOP boundary is the goal itself (darkest step
  // ends exactly there); the bottom extends down in clean equal steps until
  // all the data fits. Values above the goal (rare but possible) simply take
  // the darkest color — vega's quantize scale clamps out-of-domain values.
  function goalDomain(values, nBins, goal) {
    var min = Math.min.apply(null, values);
    if (min >= goal) min = goal - 1; // degenerate: everything at/above goal
    var raw = (goal - min) / nBins;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var units = [1, 2, 5, 10, 20, 50, 100].map(function (u) { return u * mag; });
    for (var i = 0; i < units.length; i++) {
      var start = goal - nBins * units[i];
      if (start <= min) return [Math.round(start * 1e6) / 1e6, goal];
    }
    return [min, goal]; // unreachable, but never return undefined
  }

  // Reference-anchored (diverging) domain: symmetric around the reference so
  // the grey middle bin straddles it, with a clean step size wide enough to
  // cover whichever side of the data spreads farther. Symmetry is deliberate:
  // equal color intensity means equal distance from the reference, even when
  // the data is lopsided (one side of the ramp may go unused — that's honest).
  function divergingDomain(values, nBins, center) {
    var spread = Math.max.apply(null, values.map(function (v) { return Math.abs(v - center); }));
    if (spread === 0) spread = 1;
    var half = nBins / 2;            // bins on each side of the center
    var raw = spread / half;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    // Finer unit ladder than the sequential domains: a 1/2/5 ladder can leave
    // the data covering barely half the domain (spread 6.4 → ±12.5), so the
    // darkest diverging colors would never appear. Worst case here is ~75%.
    var units = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 60, 100].map(function (u) { return u * mag; });
    for (var i = 0; i < units.length; i++) {
      if (half * units[i] >= spread) {
        var d = half * units[i];
        return [Math.round((center - d) * 1e6) / 1e6, Math.round((center + d) * 1e6) / 1e6];
      }
    }
    return [center - spread, center + spread];
  }

  // Smallest 1/2/5×10^k at or above x — the goal default when the data isn't
  // on a 0–100 scale (counts: max 8,314 → goal 10,000).
  function niceCeilAbove(x) {
    var mag = Math.pow(10, Math.floor(Math.log10(x)));
    var c = [1, 2, 5, 10].map(function (u) { return u * mag; });
    for (var i = 0; i < c.length; i++) { if (c[i] >= x) return c[i]; }
    return 10 * mag;
  }

  // The color scale for a given anchor mode + step count, from the user's
  // matched values. Shared by the real map and the wizard's preview cards.
  function scaleFor(anchor, nSteps) {
    var m = state.matches;
    var vals = Object.keys(m.byKey).map(function (k) { return m.byKey[k]; });
    if (anchor === "goal") {
      return { domain: goalDomain(vals, nSteps, state.goal), range: PALETTES[state.valence][nSteps] };
    }
    if (anchor === "reference") {
      var colors = DIVERGING[nSteps].slice();
      // Diverging always reads "rust = the bad side": flip when high = worse.
      if (state.valence === "bad") colors.reverse();
      return { domain: divergingDomain(vals, nSteps, state.center), range: colors };
    }
    return { domain: niceDomain(vals, nSteps), range: PALETTES[state.valence][nSteps] };
  }

  // Categorical spec: nominal fill from the assigned category colors, a
  // swatch legend whose labels carry the counts ("Program A (27)") — the
  // map's message is literally "these 27 counties…", and the counts feed
  // the alt text too. C9 white boundaries and the no-data grey are shared
  // with the numeric map.
  function buildCatSpec() {
    var m = state.matches, geo = GEOS[state.geo];
    var cats = m.categories;
    var nameOf = {};
    cats.forEach(function (c) { nameOf[c.norm] = c.name; });
    var values = Object.keys(m.byKey).map(function (k) {
      return { key: parseInt(k, 10), value: nameOf[catNorm(m.byKey[k])] };
    });
    var legendTitle = state.legendTitle || state.measureCol;
    var countLabel = {};
    cats.forEach(function (c) { countLabel[c.name] = c.name + " (" + c.count + ")"; });

    var description = "Map of North Carolina " + geo.described + " colored by " +
      legendTitle + ". " +
      cats.map(function (c) {
        return c.name + " — " + c.count + " " + (c.count === 1 ? geo.noun : geo.plural);
      }).join("; ") +
      ". " + m.matched + " of " + geo.count + " " + geo.plural + " have data" +
      (m.matched < geo.count ? "; " + geo.plural + " without data are shown in light grey." : ".");

    return {
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": description,
      "title": {
        "text": state.title || "Untitled map",
        "subtitle": state.subtitle || ""
      },
      "data": {
        "url": ROOT + geo.url,
        "format": { "type": "topojson", "feature": geo.feature }
      },
      "transform": [{
        "lookup": geo.lookupField,
        "from": { "data": { "values": values }, "key": "key", "fields": ["value"] }
      }],
      "width": 720,
      "height": 340,
      "projection": { "type": "mercator" },
      "mark": { "type": "geoshape", "stroke": "white", "strokeWidth": 0.5, "color": NO_DATA_FILL },
      "encoding": {
        // A conditional encoding, not a bare field: with a plain nominal
        // scale vega-lite silently SKIPS lookup-miss features (they render
        // with no fill at all — the state outline vanishes). The condition
        // routes valid values through the scale and gives everything else
        // the no-data grey, matching the numeric map's behavior.
        "color": {
          "condition": {
            "test": "isValid(datum.value)",
            "field": "value",
            "type": "nominal",
            "title": legendTitle,
            "scale": { "domain": cats.map(function (c) { return c.name; }),
                       "range": cats.map(function (c) { return c.color; }) },
            "legend": {
              "orient": "bottom", "direction": "horizontal",
              "symbolType": "square", "titleLimit": 320, "labelLimit": 300,
              // JSON.stringify escapes any quotes a category name carries, so
              // the vega expression stays well-formed for arbitrary labels.
              "labelExpr": "(" + JSON.stringify(countLabel) + ")[datum.value] || datum.value"
            }
          },
          "value": NO_DATA_FILL
        },
        "tooltip": [
          { "field": geo.tooltipField, "title": geo.tooltipTitle },
          { "field": "value", "title": legendTitle }
        ]
      },
      "usermeta": { "source": state.source }
    };
  }

  function buildSpec() {
    if (state.mode === "categorical") return buildCatSpec();
    var m = state.matches, geo = GEOS[state.geo];
    var values = Object.keys(m.byKey).map(function (k) {
      return { key: parseInt(k, 10), value: m.byKey[k] };
    });
    var sc = scaleFor(state.anchor, state.steps);
    var domain = sc.domain, colors = sc.range;
    var legendTitle = state.legendTitle || state.measureCol;

    // Auto-drafted alt text (editable export comes in Phase 3). Say what the
    // colors are anchored to — that's the map's reading instruction.
    var anchorNote = "";
    if (state.anchor === "goal") {
      anchorNote = " The darkest color marks the goal of " + state.goal + ".";
    } else if (state.anchor === "reference") {
      anchorNote = " Colors diverge from the reference value of " + state.center +
        ": grey near it, " + (state.valence === "bad" ?
          "teal below and rust above." : "rust below and teal above.");
    }
    var description = "Choropleth map of North Carolina " + geo.described + " shaded by " +
      legendTitle + ". Values range from about " + domain[0] + " to " + domain[1] +
      "." + anchorNote + " " + m.matched + " of " + geo.count + " " + geo.plural + " have data" +
      (m.matched < geo.count ? "; " + geo.plural + " without data are shown in light grey." : ".");

    return {
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": description,
      "title": {
        "text": state.title || "Untitled map",
        "subtitle": state.subtitle || ""
      },
      "data": {
        "url": ROOT + geo.url,
        "format": { "type": "topojson", "feature": geo.feature }
      },
      "transform": [{
        "lookup": geo.lookupField,
        "from": { "data": { "values": values }, "key": "key", "fields": ["value"] }
      }],
      "width": 720,
      "height": 340,
      "projection": { "type": "mercator" },
      // C9: white boundaries separate abutting fills; light-grey fill is the
      // no-data fallback (lookup miss leaves `value` undefined).
      "mark": { "type": "geoshape", "stroke": "white", "strokeWidth": 0.5, "color": NO_DATA_FILL },
      "encoding": {
        "color": {
          "field": "value",
          "type": "quantitative",
          "title": legendTitle,
          "scale": { "type": "quantize", "domain": domain, "range": colors },
          "legend": {
            "orient": "bottom", "direction": "horizontal",
            // C14: label EVERY bin boundary, both ends included, not just
            // the interior ticks vega picks by default.
            "values": binBoundaries(domain, state.steps),
            // Vega quirk: a discrete gradient legend renders the FIRST
            // explicit value's label as empty text (it labels segment right
            // edges), silently dropping the left end. labelExpr rebuilds
            // every label from datum.value, which restores it.
            "labelExpr": "format(datum.value, '~f')",
            "format": "~f", "titleLimit": 320,
            // Never let vega hide "overlapping" boundary labels (it fades
            // alternates to opacity 0 — C14 violation by another road).
            // render() widens the gradient per step count so they truly fit;
            // gradientLength can't live here (VL drops it from an encoding
            // legend block — config-level only).
            "labelOverlap": false
          }
        },
        "tooltip": [
          { "field": geo.tooltipField, "title": geo.tooltipTitle },
          { "field": "value", "title": legendTitle, "format": ".1f" }
        ]
      },
      "usermeta": { "source": state.source }
    };
  }

  function render() {
    if (!state.table || !state.matches || !state.measureCol) return;
    if (state.mode === "categorical") {
      var cats = state.matches.categories || [];
      if (!cats.length) return;   // zero matched rows — nothing to draw
      if (cats.length > MAX_CATEGORIES) {
        // Too many groups to color honestly — say so where the map goes;
        // renderCatList() explains it in the wizard too.
        $("mm-chart").textContent = "This column has " + cats.length +
          " different values — a map can carry at most " + MAX_CATEGORIES +
          " groups (5 reads better). Combine small groups into an " +
          "“Other” category, or pick a different column.";
        $("mm-export").disabled = true;
        return;
      }
    } else if (!state.matches.stats) {
      return;   // stats == null means zero matched rows — nothing to scale
    }
    var spec = buildSpec();
    var target = $("mm-chart");
    fetchTheme().then(function (theme) {
      spec.config = Object.assign({}, theme, spec.config || {});
      // Widen the gradient so every bin-boundary label fits (~48px per bin).
      // Config-level because vega-lite drops gradientLength from an
      // encoding-level legend block. Deep-merge so the theme's legend fonts
      // and colors survive.
      spec.config.legend = Object.assign({}, theme.legend || {}, {
        gradientLength: Math.max(200, 48 * state.steps)
      });
      return vegaEmbed(target, spec, { actions: false, renderer: "svg" });
    }).then(function (result) {
      state.view = result.view;
      // C7: source note as an HTML caption below the embed, chart-loader style.
      var cap = $("mm-source-caption");
      cap.textContent = state.source;
      cap.style.display = state.source ? "block" : "none";
      $("mm-export").disabled = false;
    }).catch(function (err) {
      target.textContent = "Could not render the map: " + (err && err.message ? err.message : err);
    });
  }

  var themeCache = null;
  function fetchTheme() {
    if (themeCache) return themeCache;
    themeCache = (window.NCDPIVega && window.NCDPIVega.theme) ||
      fetch(ROOT + "theme/ncdpi-vega.json").then(function (r) { return r.json(); });
    return themeCache;
  }

  // ---------- wizard previews: mini maps of the user's OWN data ----------

  // Each anchor card carries a small live choropleth so the choice is an A/B
  // comparison of the user's actual data, not an abstract description.
  // Previews use a fixed 5 steps (they illustrate the anchoring, not the
  // binning) but track the live valence, goal, and reference inputs.
  function previewSpec(anchor) {
    var m = state.matches, geo = GEOS[state.geo];
    var values = Object.keys(m.byKey).map(function (k) {
      return { key: parseInt(k, 10), value: m.byKey[k] };
    });
    var sc = scaleFor(anchor, 5);
    return {
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "data": {
        "url": ROOT + geo.url,
        "format": { "type": "topojson", "feature": geo.feature }
      },
      "transform": [{
        "lookup": geo.lookupField,
        "from": { "data": { "values": values }, "key": "key", "fields": ["value"] }
      }],
      "width": 210, "height": 100,
      "projection": { "type": "mercator" },
      "mark": { "type": "geoshape", "stroke": "white", "strokeWidth": 0.4, "color": NO_DATA_FILL },
      "encoding": {
        "color": {
          "field": "value", "type": "quantitative",
          "scale": { "type": "quantize", "domain": sc.domain, "range": sc.range },
          "legend": null
        }
      },
      // transparent so the selected card's tinted background shows through
      "config": { "background": null, "view": { "stroke": null } }
    };
  }

  function renderPreview(anchor) {
    var target = $("mm-prev-" + anchor);
    if (!target || !state.matches || !state.matches.stats) return;
    vegaEmbed(target, previewSpec(anchor), { actions: false, renderer: "svg" })
      .catch(function () { target.textContent = "(preview unavailable)"; });
  }

  function renderPreviews() {
    ["data", "goal", "reference"].forEach(renderPreview);
  }

  // ---------- PNG export (2x, with the C7 source line baked in) ----------

  function exportPNG() {
    if (!state.view) return;
    var SCALE = 2;
    state.view.toCanvas(SCALE).then(function (canvas) {
      var pad = 10 * SCALE;                       // breathing room for the caption
      // 14.67px text + leading. Convention 7's chart note is 11 PT, which is
      // 14.67 px — the same pt->px conversion the Vega theme and the design
      // system's .ncdpi-chartframe__source use. This used to say 11px, which
      // rendered the note ~25% too small in every exported map (the same
      // pt-passed-as-px slip session 24 fixed across the site theme).
      var line = state.source ? 19 * SCALE : 0;
      var out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height + line + (line ? pad : 0);
      var ctx = out.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0);
      if (state.source) {
        // C7: 11pt (= 14.67px) Arial, brand dark grey, shared left edge with
        // the title block (vega renders the title at the chart padding's
        // left edge).
        ctx.font = (14.67 * SCALE) + "px Arial";
        ctx.fillStyle = SOURCE_GREY;
        ctx.fillText(state.source, 10 * SCALE, canvas.height + line);
      }
      var a = document.createElement("a");
      var slug = (state.title || "ncdpi-map").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      a.download = (slug || "ncdpi-map") + ".png";
      a.href = out.toDataURL("image/png");
      a.click();
    });
  }

  // ---------- UI ----------

  function option(value, label, selected) {
    var o = el("option", { value: value, text: label });
    if (selected) o.selected = true;
    return o;
  }

  function buildUI(root) {
    // Presentation comes from the design system — theme/tokens.css +
    // theme/ncdpi-ds.css, loaded by map-maker.qmd (DS Phase 3 retrofit).
    // What stays here is app-specific LAYOUT the DS has no component for,
    // and it deliberately holds NO color literals: every color is a token.
    //
    // The mm-* names are kept as behavior + test hooks
    // (tools/verify_mapmaker_browser.py selects on them); the ncdpi-* classes
    // alongside them carry the styling. Don't collapse the two.
    root.appendChild(el("style", {
      text: [
        // Steps are .ncdpi-card — this adds the wizard's vertical rhythm and
        // puts the step heading on the UI type scale.
        "#map-maker-root .mm-step { margin: var(--ncdpi-space-md) 0; }",
        "#map-maker-root .mm-step h2 { margin: 0 0 var(--ncdpi-space-sm) 0; font-family: var(--ncdpi-font-ui); font-size: var(--ncdpi-size-h4); color: var(--ncdpi-text-heading); }",
        // Keep controls to a readable measure instead of full-bleed.
        "#map-maker-root .ncdpi-input { max-width: 560px; }",
        // Two-column control rows.
        "#map-maker-root .mm-cols { display: flex; gap: var(--ncdpi-space-md); flex-wrap: wrap; }",
        "#map-maker-root .mm-cols > div { flex: 1 1 240px; }",
        // Match-report status lines. These valence colors reach across the D2
        // boundary into the chart world — the same crossing, and the same two
        // contrast-validated hexes, the DS stat tile makes for its delta.
        "#map-maker-root .mm-report-ok { color: var(--ncdpi-chart-data-highlight-bar-line-is-best); font-weight: var(--ncdpi-weight-bold); }",
        "#map-maker-root .mm-report-warn { color: var(--ncdpi-danger); }",
        // Anchor cards are .ncdpi-card--flat, but with 2px borders so
        // selecting one never shifts the layout.
        "#map-maker-root .mm-anchor-cards { display: flex; gap: var(--ncdpi-space-sm); flex-wrap: wrap; align-items: stretch; }",
        "#map-maker-root .mm-anchor-card { flex: 1 1 230px; border-width: 2px; cursor: pointer; }",
        "#map-maker-root .mm-anchor-card.selected { border-color: var(--ncdpi-link); background: var(--ncdpi-surface-info); }",
        "#map-maker-root .mm-anchor-card h3 { margin: 0 0 var(--ncdpi-space-2xs) 0; font-family: var(--ncdpi-font-ui); font-size: var(--ncdpi-size-small); }",
        "#map-maker-root .mm-anchor-card h3 label { display: inline; font-size: inherit; font-weight: var(--ncdpi-weight-semibold); cursor: pointer; }",
        "#map-maker-root .mm-anchor-card .mm-preview { min-height: 104px; }",
        "#map-maker-root .mm-anchor-card input[type=number] { display: inline-block; width: 6em; }",
        // Category rows: swatch + name + brand-colors-only picker.
        "#map-maker-root .mm-cat-row { display: flex; align-items: center; gap: var(--ncdpi-space-xs); margin: var(--ncdpi-space-2xs) 0; flex-wrap: wrap; }",
        "#map-maker-root .mm-cat-row .ncdpi-input { display: inline-block; width: auto; max-width: 14em; }",
        "#map-maker-root .mm-swatch { width: 18px; height: 18px; border-radius: var(--ncdpi-radius-sm); border: 1px solid var(--ncdpi-border-subtle); display: inline-block; flex: none; }",
        "#map-maker-root .mm-cat-name { min-width: 15em; }",
        // The unmatched-rows list stays a bounded scroll box.
        "#map-maker-root .mm-unmatched { font-size: var(--ncdpi-size-small); color: var(--ncdpi-text-secondary); max-height: 8em; overflow-y: auto; }",
        // Type and color for the source line come from .ncdpi-chartframe__source;
        // this only hides it until there is a source to show.
        "#mm-source-caption { display: none; }"
      ].join("\n")
    }));

    // Step 1 — load data
    var step1 = el("div", { class: "mm-step ncdpi-card" }, [
      el("h2", { text: "1. Load your data" }),
      el("p", { class: "mm-privacy ncdpi-callout ncdpi-callout--info", text: "Your file never leaves your computer. This page reads it right in your browser — nothing is uploaded or stored anywhere. Please still use aggregate, non-personal data: one row per area." }),
      el("label", { class: "ncdpi-field__label", text: "Each row in your file is a…", for: "mm-geo" }),
      el("select", { class: "ncdpi-input", id: "mm-geo", onchange: onGeoChanged }, [
        option("district", "School district (up to 115 rows)", true),
        option("county", "County (up to 100 rows)"),
        option("region", "SBE region (8 rows)")
      ]),
      el("label", { class: "ncdpi-field__label", text: "CSV file", for: "mm-file" }),
      // Left deliberately unstyled: native file inputs resist .ncdpi-input
      // (the control is a shadow-DOM button, not a text box).
      el("input", { type: "file", id: "mm-file", accept: ".csv,text/csv", onchange: onFile }),
      el("p", { class: "mm-hint ncdpi-field__help", id: "mm-file-msg", text: "Expect one row per area: a column identifying it (name or code) and a value column — numbers for a shaded map, or group names (a program, a status) for a map colored by group. One group per row; call a combination its own group (“Hybrid”). Excel support arrives in the next version — for now, save as CSV." }),
      el("div", { id: "mm-pii-gate" })
    ]);

    // Step 2 — match report + column pickers (hidden until a file loads)
    var step2 = el("div", { class: "mm-step ncdpi-card", id: "mm-step2", style: "display:none" }, [
      el("h2", { text: "2. Check the match" }),
      el("div", { class: "mm-cols" }, [
        el("div", {}, [
          el("label", { class: "ncdpi-field__label", text: "District column", for: "mm-join", id: "mm-join-label" }),
          el("select", { class: "ncdpi-input", id: "mm-join", onchange: onColumnsChanged })
        ]),
        el("div", {}, [
          el("label", { class: "ncdpi-field__label", text: "Measure column", for: "mm-measure" }),
          el("select", { class: "ncdpi-input", id: "mm-measure", onchange: onColumnsChanged })
        ])
      ]),
      el("div", { id: "mm-report" })
    ]);

    // One anchor card: radio + heading + live mini-map preview + caption
    // nodes. A real radio keeps the choice keyboard-accessible; clicking
    // anywhere on the card selects it.
    function anchorCard(mode, heading, captionNodes) {
      var radio = el("input", {
        type: "radio", name: "mm-anchor", value: mode,
        id: "mm-anchor-" + mode, onchange: onAnchorChanged
      });
      if (mode === state.anchor) radio.checked = true;
      var card = el("div", {
        class: "mm-anchor-card ncdpi-card ncdpi-card--flat" +
          (mode === state.anchor ? " selected" : "")
      }, [
        el("h3", {}, [radio, el("label", { for: "mm-anchor-" + mode, text: " " + heading })]),
        el("div", { class: "mm-preview", id: "mm-prev-" + mode })
      ].concat(captionNodes));
      card.addEventListener("click", function () {
        if (!radio.checked) { radio.checked = true; onAnchorChanged(); }
      });
      return card;
    }

    // Step 3 — the color wizard: valence, then the reference-point question
    // (data-max vs goal vs diverge-around-a-reference) answered with live
    // A/B previews of the user's own data, then step count.
    var step3 = el("div", { class: "mm-step ncdpi-card", id: "mm-step3", style: "display:none" }, [
      el("h2", { text: "3. Choose the colors" }),
      // Categorical panel — shown when the value column holds group names.
      el("div", { id: "mm-cat-wizard", style: "display:none" }, [
        el("p", { class: "mm-hint ncdpi-field__help", text: "Your value column holds group names, so each group gets its own brand color — biggest group first. Change any group’s color below. Tip: to make a highlight map, set one group to navy and the rest to grey." }),
        el("div", { id: "mm-cat-list" })
      ]),
      // Numeric wizard — valence, steps, and the anchoring cards.
      el("div", { id: "mm-num-wizard" }, [
      el("div", { class: "mm-cols" }, [
        el("div", {}, [
          el("label", { class: "ncdpi-field__label", text: "Higher values are…", for: "mm-valence" }),
          el("select", { class: "ncdpi-input", id: "mm-valence", onchange: onColorsChanged }, [
            option("good", "Better — teal ramp (proficiency, growth)", true),
            option("bad", "Worse — rust ramp (absenteeism, suspensions)"),
            option("neutral", "Neither — blue ramp (counts, enrollment)")
          ])
        ]),
        el("div", {}, [
          el("label", { class: "ncdpi-field__label", text: "Color steps", for: "mm-steps" }),
          el("p", { class: "mm-hint ncdpi-field__help", text: "Diverging maps use an odd count — the middle grey straddles the reference." }),
          el("select", { class: "ncdpi-input", id: "mm-steps", onchange: onColorsChanged })
        ])
      ]),
      el("label", { class: "ncdpi-field__label", text: "What should the darkest color mean?" }),
      el("p", { class: "mm-hint ncdpi-field__help", text: "Same data, three honest maps — pick the comparison you want your reader to make. Each preview uses your own data." }),
      el("div", { class: "mm-anchor-cards" }, [
        anchorCard("data", "Compare districts to each other", [
          el("p", { class: "mm-hint ncdpi-field__help" }, [
            el("span", { text: "Darkest = the highest value in your data (" }),
            el("span", { id: "mm-cap-data", text: "—" }),
            el("span", { text: "). Uses the full color range; best for “where is it high, where is it low?”" })
          ])
        ]),
        anchorCard("goal", "Show distance from a goal", [
          el("p", { class: "mm-hint ncdpi-field__help" }, [
            el("span", { text: "Darkest = the goal: " }),
            el("input", { class: "ncdpi-input", type: "number", id: "mm-goal", step: "any", oninput: onGoalInput }),
            el("span", { text: " — districts read as “how close to the target?” A map where nobody has reached the goal never shows the darkest color, honestly." })
          ])
        ]),
        anchorCard("reference", "Compare to a reference value", [
          el("p", { class: "mm-hint ncdpi-field__help" }, [
            el("span", { text: "Grey = at the reference: " }),
            el("input", { class: "ncdpi-input", type: "number", id: "mm-center", step: "any", oninput: onCenterInput }),
            el("span", { text: " — colors diverge on either side (e.g. above vs below the state rate). Pre-filled with the average of your mapped values; replace it with the true statewide value if you have one (a state rate usually isn’t the simple average of district rates)." })
          ])
        ])
      ])
      ])   // closes #mm-num-wizard
    ]);

    // Step 4 — describe the map
    var step4 = el("div", { class: "mm-step ncdpi-card", id: "mm-step4", style: "display:none" }, [
      el("h2", { text: "4. Describe the map" }),
      el("label", { class: "ncdpi-field__label", text: "Title", for: "mm-title" }),
      el("p", { class: "mm-hint ncdpi-field__help", text: "The takeaway — the one-line message a reader should remember (“Proficiency is lowest in the northeast”), not a description." }),
      el("input", { class: "ncdpi-input", type: "text", id: "mm-title", oninput: onDescribe }),
      el("label", { class: "ncdpi-field__label", text: "Subtitle", for: "mm-subtitle" }),
      el("p", { class: "mm-hint ncdpi-field__help", text: "The contract: measure, unit (count or %), geography, and time period (“Percentage of students grade-level proficient by district, 2025”)." }),
      el("input", { class: "ncdpi-input", type: "text", id: "mm-subtitle", oninput: onDescribe }),
      el("label", { class: "ncdpi-field__label", text: "Source note", for: "mm-mapsource" }),
      el("p", { class: "mm-hint ncdpi-field__help", text: "Shown below the map and included in the downloaded image (“Source: NCDPI accountability data, 2025.”)." }),
      el("input", { class: "ncdpi-input", type: "text", id: "mm-mapsource", oninput: onDescribe }),
      el("label", { class: "ncdpi-field__label", text: "Legend title", for: "mm-legend" }),
      el("p", { class: "mm-hint ncdpi-field__help", text: "Name the measure + unit, e.g. “Grade-level proficient (%)”." }),
      el("input", { class: "ncdpi-input", type: "text", id: "mm-legend", oninput: onDescribe })
    ]);

    // Step 5 — the map + export.
    // The map sits in a .ncdpi-chartframe (the DS component built in Phase 2
    // for exactly this). Note there is deliberately NO __title/__subtitle
    // node: Vega paints the title and subtitle inside the SVG so they ride
    // along into the exported PNG. Adding DOM ones would render them twice.
    var step5 = el("div", { class: "mm-step ncdpi-card", id: "mm-step5", style: "display:none" }, [
      el("h2", { text: "5. Your map" }),
      el("div", { class: "ncdpi-chartframe" }, [
        el("div", { class: "ncdpi-chartframe__body", id: "mm-chart" }),
        el("p", { class: "ncdpi-chartframe__source", id: "mm-source-caption" })
      ]),
      el("p", {}, [
        el("button", { class: "ncdpi-btn ncdpi-btn--primary", id: "mm-export", text: "Download PNG (2×)", disabled: "disabled", onclick: exportPNG })
      ])
    ]);

    root.appendChild(step1);
    root.appendChild(step2);
    root.appendChild(step3);
    root.appendChild(step4);
    root.appendChild(step5);
    rebuildStepsOptions();
  }

  // ---------- event handlers ----------

  // Column names that usually mean person-level records. Heuristic by
  // design — the real safeguard is the no-server architecture — but a loud
  // stop-and-confirm beats silently mapping a roster. Person-word + "name"
  // patterns only, so legitimate columns like "district_name" don't trip it.
  var PII_PATTERNS = [
    { rx: /(first|last|middle|student|teacher|child|full)[ _-]?name/i, what: "a person’s name" },
    { rx: /\b(dob|birth ?date|date[ _-]?of[ _-]?birth|birthday)\b/i, what: "a birth date" },
    { rx: /ssn|social[ _-]?security/i, what: "a Social Security number" },
    { rx: /(student|pupil|teacher|staff|employee|person)[ _-]?(id|number|num)\b/i, what: "a person-level ID" },
    { rx: /\b(e-?mail|phone|street|address)\b/i, what: "contact information" }
  ];

  function piiFlags(columns) {
    var hits = [];
    columns.forEach(function (c) {
      for (var i = 0; i < PII_PATTERNS.length; i++) {
        if (PII_PATTERNS[i].rx.test(c)) { hits.push("“" + c + "” looks like " + PII_PATTERNS[i].what); break; }
      }
    });
    return hits;
  }

  function onFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var table = parseCSV(String(reader.result));
      var msg = $("mm-file-msg"), geo = GEOS[state.geo];
      $("mm-pii-gate").innerHTML = "";
      if (!table) { msg.textContent = "Could not read that file as CSV (needs a header row plus at least one data row)."; return; }
      // Aggregate-data sanity check, sized to the selected geography.
      if (table.rows.length > geo.count + 15) {
        msg.innerHTML = "<span class='mm-report-warn'>That file has " + table.rows.length +
          " rows — " + geo.noun + "-level data has at most " + geo.count + ". This tool maps " +
          "aggregate data only (one row per " + geo.noun + "). If your file is student- or " +
          "school-level, aggregate it first.</span>";
        return;
      }
      msg.textContent = file.name + " — " + table.rows.length + " rows, " + table.columns.length + " columns.";
      // PII gate: suspicious column names stop the flow until the user
      // confirms the file is aggregate. Nothing renders before they do.
      var flags = piiFlags(table.columns);
      if (flags.length) {
        showPiiGate(table, flags);
        return;
      }
      acceptTable(table);
    };
    reader.readAsText(file);
  }

  function showPiiGate(table, flags) {
    var gate = $("mm-pii-gate");
    gate.innerHTML =
      "<p class='mm-report-warn'><strong>Hold on — some column names look person-level:</strong><br>" +
      flags.map(function (f) {
        return String(f).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      }).join("<br>") + "</p>" +
      "<p class='mm-hint ncdpi-field__help'>This tool is for aggregate data only (one row per area). Your file " +
      "hasn’t gone anywhere — it never leaves your browser — but person-level data shouldn’t " +
      "be mapped at all. If these columns are actually aggregate (say, a district contact " +
      "person), you can continue.</p>";
    var check = el("input", { type: "checkbox", id: "mm-pii-confirm" });
    check.addEventListener("change", function () {
      if (check.checked) { gate.innerHTML = ""; acceptTable(table); }
    });
    gate.appendChild(el("label", { class: "ncdpi-field__label", for: "mm-pii-confirm" }, [
      check, el("span", { text: " This file contains only aggregate data — no person-level records." })
    ]));
  }

  function acceptTable(table) {
    state.table = table;
    var det = detectColumns(table);
    state.joinCol = det.join;
    state.measureCol = det.measure;
    fillColumnPickers();
    onColumnsChanged();
    $("mm-step2").style.display = "";
    $("mm-step3").style.display = "";
    $("mm-step4").style.display = "";
    $("mm-step5").style.display = "";
  }

  function onGeoChanged() {
    state.geo = $("mm-geo").value;
    $("mm-join-label").textContent = GEOS[state.geo].tooltipTitle + " column";
    if (!state.table) return;
    // Re-run the pipeline: the join column (and every match) can differ per
    // geography, and the wizard defaults should refresh for the new join.
    var det = detectColumns(state.table);
    state.joinCol = det.join;
    state.measureCol = det.measure;
    state.statsFor = null;
    fillColumnPickers();
    onColumnsChanged();
  }

  function fillColumnPickers() {
    var join = $("mm-join"), measure = $("mm-measure");
    join.innerHTML = ""; measure.innerHTML = "";
    state.table.columns.forEach(function (c) {
      join.appendChild(option(c, c, c === state.joinCol));
      measure.appendChild(option(c, c, c === state.measureCol));
    });
  }

  // The per-category color rows in step 3 (categorical mode): swatch +
  // "name — N counties" + a brand-colors-only picker.
  function renderCatList() {
    var wrap = $("mm-cat-list");
    if (!wrap) return;
    wrap.innerHTML = "";
    var cats = (state.matches && state.matches.categories) || [];
    var geo = GEOS[state.geo];
    if (cats.length > MAX_CATEGORIES) {
      wrap.appendChild(el("p", { class: "mm-report-warn", text:
        "“" + state.measureCol + "” has " + cats.length + " different values — too many to color as groups (max " +
        MAX_CATEGORIES + "; 5 reads better). Combine small groups into an “Other” category, or pick a different column." }));
      return;
    }
    if (cats.length === MAX_CATEGORIES) {
      wrap.appendChild(el("p", { class: "mm-report-warn", text:
        "Six groups is the ceiling — five or fewer read better. Consider combining the smallest groups." }));
    }
    cats.forEach(function (c) {
      var sel = el("select", { class: "ncdpi-input", "data-norm": c.norm, "aria-label": "Color for " + c.name, onchange: onCatColorChanged });
      CATEGORY_COLORS.forEach(function (cc) {
        sel.appendChild(option(cc.hex, cc.label, cc.hex === c.color));
      });
      wrap.appendChild(el("div", { class: "mm-cat-row" }, [
        el("span", { class: "mm-swatch", style: "background:" + c.color }),
        el("span", { class: "mm-cat-name", text: c.name + " — " + c.count + " " + (c.count === 1 ? geo.noun : geo.plural) }),
        sel
      ]));
    });
    // Colour is the only thing telling these groups apart on a map, so a pair
    // that collapses under red-green colorblindness makes the map unreadable
    // for roughly one man in twelve. Name the offending groups and point at
    // the picker sitting right beside them rather than silently recoloring —
    // the brand palette is the style guide's call, not the app's.
    cvdCollisions(cats).forEach(function (hit) {
      wrap.appendChild(el("p", { class: "mm-report-warn", text:
        "“" + hit.names[0] + "” and “" + hit.names[1] + "” (" + hit.label + ") look" +
        " nearly identical to readers with red-green color blindness — about 1 in 12" +
        " men. On a map, color is the only thing separating your groups. Recolor one" +
        " of them above (navy and grey are the most distinct pair)." }));
    });
  }

  function onCatColorChanged(ev) {
    var sel = ev.target;
    state.catColors[sel.getAttribute("data-norm")] = sel.value;
    computeMatches();   // re-derives category colors with the override applied
    renderCatList();
    render();
  }

  function onColumnsChanged() {
    state.joinCol = $("mm-join").value;
    state.measureCol = $("mm-measure").value;
    // Numeric column -> binned choropleth; text column -> categorical map.
    state.mode = columnProfile(state.table, state.measureCol).isNumeric ? "numeric" : "categorical";
    // Color overrides belong to one value column; a new column starts fresh.
    if (state.catsFor !== state.measureCol) { state.catColors = {}; state.catsFor = state.measureCol; }
    computeMatches();
    reportMatches();
    var isCat = state.mode === "categorical";
    $("mm-num-wizard").style.display = isCat ? "none" : "";
    $("mm-cat-wizard").style.display = isCat ? "" : "none";
    if (isCat) renderCatList();
    // Refresh the wizard defaults when the measure changes: goal = 100 for
    // percentage-scaled data (else a nice ceiling), reference = the mean of
    // the mapped values (a stand-in until the user types the real state rate).
    var s = state.matches.stats;
    if (!isCat && s && state.statsFor !== state.measureCol) {
      state.statsFor = state.measureCol;
      state.goal = s.max <= 100 ? 100 : niceCeilAbove(s.max);
      state.center = s.mean;
      $("mm-goal").value = state.goal;
      $("mm-center").value = state.center;
    }
    if (!isCat && s) $("mm-cap-data").textContent = String(s.max);
    if (!$("mm-legend").value) state.legendTitle = state.measureCol;
    render();
    renderPreviews();   // no-op in categorical mode (stats stays null)
  }

  function reportMatches() {
    var m = state.matches, out = $("mm-report"), geo = GEOS[state.geo];
    var missing = geo.count - m.matched;
    var html = "<p class='mm-report-" + (m.unmatched.length ? "warn" : "ok") + "'>" +
      m.matched + " of " + geo.count + " " + geo.plural + " matched.</p>";
    if (missing > 0 && !m.unmatched.length) {
      html += "<p class='mm-hint'>Every row matched, but " + missing + " NC " +
        (missing === 1 ? geo.noun + " is" : geo.plural + " are") +
        " not in your data; " + (missing === 1 ? "it" : "they") +
        " will show in light grey as “No data.”</p>";
    }
    if (m.unmatched.length) {
      html += "<p class='mm-report-warn'>" + m.unmatched.length +
        " row" + (m.unmatched.length === 1 ? "" : "s") + " could not be matched (nothing is silently dropped — fix the names/codes or accept the gap):</p>" +
        "<div class='mm-unmatched'>" + m.unmatched.map(function (u) {
          return String(u).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        }).join("<br>") + "</div>";
    }
    if (m.dup.length) {
      html += "<p class='mm-report-warn'>Duplicate " + geo.noun + " rows ignored: " + m.dup.length +
        " (this tool maps one value per " + geo.noun + " — the first row wins).</p>";
    }
    out.innerHTML = html;
  }

  function onDescribe() {
    state.title = $("mm-title").value;
    state.subtitle = $("mm-subtitle").value;
    state.source = $("mm-mapsource").value;
    state.legendTitle = $("mm-legend").value;
    render();
  }

  function onColorsChanged() {
    state.valence = $("mm-valence").value;
    state.steps = parseInt($("mm-steps").value, 10);
    render();
    renderPreviews(); // valence changes the preview ramps too
  }

  // Sequential ramps come in 3–5 steps; diverging in 3/5/7/9 (odd, so the
  // grey middle straddles the reference). Swap the step options to whichever
  // set the anchor mode allows, keeping the current pick when still valid.
  function rebuildStepsOptions() {
    var sel = $("mm-steps");
    var opts = state.anchor === "reference" ? [3, 5, 7, 9] : [3, 4, 5];
    var cur = state.steps;
    if (opts.indexOf(cur) === -1) cur = 5;
    sel.innerHTML = "";
    opts.forEach(function (n) { sel.appendChild(option(String(n), String(n), n === cur)); });
    state.steps = cur;
  }

  function onAnchorChanged() {
    var checked = document.querySelector("input[name=mm-anchor]:checked");
    state.anchor = checked ? checked.value : "data";
    var cards = document.querySelectorAll("#map-maker-root .mm-anchor-card");
    Array.prototype.forEach.call(cards, function (card) {
      var radio = card.querySelector("input[name=mm-anchor]");
      card.classList.toggle("selected", radio && radio.checked);
    });
    rebuildStepsOptions();
    render();
  }

  function onGoalInput() {
    var v = parseFloat($("mm-goal").value);
    if (!isFinite(v)) return;
    state.goal = v;
    renderPreview("goal");
    if (state.anchor === "goal") render();
  }

  function onCenterInput() {
    var v = parseFloat($("mm-center").value);
    if (!isFinite(v)) return;
    state.center = v;
    renderPreview("reference");
    if (state.anchor === "reference") render();
  }

  // ---------- boot ----------

  function boot() {
    var root = document.getElementById("map-maker-root");
    if (!root) return;
    Promise.all([
      fetch(ROOT + "data/lea-crosswalk.csv").then(function (r) { return r.text(); }),
      // The county layer doubles as the county-name/code lookup (the
      // crosswalk has names but not county codes).
      fetch(ROOT + "data/nc-counties.topojson").then(function (r) { return r.json(); })
    ])
      .then(function (loaded) {
        var t = parseCSV(loaded[0]);
        crosswalk = t.rows.map(function (r) {
          return {
            lea: parseInt(r.lea, 10),
            lea_name_short: r.lea_name_short, lea_name: r.lea_name,
            county: r.county, region: r.region,
            region_num: parseInt(r.region_num, 10)
          };
        });
        nameIndex = buildNameIndex(crosswalk, normName);
        looseIndex = buildNameIndex(crosswalk, normLoose);
        regionIndex = {}; regionNums = {};
        crosswalk.forEach(function (d) {
          regionIndex[normName(d.region)] = d.region_num;
          regionNums[d.region_num] = true;
        });
        countyIndex = {}; countyCodes = {};
        loaded[1].objects.counties.geometries.forEach(function (g) {
          var p = g.properties;
          countyIndex[normCounty(p.county)] = p.county_code;
          countyCodes[p.county_code] = true;
        });
        buildUI(root);
      })
      .catch(function (err) {
        root.textContent = "Map-maker failed to load its geography lists: " + err;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
