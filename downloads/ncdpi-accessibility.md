# Accessibility

_Portable Markdown copy of the [live Accessibility page](https://abax70.github.io/ncdpi-data-visualization-public/accessibility.html). Generated 2026-06-24 from `site/accessibility.qmd` -- do not edit by hand; re-run `tools/build_accessibility_md.py`._

Accessibility is not a box we check at the end. It is the whole point of a chart:
**everyone who comes to a visualization should be able to leave with its takeaway.**
This page lays out how we think about that at NCDPI — which is, in a few places,
deliberately more nuanced than a strict checklist reading of the rules. We explain why,
and we show our work against the actual standard.

## Two levels of accessibility

It helps to separate two things that both get called "accessibility."

> **The over-riding level — can people get the story?**
> A chart is inaccessible if a reader can't extract its meaning — and most often that
> barrier has nothing to do with disability. It's jargon, an unexplained metric, a missing
> unit, a buried takeaway, or an assumption that the reader is a "math person." Clearing
> *that* barrier — for the non-specialist, the busy stakeholder, the person new to the
> subject — is the first job, and it serves everyone.
>
> **The technical level — ADA, Section 508, WCAG.**
> Nested inside the first is the layer most people mean by "accessibility": contrast
> ratios, non-color cues, alt text, keyboard and screen-reader support. This layer is real,
> it's now legally required (see below), and we take it seriously. But it is a *means* to
> the over-riding goal, not the goal itself.

Keeping these straight matters, because the techniques that serve one often serve the
other — a clear message title helps both a screen-reader user and a hurried director —
and because the technical layer is best understood as **one of several ways** we get a
reader to the takeaway, not the only way.

## Equivalent access, not identical access

Here is the principle that drives the rest of this page:

> Our goal is that **every reader can reach the takeaway** — but *how* they reach it
> need not be the same for every reader.

If a chart offers the story through several independent channels — direct labels so the
numbers are readable without decoding color, an auxiliary data table, and good alt text —
then no single visual element has to carry the entire accessibility burden on its own.
That is not a loophole. As the next section shows, it is exactly how the standard is
written.

## What WCAG actually says — and what it doesn't

The Web Content Accessibility Guidelines (WCAG) 2.1, Level AA, are the technical standard.
It's worth quoting the relevant criteria precisely, because the text draws its lines in
specific places — and not always where a strict reading assumes.

### Use of Color (1.4.1, Level A)

> "Color is not used as the *only* visual means of conveying information, indicating an
> action, prompting a response, or distinguishing a visual element."

**What it requires:** a redundant, non-color cue wherever color carries meaning.
**What it does not require:** removing color, nor that the colors on any palette
(categorical, sequential, diverging) *mandate* a particular contrast ratio between
one another. (A 3:1 difference in *lightness* is one way to supply the "additional
visual means" the criterion asks for — but it is only one way; direct labels, white
separators, and an auxiliary table satisfy it equally.) So when we add direct labels,
white separators between abutting fills, and an auxiliary table, color is no longer
"the only means" — and 1.4.1 is satisfied. ([W3C — Understanding 1.4.1](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html))

### Non-text Contrast (1.4.11, Level AA)

> "The visual presentation of [graphical objects] have a contrast ratio of at least 3:1
> against adjacent color(s): **Parts of graphics _required to understand the content_,**
> except when a particular presentation of graphics is essential to the information being
> conveyed."

The scope is the operative phrase: **"required to understand the content."** The W3C's own
guidance lists when a graphic *doesn't* need to meet 3:1 — including when **"the information
is available in another form."**

> **This is the crux.** A faint gridline behind directly-labeled values, or a neutral
> `#B7B9BB` context bar whose magnitude is encoded by length *and* a direct label *and* an
> auxiliary table, is **not "required to understand the content"** — the information is
> available in another form. Such elements fall **outside** 1.4.11's scope; they are not
> violations of it.
>
> So "if it's visible, it must meet 3:1" is **stricter than the standard actually requires.**
> We hold the contrast line — we just hold it on the elements that genuinely carry the
> meaning. ([W3C — Understanding 1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html))

**A stricter reading exists — and we've weighed it.** Some excellent
dataviz-accessibility resources — notably [Chartability](#resources) (in our
resources below) — apply a blanket 3:1 to *all* "geometries," deliberately going
beyond WCAG 1.4.11's "required to understand" scope. That is a defensible, conservative
ceiling, and we treat it as one. But where such a rule diverges from the standard, we
follow WCAG's actual scoping: an element that is not required to understand the
content, *because the information is genuinely available another way*, is not a
violation. We name the difference on purpose — holding the WCAG line where it's drawn
is a considered choice, not an oversight.

**One limit on this exception:** it holds only where direct labeling is actually feasible.
When data density makes labels impossible — a 115-district choropleth, a school-level
scatter of thousands of points — the marks themselves become *required to understand the
content*, and the label exception no longer applies. Then the auxiliary data table (below)
becomes the primary equivalent pathway. Better still, treat the density as the real
problem: aggregate, or break the data into
[small multiples](https://abax70.github.io/ncdpi-data-visualization-public/best-practices/small-multiples.html), so the chart stays both legible and
labelable. (Note this cuts the other way for *sequential* fills: adjacent steps of a color
ramp still need not contrast 3:1 with *each other*. W3C's own guidance treats a
measurement gradient under the *essential* exception — forcing 3:1 between neighboring
shades would undermine the ramp itself — and the reader takes the value from the legend
and labels, not from telling two shades apart.)

### Contrast — Minimum (1.4.3, Level AA) — the line we do not bend

> Text has a contrast ratio of at least **4.5:1** (or **3:1** for large text — 18pt, or
> 14pt bold).

Note the boundary: 1.4.3 governs **text**, and it has **no "required to understand"
exception.** So the nuance above applies only to *non-text* graphical objects — gridlines,
fills, strokes. **Text always meets contrast:** data labels, axis values, titles,
subtitles, and annotations are held to 4.5:1, full stop. This is what keeps our position
honest — we are precise about *where* a contrast requirement applies, not casual about
*whether* it does. ([W3C — Understanding 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html))

### When a chart isn't the right vehicle: conforming alternatives

A multi-chart dashboard read aloud by a screen reader, even with a good tab order, is
often a poor experience — the structure that makes a dashboard powerful visually does not
serialize well into speech. WCAG anticipates this with the **conforming alternative
version**: an accessible equivalent (here, a well-structured **data table** plus a
**plain-language summary** of the takeaway) that "provides all of the same information,"
is kept as up to date, and is reachable from the original.

Two honest caveats: WCAG treats this as a **fallback** — the preferred path is to make
content directly accessible — and the alternative only counts **if we actually provide it
and link to it.** A conforming alternative is a safety net, not a license to write the
dashboard itself off: keyboard navigation, sensible tab order, and **clear focus states**
still matter, because they serve low-vision, keyboard-only, and motor-impaired readers who
*do* use the visual.
([W3C — Understanding Conformance](https://www.w3.org/WAI/WCAG21/Understanding/conformance.html))

And whatever the dashboard does interactively, **don't trap the keyboard:** a keyboard user
must be able to tab *into* and back *out of* every interactive widget — a filter, a legend
toggle, an embedded viz — with standard Tab / Shift-Tab, never getting stuck inside one.
This is its own Level A requirement (WCAG 2.1.2, No Keyboard Trap) and a frequent late-stage
audit failure in tools like Tableau.

### The legal footing

In April 2024 the U.S. Department of Justice finalized a rule under **ADA Title II**
adopting **WCAG 2.1 Level AA** for state and local government websites and apps. A
subsequent interim rule (April 2026) extended the deadlines by a year — moving the dates
only; the WCAG 2.1 Level AA standard itself did not change. **As a state agency,
NCDPI is on the April 26, 2027 compliance date.** That deadline is real, and it's why the
field is leaning toward strict, bright-line readings right now. Our framing meets the
standard — we get there through **redundant pathways, including conforming alternatives** —
rather than treating any element as exempt from the goal of access.
([ADA.gov — the web rule](https://www.ada.gov/resources/2024-03-08-web-rule/))

## Techniques

How the principle becomes practice. None of these is sufficient alone; together they are
what "equivalent access" means.

### On the chart

**Color and contrast.** Use our palettes (they're built for this) and make text meet
4.5:1. Don't chase the impossible standard of every categorical hue contrasting 3:1 with
every other *and* with white at once — at NCDPI we found that nearly unachievable, and the
colors you'd be forced into carry their own unwanted connotations. The right move isn't
darker colors; it's **not making color carry the meaning alone.** See
[Color rules](https://abax70.github.io/ncdpi-data-visualization-public/best-practices/color-rules.html) and the
[highlight palette](https://abax70.github.io/ncdpi-data-visualization-public/foundations/color-highlights.html).

**Never color alone.** Whatever color says, something else should say too — position, a
direct label, a shape, an annotation. This is 1.4.1, and it's also just good charting.

**Label directly.** A number printed next to its mark is readable by everyone, removes the
decode-the-legend step, and is the single most powerful accessibility move available. It's
also what lets a faint gridline or neutral fill stay faint (see the keystone above).

**Annotate when it helps.** A short note that states the takeaway in words — in our
[annotation Plum](https://abax70.github.io/ncdpi-data-visualization-public/chart-parts/chart-elements.html) — gives every reader the point directly,
not just those who can decode the encoding.

> **A note on pattern fills.** Hatching and polka-dot fills are a legitimate redundancy
> channel — they help colorblind readers, and they survive black-and-white printing where
> color collapses entirely. But they add visual noise, and they can pull the eye toward the
> texture *inside* a bar rather than the bar's edge, which is where length encodes the value.
> So treat them as a **hierarchy**: reach first for direct labels and white separators;
> reserve patterns for artifacts that may be reproduced without color.

### Supplemental to the chart

**Alt text.** Every chart carries a text description (in our specs, the `description`
field, which becomes the chart's accessible label). Good alt text states the *takeaway*,
not just "a bar chart" — it's the screen-reader user's version of the message title. A
template that keeps it consistent:

> *[Chart type] showing [data scope], where [the primary trend or takeaway]. Full data in
> the accompanying table.*

For example: *"Line chart of North Carolina's four-year cohort graduation rate, 2019–2025,
showing a steady climb to a record high in 2025. Full data in the table below."*

**Supporting tables.** Offer the underlying numbers as a real, well-structured table (see
[Table elements](https://abax70.github.io/ncdpi-data-visualization-public/chart-parts/table-elements.html)). This is both a 1.4.11 "available in
another form" pathway and the backbone of a conforming alternative for complex dashboards.

**Natural-language query.** Increasingly, readers can ask a dashboard a question in plain
words and get an answer back. Where the tooling supports it, this is another door into the
same data — especially valuable for readers who find the visual itself a barrier. Treat it
as a supplement, not a substitute, for the techniques above. See also
[Tooltips](https://abax70.github.io/ncdpi-data-visualization-public/chart-parts/tooltips.html) for putting the value into words on hover.

## Resources

A short, curated set — covering both the technical layer and the story-for-everyone layer:

- **[W3C WAI — Complex Images tutorial](https://www.w3.org/WAI/tutorials/images/complex/)**
  — the authoritative source on describing charts and graphics for WCAG.
- **[Chartability](https://chartability.fizz.studio/)** (Frank Elavsky) — 50 testable
  heuristics for evaluating data-visualization accessibility; tool-agnostic and used across
  government agencies. The best dataviz-specific resource going.
- **[Do No Harm Guide: Applying Equity Awareness in Data Visualization](https://www.urban.org/research/publication/do-no-harm-guide-applying-equity-awareness-data-visualization)**
  (Schwabish & Feng, Urban Institute) — the story-for-everyone layer: framing, language,
  and ordering that make data equitable and inclusive.
- **[Datawrapper — Accessibility](https://www.datawrapper.de/accessibility)** and
  **[designing for colorblindness](https://www.datawrapper.de/blog/colorblindness-part2)**
  (Lisa Charlotte Muth) — the clearest practical writing on the craft.
- **[An intro to designing accessible data visualizations](https://fossheim.io/writing/posts/accessible-dataviz-design/)**
  (Sarah L. Fossheim) — a clean, example-driven primer.
- **[The ADA Title II web rule](https://www.ada.gov/resources/2024-03-08-web-rule/)**
  (ADA.gov) — the legal requirement and what it means for public agencies.
