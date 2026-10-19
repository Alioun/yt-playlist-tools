// THROWAWAY PROTOTYPE (ticket 14). The rough dev build (dist-ext/, from `bun run build`) on REAL youtube.com,
// signed out, in headless Chromium: the background registers pp-www-page (MAIN) and pp-www (isolated: core → kit →
// features) at runtime, exactly as ticket 17 shapes production. Drives the controls on a channel grid (signed-out home
// is empty), search, a watch page and a Short, in both themes and at narrow widths; writes screenshots/live-*.png and
// screenshots/live-report.json. Usage: node scripts/live.mjs [step …]   (steps: grid search watch widths shorts fs)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ext = path.join(root, "dist-ext");
const out = path.join(root, "screenshots");
fs.mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME ?? "/tmp/pw/browsers/chromium-1248/chrome-linux64/chrome";
const steps = process.argv.slice(2);
const want = (s) => !steps.length || steps.includes(s);
const report = { when: new Date().toISOString(), notes: [], pages: {} };
const note = (k, v) => {
  report.notes.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  console.log(k, typeof v === "string" ? v : JSON.stringify(v));
};

// YouTube keeps a signed-out visitor's theme from the first visit, so each theme gets its own fresh profile.
let ctx;
async function launch(theme) {
  ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "pp14live-")), {
    executablePath: CHROME,
    headless: true,
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
    colorScheme: theme,
    // YouTube treats the HeadlessChrome user agent differently (no device theme, for one).
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
    args: ["--headless=new", "--no-sandbox", "--lang=en-US", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--autoplay-policy=no-user-gesture-required"],
  });
  await ctx.addCookies([{ name: "SOCS", value: "CAI", domain: ".youtube.com", path: "/", secure: true }]);
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  await new Promise((r) => setTimeout(r, 800));
  note(`registered (${theme})`, await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => `${s.id} [${s.world}] ${s.js.join(" → ")} @${s.runAt}`)));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function dev(page, cmd) {
  return page.evaluate(
    (c) =>
      new Promise((res) => {
        const on = (e) => {
          document.removeEventListener("pp-dev-result", on);
          res(JSON.parse(e.detail));
        };
        document.addEventListener("pp-dev-result", on);
        document.dispatchEvent(new CustomEvent("pp-dev", { detail: JSON.stringify(c) }));
        setTimeout(() => res({ timeout: true }), 3000);
      }),
    cmd,
  );
}
async function open(url, theme) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => /ytpt|pp-|Playlist Pigeon/.test(e.message + e.stack) && note("pageerror", e.message));
  page.on("console", (m) => /Playlist Pigeon|pp-/.test(m.text()) && note(`console.${m.type()}`, m.text().slice(0, 300)));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("pp-layer"), null, { timeout: 30000 }).catch(() => note("no layer host", url));
  await wait(2500);
  return page;
}
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(out, `live-${name}.png`), ...opts });
async function hoverThumb(page, sel, n = 0) {
  const el = page.locator(sel).nth(n);
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  return b;
}
async function overlayInfo(page) {
  return page.evaluate(() => {
    const h = document.querySelector("pp-overlay");
    if (!h) return null;
    const r = h.getBoundingClientRect();
    const btns = [...(h.shadowRoot?.querySelectorAll("button") ?? [])].map((b) => b.getAttribute("aria-label"));
    const top = document.elementFromPoint(r.left + 10, r.top + 10);
    return { parent: h.parentElement?.tagName.toLowerCase() + "." + [...(h.parentElement?.classList ?? [])].join("."), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], buttons: btns, onTop: top === h || h.contains(top) };
  });
}

for (const theme of (process.env.THEMES ?? "light,dark").split(",")) {
  await launch(theme);
  // 1. A channel's video grid (signed-out home is empty): the overlay on lockups.
  if (want("grid")) {
    const page = await open("https://www.youtube.com/@veritasium/videos", theme);
    const q = await dev(page, { query: 1 });
    report.pages[`grid-${theme}`] = { settle: q.settle, timing: q.timing, running: q.running };
    note(`grid ${theme} running`, q.running);
    note(`grid ${theme} settle check`, q.settle);
    note(`grid ${theme} theme vars`, await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--yt-sys-color-baseline--base-background")));
    const T = "a.ytLockupViewModelContentImage";
    await hoverThumb(page, T, 1);
    await wait(900);
    note(`grid ${theme} overlay (YouTube's toggles present, ours defers)`, await overlayInfo(page));
    await shot(page, `grid-hover-${theme}`);
    // Ours alongside YouTube's own, for comparison.
    await dev(page, { set: { queueDefers: false } });
    await page.mouse.move(5, 5);
    await wait(200);
    await hoverThumb(page, T, 2);
    await wait(900);
    note(`grid ${theme} overlay (not deferring)`, await overlayInfo(page));
    await shot(page, `grid-hover-both-queues-${theme}`);
    if (theme === "light") {
      const b = await page.locator(T).nth(2).boundingBox();
      await shot(page, `grid-hover-crop-${theme}`, { clip: { x: b.x - 8, y: b.y - 8, width: b.width + 16, height: b.height + 90 } });
    }
    // The picker from ▾ (popovers.js injected on first use).
    const t0 = Date.now();
    await page.locator("pp-overlay button[aria-label='Save to another playlist…']").click();
    await page.waitForSelector("pp-layer [role=dialog]", { timeout: 8000 }).catch(() => note("picker", "did not open"));
    note(`grid ${theme} picker first open (click → dialog in DOM)`, `${Date.now() - t0} ms`);
    await wait(1200);
    await shot(page, `grid-picker-${theme}`);
    // isolateEvents vs Bits UI's Escape: without our own handler, then with it.
    await dev(page, { escapeFix: false });
    await page.keyboard.press("Escape");
    await wait(300);
    const openNoFix = await page.locator("pp-layer [role=dialog]").count();
    note(`grid ${theme} Escape closes the picker without our handler (isolateEvents on)`, openNoFix === 0);
    await dev(page, { escapeFix: true });
    await page.keyboard.press("Escape");
    await wait(300);
    note(`grid ${theme} Escape closes the picker with our handler`, (await page.locator("pp-layer [role=dialog]").count()) === 0);
    // Keyboard reach: focus the thumbnail link, Tab once.
    await page.mouse.move(5, 500);
    await page.locator(T).nth(4).focus();
    await wait(200);
    const order = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      await wait(250);
      order.push(
        await page.evaluate(() => {
          const a = document.activeElement;
          const inner = a?.shadowRoot?.activeElement;
          return inner ? `ours: ${inner.getAttribute("aria-label")}` : `${a?.tagName.toLowerCase()} "${(a?.getAttribute("aria-label") ?? a?.textContent ?? "").trim().slice(0, 30)}"`;
        }),
      );
      if (order.at(-1).startsWith("ours")) break;
    }
    note(`grid ${theme} Tab order after a thumbnail link`, order);
    await shot(page, `grid-keyboard-${theme}`);
    // Right-click a card: YouTube's own ⋮ menu.
    if (theme === "light") {
      await page.keyboard.press("Escape");
      const b = await page.locator(T).nth(5).boundingBox();
      await page.mouse.click(b.x + 60, b.y + 40, { button: "right" });
      await wait(800);
      note("grid card menu: YouTube's dropdown open", await page.evaluate(() => [...document.querySelectorAll("tp-yt-iron-dropdown")].some((d) => getComputedStyle(d).display !== "none" && d.getBoundingClientRect().width > 0)));
      await shot(page, `grid-right-click-${theme}`);
      await page.keyboard.press("Escape");
      // Toasts: ours (one-click save) and YouTube's own, for comparison.
      await page.mouse.move(5, 500);
      await hoverThumb(page, T, 0);
      await wait(500);
      await page.locator("pp-overlay button[aria-label^='Save to']").first().click();
      await wait(1500);
      await shot(page, `grid-toast-ours-${theme}`);
      await dev(page, { set: { "outcome.save": "missing" } });
      await page.locator("pp-overlay button[aria-label^='Save to'], pp-overlay button[aria-label^='Saved to']").first().click();
      await wait(1500);
      await shot(page, `grid-toast-failure-${theme}`);
      await dev(page, { set: { "outcome.save": "ok" } });
      await dev(page, { notice: ["quickSave", "queue"] });
      await wait(800);
      await shot(page, `grid-notice-${theme}`);
    }
    await page.close();
  }

  // 2. Search: YouTube's inline preview plays in a layer above the card.
  if (want("search")) {
    const page = await open("https://www.youtube.com/results?search_query=woodworking+dovetail", theme);
    const q = await dev(page, { query: 1 });
    note(`search ${theme} settle check`, q.settle);
    const T = "ytd-video-renderer:not([is-ad]) a#thumbnail";
    await hoverThumb(page, T, 1);
    await wait(400);
    note(`search ${theme} overlay before preview`, await overlayInfo(page));
    await wait(2200);
    note(`search ${theme} overlay with the inline preview playing`, await overlayInfo(page));
    await shot(page, `search-preview-${theme}`);
    const shortsLink = await page.evaluate(() => document.querySelector("a[href^='/shorts/']")?.getAttribute("href"));
    report.shortsLink = shortsLink;
    await page.close();
  }

  // 3. A watch page: the pill, its menu, the picker by key, typing isolation, fullscreen.
  if (want("watch")) {
    const page = await open("https://www.youtube.com/watch?v=aqz-KE-bpKQ", theme);
    await page.waitForSelector("pp-inline", { timeout: 15000 }).catch(() => note("watch", "no pill"));
    const where = await page.evaluate(() => {
      const h = document.querySelector("pp-inline");
      const prev = h?.previousElementSibling;
      return { parent: h?.parentElement?.id, after: prev?.tagName.toLowerCase() + " " + (prev?.textContent ?? "").trim().slice(0, 20), rect: h?.getBoundingClientRect().toJSON() };
    });
    note(`watch ${theme} pill placed`, where);
    await shot(page, `watch-${theme}`);
    const meta = await page.locator("ytd-watch-metadata #top-row").boundingBox();
    if (meta) await shot(page, `watch-row-${theme}`, { clip: { x: meta.x - 8, y: meta.y - 8, width: meta.width + 16, height: meta.height + 16 } });
    await dev(page, { set: { "autoAdd.kind": "partly", "autoAdd.progress": 63 } });
    await wait(300);
    if (meta) await shot(page, `watch-row-partly-${theme}`, { clip: { x: meta.x - 8, y: meta.y - 8, width: meta.width + 16, height: meta.height + 16 } });
    await dev(page, { set: { "autoAdd.kind": "counting", "autoAdd.progress": 32 } });
    await page.locator("pp-inline button").first().click();
    await page.waitForSelector("pp-layer [role=dialog]", { timeout: 8000 }).catch(() => note("watch menu", "did not open"));
    await wait(900);
    await shot(page, `watch-menu-${theme}`);
    await page.keyboard.press("Escape");
    await wait(300);
    // Alt+Shift+P with the pointer on the player: the picker over the player.
    const pl = await page.locator("#movie_player").boundingBox();
    await page.mouse.move(pl.x + pl.width / 2, pl.y + pl.height / 2);
    await page.keyboard.press("Alt+Shift+P");
    await page.waitForSelector("pp-layer [role=dialog]", { timeout: 8000 }).catch(() => note("picker key", "did not open"));
    await wait(900);
    await shot(page, `watch-picker-key-${theme}`);
    // Typing "k" (YouTube's play/pause) in our search field must not reach YouTube.
    const before = await page.evaluate(() => document.querySelector("#movie_player")?.getPlayerState?.());
    await page.keyboard.type("kk mus");
    await wait(400);
    const after = await page.evaluate(() => document.querySelector("#movie_player")?.getPlayerState?.());
    note(`watch ${theme} typing "kk" in our picker: player state before/after (1 playing, 2 paused)`, [before, after]);
    await shot(page, `watch-picker-typing-${theme}`);
    await page.keyboard.press("Escape");
    await wait(300);
    if (theme === "dark") {
      // Fullscreen: an explicit key's toast shows over the video; auto-add's waits until fullscreen ends.
      await page.mouse.click(pl.x + pl.width / 2, pl.y + pl.height / 2);
      await page.keyboard.press("f");
      await wait(1500);
      note("watch fullscreenElement", await page.evaluate(() => document.fullscreenElement?.tagName.toLowerCase() ?? null));
      await dev(page, { autoAddFire: true });
      await wait(1200);
      await page.mouse.move(700, 450);
      await page.keyboard.press("Alt+W");
      await wait(1500);
      await shot(page, `watch-fullscreen-${theme}`);
      note("watch fullscreen: toast shown / held", await dev(page, { query: 1 }).then((r) => r.toast));
      await page.evaluate(() => document.exitFullscreen?.());
      await wait(1500);
      await shot(page, `watch-after-fullscreen-${theme}`);
      note("watch after fullscreen: toast", await dev(page, { query: 1 }).then((r) => r.toast));
    }
    // Teardown: switching every feature off removes every host.
    await dev(page, { set: { "features.watchButton": false, "features.quickSave": false, "features.queue": false, "features.shortcuts": false, "features.cardMenu": false } });
    await wait(400);
    note(`watch ${theme} after switching features off`, await dev(page, { query: 1 }).then((r) => ({ running: r.running, hosts: r.hosts.map((h) => h.tag) })));
    await page.close();
  }

  // 4. Narrow widths: YouTube folds Save into "…"; our pill folds to icon only.
  if (want("widths")) {
    const page = await open("https://www.youtube.com/watch?v=aqz-KE-bpKQ", theme);
    await page.waitForSelector("pp-inline", { timeout: 15000 }).catch(() => {});
    const rows = [];
    for (const w of [1400, 1200, 1000, 860, 700, 560, 420]) {
      await page.setViewportSize({ width: w, height: 900 });
      await wait(1300);
      const info = await page.evaluate(() => {
        const h = document.querySelector("pp-inline");
        const save = document.querySelector("ytd-watch-metadata #flexible-item-buttons button[aria-label='Save to playlist']");
        const more = document.querySelector("ytd-watch-metadata ytd-menu-renderer > yt-button-shape button");
        const r = h?.getBoundingClientRect();
        const menu = document.querySelector("ytd-watch-metadata ytd-menu-renderer")?.getBoundingClientRect();
        return {
          pill: r ? Math.round(r.width) : null,
          compact: r ? r.width < 50 : null,
          saveShown: !!save && save.offsetParent !== null,
          moreVisible: !!more && more.getBoundingClientRect().right <= innerWidth,
          rowOverflows: !!menu && !!r && (r.right > menu.right + 1 || r.left < menu.left - 1),
        };
      });
      rows.push({ w, ...info });
      const meta = await page.locator("ytd-watch-metadata #top-row").boundingBox();
      if (meta) await shot(page, `width-${w}-${theme}`, { clip: { x: Math.max(0, meta.x - 8), y: meta.y - 8, width: Math.min(w, meta.width + 16), height: meta.height + 16 } });
    }
    report.pages[`widths-${theme}`] = rows;
    note(`widths ${theme}`, rows);
    await page.close();
  }

  // 5. A Short: the column button.
  if (want("shorts")) {
    const link = report.shortsLink ?? "/shorts/";
    const page = await open(`https://www.youtube.com${link}`, theme);
    await page.waitForSelector("pp-inline", { timeout: 15000 }).catch(() => note("shorts", "no column button"));
    note(
      `shorts ${theme} button placed`,
      await page.evaluate(() => {
        const h = document.querySelector("pp-inline");
        return { parent: h?.parentElement?.tagName.toLowerCase(), next: h?.nextElementSibling?.tagName.toLowerCase(), rect: h?.getBoundingClientRect().toJSON() };
      }),
    );
    await shot(page, `shorts-${theme}`);
    await page.locator("pp-inline button").first().click().catch(() => {});
    await page.waitForSelector("pp-layer [role=dialog]", { timeout: 8000 }).catch(() => {});
    await wait(900);
    await shot(page, `shorts-menu-${theme}`);
    await page.close();
  }
  await ctx.close();
}

fs.writeFileSync(path.join(out, "live-report.json"), JSON.stringify(report, null, 1));
