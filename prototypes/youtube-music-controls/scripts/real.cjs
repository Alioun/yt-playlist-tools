// THROWAWAY PROTOTYPE (ticket 27). Helpers to drive REAL music.youtube.com, signed out, with the rough dev build.
// CHROMIUM=/path/to/chrome (a full Chromium: new headless loads extensions). Consent is declined by cookie (SOCS=CAI).
const { chromium } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const EXT = path.resolve(__dirname, "../dist/ext");

async function launch({ width = 1440, height = 900, dev = {}, wiz = false } = {}) {
  const dir = fs.mkdtempSync("/tmp/pp27-profile-");
  const context = await chromium.launchPersistentContext(dir, {
    executablePath: process.env.CHROMIUM || "/tmp/pw/browsers/chromium-1248/chrome-linux64/chrome",
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--autoplay-policy=no-user-gesture-required", "--lang=en-US"],
    viewport: { width, height },
    userAgent: UA,
    locale: "en-US",
  });
  await context.addCookies([
    { name: "SOCS", value: "CAI", domain: ".youtube.com", path: "/", secure: true },
    { name: "PREF", value: "hl=en&gl=US", domain: ".youtube.com", path: "/", secure: true },
  ]);
  await context.addInitScript((d) => localStorage.setItem("pp27", d), JSON.stringify(dev));
  if (wiz) {
    // Force YouTube Music's Wiz miniplayer A/B flag (music_web_enable_wiz_miniplayer) into the served page config.
    await context.route(/^https:\/\/music\.youtube\.com\/(\?.*|watch.*|browse.*|search.*|)$/, async (route) => {
      const resp = await route.fetch();
      const body = (await resp.text()).replace('"EXPERIMENT_FLAGS":{', '"EXPERIMENT_FLAGS":{"music_web_enable_wiz_miniplayer":true,');
      await route.fulfill({ response: resp, body });
    });
  }
  // Wait for the background to register the page scripts (runtime registration, ticket 17).
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent("serviceworker");
  for (let i = 0; i < 40; i++) {
    const n = await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length).catch(() => 0);
    if (n >= 2) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  const page = context.pages()[0] || (await context.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => /pp27|svelte|bits/i.test(m.text()) && errors.push("console: " + m.text().slice(0, 200)));
  return { context, page, sw, errors };
}

async function devLog(page) {
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("pp27:dev", { detail: "log" })));
  return JSON.parse((await page.evaluate(() => document.documentElement.dataset.pp27log)) || "[]");
}

async function go(page, url, ms = 7000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(ms);
}

module.exports = { launch, devLog, go };
