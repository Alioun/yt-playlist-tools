// Renders the sheet (full page, light and dark) and each concept at 16/32/48/128 px
// into prototypes/icon/renders/, with headless Chrome through playwright-core.
// Run: node prototypes/icon/tools/render.mjs
// Env: PLAYWRIGHT_CORE (path to playwright-core), CHROME (browser binary), CHROME_LIBS (extra LD_LIBRARY_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || '/tmp/pw/node_modules/playwright-core');
const executablePath = process.env.CHROME || '/tmp/ytprobe-cft/chrome/linux-155.0.8059.84/chrome-linux64/chrome';
const libs = process.env.CHROME_LIBS ?? '/tmp/ytprobe-libs/usr/lib/x86_64-linux-gnu';
const out = path.join(root, 'renders');
fs.mkdirSync(out, { recursive: true });

const slugs = fs.readdirSync(path.join(root, 'concepts')).filter((d) => fs.statSync(path.join(root, 'concepts', d)).isDirectory());

const browser = await chromium.launch({ executablePath, env: { ...process.env, LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1368, height: 900 } });

for (const theme of ['light', 'dark']) {
  await page.goto(pathToFileURL(path.join(root, 'sheet.html')).href + `?theme=${theme}`);
  await page.waitForSelector('body[data-ready="1"]');
  await page.screenshot({ path: path.join(out, `sheet-${theme}.png`), fullPage: true });
}

// Each concept at its shipping sizes: 16 and 32 from their own drawings, 48 from the artwork,
// 128 as the store tile (96 px artwork, 16 px transparent padding).
for (const slug of slugs) {
  const file = (s) => fs.readFileSync(path.join(root, 'concepts', slug, s), 'utf8');
  const sizes = [
    [16, file(`${slug}-16.svg`)],
    [32, file(`${slug}-32.svg`)],
    [48, file(`${slug}.svg`)],
    [128, file(`${slug}-128.svg`)],
  ];
  for (const [n, svg] of sizes) {
    const sized = svg.replace(/ width="\d+" height="\d+"/, ` width="${n}" height="${n}"`);
    await page.setContent(`<body style="margin:0;background:transparent"><div id="i" style="width:${n}px;height:${n}px;line-height:0">${sized}</div></body>`);
    await (await page.$('#i')).screenshot({ path: path.join(out, `${slug}-${n}.png`), omitBackground: true });
  }
}
await browser.close();
console.log('rendered', fs.readdirSync(out).length, 'files into', path.relative(process.cwd(), out) || out);
