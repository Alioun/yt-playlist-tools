# Converts short lines of text to SVG outlines in Nunito at a given weight, for the brand images.
# Run: python3 -I assets/brand/tools/textpath.py <Nunito[wght].ttf> <positions.json> <out.json> [fontTools dir]
# positions.json: [{"key", "text", "weight", "x": [offset of each character at 1000 px]}], measured in
# Chrome with the font's kerning (see README). Output: {key: {"d", "width"}} in font units, baseline y = 0,
# y down, so a line drops into SVG with translate(x, baseline) scale(size / 1000).
import json
import re
import sys

if len(sys.argv) > 4:
    sys.path.insert(0, sys.argv[4])
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

def transform(d, dx):
    toks = re.findall(r'[MLHVQCZ]|-?\d+(?:\.\d+)?', d)
    out, i, cx, cy, cmd = [], 0, 0.0, 0.0, None
    pt = lambda x, y: f'{x + dx:.1f} {-y:.1f}'
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

font = TTFont(sys.argv[1])
lines = json.load(open(sys.argv[2]))
res = {}
for line in lines:
    inst = instantiateVariableFont(font, {'wght': line['weight']}, inplace=False)
    gs, cmap, hmtx = inst.getGlyphSet(), inst.getBestCmap(), inst['hmtx']
    d = ''
    for ch, x in zip(line['text'], line['x']):
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(pen)
        d += transform(pen.getCommands(), x)
    last = line['text'][-1]
    res[line['key']] = {'text': line['text'], 'weight': line['weight'], 'd': d, 'width': round(line['x'][-1] + hmtx[cmap[ord(last)]][0], 1)}
json.dump(res, open(sys.argv[3], 'w'), indent=1, ensure_ascii=False)
print('wrote', sys.argv[3], list(res))
