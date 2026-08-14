# StockSteer brand assets

**The mark — "dispatch S".** The S is the allocation route, drawn as a duct:
one 10-unit stroke on a 48 grid whose four outer elbows bend at r7 while
every inner corner and both terminals stay square-cut, so the two ports
flare open like intakes. The two slots the S cuts are the two channels
(Shopify / Amazon). The route is soft; the cargo is hard: where the top
stroke was cut, a sharp amber block sits tilted 6 degrees, mid-dispatch —
the unit of stock leaving for the channel that earns more. Teal is the
channel, amber is the goods: the landing page's film-grade teal x amber
pairing, in one gesture.

## Files

| file | use |
|---|---|
| `logo-lockup.svg` | full lockup on light grounds (paper, white cards) |
| `logo-lockup-inverse.svg` | full lockup on the deep emulsion panel |
| `logo-mark.svg` | mark alone, light grounds, >=20px |
| `logo-mark-inverse.svg` | mark alone, dark grounds |
| `logo-mark-mono.svg` | one-color contexts (print, embossing, disabled states) |
| `logo-app.svg` / `favicon.svg` | app icon / browser tab (emulsion tile, rx 14/64) |
| `og-image.svg` | Open Graph card source, 1200x630 (hero composition: emulsion panel + specimen card) |

## Colors (from styles.css tokens)

| role | oklch | hex fallback |
|---|---|---|
| channel teal | `oklch(0.44 0.075 200)` (--primary) | `#005F63` |
| unit amber | `oklch(0.50 0.115 55)` (--accent) | `#944E12` |
| unit amber on dark | `oklch(0.68 0.125 60)` | `#D08440` |
| ink | `oklch(0.27 0.022 220)` (--ink) | `#1A292E` |
| emulsion | `oklch(0.30 0.045 215)` (--deep) | `#0C333C` |
| paper | `oklch(0.976 0.006 200)` (--bg) | `#F3F8F9` |

## Rules

- Wordmark is outlined from a kaku-gothic W7 (StockSteer set as paths - no
  font dependency). Don't retype it in another font next to the mark.
- Clear space: half the mark's height on all sides.
- Minimum sizes: mark 16px, lockup 96px wide, app tile any.
- The amber block is part of the glyph. Don't recolor it to teal, don't drop
  it (except in the mono variant, where it stays as the detached square).
- Regenerate everything: `python3 gen_logo.py` (script lives in repo tooling;
  needs macOS Hiragino Sans + fontTools).
- The OG card is the one asset that ships as a raster. After editing
  `og-image.svg`, re-render it from the repo root — the deployed PNG is not
  generated at build time:
  `rsvg-convert -w 1200 -h 630 brand/og-image.svg -o og-image.png`
  Everything in `brand/` is excluded from the deploy by `.vercelignore`;
  `og-image.png` sits at the root because `og:image` must be publicly fetchable.

Specimen: open `specimen.html` under a local server.
