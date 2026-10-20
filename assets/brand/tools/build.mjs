// Composes the wordmark variants, lockups and store images from assets/icon/icon.svg and
// assets/brand/wordmark.svg, exports their PNGs, builds sheet.html and renders sheet.png.
// Run: node assets/brand/tools/build.mjs
// Env: PLAYWRIGHT_CORE (path to playwright-core), CHROME (browser binary), CHROME_LIBS (extra LD_LIBRARY_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || '/tmp/pw/node_modules/playwright-core');
const executablePath = process.env.CHROME || '/tmp/ytprobe-cft/chrome/linux-155.0.8059.84/chrome-linux64/chrome';
const libs = process.env.CHROME_LIBS ?? '/tmp/ytprobe-libs/usr/lib/x86_64-linux-gnu';

// ---- Palette -------------------------------------------------------------------------------
const C = {
  ink: '#262B36', // wordmark on light
  paper: '#F1F3F6', // wordmark on dark
  teal: '#14A39A',
  violet: '#7B5CD6',
  night: '#2B2170', // store images' background: a deep, saturated violet
  hole: '#251C63', // the faint pigeonhole wall behind
  holeCard: '#30267A',
  lavender: '#BDB2F2', // "for YouTube™" on the social preview
  mist: '#E4E1F7', // the social preview's line
  cabinet: '#8E74E2',
  cabinetShade: '#6E52CC',
  ink2: '#26223C',
  card: '#F5F7FA',
  cardBack: '#CDD3DC',
};

// ---- Parts ---------------------------------------------------------------------------------
const iconSrc = fs.readFileSync(path.join(dir, '..', 'icon', 'icon.svg'), 'utf8');
const wmSrc = fs.readFileSync(path.join(dir, 'wordmark.svg'), 'utf8');
const iconInner = iconSrc.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const wmView = wmSrc.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number); // x y w h
const wmInk = wmSrc.match(/<path class="ink"[^>]* d="([^"]+)"/)[1];
const wmDot = wmSrc.match(/<path class="dot"[^>]* d="([^"]+)"/)[1];
const WM = { x: wmView[0], y: wmView[1], w: wmView[2], h: wmView[3], base: 760, cap: 705 };
let k = 0;
// The icon's artwork (96 units) at x, y and size, with its gradient id made unique.
function icon(x, y, size) {
  const id = `n${++k}`;
  const inner = iconInner.replace(/id="neck"/g, `id="${id}"`).replace(/url\(#neck\)/g, `url(#${id})`);
  return `<g transform="translate(${x} ${y}) scale(${size / 96})">${inner}</g>`;
}
// The wordmark with its left edge at x, its baseline at y, and the given cap height.
function wordmark(x, baseline, capHeight, ink, dot = C.teal) {
  const s = capHeight / WM.cap;
  const left = WM.x + 20; // the viewBox has 20 units of padding
  return `<g transform="translate(${(x - left * s).toFixed(2)} ${(baseline - WM.base * s).toFixed(2)}) scale(${s.toFixed(5)})"><path fill="${ink}" d="${wmInk}"/><path fill="${dot}" d="${wmDot}"/></g>`;
}
const wmWidth = (capHeight) => (WM.w - 40) * (capHeight / WM.cap);
const svg = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${extra}>\n${body}\n</svg>\n`;

// A faint wall of pigeonholes behind the store images: an aligned grid of holes, cw × ch, with a
// frame of `gap` between them, centred on the image. Every few holes holds a faint card, on a fixed
// pattern so the wall looks used but stays quiet.
function wall(W, H, cw, ch, gap, clear = [0, 0, 0, 0]) {
  const cols = Math.ceil(W / (cw + gap)) + 1, rows = Math.ceil(H / (ch + gap)) + 1;
  const x0 = (W - (cols * (cw + gap) - gap)) / 2, y0 = (H - (rows * (ch + gap) - gap)) / 2;
  let s = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (cw + gap), y = y0 + r * (ch + gap);
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw}" height="${ch}" rx="${(ch / 8).toFixed(1)}" fill="${C.hole}"/>`;
      const [cx0, cy0, cx1, cy1] = clear;
      const inClear = x + cw > cx0 && x < cx1 && y + ch > cy0 && y < cy1;
      if ((r * 3 + c * 5) % 7 === 0 && !inClear) {
        const w = cw * 0.62, h = ch * 0.5;
        s += `<rect x="${(x + (cw - w) / 2).toFixed(1)}" y="${(y + ch - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${C.holeCard}"/>`;
      }
    }
  }
  return s;
}
const lines = JSON.parse(fs.readFileSync(path.join(dir, 'tools', 'lines.json'), 'utf8'));
// A line of text in outlines, its left edge at x and baseline at y, `size` px tall per em.
const line = (key, x, y, size, fill) => `<path transform="translate(${x} ${y}) scale(${size / 1000})" fill="${fill}" d="${lines[key].d}"/>`;

// ---- Wordmark and lockups ------------------------------------------------------------------
const out = {};
out['wordmark-on-light.svg'] = wmSrc;
out['wordmark-on-dark.svg'] = wmSrc.replace(`fill="${C.ink}"`, `fill="${C.paper}"`);

// Lockup: the icon at 96 units, the wordmark's cap height 40 units, baseline at 70, 14 units apart.
const LCAP = 40, LBASE = 70, LGAP = 14;
const lockW = Math.ceil(96 + LGAP + wmWidth(LCAP) + 4);
const lockup = (ink) => svg(lockW, 96, `${icon(0, 0, 96)}\n${wordmark(96 + LGAP, LBASE, LCAP, ink)}`);
out['lockup-on-light.svg'] = lockup(C.ink);
out['lockup-on-dark.svg'] = lockup(C.paper);

// ---- Store and social images ---------------------------------------------------------------
// The mark and the name side by side, centred: icon `size` px, a gap, then the wordmark at `cap`.
// The name's baseline sits half a cap below the icon's middle, level with the ledge.
function scene(W, H, { size, gap, cap, cell, dy = 0, below = 0, extra = () => '' }) {
  const total = size + gap + wmWidth(cap);
  const x0 = Math.round((W - total) / 2), iy = Math.round((H - size) / 2) + dy;
  const tx = x0 + size + gap, base = Math.round(iy + size / 2 + cap / 2);
  // No faint cards behind the mark or the text (with a margin of one frame).
  const m = cell ? cell[2] : 0;
  const clear = [x0 - m, iy - m, x0 + total + m, Math.max(iy + size, base + below) + m];
  const bg = `<rect width="${W}" height="${H}" fill="${C.night}"/>${cell ? wall(W, H, ...cell, clear) : ''}`;
  return svg(W, H, `${bg}\n${icon(x0, iy, size)}\n${wordmark(tx, base, cap, C.paper)}${extra(tx, base)}`);
}
// Small promo tile, 440 × 280: the mark and the name, nothing else (Chrome: "Avoid text").
out['promo-small-440x280.svg'] = scene(440, 280, { size: 150, gap: 16, cap: 34, cell: [58, 30, 10] });
// Marquee, 1400 × 560.
out['marquee-1400x560.svg'] = scene(1400, 560, { size: 360, gap: 50, cap: 96, cell: [128, 66, 20] });
// GitHub social preview, 1280 × 640: the full name and one line, raised to make room below.
out['social-preview-1280x640.svg'] = scene(1280, 640, {
  size: 280, gap: 46, cap: 84, cell: [124, 64, 20], dy: -26, below: 140,
  extra: (tx, base) => `\n${line('forYouTube', tx + 2, base + 62, 44, C.lavender)}\n${line('tagline', tx + 2, base + 124, 36, C.mist)}`,
});

for (const [f, s] of Object.entries(out)) fs.writeFileSync(path.join(dir, f), s);

// ---- PNG exports ---------------------------------------------------------------------------
const pngs = [
  ['wordmark-on-light.svg', 'wordmark-on-light-800.png', 800, true],
  ['wordmark-on-dark.svg', 'wordmark-on-dark-800.png', 800, true],
  ['lockup-on-light.svg', 'lockup-on-light-960.png', 960, true],
  ['lockup-on-dark.svg', 'lockup-on-dark-960.png', 960, true],
  ['lockup-on-light.svg', 'lockup-on-light-480.png', 480, true],
  ['lockup-on-dark.svg', 'lockup-on-dark-480.png', 480, true],
  ['promo-small-440x280.svg', 'promo-small-440x280.png', 440, false],
  ['marquee-1400x560.svg', 'marquee-1400x560.png', 1400, false],
  ['social-preview-1280x640.svg', 'social-preview-1280x640.png', 1280, false],
];
const browser = await chromium.launch({ executablePath, env: { ...process.env, LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1500, height: 900 } });
for (const [src, png, width, transparent] of pngs) {
  const s = fs.readFileSync(path.join(dir, src), 'utf8');
  const [, , vw, vh] = s.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const h = Math.round((width * vh) / vw);
  const sized = s.replace(/ width="\d+" height="\d+"/, ` width="${width}" height="${h}"`);
  await page.setContent(`<body style="margin:0;background:transparent"><div id="i" style="width:${width}px;height:${h}px;line-height:0">${sized}</div></body>`);
  await (await page.$('#i')).screenshot({ path: path.join(dir, png), omitBackground: transparent });
}
// ---- Sheet ---------------------------------------------------------------------------------
const png = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
const at = (file, width) => {
  const s = fs.readFileSync(path.join(dir, file), 'utf8');
  const [, , vw, vh] = s.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  return s.replace(/ width="\d+" height="\d+"/, ` width="${width}" height="${Math.round((width * vh) / vw)}"`).replace(/id="(n\d+)"/g, `id="$1-${width}"`).replace(/url\(#(n\d+)\)/g, `url(#$1-${width})`);
};
const swatch = (n, h, use) => `<tr><td><span class="sw" style="background:${h}"></span>${n}</td><td><code>${h}</code></td><td>${use}</td></tr>`;
const sheet = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Perchling · wordmark and store images</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#F3F4F7;color:#1D2330;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Ubuntu,sans-serif}
main{width:1480px;margin:0 auto;padding:28px 40px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:18px;margin:0 0 8px}
.muted{color:#5E6875;margin:4px 0 12px}
.card{background:#fff;border:1px solid #E1E4EA;border-radius:14px;padding:20px 24px;margin-bottom:18px}
.row{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.pane{padding:24px 28px;border-radius:12px;display:flex;align-items:center;gap:36px;flex-wrap:wrap}
.light{background:#FFFFFF;border:1px solid #E1E4EA}.dark{background:#2B2A33}
figure{margin:0;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
figcaption{font-size:12px;color:#5E6875}
.store{background:#F1F3F4;padding:24px;border-radius:12px;display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap}
.store img{border-radius:8px;display:block}
.cardmock{width:600px;border:1px solid #D0D7DE;border-radius:10px;overflow:hidden;background:#fff}
.cardmock img{display:block;width:600px;height:300px}
.cardmock div{padding:10px 14px;font-size:13px;color:#57606A}
code{font-size:12.5px;background:#EEF0F5;padding:1px 4px;border-radius:4px}
table{border-collapse:collapse;font-size:13px}td{padding:4px 12px 4px 0;border-bottom:1px solid #E1E4EA}
.sw{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:8px;border:1px solid rgba(127,127,127,.4)}
ul{margin:6px 0 0;padding-left:18px}li{margin-bottom:4px}
</style></head><body><main>
<h1>Perchling · wordmark and store images</h1>
<p class="muted">The wordmark is “Perchling” in Nunito ExtraBold (SIL OFL 1.1), converted to outlines and lightly kerned, with the i’s dot in the brand teal. The mark is Perch (<code>assets/icon/</code>). Everything here is the exported file.</p>

<section class="card"><h2>Wordmark</h2>
<div class="pane light">${at('wordmark-on-light.svg', 520)}${at('wordmark-on-light.svg', 240)}${at('wordmark-on-light.svg', 120)}</div>
<div class="pane dark" style="margin-top:10px">${at('wordmark-on-dark.svg', 520)}${at('wordmark-on-dark.svg', 240)}${at('wordmark-on-dark.svg', 120)}</div>
</section>

<section class="card"><h2>Lockup</h2>
<p class="muted">The icon and the wordmark side by side; the name’s baseline sits level with the ledge. Keep clear space of at least the icon’s ledge height (about a tenth of the icon) all round.</p>
<div class="pane light">${at('lockup-on-light.svg', 560)}${at('lockup-on-light.svg', 280)}${at('lockup-on-light.svg', 160)}</div>
<div class="pane dark" style="margin-top:10px">${at('lockup-on-dark.svg', 560)}${at('lockup-on-dark.svg', 280)}${at('lockup-on-dark.svg', 160)}</div>
</section>

<section class="card"><h2>Chrome Web Store</h2>
<p class="muted">Following Google's image guidelines: saturated colour filling the whole region, defined edges on the store's light grey, the brand and no other text, no screenshot and no claims, and still readable at half size. No YouTube name or logo; the listing's name beside the tile already says “for YouTube™”.</p>
<div class="store">
<figure><img src="${png('promo-small-440x280.png')}" width="440" height="280" alt=""><figcaption>Small promo tile, 440 × 280 (required)</figcaption></figure>
<figure><img src="${png('promo-small-440x280.png')}" width="220" height="140" alt=""><figcaption>The same at half size</figcaption></figure>
</div>
<div class="store" style="margin-top:12px"><figure><img src="${png('marquee-1400x560.png')}" width="1352" height="541" alt=""><figcaption>Marquee, 1400 × 560 (optional), shown at 97 %</figcaption></figure></div>
</section>

<section class="card"><h2>GitHub social preview</h2>
<p class="muted">1280 × 640, set by the user in the repository's settings (Settings › General › Social preview). It's the one image that writes the full name, “for YouTube™”, as plain text.</p>
<div class="row">
<figure><img src="${png('social-preview-1280x640.png')}" width="640" height="320" alt="" style="border-radius:8px;display:block"><figcaption>At half size</figcaption></figure>
<figure><div class="cardmock"><img src="${png('social-preview-1280x640.png')}" alt=""><div><b>Alioun/yt-playlist-tools</b> · github.com</div></div><figcaption>As a link card</figcaption></figure>
</div>
</section>

<section class="card"><h2>Notes</h2>
<ul>
<li><b>AMO</b> takes only an icon (<code>assets/icon/amo-128.png</code>) and screenshots, so it needs nothing from here.</li>
<li><b>Screenshots</b> come from the release candidate at release (spec 08 §9.4), not from this folder.</li>
<li><b>Type:</b> Nunito ExtraBold (800), version 3.602, SIL Open Font License 1.1, from google/fonts. Only outlines ship; the font file isn't redistributed.</li>
</ul>
<table style="margin-top:10px">
${swatch('Ink', C.ink, 'the wordmark on light')}${swatch('Paper', C.paper, 'the wordmark on dark and on the store images')}${swatch('Brand teal', C.teal, 'the i’s dot')}${swatch('Night', C.night, 'the store images’ background')}${swatch('Hole', C.hole, 'the faint pigeonhole wall')}${swatch('Hole card', C.holeCard, 'a faint card in the wall')}${swatch('Lavender', C.lavender, '“for YouTube™” on the social preview')}${swatch('Mist', C.mist, 'the social preview’s line')}
</table>
</section>
</main></body></html>
`;
fs.writeFileSync(path.join(dir, 'sheet.html'), sheet);
await page.setViewportSize({ width: 1480, height: 900 });
await page.goto(pathToFileURL(path.join(dir, 'sheet.html')).href);
await page.screenshot({ path: path.join(dir, 'sheet.png'), fullPage: true });
await browser.close();
console.log('wrote', Object.keys(out).length, 'SVGs,', pngs.length, 'PNGs, sheet.html and sheet.png');
