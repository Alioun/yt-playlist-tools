// THROWAWAY PROTOTYPE (ticket 14). Screenshots of the hi-fi mock (dist/, from `bun run build`) in both YouTube
// themes. Usage: node scripts/shots.mjs [sceneId …]
// Needs a Chromium: CHROME=/path/to/chrome (default: the Playwright build ticket 24 left in /tmp/pw), plus
// LD_LIBRARY_PATH if the machine lacks its libraries (this WSL box: /tmp/ytprobe-libs/usr/lib/x86_64-linux-gnu).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(root, "dist");
const out = path.join(root, "screenshots");
fs.mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME ?? "/tmp/pw/browsers/chromium-1248/chrome-linux64/chrome";

const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let f = path.join(dist, decodeURIComponent(u.pathname));
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" }).end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

// [file, scene, theme, width, height, extra wait ms, { variant, clip, actions }]
const ALL = [
  ["01-home-hover", "home", "light", 1400, 900, 400],
  ["02-home-hover", "home", "dark", 1400, 900, 400],
  ["03-states", "states", "light", 1400, 1500, 300],
  ["04-states", "states", "dark", 1400, 1500, 300],
  ["05-picker", "picker", "light", 1400, 900, 1200],
  ["06-picker", "picker", "dark", 1400, 900, 1200],
  ["07-choose-mode", "choose", "light", 1400, 900, 1200],
  ["08-toast-undo", "toast-undo", "light", 1400, 900, 1300],
  ["09-toast-undo", "toast-undo", "dark", 1400, 900, 1300],
  ["10-queue-added", "toast-queue", "dark", 1400, 900, 1300],
  ["11-queue-unconfirmed", "queue-unconfirmed", "light", 1400, 900, 1300],
  ["12-toast-failure", "toast-failure", "dark", 1400, 900, 1300],
  ["13-yt-toggles-queue-steps-aside", "yt-toggles", "light", 1400, 900, 600],
  ["14-not-working-notice", "notice", "light", 1400, 900, 900],
  ["15-not-working-notice", "notice", "dark", 1400, 900, 900],
  ["16-watch", "watch", "light", 1400, 900, 600],
  ["17-watch", "watch", "dark", 1400, 900, 600],
  ["18-watch-menu", "watch-menu", "light", 1400, 900, 1200],
  ["19-watch-menu", "watch-menu", "dark", 1400, 900, 1200],
  ["20-watch-plain", "watch-plain", "dark", 1400, 900, 600],
  ["21-watch-narrow-1000", "watch", "light", 1000, 800, 900],
  ["22-watch-narrow-760", "watch", "dark", 760, 900, 900],
  ["23-watch-narrow-560", "watch", "light", 560, 900, 900],
  ["24-picker-key-player", "picker-key", "dark", 1400, 900, 1200],
  ["25-picker-key-card", "picker-key-card", "light", 1400, 900, 1200],
  ["26-pending-key-save", "pending", "light", 1400, 900, 1500],
  ["27-shorts", "shorts", "dark", 1400, 900, 700],
  ["28-shorts", "shorts", "light", 1400, 900, 700],
  ["29-fullscreen", "fullscreen", "dark", 1400, 900, 2200],
  ["30-card-menu", "card-menu", "light", 1400, 900, 700],
  ["31-signed-out", "signed-out", "dark", 1400, 900, 600],
  ["32-keyboard-reach", "home-keyboard", "light", 1400, 900, 1000],
  ["33-hidden-tab-held-failure", "hidden-tab", "light", 1400, 900, 2400],
  ["34-variant-B-watch", "watch-plain", "light", 1400, 900, 600, { variant: "B" }],
  ["35-variant-C-home", "home", "light", 1400, 900, 400, { variant: "C" }],
  ["36-fallback-palette-dark", "watch-menu", "dark", 1400, 900, 1200, { vars: "0" }],
];
const only = process.argv.slice(2);
const list = only.length ? ALL.filter((s) => only.some((o) => s[0].includes(o) || s[1] === o)) : ALL;

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "pp14-")), {
  executablePath: CHROME,
  headless: true,
  args: ["--headless=new", "--no-sandbox", "--lang=en-US", "--force-prefers-reduced-motion"],
  locale: "en-US",
});
const errors = [];
for (const [file, scene, theme, w, h, waitMs, opt = {}] of list) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${file}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${file}: console ${m.text()}`));
  await page.setViewportSize({ width: w, height: h });
  const q = new URLSearchParams({ scene, theme, chrome: "0", ...(opt.variant ? { variant: opt.variant } : {}), ...(opt.vars ? { vars: opt.vars } : {}) });
  await page.goto(`${base}?${q}`);
  await page.waitForFunction(() => globalThis.__pp?.kit?.layer, null, { timeout: 10000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: path.join(out, `${file}-${theme}.png`) });
  console.log("shot", `${file}-${theme}.png`);
  await page.close();
}
await ctx.close();
server.close();
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
