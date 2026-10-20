# Converts "Perchling" in Nunito ExtraBold (800) to SVG outlines: assets/brand/wordmark.svg.
# Run: python3 -I assets/brand/tools/wordmark.py <path to Nunito[wght].ttf> [fontTools package dir]
# The font is google/fonts' ofl/nunito/Nunito[wght].ttf (SIL OFL 1.1); see assets/brand/README.md.
# Glyph offsets are the font's own advances and kerning (as Chrome lays them out at 1000 px,
# i.e. in font units), plus the hand adjustments in TWEAK.
import os
import re
import sys

if len(sys.argv) > 2:
    sys.path.insert(0, sys.argv[2])
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

TEXT = 'Perchling'
# Offsets from Chrome at 1000 px with font-kerning on: the font's kerning tightens "Pe" and "rc".
FONT_X = [0, 637.42, 1186.42, 1589.8, 2067.8, 2662.8, 2995.8, 3263.8, 3858.8]
# Hand kerning, in font units, applied cumulatively before each glyph.
TWEAK = [0, -6, -4, -10, -8, -14, -16, -12, -10]
TRACK = -6  # light overall tightening for display sizes, per glyph after the first
INK = '#262B36'
TEAL = '#14A39A'

font = TTFont(sys.argv[1])
inst = instantiateVariableFont(font, {'wght': 800}, inplace=False)
gs = inst.getGlyphSet()
cmap = inst.getBestCmap()
version = inst['name'].getDebugName(5)

num = re.compile(r'-?\d+(?:\.\d+)?')

def transform(d, dx, base):
    """Moves a glyph's absolute path by dx and flips it about the baseline (font y-up to SVG y-down).
    fontTools' pen writes M, L, H, V, Q, C and Z; H and V become L so every point is explicit."""
    toks = re.findall(r'[MLHVQCZ]|-?\d+(?:\.\d+)?', d)
    out, i, cx, cy, cmd = [], 0, 0.0, 0.0, None
    pt = lambda x, y: f'{x + dx:.1f} {base - y:.1f}'
    while i < len(toks):
        t = toks[i]
        if t in 'MLHVQCZ':
            cmd = t
            i += 1
            if t == 'Z':
                out.append('Z')
            continue
        if cmd in 'ML':
            cx, cy = float(toks[i]), float(toks[i + 1]); i += 2
            out.append(f'{cmd}{pt(cx, cy)}')
        elif cmd == 'H':
            cx = float(toks[i]); i += 1
            out.append(f'L{pt(cx, cy)}')
        elif cmd == 'V':
            cy = float(toks[i]); i += 1
            out.append(f'L{pt(cx, cy)}')
        elif cmd == 'Q':
            x1, y1, cx, cy = (float(v) for v in toks[i:i + 4]); i += 4
            out.append(f'Q{pt(x1, y1)} {pt(cx, cy)}')
        elif cmd == 'C':
            x1, y1, x2, y2, cx, cy = (float(v) for v in toks[i:i + 6]); i += 6
            out.append(f'C{pt(x1, y1)} {pt(x2, y2)} {pt(cx, cy)}')
    return ''.join(out)

def subpaths(d):
    return [p for p in re.split(r'(?=M)', d) if p]

def ys(d):
    v = [float(n) for n in num.findall(d)]
    return v[1::2]

BASE = 760.0
paths, dot = [], None
xmin, xmax, ymin, ymax = 1e9, -1e9, 1e9, -1e9
shift = 0.0
for i, ch in enumerate(TEXT):
    shift += TWEAK[i] + (TRACK if i else 0)
    dx = FONT_X[i] + shift
    pen = SVGPathPen(gs)
    gs[cmap[ord(ch)]].draw(pen)
    d = pen.getCommands()
    if ch == 'i':
        parts = subpaths(d)
        top = max(parts, key=lambda p: min(ys(p)))
        dot = transform(top, dx, BASE)
        d = ''.join(p for p in parts if p is not top)
    t = transform(d, dx, BASE)
    paths.append(t)
    for p in [t] + ([dot] if ch == 'i' else []):
        v = [float(n) for n in num.findall(p)]
        xs, yv = v[0::2], v[1::2]
        xmin, xmax = min(xmin, *xs), max(xmax, *xs)
        ymin, ymax = min(ymin, *yv), max(ymax, *yv)

pad = 20
vx, vy = round(xmin - pad), round(ymin - pad)
vw, vh = round(xmax - xmin + 2 * pad), round(ymax - ymin + 2 * pad)
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx} {vy} {vw} {vh}" width="{vw // 4}" height="{vh // 4}">\n'
    f'  <path class="ink" fill="{INK}" d="{"".join(paths)}"/>\n'
    f'  <path class="dot" fill="{TEAL}" d="{dot}"/>\n'
    '</svg>\n'
)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wordmark.svg')
open(out, 'w').write(svg)
print('wrote', os.path.normpath(out), '| Nunito', version, '| baseline', BASE, '| viewBox', vx, vy, vw, vh)
