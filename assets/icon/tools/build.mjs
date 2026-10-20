// Exports the icon PNGs from the hand-drawn SVGs, builds sheet.html from those PNGs,
// and renders sheet-light.png and sheet-dark.png, all in assets/icon/.
// Run: node assets/icon/tools/build.mjs
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

const svg = (f) => fs.readFileSync(path.join(dir, f), 'utf8').trim();
const master = svg('icon.svg');
const s32 = svg('icon-32.svg');
const s16 = svg('icon-16.svg');
const mono = svg('icon-mono.svg');
const padded = master.replace('viewBox="0 0 96 96"', 'viewBox="-16 -16 128 128"');

// Which drawing each PNG comes from. 16 and 32 are their own pixel-grid drawings;
// 19 and 24 come from the nearest of them; 48 and up use the full artwork.
const exportsList = [
  ['icon-16.png', 16, s16],
  ['icon-19.png', 19, s16],
  ['icon-24.png', 24, s32],
  ['icon-32.png', 32, s32],
  ['icon-38.png', 38, s32],
  ['icon-48.png', 48, master],
  ['icon-64.png', 64, master],
  ['icon-96.png', 96, master],
  ['icon-128.png', 128, master],
  ['store-128.png', 128, padded],
  ['amo-128.png', 128, master],
];

const browser = await chromium.launch({ executablePath, env: { ...process.env, LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1280, height: 900 } });

for (const [file, n, src] of exportsList) {
  const sized = src.replace(/ width="\d+" height="\d+"/, ` width="${n}" height="${n}"`);
  await page.setContent(`<body style="margin:0;background:transparent"><div id="i" style="width:${n}px;height:${n}px;line-height:0">${sized}</div></body>`);
  await (await page.$('#i')).screenshot({ path: path.join(dir, file), omitBackground: true });
}

const png = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
const P = Object.fromEntries(exportsList.map(([f]) => [f, png(f)]));

// Contrast against the four toolbars (WCAG relative luminance).
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tbs = [['Chrome light', '#FFFFFF'], ['Firefox light', '#F9F9FB'], ['Chrome dark', '#3C3C3C'], ['Firefox dark', '#2B2A33']];
const colours = [
  ['Pigeon grey', '#8B95A4', 'head and body'],
  ['Wing grey', '#78828F', 'folded wing'],
  ['Tail grey', '#6B7584', 'tail, 16 px wing line (tail #727C8B at 16 px)'],
  ['Tail band', '#4A5360', 'tail tip, feet'],
  ['Beak', '#3D4552', 'beak'],
  ['Cere and card', '#F5F7FA', 'eye ring, cards (cere #E9EDF2)'],
  ['Pupil', '#1A1E27', 'eye'],
  ['Brand teal', '#14A39A', 'the ledge; the neck gradient’s start'],
  ['Ledge shade', '#0F8A82', 'the ledge’s underside'],
  ['Brand violet', '#7B5CD6', 'the neck gradient’s end, card lines'],
  ['Cabinet violet', '#8E74E2', 'the cabinet (a light tint of brand violet)'],
  ['Cabinet shade', '#6E52CC', 'under the ledge'],
  ['Pigeonhole ink', '#26223C', 'the holes'],
  ['Back card', '#CDD3DC', 'a card behind a card'],
];
const contrastRows = colours.map(([n, h, use]) => `<tr><td><span class="sw" style="background:${h}"></span>${n}</td><td><code>${h}</code></td><td>${use}</td>${tbs.map(([, b]) => `<td class="num">${ratio(h, b).toFixed(2)}</td>`).join('')}</tr>`).join('');

const badges = {
  tick: { text: '✓', bg: '#0B7A70', fg: '#FFFFFF', label: '✓ auto-added' },
  paused: { text: 'II', bg: '#5E6875', fg: '#FFFFFF', label: 'II paused' },
  needs: { text: '!', bg: '#6949D2', fg: '#FFFFFF', label: '! needs you (violet)' },
  broken: { text: '!', bg: '#E8A33A', fg: '#000000', label: '! not working (amber)' },
};
const toolbars = [
  { id: 'chrome-light', label: 'Chrome, light', kind: 'chrome' },
  { id: 'chrome-dark', label: 'Chrome, dark', kind: 'chrome' },
  { id: 'firefox-light', label: 'Firefox, light', kind: 'firefox' },
  { id: 'firefox-dark', label: 'Firefox, dark', kind: 'firefox' },
];
const ph = [
  '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1.5 L13.5 3.5 V8 C13.5 11.2 11.2 13.6 8 14.6 C4.8 13.6 2.5 11.2 2.5 8 V3.5 Z" fill="currentColor"/></svg>',
  '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor"/><rect x="5" y="5" width="6" height="2" fill="var(--tb)"/><rect x="5" y="9" width="4" height="2" fill="var(--tb)"/></svg>',
];
const puzzle = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 5 H6 V4 A1.6 1.6 0 0 1 9.2 4 V5 H12 V8 H13 A1.6 1.6 0 0 1 13 11.2 H12 V14 H3 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const nav = [
  '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M13 8 H4 M7.5 4 L3.5 8 L7.5 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8 H12 M8.5 4 L12.5 8 L8.5 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M12.6 6.4 A5 5 0 1 0 13 9.4 M13 3.2 V6.6 H9.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
];
const badgeHtml = (kind, b) => (b ? `<span class="bdg ${kind}" style="background:${b.bg};color:${b.fg}">${b.text}</span>` : '');
// The 16 px PNG at 1x; on the 2x strip the 32 px PNG drawn in a 16 px box.
const ours = (kind, state, hi) => `<span class="btn ours ${kind}"><img class="ic" src="${hi ? P['icon-32.png'] : P['icon-16.png']}" width="16" height="16" alt="">${badgeHtml(kind, badges[state])}</span>`;
const toolbar = (tb, state = null, hi = false, label = tb.label) => `<div class="tb ${tb.id}${hi ? ' hi' : ''}"><div class="tb-label">${label}</div><div class="tb-row">${nav.map((s) => `<span class="btn ${tb.kind}">${s}</span>`).join('')}<div class="url">youtube.com/watch?v=dQw-example</div>${ph.map((s) => `<span class="btn ${tb.kind}">${s}</span>`).join('')}${ours(tb.kind, state, hi)}<span class="btn ${tb.kind}">${puzzle}</span><span class="avatar"></span></div></div>`;
const states = ['none', 'tick', 'paused', 'needs', 'broken'];
const statesTable = `<table class="states"><tr><th></th>${states.map((s) => `<th>${s === 'none' ? 'at rest' : badges[s].label}</th>`).join('')}</tr>${toolbars.map((tb) => `<tr class="${tb.id}"><th>${tb.label}</th>${states.map((s) => `<td><span class="tb-cell">${ours(tb.kind, s === 'none' ? null : s)}</span></td>`).join('')}</tr>`).join('')}</table>`;

const sizes = [
  ['icon-16.png', '16', 'toolbar 1x'], ['icon-19.png', '19', 'legacy'], ['icon-24.png', '24', 'toolbar 1.5x'], ['icon-32.png', '32', 'toolbar 2x'], ['icon-38.png', '38', 'legacy'],
  ['icon-48.png', '48', 'extensions page'], ['icon-64.png', '64', 'Firefox menu 2x'], ['icon-96.png', '96', 'Firefox add-ons 2x'], ['icon-128.png', '128', 'full bleed'],
];
const sizeRow = (cls) => `<div class="sizes ${cls}">${sizes.map(([f, n, note]) => `<figure><img src="${P[f]}" width="${n}" height="${n}" alt=""><figcaption>${n}${note ? `<br><span>${note}</span>` : ''}</figcaption></figure>`).join('')}</div>`;

const zoom = (f, n, k, bg, label) => `<figure><canvas class="zoom" data-src="${f}" data-n="${n}" data-k="${k}" data-bg="${bg}" width="${n * k}" height="${n * k}"></canvas><figcaption>${label}</figcaption></figure>`;
const zbadges = toolbars.map((tb) => `<div class="row">${['tick', 'paused', 'needs', 'broken'].map((s) => `<figure><canvas class="zb" data-kind="${tb.kind}" data-tb="${tb.id}" data-state="${s}"></canvas><figcaption>${tb.label} · ${badges[s].text}</figcaption></figure>`).join('')}</div>`).join('');

const monoRow = (fg, bg, label) => `<div class="mono" style="color:${fg};background:${bg}">${[16, 20, 24, 48].map((n) => mono.replace(/ width="\d+" height="\d+"/, ` width="${n}" height="${n}"`).replace(/id="cut"/, `id="cut-${fg.slice(1)}-${n}"`).replace(/url\(#cut\)/, `url(#cut-${fg.slice(1)}-${n})`)).join('')}<span>${label}</span></div>`;

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Perch · the 2.0 icon</title>
<style>
:root{--bg:#F3F4F7;--card:#FFFFFF;--text:#1D2330;--muted:#5E6875;--line:#E1E4EA;--chip:#EEF0F5}
[data-theme=dark]{--bg:#121318;--card:#1C1E25;--text:#E7EAF0;--muted:#9AA3B2;--line:#2C2F39;--chip:#262933}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Ubuntu,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px}
header{display:flex;align-items:flex-start;gap:24px;margin-bottom:16px}
header .heroes{display:flex;gap:12px}
.hero{width:150px;height:150px;border-radius:14px;display:flex;align-items:center;justify-content:center}
h1{font-size:26px;margin:4px 0 6px}
h2{font-size:18px;margin:0 0 6px}
.muted{color:var(--muted);margin:4px 0 10px}
code{font-size:12.5px;background:var(--chip);padding:1px 4px;border-radius:4px}
.toggle{margin-left:auto;border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 22px;margin-bottom:16px}
.on-light{background:#FFFFFF;color:#1D2330;border:1px solid #E1E4EA}
.on-dark{background:#2B2A33;color:#E7EAF0;border:1px solid #2B2A33}
.sizes{display:flex;align-items:flex-end;gap:20px;padding:14px 16px;border-radius:10px;margin-bottom:8px;flex-wrap:wrap}
.sizes figure,.zooms figure,.row figure,.tiles figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px}
.sizes figcaption{font-size:11px;text-align:center;opacity:.8}
.sizes figcaption span{opacity:.75}
.tiles{display:flex;gap:18px;flex-wrap:wrap}
.tile{padding:0;border-radius:10px;line-height:0}
.tile img{outline:1px dashed #9AA3B2}
.tb{border-radius:10px;overflow:hidden;margin-bottom:8px;border:1px solid var(--line)}
.tb-label{font-size:11px;padding:3px 10px;background:var(--frame);color:var(--fg)}
.tb-row{display:flex;align-items:center;gap:2px;padding:4px 8px 6px;height:46px;background:var(--tb)}
.chrome-light{--tb:#FFFFFF;--fg:#474747;--url:#E9EEF6;--urlfg:#1F1F1F;--frame:#DCE3EE}
.chrome-dark{--tb:#3C3C3C;--fg:#C7C7C7;--url:#282828;--urlfg:#E3E3E3;--frame:#1F1F1F}
.firefox-light{--tb:#F9F9FB;--fg:#5B5B66;--url:#FFFFFF;--urlfg:#15141A;--frame:#F0F0F4}
.firefox-dark{--tb:#2B2A33;--fg:#FBFBFE;--url:#1C1B22;--urlfg:#FBFBFE;--frame:#1C1B22}
.url{flex:1;height:34px;border-radius:17px;background:var(--url);color:var(--urlfg);display:flex;align-items:center;padding:0 14px;font-size:13px;margin:0 8px;min-width:100px;white-space:nowrap;overflow:hidden}
.firefox-light .url,.firefox-dark .url{border-radius:6px;height:32px}
.firefox-light .url{box-shadow:0 1px 3px rgba(0,0,0,.18)}
.tb.hi{zoom:2;border-radius:5px}
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--fg)}
.btn.chrome{width:34px;height:34px}
.btn.firefox{width:32px;height:32px}
.btn>svg{display:block;opacity:.85}
.btn .ic{position:absolute}
.btn.chrome .ic{left:9px;top:9px}
.btn.firefox .ic{left:8px;top:8px}
.avatar{width:22px;height:22px;border-radius:50%;background:var(--fg);opacity:.45;margin:0 6px;flex:none}
.bdg{position:absolute;display:block;text-align:center;white-space:nowrap;font-family:system-ui,"Segoe UI",Ubuntu,sans-serif}
.bdg.chrome{right:3px;bottom:3px;height:14px;min-width:14px;padding:0 2px;border-radius:4px;font-size:9px;font-weight:700;line-height:14px;box-shadow:0 0 0 1px var(--tb)}
.bdg.firefox{right:4px;top:3px;height:11px;min-width:14px;max-width:20px;padding:0 2px 1px;border-radius:2px;font-size:10px;line-height:10px;box-shadow:0 1px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.25)}
table.states{border-collapse:separate;border-spacing:6px 4px;table-layout:fixed}
table.states th{font-size:11px;font-weight:600;color:var(--muted);text-align:center;width:140px}
table.states tr th:first-child{text-align:left;width:100px}
table.states td{text-align:center}
.tb-cell{display:inline-flex;padding:4px 10px;border-radius:8px;background:var(--tb)}
.zooms,.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;margin-bottom:12px}
figcaption{font-size:11px;color:var(--muted)}
canvas{image-rendering:pixelated;border-radius:4px;display:block}
table.contrast{border-collapse:collapse;font-size:12.5px;width:100%}
table.contrast th,table.contrast td{padding:4px 8px;border-bottom:1px solid var(--line);text-align:left}
table.contrast .num{text-align:right;font-variant-numeric:tabular-nums}
.sw{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:8px;border:1px solid rgba(127,127,127,.4)}
.mono{display:flex;align-items:center;gap:16px;padding:12px 16px;border-radius:10px;margin-bottom:8px}
.mono span{font-size:12px;opacity:.8}
ul.notes li{margin-bottom:5px}
</style>
</head>
<body>
<main>
<header>
  <div class="heroes"><div class="hero on-light"><img src="${P['icon-128.png']}" width="128" height="128" alt=""></div><div class="hero on-dark"><img src="${P['icon-128.png']}" width="128" height="128" alt=""></div></div>
  <div>
    <h1>Perch</h1>
    <p class="muted">The 2.0 icon: a pigeon sits on top of the pigeonholes, not in one. Hand-drawn SVG; the 16 and 32 px files are their own pixel-grid drawings. Every image on this page is the exported PNG that ships. The name is pending, so there's no wordmark yet.</p>
  </div>
  <button class="toggle" id="theme">Dark page</button>
</header>

<section class="card"><h2>Every size</h2>
<p class="muted">16 and 32 are drawn on their own grids; 19 and 24 come from the 16 and 32 drawings; 48 and up use the full artwork. Chrome's 19 and 38 are legacy and needn't ship.</p>
${sizeRow('on-light')}${sizeRow('on-dark')}
<h2 style="margin-top:14px">Store icons</h2>
<div class="tiles">
  <figure><span class="tile on-light"><img src="${P['store-128.png']}" width="128" height="128" alt=""></span><figcaption>store-128.png on light (96 px art, 16 px padding)</figcaption></figure>
  <figure><span class="tile on-dark"><img src="${P['store-128.png']}" width="128" height="128" alt=""></span><figcaption>store-128.png on dark</figcaption></figure>
  <figure><span class="tile on-light"><img src="${P['amo-128.png']}" width="64" height="64" alt=""></span><figcaption>amo-128.png as AMO shows it (64)</figcaption></figure>
  <figure><span class="tile on-light"><img src="${P['amo-128.png']}" width="32" height="32" alt=""></span><figcaption>and at 32</figcaption></figure>
</div>
</section>

<section class="card"><h2>In the toolbar</h2>
<p class="muted">Real-ish toolbars at 1x, then the same at 2x with the 32 px drawing. The grey shapes stand in for other extensions.</p>
${toolbars.map((tb) => toolbar(tb)).join('')}
${toolbar(toolbars[1], 'broken', true, 'Chrome, dark, 2x · amber “!”')}
${toolbar(toolbars[2], 'tick', true, 'Firefox, light, 2x · ✓')}
<h2 style="margin-top:14px">Badges</h2>
<p class="muted">Browser badges (<code>action.setBadgeText</code>), at 1x. Chrome draws them bottom-right and cuts a 1 px gap into the icon; Firefox draws them top-right. The head stays clear of both.</p>
${statesTable}
</section>

<section class="card"><h2>Magnified</h2>
<div class="zooms">
${zoom('icon-16.png', 16, 8, '#FFFFFF', '16 px ×8, Chrome light')}${zoom('icon-16.png', 16, 8, '#3C3C3C', '16 px ×8, Chrome dark')}${zoom('icon-16.png', 16, 8, '#2B2A33', '16 px ×8, Firefox dark')}
${zoom('icon-32.png', 32, 4, '#FFFFFF', '32 px ×4, light')}${zoom('icon-32.png', 32, 4, '#2B2A33', '32 px ×4, dark')}
</div>
<p class="muted">16 px with each badge, ×4, at each browser's badge geometry.</p>
${zbadges}
</section>

<section class="card"><h2>Monochrome mark</h2>
<p class="muted"><code>icon-mono.svg</code> is drawn in <code>currentColor</code> on a 24 px grid, for the places inside YouTube where the mark appears in the site's own colours (UI-BRAND-08).</p>
${monoRow('#0F0F0F', '#FFFFFF', 'YouTube light')}${monoRow('#F1F1F1', '#0F0F0F', 'YouTube dark')}
</section>

<section class="card"><h2>Colours and contrast</h2>
<p class="muted">Flat fills; the teal-to-violet gradient appears only on the neck (UI-BRAND-06), from 32 px up, with solid teal and violet bands at 16 px. Ratios are against each toolbar.</p>
<table class="contrast"><tr><th>Colour</th><th>Hex</th><th>Where</th>${tbs.map(([n]) => `<th class="num">${n}</th>`).join('')}</tr>${contrastRows}</table>
<ul class="notes">
<li><b>One icon for light and dark.</b> Chrome can't switch icons by theme, so the large shapes sit near 3:1 on every toolbar. The grey bird, the teal ledge and the light-violet cabinet carry the silhouette; the dark holes and the tail are detail.</li>
<li><b>No Firefox dark variant.</b> <code>context-fill</code> is reserved for Mozilla's own extensions, and a <code>theme_icons</code> pair would gain little over these ratios while making Firefox differ from Chrome.</li>
</ul>
</section>
</main>
<script>
const PNG = ${JSON.stringify({ 'icon-16.png': P['icon-16.png'], 'icon-32.png': P['icon-32.png'] })};
const BADGES = ${JSON.stringify(badges)};
const TB = {'chrome-light':'#FFFFFF','chrome-dark':'#3C3C3C','firefox-light':'#F9F9FB','firefox-dark':'#2B2A33'};
function setTheme(t){document.documentElement.dataset.theme=t;document.getElementById('theme').textContent=t==='dark'?'Light page':'Dark page';}
setTheme(new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light');
document.getElementById('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
const load=(src)=>new Promise((r)=>{const i=new Image();i.onload=()=>r(i);i.src=src;});
function rr(g,x,y,w,h,r){g.beginPath();g.roundRect(x,y,w,h,r);}
function composite(icon,kind,bg,state){
  const S=kind==='chrome'?28:32,o=kind==='chrome'?6:8;
  const L=document.createElement('canvas');L.width=S;L.height=S;const lg=L.getContext('2d');lg.drawImage(icon,o,o);
  const c=document.createElement('canvas');c.width=S;c.height=S;const g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,S,S);
  const b=BADGES[state];
  if(kind==='chrome'){
    g.font='bold 9px system-ui, sans-serif';const w=Math.max(14,Math.ceil(g.measureText(b.text).width)+4);
    lg.globalCompositeOperation='destination-out';rr(lg,S-w-1,S-15,w+2,16,5);lg.fill();
    g.drawImage(L,0,0);rr(g,S-w,S-14,w,14,4);g.fillStyle=b.bg;g.fill();g.fillStyle=b.fg;g.textAlign='center';g.textBaseline='middle';g.fillText(b.text,S-w/2,S-6.5);
  } else {
    g.drawImage(L,0,0);g.font='10px system-ui, sans-serif';const w=Math.min(20,Math.max(14,Math.ceil(g.measureText(b.text).width)+4));
    const x=o+20-w,y=o-5;g.fillStyle='rgba(0,0,0,.35)';rr(g,x,y+1,w,11,2);g.fill();rr(g,x,y,w,11,2);g.fillStyle=b.bg;g.fill();g.fillStyle=b.fg;g.textAlign='center';g.textBaseline='middle';g.fillText(b.text,x+w/2,y+5.5);
  }
  return c;
}
(async()=>{
  for(const cv of document.querySelectorAll('canvas.zoom')){const i=await load(PNG[cv.dataset.src]);const g=cv.getContext('2d');g.fillStyle=cv.dataset.bg;g.fillRect(0,0,cv.width,cv.height);g.imageSmoothingEnabled=false;g.drawImage(i,0,0,cv.width,cv.height);}
  const i16=await load(PNG['icon-16.png']);
  for(const cv of document.querySelectorAll('canvas.zb')){const c=composite(i16,cv.dataset.kind,TB[cv.dataset.tb],cv.dataset.state);cv.width=c.width*4;cv.height=c.height*4;const g=cv.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(c,0,0,cv.width,cv.height);}
  document.body.dataset.ready='1';
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dir, 'sheet.html'), html);

for (const theme of ['light', 'dark']) {
  await page.goto(pathToFileURL(path.join(dir, 'sheet.html')).href + `?theme=${theme}`);
  await page.waitForSelector('body[data-ready="1"]');
  await page.screenshot({ path: path.join(dir, `sheet-${theme}.png`), fullPage: true });
}
await browser.close();
console.log('exported', exportsList.length, 'PNGs, sheet.html, sheet-light.png and sheet-dark.png');
