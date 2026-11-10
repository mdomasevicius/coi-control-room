# Design: "control room"

Control Room is a second-screen instrument panel for a Captain of Industry colony: the player glances at it while
playing to see whether the economy is healthy and to pause, change speed or poke the console.

The direction comes from industrial control rooms. The high-performance HMI guidelines (ISA-101) behind modern
plant operator screens use a simple rule, and it is the rule here too:

> **Grey is normal. Color means something.**

Neutrals are low-saturation steel greys: a painted equipment enclosure at night in dark, and the classic light HMI
panel grey in light. Saturated color appears only in three places:

- **Data series:** produced/consumed lines and categorical slots, from the validated palette.
- **States:** live, paused, offline, errors.
- **The paused signal:** signal yellow and the hazard stripe.

Selection (current page, pressed segment, selected row) is shown by **inverting ink and surface**, not by an
accent hue.

## Both themes, always

Every screen is designed for light *and* dark. The theme is `auto` (follows the OS) by default, and `light` or
`dark` can be picked in the top bar. The choice persists in localStorage. `<html data-theme>` always holds the
resolved theme, and the tokens in `src/app.css` switch on it. Only use token utilities; never hex values or
Tailwind palette colors (`gray-*`, `white`, `black`). A new color is a new token with a light and a dark value.

| Token utility | Role |
|---|---|
| `bg-bg` | page background (behind panels) |
| `bg-surface`, `bg-surface-2` | panels; hover, insets and table header rows |
| `border-line`, `border-line-strong` | hairlines; control borders |
| `text-ink`, `text-ink-2`, `text-muted` | primary text; secondary text; captions, axis text, units |
| `bg-sel` + `text-sel-ink` | selected / current (inverted) |
| `bg-signal` + `text-signal-ink`, `hazard` | paused only |
| `text-good/warning/serious/critical` | states (connection, errors), **always with an icon and a label** |
| `text-pos`, `text-neg` | net surplus / deficit (produced / consumed hues) |
| `produced`, `consumed`, `stock`, `stored`, `cat-1..8` | chart series; `var(--cat-N)` in inline styles |
| `bg-scrim` | dialog backdrop |

## One color rule

Every number and mark about a product follows the same mapping, on every page:

| Meaning | Color |
|---|---|
| Produced (lines, sparklines, source bars, swatches) | `produced` blue |
| Consumed (lines, sparklines, sink bars, swatches) | `consumed` orange |
| Net as text | `text-pos` = surplus in a text-safe produced blue, `text-neg` = deficit in a text-safe consumed orange |
| Levels: quantity, in storage | neutral, `--series-stock` = ink-2 and `--series-stored` = muted, dashed |
| Meters (storage fill, share of diet) | neutral `ink-2`. Storage warms toward `critical` red below 40%, because an emptying store is the suspicious case and a full one is routine in COI. Byproducts (`src/lib/byproducts.ts`: waste, slag, exhaust, …) never warm: empty is good for them |
| Several entities compared (foods, farm inputs) | categorical `cat-3` onward (slots 1–2 are produced/consumed), in the page's fixed order, never by rank. Past six, the smallest fold into a muted "Other (N)" (`topSeries`). With only one entity, use the neutral or flow color instead |

No green/red for good/bad numbers. Game icons get a thin `--icon-edge` outline in light mode, so white icons stay
visible.

## Type

One family: **Archivo** (variable, self-hosted), used across its width axis. Condensed widths are the
typographic voice: they are how instrument readouts and plant signage pack figures tightly.

| Use | Classes |
|---|---|
| Page title | `text-xl font-semibold font-stretch-75% tracking-tight` (PageHeader does this) |
| Big figures (stats) | `text-xl font-semibold font-stretch-75% tabular-nums` (Stat does this) |
| Panel title | `text-sm font-semibold` |
| Body / table cells | `text-sm` |
| Labels, secondary | `text-xs text-ink-2` |
| Captions, notes, axis | `text-2xs text-muted` |
| Console / code | `font-mono text-xs` |

Scale at the browser's 16px root: 13 (`2xs`) / 14 (`xs`) / 15 (`sm`) / 16 (`base`) / 20 (`lg`) / 30 (`xl`). Nothing
smaller than 13px. Numbers are
always `tabular-nums` and right-aligned in tables (`num` utility).

**Don't:**
- **All-caps labels:** no uppercase eyebrows or uppercase table headers. Use sentence case.
- **Middle-dot meta strings:** avoid strings like "A · B · C". Use separate elements or plain words.
- **Monospace for small data labels:** monospace is for the console only.
- **Arrows on links:** no `→` appended to link or button text.

## Layout

- **Page container:** `mx-auto w-full max-w-[110rem] px-4 py-5 sm:px-6`, left-aligned.
- **Page header:** a `PageHeader` with the title, an optional one-line description, and page-level controls on the
  right.
- **One period for the whole app:** the dropdown in the top bar (`src/logic/period.svelte.ts`, persisted). Pages
  never get their own period switch; panels name the period in their note. Mod-backed pages build "this month"
  themselves: grid rates average this month's finished days, Unity sums the game's this-month ledger.
- **Key figures:** one `StatBand` (a continuous gauge cluster split by hairlines), never a row of separate cards.
- **Overview is pictures first.** Its tiles are a label, one number and a picture of it: a `Bullet` (value on a
  track that is the whole scale, a tick for a threshold, the scale's top labelled at the end) and a 12-month
  `Sparkline`. No subtitles. Supplies are one `Runway` chart: time to empty as bars on a square-root month scale
  (1, 3, 6, 12, 24+), the under-3-months zone shaded, with an icon on bars inside it. No speedometer gauges, pies or
  donuts: length and position are what people judge amounts by.
- **Content:** `Panel`s in CSS grids with `gap-4`. Tables and lists may pair up in two columns at `lg:`/`xl:`.
  **Charts never sit side by side:** each chart takes the full panel width, stacked with `gap-8`. A year or more of
  periods needs the width.
- **Charts follow the period** (`src/lib/historyWindow.ts`):
  - last/this month → the last 12 months;
  - this year → its months so far;
  - last year → its 12 months;
  - lifetime → per year.

  The panel heading names the window.
- **Depth:** no shadows on panels. Depth comes from the bg → surface → surface-2 steps. Shadows are only for
  floating layers (menus, tooltips, dialogs).
- **Radius:** `rounded-ui` (4px) everywhere, so it reads as machined, not bubbly.
- **Phones (390px):** everything must work, with no sideways scrolling.
  - Below `md`, tables become lists of cards: name and the key figure on top, the rest as a small figures grid,
    and the sparkline on the right. Card lists that drop sortable headers get a sort select.
  - Switches too wide for a phone use `Segmented collapse`, which becomes a native select below `sm`.
  - Grids collapse to one column, and the StatBand goes to two columns.

## Building blocks (`src/components`)

- **`Button`:** `variant="default|ghost|signal|selected"`, `size="sm|md|icon|icon-sm"`, plus any button attributes.
  Plain `<button>`s are unstyled (no global button CSS), so use this, or give a bare button its full utilities.
- **`Segmented`:** generic toggle group with `options={[{ value, label, icon?, title?, count? }]}`, `value` and
  `onchange`, plus `label` (accessible name), `size="sm|md"` and `iconOnly`. Use it for period, resolution and
  filter switches. A group too wide for its container scrolls sideways.
- **`Panel`:** `title`, `note` (quiet context such as "last month"), an `actions` snippet (controls on the right)
  and `children`. `flush` drops the body padding, for tables and edge-to-edge content.
- **`StatBand` + `Stat`:** `<Stat label value sub? icon? href? valueClass?>`.
- **`PageHeader`:** `title`, `description`, and `leading` / `actions` snippets.
- **`Tooltip`:** a `trigger(id)` snippet plus the content. Put `aria-describedby={id}` on the focusable trigger.
- **`Chart`:** a uPlot wrapper with `labels`, `series=[{ label, values, color: '--series-…', dash? }]` and
  `lastInProgress`. Line or bar is one global preference (`src/logic/chartPrefs`, persisted), and the toggle on any
  chart switches every chart; so does the y scale (linear, log via asinh so zero months still plot, or square root).
  Lines are 2px with one ringed dot on the latest finished period, no dot per point. Produced vs consumed fills
  the gap between the lines (produced hue where production leads, consumed where it trails); a lone series gets a
  soft area. Line mode leaves the period in progress out (a just-started month always plots as a crash to zero), so
  the legend reads the last finished period; bars keep it, shaded. Month ticks are two-tier: "M4" with the year
  under the first month and each new year. Bars are stacked: one bar per period made of all series, first series
  at the bottom, with 2px surface gaps between segments; legend and tooltip still show each series' own value. A
  `dash` series is a part of another (in storage within quantity): a dashed line, or a narrower lighter core inside
  the bar, never stacked on top.
  Hover works Grafana-style: the hovered period gets a soft column (`--hover`), and the series under the pointer
  stays bright while the others dim (nearest line, or the stacked segment under the pointer) in the plot, legend and
  tooltip. The tooltip heads with the period, lists rows in stack order and adds a total for stacked bars.
- **`RecipeIcons`:** draws a recipe name ("A + B → C") as product icons.
- **Tables:** `<table class="data-table">`, with `num` on numeric `th`/`td`. Header text is sentence case, and
  row hover is built in.
- **Icons:** Lucide, one import per icon: `import TriangleAlert from '@lucide/svelte/icons/triangle-alert'`, then
  `<TriangleAlert size={16} aria-hidden="true" />`.

## Copy

Words have to earn their place. No page descriptions, footnotes or "how this is computed" paragraphs. Name things
so they explain themselves: a panel called "Running out" needs no rule underneath it. When an explanation is truly
needed, put it in a Tooltip on an info icon. Nothing is set smaller than 13px.

## Weight

Marks register by shape and fill, not by thickness: chart lines are 2px, sparklines 1.5px, meters and share bars
8px tall, and legend swatches 4px.

Sparklines (`Sparkline`) are about shape, since the row's figures carry the level: the y-scale fits the row's own
range (its span at least 25% of the top value, so noise stays flat), they show the last 12 finished periods
(`sparkValues`, or `partialLast`), end in a ringed dot, and use the same produced/consumed gap fill as the charts.

## Motion

Almost none. Color and background transitions are 100ms. The live connection dot pulses, and that is the only
ambient motion. Respect `motion-reduce:`.

## Tailwind practice

- Reuse comes from **Svelte components**, not `@apply` classes. `src/app.css` holds only tokens, element
  defaults, `.data-table`, `num` and `hazard`.
- Prefer scale values (`px-3`, `gap-4`, `size-8`, `h-9`) over arbitrary ones. Use arbitrary values only when the
  scale has nothing close.
- Class names must appear complete in the source. Map states to full class strings with lookup objects
  (`{ critical: 'text-critical', … }`), never `text-${x}`. Combine with Svelte `class={[...]}` arrays.
- Space elements with `gap` on flex/grid parents, not margins between siblings.
- No `dark:` variants unless a token really can't express it; the tokens already switch.
- No component `<style>` blocks.
