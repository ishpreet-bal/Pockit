# STEP 6 — UI Design System

## 6.1 Principle

A finance app earns trust through **legibility and consistency**, not decoration. Numbers are the
content; everything else is chrome. The house style: quiet surfaces, one accent, generous whitespace,
tabular figures, and a strict typographic scale.

## 6.2 Colour tokens

Defined as CSS custom properties on `:root`, re-declared for dark. Components reference tokens only —
never a raw hex, never a Tailwind palette colour for anything semantic.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fbfbfa` | `#0b0c0e` | Page ground |
| `--surface` | `#ffffff` | `#141619` | Cards |
| `--surface-2` | `#f5f5f4` | `#1b1e22` | Nested / hover |
| `--border` | `#e7e5e4` | `#282c32` | Hairlines |
| `--text` | `#1c1917` | `#f2f3f5` | Primary |
| `--text-muted` | `#6b6560` | `#9aa0a8` | Secondary |
| `--text-subtle` | `#8f8a85` | `#6d747c` | Tertiary |
| `--accent` | `#2f6f5e` | `#4fbf9a` | Brand, primary action |
| `--positive` | `#177245` | `#4ade80` | Income, gains, under budget |
| `--negative` | `#a4303f` | `#f87171` | Expense, losses, over budget |
| `--warning` | `#9a6700` | `#fbbf24` | Approaching a limit |
| `--info` | `#1f5f8b` | `#60a5fa` | Neutral notice |

**Green/red discipline:** colour is never the only carrier of meaning (sign and label always present),
and `--positive`/`--negative` are reserved for *money direction*, never for UI state.

**Chart series** (`--chart-1` … `--chart-8`) are a separate, categorically-distinct ramp tuned for both
themes, so a pie chart never reuses the semantic income/expense colours.

## 6.3 Typography

- **Family:** system UI stack (`ui-sans-serif, -apple-system, "Segoe UI", Roboto, …`). No webfont —
  a finance dashboard should render instantly, and system fonts have the best numeral coverage.
- **Numerals:** `font-variant-numeric: tabular-nums` on every monetary figure, so columns align and
  digits do not jitter as values update.
- **Scale:** 12 / 13 / 14 / 16 / 20 / 24 / 32 / 40 px. Nothing between.
- **Weights:** 400 body, 500 labels, 600 headings and figures. No 700+ — it reads as shouting.
- **Money display:** the currency symbol and the cents are rendered at reduced emphasis so the
  significant digits dominate: `$**1,284**.50`.

## 6.4 Spacing & layout

- 4 px base unit; the scale is 4/8/12/16/24/32/48/64.
- Card padding: 20 px desktop, 16 px mobile.
- Content max width 1280 px; the ledger table is allowed full width.
- Grid: 12-column desktop, 6-column tablet, 1-column mobile.
- Radii: 8 px controls, 12 px cards, 999 px pills.
- Shadows: almost none. One `--shadow-sm` for overlays. Depth comes from borders.

## 6.5 Components

**Card** — `--surface` on `--bg`, 1 px `--border`, 12 px radius. Header is a 13 px uppercase-tracked
muted label plus optional action. Never an empty card: every card ships an empty state with one
sentence and one action.

**Stat** — label (13 px muted) / value (32 px, 600, tabular) / delta (13 px with sign, arrow, and
period). The delta is always accompanied by *what it is compared against*.

**Table** — 13 px, 40 px rows, sticky header, right-aligned numerics, zebra off, hover `--surface-2`.
Bulk selection via a leading checkbox column. On mobile the table becomes a card list with the two
most important fields on the first line.

**Charts** — Recharts. No gridlines on the Y axis beyond 4 ticks, no 3D, no gradients except a single
low-opacity area fill. Every chart has: an accessible title, a value formatter that matches the rest
of the app, a tooltip showing the exact figure, and an empty state.

**Forms** — labels above inputs, 40 px controls, inline validation on blur, error text below in
`--negative`. Money inputs accept `1,234.56`, `1234.56`, `$1234.56` and normalise on blur. Every input
has a real `<label>`.

**Buttons** — primary (accent fill), secondary (surface + border), ghost (text only), danger
(negative). 36 px tall, 13 px 500. Loading state replaces the label with a spinner *and keeps the
width*, so layout does not jump.

**Modal / Sheet** — centred dialog on desktop, bottom sheet on mobile, both from one component. Focus
trapped, `Esc` closes, background scroll locked.

**Progress** — budget bars are 6 px, with a thin marker showing *time elapsed in the period*, so
"68% spent" is instantly readable against "60% of the month gone".

## 6.6 Navigation

- **Desktop:** 240 px fixed left sidebar. Workspace switcher pinned at the top (colour-coded:
  personal = accent, business = indigo). Sections grouped Money / Plan / Grow / Manage.
- **Mobile:** bottom tab bar with 5 destinations (Overview, Transactions, Add, Budget, More) and a
  centre "+" that opens quick-add. Everything else lives behind More.
- **⌘K command palette** everywhere: jump to a page, add a transaction, run a search, ask the assistant.

## 6.7 Mobile behaviour

- Touch targets ≥44 px.
- The add-transaction sheet opens with the numeric keypad focused.
- Tables collapse to cards; charts keep full width and lose the legend to a tap-reveal.
- Upload uses `<input type="file" accept="image/*" capture="environment">` for direct camera capture.
- Safe-area insets respected on the bottom bar.

## 6.8 Dark mode

Not an inversion. Dark surfaces are slightly blue-shifted, borders are lighter relative to the
surface, and the accent brightens for contrast. Theme is applied by a `data-theme` attribute set
before paint by an inline script, so there is no flash. `system` is the default.

## 6.9 Accessibility

- All text meets WCAG AA (4.5:1); large figures meet 3:1 minimum but are targeted at 4.5:1.
- Every interactive element is keyboard reachable with a visible `:focus-visible` ring in `--accent`.
- Charts have a table-equivalent behind a "View data" toggle.
- `aria-live="polite"` for figures that update after a filter change.
- `prefers-reduced-motion` disables all transitions.
