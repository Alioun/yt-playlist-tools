// Measures where each character of a line starts, with the font's own kerning, as Chrome lays the
// line out at 1000 px (so offsets are in font units). textpath.py turns the result into outlines.
// Run: node assets/brand/tools/measure.mjs <Nunito[wght].ttf> assets/brand/tools/lines-in.json <positions.json>
// Env: PLAYWRIGHT_CORE (path to playwright-core), CHROME (browser binary), CHROME_LIBS (extra LD_LIBRARY_PATH).
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || '/tmp/pw/node_modules/playwright-core');
const executablePath = process.env.CHROME || '/tmp/ytprobe-cft/chrome/linux-155.0.8059.84/chrome-linux64/chrome';
const libs = process.env.CHROME_LIBS ?? '/tmp/ytprobe-libs/usr/lib/x86_64-linux-gnu';
const [font, inFile, outFile] = process.argv.slice(2);
const lines = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const uri = 'data:font/ttf;base64,' + fs.readFileSync(font).toString('base64');

const browser = await chromium.launch({ executablePath, env: { ...process.env, LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
const page = await browser.newPage();
await page.setContent(`<style>@font-face{font-family:N;src:url(${uri});font-weight:200 1000}</style>` +
  lines.map((l, i) => `<div><span id="t${i}" style="font:${l.weight} 1000px/1 N;white-space:pre;font-kerning:normal"></span></div>`).join(''));
const res = await page.evaluate(async (lines) => {
  await document.fonts.load('800 1000px N');
  await document.fonts.ready;
  return lines.map((l, i) => {
    const el = document.getElementById('t' + i);
    el.textContent = l.text;
    const n = el.firstChild, x0 = el.getBoundingClientRect().left, x = [];
    for (let j = 0; j < n.length; j++) {
      const r = document.createRange();
      r.setStart(n, j);
      r.setEnd(n, j + 1);
      x.push(+(r.getBoundingClientRect().left - x0).toFixed(2));
    }
    return { ...l, x };
  });
}, lines);
fs.writeFileSync(outFile, JSON.stringify(res, null, 1) + '\n');
await browser.close();
console.log('measured', res.map((r) => `${r.key} (${r.x.length})`).join(', '));
