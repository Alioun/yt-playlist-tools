// Builds prototypes/icon/sheet.html from the hand-drawn SVGs in concepts/ and dropped/.
// Also writes each concept's <slug>-128.svg (the 96 px artwork with 16 px padding).
// Run: node prototypes/icon/tools/build-sheet.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const concepts = [
  {
    slug: 'cabinet-bird',
    name: 'Cabinet bird',
    line: 'A pigeon whose body is a little cabinet of pigeonholes.',
    idea: 'A pigeon made of pigeonholes: grey head, teal-to-violet neck, a violet cabinet for a body, tail and feet. It reworks “a pigeon whose wing is the grid” so it isn’t a bird with a patterned wing.',
    pros: [
      'The most character of the five: cute, tidy, and the joke is the shape itself.',
      'A silhouette no neighbour has (round head, box body, tail, feet); reads as a bird at 16 px.',
      'Head and eye sit top-left, clear of both browsers’ badges.',
      'Keeps ticket 15’s grey bird and gradient neck, so the popup and settings change little.',
    ],
    cons: [
      'Playful rather than sober; the boxy body can read as a toy or robot bird.',
      'At 16 px the grid is only 2×2 slots.',
      'Violet body is the weakest colour on Chrome’s dark toolbar (2.3:1); the grey head and teal carry it.',
    ],
  },
  {
    slug: 'perch',
    name: 'Perch',
    line: 'A pigeon sits on top of the pigeonholes, not in one.',
    idea: 'The pigeon files things but isn’t filed: it perches on a cabinet of cubbies holding cards. The “not pigeonholed” wink, with the bird the user liked.',
    pros: [
      'The clearest bird at 16 px: a perched pigeon in profile on a slotted shelf.',
      'Head top-left, clear of both badges; Chrome’s badge only hides cabinet and tail.',
      'Grey bird and teal ledge hold 3:1 or better on all four toolbars.',
    ],
    cons: [
      'The pigeonholes are a thin shelf at 16 px; the grid is secondary.',
      'A grey pigeon in side view is the genre Pigeonhole Live and PigeonPod use (theirs: orange in a circle; slate with a striped white wing). Ours differs in pose, cabinet and neck, but the genre is shared.',
      'Wide, short silhouette; the top-right corner is empty.',
    ],
  },
  {
    slug: 'odd-one-out',
    name: 'Odd one out',
    line: 'Four cubbies, and one of them is a pigeon.',
    idea: 'A tidy 2×2 of cubby tiles, each with a card in its slot, stepping through the brand gradient. The fourth tile is a pigeon’s head: the one that doesn’t fit the grid.',
    pros: [
      'The cleanest and most logo-like; solid shapes survive 16 px.',
      'The head is top-left, so no badge ever covers it.',
      'Works as a small favicon or app mark too.',
    ],
    cons: [
      'A 2×2 of coloured tiles echoes Microsoft’s four squares and app-launcher grids.',
      'Least “cabinet”: the tiles read as slots only up close.',
      'Three hues plus grey is the busiest palette.',
    ],
  },
  {
    slug: 'peek',
    name: 'Peek',
    line: 'A pigeon looks out of the big cubby of a dovecote cabinet.',
    idea: 'Pigeonholes were first the nest holes of a dovecote. Arched cubbies, the big one with its pigeon, the rest holding filed cards.',
    pros: [
      'The grid is the whole icon; arches say “pigeonhole”, not “window”.',
      'Cute, and the bird is safe from both badges.',
    ],
    cons: [
      'The busiest at 16 px: a full violet square, heavier than its neighbours.',
      'A bust in a big opening can read as an avatar or a video call.',
      'A filled square is the closest of the five to an app tile or “screen”.',
    ],
  },
  {
    slug: 'escapee',
    name: 'Escapee',
    line: 'One card wouldn’t stay filed.',
    idea: 'A cabinet of filed cards; one card has jumped out of its slot. “Not pigeonholed”, without a bird.',
    pros: [
      'The soberest: no mascot, nothing near any pigeon logo.',
      'Says “filing”, and “not stuck in one slot”, at 32 px and up.',
    ],
    cons: [
      'At 16 px the tilt and the empty slot are lost: a card beside a grid, close to a generic document or calendar icon.',
      'Drops the pigeon the user liked.',
      'Firefox’s badge covers the card, the part that carries the idea.',
    ],
  },
];

const dropped = [
  { file: 'plain-grid-16.svg', name: 'Plain grid', why: 'A 3×3 or 2×2 grid with one card read as a calendar or a lit building at 16 px; the card read as a chimney.' },
  { file: 'striped-wing-16.svg', name: 'Pigeon whose wing is the grid', why: 'A grey side-view pigeon with a light, divided wing is PigeonPod’s logo (slate pigeon, white wing with navy stripes). Reworked as Cabinet bird.' },
  { file: 'monogram-16.svg', name: 'Monogram (P in a cubby)', why: 'The name is pending, P marks are crowded (Pinterest, PayPal, Patreon), purple with a white bar edges toward Twitch, and AMO’s listing guide says not to put letters in the icon.' },
];

const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').trim();

// Store tile: same artwork, 16 px of transparent padding on each side.
for (const c of concepts) {
  const m = read('concepts', c.slug, `${c.slug}.svg`);
  const tile = m
    .replace('viewBox="0 0 96 96" width="96" height="96"', 'viewBox="-16 -16 128 128" width="128" height="128"')
    .replace(/id="([^"]+)"/g, 'id="$1-128"')
    .replace(/url\(#([^)]+)\)/g, 'url(#$1-128)');
  fs.writeFileSync(path.join(root, 'concepts', c.slug, `${c.slug}-128.svg`), tile + '\n');
  c.src = {
    s16: read('concepts', c.slug, `${c.slug}-16.svg`),
    s32: read('concepts', c.slug, `${c.slug}-32.svg`),
    m,
  };
}
for (const d of dropped) d.src = read('dropped', d.file);

// Inline an SVG at a given pixel size, with ids made unique for this instance.
let uid = 0;
function inline(svg, size, extra = '') {
  const k = ++uid;
  return svg
    .replace(/ width="\d+" height="\d+"/, ` width="${size}" height="${size}"${extra}`)
    .replace(/id="([^"]+)"/g, `id="$1-i${k}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-i${k})`);
}
// Store tile: the 96 artwork in a 128 box with 16 px padding.
function tile(svg, size = 128) {
  return inline(svg.replace('viewBox="0 0 96 96"', 'viewBox="-16 -16 128 128"'), size);
}

const badges = {
  none: null,
  tick: { text: '✓', bg: '#0B7A70', fg: '#FFFFFF', label: '✓ auto-added (teal)' },
  paused: { text: 'II', bg: '#5E6875', fg: '#FFFFFF', label: 'II paused (slate)' },
  needs: { text: '!', bg: '#6949D2', fg: '#FFFFFF', label: '! needs you (violet)' },
  broken: { text: '!', bg: '#E8A33A', fg: '#000000', label: '! not working (amber)' },
};
const toolbars = [
  { id: 'chrome-light', label: 'Chrome, light', kind: 'chrome' },
  { id: 'chrome-dark', label: 'Chrome, dark', kind: 'chrome' },
  { id: 'firefox-light', label: 'Firefox, light', kind: 'firefox' },
  { id: 'firefox-dark', label: 'Firefox, dark', kind: 'firefox' },
];

// Grey placeholder glyphs for other toolbar icons (16 px), drawn in currentColor.
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

function badge(kind, b) {
  if (!b) return '';
  return `<span class="bdg ${kind}" style="background:${b.bg};color:${b.fg}">${b.text}</span>`;
}
// One toolbar button with our icon and an optional badge, at 1x.
function ourButton(c, kind, state) {
  return `<span class="btn ours ${kind}"><span class="ic">${inline(c.src.s16, 16)}</span>${badge(kind, badges[state])}</span>`;
}
function toolbar(tb, iconsHtml, url = 'youtube.com/watch?v=dQw-example') {
  const navHtml = nav.map((s) => `<span class="btn ${tb.kind}">${s}</span>`).join('');
  const phHtml = ph.map((s) => `<span class="btn ${tb.kind}">${s}</span>`).join('');
  return `<div class="tb ${tb.id}"><div class="tb-label">${tb.label}</div><div class="tb-row">${navHtml}<div class="url">${url}</div>${phHtml}${iconsHtml}<span class="btn ${tb.kind}">${puzzle}</span><span class="avatar"></span></div></div>`;
}

const sizesRow = (c) => {
  const items = [
    ['16', inline(c.src.s16, 16)],
    ['19*', inline(c.src.s16, 19)],
    ['32', inline(c.src.s32, 32)],
    ['38*', inline(c.src.s32, 38)],
    ['48', inline(c.src.m, 48)],
    ['96', inline(c.src.m, 96)],
    ['128', inline(c.src.m, 128)],
    ['store 128 (96 + 16 padding)', `<span class="tile">${tile(c.src.m)}</span>`],
  ];
  const cell = (theme) => `<div class="sizes ${theme}">${items.map(([l, s]) => `<figure>${s}<figcaption>${l}</figcaption></figure>`).join('')}</div>`;
  return cell('on-light') + cell('on-dark');
};

const stateOrder = ['none', 'tick', 'paused', 'needs', 'broken'];
const statesTable = (c) => {
  const head = `<tr><th></th>${stateOrder.map((s) => `<th>${s === 'none' ? 'at rest' : badges[s].label}</th>`).join('')}</tr>`;
  const rows = toolbars.map((tb) => `<tr class="${tb.id}"><th>${tb.label}</th>${stateOrder.map((s) => `<td><span class="tb-cell">${ourButton(c, tb.kind, s)}</span></td>`).join('')}</tr>`).join('');
  return `<table class="states">${head}${rows}</table>`;
};

const zoomBlock = (c) => {
  const z = (src, n, k, bg, label) => `<figure><canvas class="zoom" data-src="${c.slug}:${src}" data-n="${n}" data-k="${k}" data-bg="${bg}" width="${n * k}" height="${n * k}"></canvas><figcaption>${label}</figcaption></figure>`;
  const zb = (kind, tbId, state) => `<figure><canvas class="zb" data-src="${c.slug}:s16" data-kind="${kind}" data-tb="${tbId}" data-state="${state}"></canvas><figcaption>${tbId.replace('-', ' ')} · ${state === 'none' ? 'at rest' : badges[state].text}</figcaption></figure>`;
  return `<div class="zooms">
    ${z('s16', 16, 8, '#FFFFFF', '16 px ×8, light')}${z('s16', 16, 8, '#2B2A33', '16 px ×8, dark')}
    ${z('s32', 32, 4, '#FFFFFF', '32 px ×4, light')}${z('s32', 32, 4, '#3C3C3C', '32 px ×4, dark')}
  </div>
  ${toolbars.map((tb) => `<div class="zbadges">${['tick', 'paused', 'needs', 'broken'].map((s) => zb(tb.kind, tb.id, s)).join('')}</div>`).join('')}`;
};

const lineup = () => {
  const rows = toolbars.map((tb) => toolbar(tb, concepts.map((c) => ourButton(c, tb.kind, 'none')).join(''))).join('')
    + toolbar({ ...toolbars[1], label: 'Chrome, dark · each with the amber “!” (bottom-right, the hardest case)' }, concepts.map((c) => ourButton(c, 'chrome', 'broken')).join(''))
    + toolbar({ ...toolbars[2], label: 'Firefox, light · each with the teal ✓ (top-right)' }, concepts.map((c) => ourButton(c, 'firefox', 'tick')).join(''));
  const zs = concepts.map((c) => `<figure><canvas class="zoom" data-src="${c.slug}:s16" data-n="16" data-k="5" data-bg="#FFFFFF" width="80" height="80"></canvas><canvas class="zoom" data-src="${c.slug}:s16" data-n="16" data-k="5" data-bg="#3C3C3C" width="80" height="80"></canvas><figcaption>${c.name}</figcaption></figure>`).join('');
  return `<section class="card"><h2>Line-up</h2><p class="muted">All five side by side at 16 px, for comparison only: an extension shows one icon. The grey shapes stand in for other extensions' icons. The URL bar and buttons are approximate.</p>${rows}<div class="lineup-zoom">${zs}</div></section>`;
};

const conceptSection = (c, i) => `
<section class="card concept" id="${c.slug}">
  <div class="concept-head">
    <div class="hero on-light">${inline(c.src.m, 128)}</div>
    <div class="hero on-dark">${inline(c.src.m, 128)}</div>
    <div class="caption">
      <h2>${i + 1}. ${c.name}</h2>
      <p class="line">${c.line}</p>
      <p><b>Idea.</b> ${c.idea}</p>
      <div class="pc"><div><b>Pros</b><ul>${c.pros.map((p) => `<li>${p}</li>`).join('')}</ul></div><div><b>Cons</b><ul>${c.cons.map((p) => `<li>${p}</li>`).join('')}</ul></div></div>
    </div>
  </div>
  <h3>Every size</h3>
  <p class="muted">16 and 32 are separate hand-tuned drawings; 48, 96 and 128 are the full artwork. * 19 and 38 are Chrome's old toolbar sizes, shown for reference only: MV3 action icons are 16 dip (16/24/32), so they aren't shipped.</p>
  ${sizesRow(c)}
  <h3>In the toolbar</h3>
  ${toolbars.map((tb) => toolbar(tb, ourButton(c, tb.kind, 'none'))).join('')}
  <p class="muted">The three marks as browser badges, at 1x. Chrome draws them bottom-right and cuts a 1 px gap into the icon; Firefox draws them top-right.</p>
  ${statesTable(c)}
  <h3>Magnified</h3>
  ${zoomBlock(c)}
</section>`;

const droppedSection = () => `<section class="card"><h2>Tried and dropped</h2><div class="dropped">${dropped.map((d) => `<figure><canvas class="zoom" data-src="dropped:${d.file}" data-n="16" data-k="6" data-bg="#FFFFFF" width="96" height="96"></canvas><figcaption><b>${d.name}.</b> ${d.why}</figcaption></figure>`).join('')}</div></section>`;

const notes = `<section class="card notes"><h2>Notes</h2>
<ul>
<li><b>Hand-drawn.</b> Every shape is a rect, circle, ellipse or path placed by hand in the SVG files under <code>concepts/</code>. Nothing is generated or traced. The 16 and 32 px files are drawn on their own pixel grids.</li>
<li><b>Palette.</b> Ticket 15's teal <code>#14A39A</code> and violet <code>#7B5CD6</code>; pigeon grey <code>#8B95A4</code>, chosen so one icon reads on light and dark toolbars (3.0:1 on white, 3.6:1 on Chrome's dark toolbar); hole ink <code>#26223C</code>; card white <code>#F5F7FA</code>. The 16 px files use solid fills only; the gradient appears only on the neck at 32 px and up. No red, no play triangle, no rounded-rectangle screen.</li>
<li><b>Badges.</b> These are <code>action.setBadgeText</code> plus <code>setBadgeBackgroundColor</code>, as the spec's <code>badgeFor()</code> already says. The tick is teal <code>#0B7A70</code>, paused is slate <code>#5E6875</code>, needs-you "!" is violet <code>#6949D2</code>, and not-working "!" is amber <code>#E8A33A</code> with black text. The geometry here follows Chromium's <code>icon_with_badge_image_source.cc</code> (14 px tall, bottom-right, 9 px bold, a 1 px gap cut) and Firefox's <code>toolbarbutton.css</code> (about 11 px tall, top-right, 10 px).</li>
<li><b>Sizes.</b> Chrome: PNG only, no SVG and no light/dark switch. Manifest icons are 16, 32, 48 and 128, with 128 as 96 px artwork plus 16 px of transparent padding. The action uses 16 and 32. Firefox can take one SVG, or <code>theme_icons</code> pairs; <code>context-fill</code> is reserved for Mozilla's own extensions. AMO's listing icon is a separate upload at 32 and 64 px.</li>
</ul></section>`;

const srcMap = {};
for (const c of concepts) srcMap[c.slug] = c.src;
srcMap.dropped = Object.fromEntries(dropped.map((d) => [d.file, d.src]));

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Icon concepts · ticket 34</title>
<style>
:root{--bg:#F3F4F7;--card:#FFFFFF;--text:#1D2330;--muted:#5E6875;--line:#E1E4EA;--chip:#EEF0F5}
[data-theme=dark]{--bg:#121318;--card:#1C1E25;--text:#E7EAF0;--muted:#9AA3B2;--line:#2C2F39;--chip:#262933}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Ubuntu,sans-serif}
main{max-width:1320px;margin:0 auto;padding:24px}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:16px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:20px;margin:0 0 6px}
h3{font-size:14px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.muted{color:var(--muted);margin:4px 0 10px}
code{font-size:12.5px;background:var(--chip);padding:1px 4px;border-radius:4px}
.tag{display:inline-block;background:#FFE58A;color:#3A2E00;font-weight:600;font-size:11px;padding:2px 7px;border-radius:5px;margin-right:6px}
.toggle{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:18px}
.concept-head{display:grid;grid-template-columns:150px 150px 1fr;gap:16px;align-items:start}
.hero{width:150px;height:150px;border-radius:12px;display:flex;align-items:center;justify-content:center}
.on-light{background:#FFFFFF;color:#1D2330;border:1px solid #E1E4EA}
.on-dark{background:#2B2A33;color:#E7EAF0;border:1px solid #2B2A33}
.caption .line{font-size:16px;margin:0 0 8px}
.caption p{margin:0 0 8px}
.pc{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pc ul{margin:4px 0 0;padding-left:18px}
.pc li{margin-bottom:3px}
.sizes{display:flex;align-items:flex-end;gap:18px;padding:14px 16px;border-radius:10px;margin-bottom:8px;flex-wrap:wrap}
.sizes figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px}
.sizes figcaption{font-size:11px;opacity:.75;max-width:130px;text-align:center}
.tile{display:inline-block;outline:1px dashed #9AA3B2;line-height:0}
/* toolbars */
.tb{border-radius:10px;overflow:hidden;margin-bottom:8px;border:1px solid var(--line)}
.tb-label{font-size:11px;padding:3px 10px;opacity:.8}
.tb-row{display:flex;align-items:center;gap:2px;padding:4px 8px 6px;height:46px}
.chrome-light{--tb:#FFFFFF;--fg:#474747;--url:#E9EEF6;--urlfg:#1F1F1F;--frame:#DCE3EE;background:var(--frame);color:var(--fg)}
.chrome-dark{--tb:#3C3C3C;--fg:#C7C7C7;--url:#282828;--urlfg:#E3E3E3;--frame:#1F1F1F;background:var(--frame);color:var(--fg)}
.firefox-light{--tb:#F9F9FB;--fg:#5B5B66;--url:#FFFFFF;--urlfg:#15141A;--frame:#F0F0F4;background:var(--frame);color:var(--fg)}
.firefox-dark{--tb:#2B2A33;--fg:#FBFBFE;--url:#1C1B22;--urlfg:#FBFBFE;--frame:#1C1B22;background:var(--frame);color:var(--fg)}
.tb .tb-row{background:var(--tb)}
.tb-label{background:var(--frame);color:var(--fg)}
.url{flex:1;height:34px;border-radius:17px;background:var(--url);color:var(--urlfg);display:flex;align-items:center;padding:0 14px;font-size:13px;margin:0 8px;min-width:120px;white-space:nowrap;overflow:hidden}
.firefox-light .url,.firefox-dark .url{border-radius:6px;height:32px}
.firefox-light .url{box-shadow:0 1px 3px rgba(0,0,0,.18)}
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--fg);opacity:1}
.btn.chrome{width:34px;height:34px}
.btn.firefox{width:32px;height:32px}
.btn>svg{display:block}
.btn:not(.ours)>svg{opacity:.85}
.btn .ic{position:absolute;line-height:0}
.btn.chrome .ic{left:9px;top:9px}
.btn.firefox .ic{left:8px;top:8px}
.avatar{width:22px;height:22px;border-radius:50%;background:var(--fg);opacity:.45;margin:0 6px;flex:none}
.bdg{position:absolute;display:block;text-align:center;white-space:nowrap;font-family:system-ui,"Segoe UI",Ubuntu,sans-serif}
.bdg.chrome{right:3px;bottom:3px;height:14px;min-width:14px;padding:0 2px;border-radius:4px;font-size:9px;font-weight:700;line-height:14px;box-shadow:0 0 0 1px var(--tb)}
.bdg.firefox{right:4px;top:3px;height:11px;min-width:14px;max-width:20px;padding:0 2px 1px;border-radius:2px;font-size:10px;line-height:10px;box-shadow:0 1px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.25)}
table.states{border-collapse:separate;border-spacing:6px 4px;margin:4px 0;table-layout:fixed}
table.states th{font-size:11px;font-weight:600;color:var(--muted);text-align:center;padding:0 6px;width:150px}
table.states tr th:first-child{text-align:left;width:110px}
table.states td{padding:0;text-align:center}
.tb-cell{display:inline-flex;padding:4px 10px;border-radius:8px;background:var(--tb)}
tr.chrome-light,tr.chrome-dark,tr.firefox-light,tr.firefox-dark{background:none}
.zooms,.zbadges,.lineup-zoom,.dropped{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
.zooms figure,.zbadges figure,.lineup-zoom figure,.dropped figure{margin:0;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.zbadges{margin-top:12px}
.lineup-zoom{margin-top:12px}
.lineup-zoom figure{flex-direction:row;flex-wrap:wrap;width:178px;gap:6px}
.lineup-zoom figcaption{width:100%}
figcaption{font-size:11px;color:var(--muted)}
canvas{image-rendering:pixelated;border-radius:4px;display:block}
.dropped figure{width:300px;flex-direction:row;gap:12px}
.dropped figcaption{font-size:12.5px;color:var(--text)}
.notes li{margin-bottom:6px}
</style>
</head>
<body>
<main>
<header>
  <div>
    <h1>Icon concepts</h1>
    <p class="muted"><span class="tag">PROTOTYPE · TICKET 34</span>Five hand-drawn concepts on the pigeonhole theme for 2.0's toolbar and store icon. The name is pending (ticket 22), so none carries a wordmark. The palette is ticket 15's. Nothing here is YouTube red or a play shape.</p>
  </div>
  <button class="toggle" id="theme">Dark page</button>
</header>
${lineup()}
${concepts.map(conceptSection).join('\n')}
${droppedSection()}
${notes}
</main>
<script>
const SRC = ${JSON.stringify(srcMap)};
const BADGES = ${JSON.stringify(badges)};
const TB = {'chrome-light':'#FFFFFF','chrome-dark':'#3C3C3C','firefox-light':'#F9F9FB','firefox-dark':'#2B2A33'};
const params = new URLSearchParams(location.search);
function setTheme(t){document.documentElement.dataset.theme=t;document.getElementById('theme').textContent=t==='dark'?'Light page':'Dark page';}
setTheme(params.get('theme')==='dark'?'dark':'light');
document.getElementById('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
const cache = new Map();
function img(key){
  if(cache.has(key)) return cache.get(key);
  const [a,b] = key.split(':');
  const svg = SRC[a][b];
  const p = new Promise((res)=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
  cache.set(key,p); return p;
}
function raster(i,n){const c=document.createElement('canvas');c.width=n;c.height=n;c.getContext('2d').drawImage(i,0,0,n,n);return c;}
function rr(g,x,y,w,h,r){g.beginPath();g.roundRect(x,y,w,h,r);}
// Icon plus badge at 1x, with the browser's geometry, then magnified.
function composite(icon16, kind, bg, state){
  const S = kind==='chrome'?28:32, o = kind==='chrome'?6:8;
  const layer=document.createElement('canvas');layer.width=S;layer.height=S;const lg=layer.getContext('2d');
  lg.drawImage(icon16,o,o);
  const c=document.createElement('canvas');c.width=S;c.height=S;const g=c.getContext('2d');
  g.fillStyle=bg;g.fillRect(0,0,S,S);
  const b=BADGES[state];
  if(b&&kind==='chrome'){
    g.font='bold 9px system-ui, sans-serif';const w=Math.max(14,Math.ceil(g.measureText(b.text).width)+4);
    lg.globalCompositeOperation='destination-out';rr(lg,S-w-1,S-15,w+2,16,5);lg.fill();lg.globalCompositeOperation='source-over';
    g.drawImage(layer,0,0);
    rr(g,S-w,S-14,w,14,4);g.fillStyle=b.bg;g.fill();g.fillStyle=b.fg;g.textAlign='center';g.textBaseline='middle';g.fillText(b.text,S-w/2,S-6.5);
  } else if(b){
    g.drawImage(layer,0,0);
    g.font='10px system-ui, sans-serif';const w=Math.min(20,Math.max(14,Math.ceil(g.measureText(b.text).width)+4));
    const x=o+16+4-w,y=o-5;
    g.fillStyle='rgba(0,0,0,.35)';rr(g,x,y+1,w,11,2);g.fill();
    rr(g,x,y,w,11,2);g.fillStyle=b.bg;g.fill();g.fillStyle=b.fg;g.textAlign='center';g.textBaseline='middle';g.fillText(b.text,x+w/2,y+5.5);
  } else g.drawImage(layer,0,0);
  return c;
}
(async()=>{
  for(const cv of document.querySelectorAll('canvas.zoom')){
    const n=+cv.dataset.n,k=+cv.dataset.k;const r=raster(await img(cv.dataset.src),n);
    const g=cv.getContext('2d');g.fillStyle=cv.dataset.bg;g.fillRect(0,0,cv.width,cv.height);g.imageSmoothingEnabled=false;g.drawImage(r,0,0,n*k,n*k);
  }
  for(const cv of document.querySelectorAll('canvas.zb')){
    const r=raster(await img(cv.dataset.src),16);const c=composite(r,cv.dataset.kind,TB[cv.dataset.tb],cv.dataset.state);
    const k=4;cv.width=c.width*k;cv.height=c.height*k;const g=cv.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(c,0,0,cv.width,cv.height);
  }
  document.body.dataset.ready='1';
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'sheet.html'), html);
console.log('wrote sheet.html', (html.length / 1024).toFixed(1) + ' KB');
