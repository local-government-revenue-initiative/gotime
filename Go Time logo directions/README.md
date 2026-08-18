# Handoff: Go Time — brand identity (logo, favicon, tokens)

## Overview
Go Time is a web app for finding preferred dates and times for meetings, trips and
other events. This bundle is the brand identity for it: the logo system ("The Grid"),
the favicon / app icon, and the design tokens (colour, type, spacing, radius, shadow,
motion) the app's UI should be built on.

The identity deliberately references an existing institutional design system (University
Blue anchor, Prosperity Green / Sea Turquoise / Sunny Yellow accents, Avenir-style
geometric sans, solid colour blocks, squared geometric forms) **without** reusing that
organisation's logo or naming it anywhere. The mark and wordmark here are original to
Go Time.

## About the Design Files
The files in this bundle are **design references**. `Go Time Logo.dc.html` is an HTML
prototype of the logo specimen board — it exists to show intended look, proportion and
colour, not to be shipped. The SVGs in `assets/` and `tokens.css` **are** production
assets and can be used directly.

The task is to adopt this branding inside Go Time's own codebase using its established
patterns (React/Vue/Tailwind/CSS modules/etc.). If no styling environment exists yet,
pick the framework that fits the project and express the tokens in its idiom (CSS custom
properties as shipped, a Tailwind theme extension, or a JS/TS token module).

## Fidelity
**High-fidelity.** Colours, weights, geometry and proportions are final. Reproduce the
mark exactly from the SVGs; do not redraw it. Type sizes given for the lockup are exact;
UI type sizes elsewhere in the app are guidance until those screens are designed.

## The logo system

### The mark
A 3×3 grid of equal squares on a 64×64 canvas: nine candidate slots in a week. Cells are
16×16 with a 4px gutter, first cell at (4,4), so cell origins are at x/y = 4, 24, 44.
No rounding on the cells — the forms stay squared.

Cell colours (row-major):

| | col 1 | col 2 | col 3 |
|---|---|---|---|
| row 1 | `#D1D4DE` | `#D1D4DE` | `#009E47` |
| row 2 | `#D1D4DE` | `#FFC70A` | `#D1D4DE` |
| row 3 | `#1A2E5A` | `#D1D4DE` | `#47BFAF` |

Meaning: `#FFC70A` (Sunny Yellow) is the agreed slot; green, turquoise and blue are
votes cast; `#D1D4DE` (Blue 20%) cells are still open. The colour placement is fixed —
do not shuffle it per instance.

### The wordmark
"Go Time" in Mulish (stand-in for Avenir LT — see *Type* below), set as one line:
**"Go" at weight 800**, a single space, **"Time" at weight 200**, tracking `-0.02em`,
colour `#1A2E5A`. Sentence case, always two words with a space, never "GoTime".

### Lockups
- **Horizontal (primary)** — mark left, wordmark right, gap = 14px when the mark is 44px
  (≈ 0.32× mark height). Vertically centred on the wordmark's cap height.
  Wordmark size ≈ 0.68× mark height (44px mark → 30px type).
- **Stacked** — mark centred above the wordmark, gap 14px at an 88px mark, wordmark 28px.
- **Reverse (on University Blue)** — open cells become `#484F73` (Blue 80%), the blue
  cell becomes `#FFFFFF`, accents stay; wordmark `#FFFFFF`.
- **Single colour** — all claimed cells `#1A2E5A`, open cells `#D1D4DE`; on dark, all
  claimed cells `#FFFFFF`, open cells `#484F73`.

### Clear space & minimum size
Clear space on all four sides equals one grid cell of the mark at its rendered size
(≈ 0.25× mark height; 22px at an 88px mark). Nothing — type, image edge, container
border — inside it.

Minimum mark size **22px**. Below a 30px mark, set "Time" at weight 400 instead of 200
so the light weight does not disappear.

### Don'ts
- Do not recolour, reorder or animate the cells, or add a fourth row/column.
- Do not round the cells, outline them, or add gradients or shadows to the mark.
- Do not place the wordmark in all-caps, condense it, or change the weight contrast.
- Do not set the colour mark on any background other than white, `#F3F4F7`, or
  `#1A2E5A` (use the reverse version on blue).

## Favicon & app icon
At icon sizes the 3×3 grid loses legibility, so the icon uses a **2×2** grid on a solid
`#1A2E5A` field:

- Canvas 64×64, field `#1A2E5A`, radius **10** for the favicon, **14** for the app icon.
- Four 17×17 cells at (12,12) `#FFFFFF`, (35,12) `#009E47`, (12,35) `#47BFAF`,
  (35,35) `#FFC70A`.

Verified legible at 16px. PNG rasters ship in `assets/`: `favicon-16/32/48/64/192/512.png`
(radius 10), `apple-touch-icon-180.png` and `app-icon-512.png` (radius 14). Suggested head:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="icon" href="/favicon-16.png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1A2E5A">
```

Manifest icons: `favicon-192.png` (any) and `app-icon-512.png` (any maskable) — the
maskable safe zone is satisfied because the cells sit well inside the field.

## Design tokens
Full set in `tokens.css` (CSS custom properties, prefix `--gt-`). Summary:

**Colour** — Blue `#1A2E5A` (primary), Clear Blue `#304D9B` (links), Green `#009E47`,
Turquoise `#47BFAF`, Yellow `#FFC70A`, Off Black `#1E1B1D` (body). Blue tints 80/60/40/20/10/5:
`#484F73` `#767C9B` `#A3A8BC` `#D1D4DE` `#E8E9EF` `#F3F4F7`. Warm neutral ramp
900→050: `#1E1B1D` `#353133` `#4E4A4C` `#6B6769` `#8C888A` `#ABA8A9` `#CBC9CA`
`#E4E2E3` `#F1F0F0` `#F8F7F7`. Use colour as **solid blocks** — no gradients.

**Type** — Mulish, weights 200 display / 400 body / 600 sub-head / 700 heading / 800 logo.
Display ≥3× body at `-0.02em`; headings 700 at ≥1.25× body; ALL-CAPS labels at
`0.12em` tracking. Sentence case for headlines and body.

**Spacing** — 4px base: 4, 8, 12, 16, 24, 32, 40, 56, 80. Max content width 1200px,
reading measure ~760px, 24px gutters.

**Radius** — controls 6px, cards 8px, favicon field 10px, app icon 14px, pills 999px,
badges 3px.

**Shadow** — blue-tinted only, never neutral grey:
xs `0 1px 2px rgba(26,46,90,.06)`, sm `0 1px 3px rgba(26,46,90,.08)`,
md `0 4px 12px rgba(26,46,90,.10)`, lg `0 10px 28px rgba(26,46,90,.12)`.
Focus ring `0 0 0 3px rgba(48,77,155,.55)`.

**Motion** — 120–180ms ease. Cards lift 2–3px on hover; buttons darken (~`brightness(.92)`)
on hover and translate 1px down on press. No bounces, no looping decoration.

## Voice (for app copy)
Grounded and plain. Full sentences, sentence case, no hype, **no emoji**. ALL-CAPS
letter-spaced labels for eyebrows and metadata. Describe scheduling in concrete terms
("Pick the times that work", "3 of 5 have replied") rather than marketing language.

## Assets
All original, drawn as SVG for this handoff — no third-party or licensed artwork.

| File | Use |
|---|---|
| `assets/logo-mark.svg` | mark, colour, on light |
| `assets/logo-mark-white.svg` | mark, reverse, on `#1A2E5A` |
| `assets/logo-mark-mono-blue.svg` | mark, single colour |
| `assets/logo-horizontal.svg` | primary lockup, on light |
| `assets/logo-horizontal-white.svg` | primary lockup, reverse |
| `assets/logo-horizontal-mono-blue.svg` | primary lockup, single colour |
| `assets/logo-stacked.svg` | stacked lockup |
| `assets/favicon.svg` | favicon (2×2, radius 10) |
| `assets/app-icon.svg` | app / PWA icon (2×2, radius 14) |
| `assets/favicon-16…512.png` | favicon rasters, radius 10 |
| `assets/apple-touch-icon-180.png` | iOS home screen |
| `assets/app-icon-512.png` | PWA manifest icon |
| `tokens.css` | design tokens |

Note on the lockup SVGs: the wordmark is live `<text>` in Mulish so it stays editable.
If you need the lockup to render identically without the webfont (email, OG image,
third-party embed), convert the text to outlines or use the mark SVG plus HTML text.

**Font licence:** Mulish is an open Google Font and can ship as-is. It stands in for
Avenir LT, which is a licensed Linotype face — if Go Time later licenses Avenir LT,
swap the `@import` in `tokens.css` for the licensed webfont and change no other value.

## Files
- `Go Time Logo.dc.html` — the specimen board prototype. Its top section is the selected
  direction ("The Grid") with the full lockup set; the section below it holds the two
  directions that were not chosen, kept for reference.
- `assets/`, `tokens.css` — production assets, described above.
