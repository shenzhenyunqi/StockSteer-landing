#!/usr/bin/env python3
"""Generate StockSteer brand SVGs: mark, app icon, lockups, mono + README."""
import math, os

# ---------- oklch -> sRGB hex ----------
def oklch_hex(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    r = +4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bl = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    def gam(u):
        u = max(0.0, min(1.0, u))
        return 12.92*u if u <= 0.0031308 else 1.055*(u**(1/2.4)) - 0.055
    return '#%02X%02X%02X' % tuple(round(gam(v)*255) for v in (r, g, bl))

TEAL    = oklch_hex(0.44, 0.075, 200)   # --primary film teal
INK     = oklch_hex(0.27, 0.022, 220)   # --ink
DEEP    = oklch_hex(0.30, 0.045, 215)   # --deep emulsion panel
PAPER   = oklch_hex(0.976, 0.006, 200)  # --bg toned paper
AMBER   = oklch_hex(0.50, 0.115, 55)    # --accent film amber
AMBER_D = oklch_hex(0.68, 0.125, 60)    # amber lifted for dark ground

# ---------- the mark: "dispatch S" on a 48 grid ----------
# The S is the allocation route drawn as a duct: stroke 10, counters 5,
# body x/y [4,44]. The four outer elbows bend at r7 while every inner
# corner and both terminals stay square-cut, so the ports flare open like
# intakes. The route is soft; the cargo is hard: a sharp 10x10 amber block,
# tilted 6 degrees mid-dispatch, docked where the top stroke was cut.
def s_duct():
    return ('M11 4'
            'L29 4L29 14L14 14L14 19'      # top terminal + inner elbow 1
            'L37 19A7 7 0 0 1 44 26'       # flared top port + outer elbow 3
            'L44 37A7 7 0 0 1 37 44'       # outer elbow 4
            'L4 44L4 34L34 34L34 29'       # bottom terminal + inner elbows
            'L11 29A7 7 0 0 1 4 22'        # flared bottom port + outer elbow 2
            'L4 11A7 7 0 0 1 11 4'         # outer elbow 1
            'Z')

def mark_body(fg, unit_c):
    return (f'<path d="{s_duct()}" fill="{fg}"/>'
            f'<rect x="34" y="4" width="10" height="10" fill="{unit_c}" transform="rotate(-6 39 9)"/>')

def mark_svg(fg, unit_c):
    return ('<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'
            + mark_body(fg, unit_c) + '</svg>')

def app_svg():
    return (f'<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">'
            f'<rect width="64" height="64" rx="14" fill="{DEEP}"/>'
            f'<g transform="translate(8 8)">{mark_body(PAPER, AMBER_D)}</g></svg>')

# ---------- wordmark: Hiragino Sans W7 outlines ----------
from fontTools.ttLib import TTCollection
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

coll = TTCollection('/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc', lazy=True)
font = next(f for f in coll.fonts if 'HiraginoSans-W7' in (f['name'].getDebugName(6) or ''))
cmap = font.getBestCmap()
glyphset = font.getGlyphSet()
hmtx = font['hmtx']

def glyph_info(ch):
    g = cmap[ord(ch)]
    p = SVGPathPen(glyphset); glyphset[g].draw(p)
    b = BoundsPen(glyphset); glyphset[g].draw(b)
    return p.getCommands(), hmtx[g][0], b.bounds

_, _, sb = glyph_info('S')
CAP = sb[3]

TEXT = 'StockSteer'
KERN = {'St': -14, 'kS': -8}   # optical, font units (no GPOS data for these pairs)
TRACK = -2                     # global, font units per gap

def wordmark_parts(scale, x0, baseline):
    parts, x, prev = [], x0, None
    for ch in TEXT:
        cmds, adv, _ = glyph_info(ch)
        if prev is not None:
            x += (KERN.get(prev + ch, 0) + TRACK) * scale
        parts.append(f'<path transform="translate({x:.2f} {baseline:.2f}) scale({scale:.6f} {-scale:.6f})" d="{cmds}"/>')
        x += adv * scale
        prev = ch
    return parts, x

def lockup_svg(mark_fg, unit_c, text_c):
    cap_target = 27.0
    scale = cap_target / CAP
    baseline = 24 + cap_target / 2          # cap block optically centered on mark
    parts, xend = wordmark_parts(scale, 48 + 17, baseline)
    w = math.ceil(xend)
    return (f'<svg width="{w}" height="48" viewBox="0 0 {w} 48" fill="none" xmlns="http://www.w3.org/2000/svg">'
            + mark_body(mark_fg, unit_c)
            + f'<g fill="{text_c}">{"".join(parts)}</g></svg>')

def square_svg(mark_fg, unit_c, text_c, S=160):
    """1:1 stacked lockup: mark on top, wordmark below, square canvas."""
    # measure text width at cap=1 to size it to ~84% of canvas
    unit_parts, unit_end = wordmark_parts(1.0 / CAP, 0, 0)
    text_w_per_cap = unit_end                     # width when cap == 1
    cap_target = (0.84 * S) / text_w_per_cap
    scale = cap_target / CAP
    text_w = text_w_per_cap * cap_target
    mark_scale = (0.42 * S) / 48.0
    mark_w = 48 * mark_scale
    gap = 0.125 * S
    total_h = mark_w + gap + cap_target
    top = (S - total_h) / 2 - 0.01 * S            # slight optical lift
    mark_x = (S - mark_w) / 2
    baseline = top + mark_w + gap + cap_target
    parts, _ = wordmark_parts(scale, (S - text_w) / 2, baseline)
    return (f'<svg width="{S}" height="{S}" viewBox="0 0 {S} {S}" fill="none" xmlns="http://www.w3.org/2000/svg">'
            f'<g transform="translate({mark_x:.2f} {top:.2f}) scale({mark_scale:.4f})">'
            + mark_body(mark_fg, unit_c) + '</g>'
            f'<g fill="{text_c}">{"".join(parts)}</g></svg>')

OUT = '/Users/okonma/CodeSpace/StockSteer-Mono/StockSteer-landing/brand'
os.makedirs(OUT, exist_ok=True)

files = {
    'logo-square.svg':         square_svg(TEAL, AMBER, INK),
    'logo-square-inverse.svg': square_svg(PAPER, AMBER_D, PAPER),
    'logo-mark.svg':           mark_svg(TEAL, AMBER),
    'logo-mark-inverse.svg':   mark_svg(PAPER, AMBER_D),
    'logo-mark-mono.svg':      mark_svg(INK, INK),
    'logo-app.svg':            app_svg(),
    'favicon.svg':             app_svg(),
    'logo-lockup.svg':         lockup_svg(TEAL, AMBER, INK),
    'logo-lockup-inverse.svg': lockup_svg(PAPER, AMBER_D, PAPER),
}
for name, svg in files.items():
    with open(os.path.join(OUT, name), 'w') as fh:
        fh.write(svg + '\n')
    print('wrote', name)

README = f"""# StockSteer brand assets

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

## Colors (from styles.css tokens)

| role | oklch | hex fallback |
|---|---|---|
| channel teal | `oklch(0.44 0.075 200)` (--primary) | `{TEAL}` |
| unit amber | `oklch(0.50 0.115 55)` (--accent) | `{AMBER}` |
| unit amber on dark | `oklch(0.68 0.125 60)` | `{AMBER_D}` |
| ink | `oklch(0.27 0.022 220)` (--ink) | `{INK}` |
| emulsion | `oklch(0.30 0.045 215)` (--deep) | `{DEEP}` |
| paper | `oklch(0.976 0.006 200)` (--bg) | `{PAPER}` |

## Rules

- Wordmark is outlined from a kaku-gothic W7 (StockSteer set as paths - no
  font dependency). Don't retype it in another font next to the mark.
- Clear space: half the mark's height on all sides.
- Minimum sizes: mark 16px, lockup 96px wide, app tile any.
- The amber block is part of the glyph. Don't recolor it to teal, don't drop
  it (except in the mono variant, where it stays as the detached square).
- Regenerate everything: `python3 gen_logo.py` (script lives in repo tooling;
  needs macOS Hiragino Sans + fontTools).

Specimen: open `specimen.html` under a local server.
"""
with open(os.path.join(OUT, 'README.md'), 'w') as fh:
    fh.write(README)
print('wrote README.md')

# favicon data URI (URL-encoded) for direct <link> embedding
import urllib.parse
enc = urllib.parse.quote(files['favicon.svg'], safe="/ :='")
print('\nFAVICON_DATA_URI:\ndata:image/svg+xml,' + enc.replace("'", "%27"))
