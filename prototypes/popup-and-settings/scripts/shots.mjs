// THROWAWAY PROTOTYPE (ticket 15). Screenshots of the prototype, from a declarative list.
//
//   bun run build && bun run preview          (serves dist on http://localhost:4173)
//   LD_LIBRARY_PATH=… node scripts/shots.mjs [filter]
//
// Env: BASE (default http://localhost:4173), OUT (default ../screenshots), PLAYWRIGHT_CORE (path to playwright-core),
// CHROMIUM (browser executable). `filter` runs only shots whose name contains it.
// Popup shots load popup.html directly at 360 px and capture the popup itself, so they're crisp; the harness gets
// one overview shot of its own.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "/tmp/pw/node_modules/playwright-core");
const BASE = (process.env.BASE || "http://localhost:4173").replace(/\/$/, "");
const OUT = resolve(process.env.OUT || join(here, "..", "screenshots"));
const CHROMIUM =
  process.env.CHROMIUM || "/tmp/pw/browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const filter = process.argv[2] || "";

const POPUP = { width: 360, height: 600 };
const PAGE = { width: 1280, height: 800 };
const WIDE = { width: 1440, height: 900 };
/** The popup's own box, so a short popup isn't padded to 600 px. */
const popupEl = "#app > *";

const popup = (name, query, actions) => ({ name, url: `/popup.html?${query}`, viewport: POPUP, element: popupEl, actions });
const settings = (name, query, hash, extra = {}) => ({ name, url: `/settings.html?${query}#${hash}`, viewport: PAGE, fullPage: true, ...extra });
const onboarding = (name, query, extra = {}) => ({ name, url: `/onboarding.html?${query}`, viewport: PAGE, fullPage: true, ...extra });

/**
 * Each shot: { name, url, viewport, actions?, fullPage?, element?, clip? }.
 * Actions: { click: selector } | { press: key } | { type: [selector, text] } | { wait: ms } | { hover: selector } |
 * { scroll: selector, block?: "start" | "center" } (scrolls it into view, to the middle by default).
 */
export const shots = [
  // The popup's first view (variant A, chosen)
  popup("01-popup-on-video-light", "s=on-video&theme=light"),
  popup("02-popup-on-video-dark", "s=on-video&theme=dark"),
  popup("03-popup-youtube-music-light", "s=music&theme=light"),
  popup("04-popup-youtube-music-dark", "s=music&theme=dark"),
  // What unfolds (lazy)
  popup("05-popup-auto-add-unfolded", "s=on-video&theme=light&open=autoAdd"),
  popup("06-popup-playlist-options-and-channel-filter", "s=on-video&theme=light&open=autoAdd", [{ click: 'button[aria-label="Options for Kids – approved"]' }, { wait: 400 }, { scroll: 'text=Takes' }]),
  popup("07-popup-shortcuts-unfolded", "s=on-video&theme=light&open=shortcuts"),
  popup("08-popup-key-recorder-recording", "s=on-video&theme=light&open=shortcuts", [{ click: 'button[aria-label="No key. Set key"]' }, { press: "Alt" }]),
  popup("09-popup-key-recorder-clash", "s=on-video&theme=light&open=shortcuts", [{ click: 'button[aria-label="No key. Set key"]' }, { press: "Alt+k" }]),
  popup("10-popup-key-recorder-youtube-key-note", "s=on-video&theme=dark&open=shortcuts", [{ click: 'button[aria-label="No key. Set key"]' }, { press: "k" }]),
  popup("11-popup-this-video-details-dark", "s=on-video&theme=dark&open=video"),
  popup("12-popup-picker-save-to", "s=on-video&theme=light&open=video", [{ click: 'button:has-text("Save to…")' }, { wait: 900 }]),
  popup("13-popup-picker-new-playlist", "s=on-video&theme=light&open=video", [
    { click: 'button:has-text("Save to…")' },
    { wait: 700 },
    { click: 'button:has-text("New playlist")' },
    { type: ["#np-title", "Cooking"] },
  ]),
  popup("14-popup-picker-choose-for-shortcut", "s=on-video&theme=dark&open=shortcuts", [{ click: 'button:has-text("No playlist on Alioun yet")' }, { wait: 600 }]),
  popup("15-popup-account-in-view-menu", "s=two-setups&theme=light&open=accounts"),
  popup("16-popup-music-quick-actions-unfolded", "s=music&theme=light&open=musicQuickActions"),
  popup("17-popup-music-picker", "s=music&theme=dark", [{ click: 'button[aria-label="Save to another playlist"]' }, { wait: 900 }]),
  popup("18-popup-consent-before-a-feature-runs", "s=fresh&theme=light", [{ click: 'button[role=switch][aria-label="Auto-add"]' }, { wait: 400 }]),
  popup("19-popup-partly-added", "s=partly-added&theme=light"),
  popup("20-popup-on-a-short", "s=short&theme=light"),
  popup("21-popup-auto-add-paused", "s=paused&theme=light"),
  popup("22-popup-new-account", "s=new-account&theme=light&open=autoAdd"),
  // Banners and states, in ticket 09's order
  popup("30-popup-waiting-for-consent", "s=fresh&theme=light"),
  popup("31-popup-upgrade-pending", "s=upgrade-pending&theme=light"),
  popup("32-popup-reset-from-another-browser", "s=sync-reset&theme=light"),
  popup("33-popup-no-site-access-firefox", "s=no-access&theme=light"),
  popup("34-popup-no-music-access-chrome", "s=no-music-access&theme=light"),
  popup("35-popup-account-changed-in-another-tab", "s=stale-tab&theme=light"),
  popup("36-popup-not-signed-in", "s=signed-out&theme=light"),
  popup("37-popup-private-window", "s=private-window&theme=light"),
  popup("38-popup-no-youtube-tab", "s=no-tab&theme=light"),
  popup("39-popup-synced-account-not-loaded", "s=synced-account&theme=light&open=autoAdd"),
  popup("40-popup-sync-full", "s=sync-full&theme=light"),
  popup("41-popup-sync-update", "s=sync-update&theme=dark"),
  popup("42-popup-missing-or-full", "s=missing&theme=light&open=autoAdd"),
  popup("43-popup-1x-unclaimed", "s=unclaimed&theme=light"),
  popup("44-popup-1x-claimed", "s=claimed&theme=light"),
  popup("45-popup-youtube-changed", "s=youtube-changed&theme=light"),
  popup("46-popup-reading-account", "s=reading-account&theme=light"),
  popup("47-popup-installed-music-app", "s=installed-app&theme=dark"),
  // Variants B and C (runner-ups)
  popup("50-popup-variant-B-drill-in", "s=on-video&theme=light&variant=B&open=autoAdd"),
  popup("51-popup-variant-C-status-first", "s=partly-added&theme=light&variant=C"),
  popup("52-popup-variant-C-status-first-dark", "s=on-video&theme=dark&variant=C"),
  // Settings
  settings("60-settings-youtube", "s=on-video&theme=light", "youtube"),
  settings("61-settings-youtube-dark", "s=on-video&theme=dark", "youtube"),
  { name: "62-settings-playlist-shortcuts", url: "/settings.html?s=on-video&theme=light#feature-shortcuts", viewport: PAGE, actions: [{ wait: 2500 }] },
  { name: "63-settings-shortcut-playlist-chooser", url: "/settings.html?s=on-video&theme=light#feature-shortcuts", viewport: PAGE, actions: [{ wait: 2500 }, { scroll: 'text=Name (optional)', block: "start" }, { click: 'button:has-text("Choose a playlist")' }, { wait: 900 }] },
  settings("64-settings-youtube-music-dark", "s=on-video&theme=dark", "music"),
  settings("65-settings-everywhere-sync-full", "s=sync-full&theme=light", "everywhere"),
  { name: "66-settings-sync-join-question", url: "/settings.html?s=sync-join&theme=light#everywhere", viewport: PAGE, actions: [{ wait: 600 }, { click: "[role=switch]" }, { wait: 500 }] },
  settings("67-settings-accounts", "s=two-setups&theme=light", "accounts"),
  settings("68-settings-accounts-synced-dark", "s=synced-account&theme=dark", "accounts"),
  settings("69-settings-appearance", "s=on-video&theme=light", "appearance"),
  settings("70-settings-privacy", "s=sync-on&theme=light", "privacy"),
  { name: "71-settings-clear-all-data", url: "/settings.html?s=sync-on&theme=light#privacy", viewport: PAGE, actions: [{ wait: 600 }, { click: 'button:has-text("Clear all data…")' }, { wait: 300 }, { click: "[role=dialog] button[role=checkbox]" }, { wait: 300 }] },
  settings("72-settings-diagnostics-dark", "s=youtube-changed&theme=dark", "diagnostics"),
  settings("73-settings-about", "s=on-video&theme=light", "about"),
  { name: "74-settings-consent-before-a-feature-runs", url: "/settings.html?s=fresh&theme=dark#youtube", viewport: PAGE, actions: [{ wait: 600 }, { click: "[aria-label='Auto-add']" }, { wait: 400 }] },
  settings("75-settings-not-working", "s=youtube-changed&theme=light", "feature-queueButton", { fullPage: false }),
  settings("76-settings-private-window", "s=private-window&theme=light", "youtube", { fullPage: false }),
  settings("77-settings-no-music-access", "s=no-music-access&theme=light", "music", { fullPage: false }),
  // First run and the upgrade note
  onboarding("80-first-run-1-pick-features", "s=fresh&theme=light"),
  onboarding("81-first-run-1-from-sync-dark", "s=fresh&theme=dark&sync=found"),
  onboarding("82-first-run-2-before-you-start", "s=fresh&theme=light&step=2"),
  onboarding("83-first-run-3-finish", "s=fresh&theme=light&step=3"),
  onboarding("84-first-run-not-now-dark", "s=fresh&theme=dark&step=notnow"),
  onboarding("85-upgrade-note", "s=upgrade-pending&theme=light&mode=upgrade"),
  onboarding("86-upgrade-note-keys-dark", "s=upgrade-set&theme=dark&mode=upgrade"),
  onboarding("87-upgrade-note-agreed", "s=upgrade-pending&theme=light&mode=upgrade", { actions: [{ click: 'button:has-text("Agree and turn on")' }, { wait: 1200 }] }),
  onboarding("88-upgrade-note-no-site-access-firefox", "s=no-access&theme=light&mode=upgrade&browser=firefox"),
  // Brand and the harness
  { name: "90-brand-sheet", url: "/?surface=brand", viewport: WIDE, fullPage: true },
  { name: "91-harness-popup-light-and-dark", url: "/?surface=popup&s=on-video&theme=both", viewport: WIDE },
  { name: "92-harness-settings", url: "/?surface=settings&s=on-video&theme=light", viewport: WIDE },
];

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  let done = 0;
  for (const shot of shots.filter((s) => !filter || s.name.includes(filter))) {
    const page = await browser.newPage({ viewport: shot.viewport ?? PAGE, deviceScaleFactor: 2 });
    page.on("pageerror", (e) => console.warn(`  ${shot.name}: page error: ${e.message}`));
    await page.goto(BASE + shot.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    for (const a of shot.actions ?? []) {
      if (a.click) await page.click(a.click);
      else if (a.press) await page.keyboard.press(a.press);
      else if (a.type) await page.fill(a.type[0], a.type[1]);
      else if (a.hover) await page.hover(a.hover);
      else if (a.wait) await page.waitForTimeout(a.wait);
      else if (a.scroll) await page.locator(a.scroll).first().evaluate((el, block) => el.scrollIntoView({ block }), a.block ?? "center");
      await page.waitForTimeout(150);
    }
    await page.waitForLoadState("networkidle");
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    const path = join(OUT, `${shot.name}.png`);
    if (shot.element) {
      const el = page.locator(shot.element).first();
      await el.screenshot({ path });
    } else await page.screenshot({ path, fullPage: !!shot.fullPage, clip: shot.clip });
    console.log(`  ${shot.name}.png`);
    await page.close();
    done++;
  }
  await browser.close();
  console.log(`${done} screenshot${done === 1 ? "" : "s"} in ${OUT}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
