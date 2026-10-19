// THROWAWAY PROTOTYPE (ticket 27). The rough dev build on REAL music.youtube.com, signed out. Build it first
// (`bun run build:ext`), then: CHROMIUM=/path/to/chrome node scripts/shoot-real.cjs
// Queue actions really run (signed out they change only this tab's queue). Save and Like are drawn with the dev
// flag "pretendSignedIn" to check their placement; nothing is sent for them.
const path = require("node:path");
const fs = require("node:fs");
const { launch, devLog, go } = require("./real.cjs");
const OUT = path.resolve(__dirname, "../screenshots");
const WATCH = "https://music.youtube.com/watch?v=gx7GyiDZQms&list=RDAMVMgx7GyiDZQms";
const report = [];
const note = (k, v) => (report.push({ k, v }), console.log(k, typeof v === "string" ? v : JSON.stringify(v)));
const shot = (page, name, clip) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
const box = async (loc, pad = 16) => {
  const b = await loc.boundingBox();
  return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad };
};
const qlen = (page) => page.evaluate(() => document.querySelector("ytmusic-app").queue.getItems().length);
const noThanks = (page) => page.getByText("No thanks").click({ timeout: 1500 }).catch(() => {});
const toHome = async (page) => {
  await page.locator("ytmusic-guide-entry-renderer", { hasText: "Home" }).first().click();
  await page.waitForTimeout(6000);
  await noThanks(page);
};

(async () => {
  // 1. Album page: the header group and a hovered track row.
  {
    const { context, page, errors } = await launch({ dev: {} });
    await go(page, "https://music.youtube.com/browse/MPREb_K8qWMWVqXGi");
    const row = page.locator("ytmusic-shelf-renderer ytmusic-responsive-list-item-renderer").nth(4);
    await row.hover();
    await page.waitForTimeout(800);
    await row.locator("pp27-slot button").first().hover();
    await page.waitForTimeout(700);
    await shot(page, "r01-album-header-and-row");
    // Play next on the whole album from its header (nothing plays yet: it starts playback).
    await page.locator("ytmusic-responsive-header-renderer pp27-slot").locator('button[aria-label^="Play next"]').click();
    await page.waitForTimeout(4000);
    await shot(page, "r02-album-header-play-next-empty-queue");
    note("album header, empty queue", { queue: await qlen(page) });
    note("album log", (await devLog(page)).filter((l) => /header|probe|settle/.test(l.what)));
    note("errors 1", errors);
    await context.close();
  }
  // 2. Playlist page header and a hovered row; search rows.
  {
    const { context, page } = await launch({ dev: {} });
    await go(page, "https://music.youtube.com/browse/VLRDCLAK5uy_nHSqCJjDrW9HBhCNdF6tWPdnOMngOv0wA");
    const row = page.locator("ytmusic-responsive-list-item-renderer").nth(2);
    await row.hover();
    await page.waitForTimeout(900);
    await shot(page, "r03-playlist-header-and-row");
    await go(page, "https://music.youtube.com/search?q=daft+punk");
    const srow = page.locator("ytmusic-search-page ytmusic-responsive-list-item-renderer").first();
    await srow.hover();
    await page.waitForTimeout(900);
    await shot(page, "r04-search-row", await box(srow, 24));
    await context.close();
  }
  // 3. Home while playing: Quick picks rows (narrow at 1440), a card, the toast, Undo by key, keyboard focus.
  {
    const { context, page, errors } = await launch({ dev: { buttons: { playNext: true, addToQueue: true, save: true } , pretendSignedIn: true } });
    await go(page, WATCH, 8000);
    await toHome(page);
    const q0 = await qlen(page);
    const row = page.locator("ytmusic-carousel ytmusic-responsive-list-item-renderer").nth(2);
    await row.hover();
    await page.waitForTimeout(700);
    await row.locator('pp27-slot button[aria-label^="Play next"]').hover();
    await page.waitForTimeout(700);
    await shot(page, "r05-quick-picks-row-1440-narrow");
    await row.locator('pp27-slot button[aria-label^="Play next"]').click();
    await page.waitForTimeout(1500);
    await shot(page, "r06-quick-picks-play-next-toast");
    note("quick picks play next: queue", [q0, await qlen(page)]);
    const card = page.locator("ytmusic-carousel-shelf-renderer ytmusic-two-row-item-renderer").first();
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await page.waitForTimeout(900);
    await card.locator('pp27-slot button[aria-label^="Add to queue"]').hover();
    await page.waitForTimeout(600);
    await shot(page, "r07-card-hover", await box(card, 24));
    await card.locator('pp27-slot button[aria-label^="Add to queue"]').click();
    await page.waitForTimeout(2500);
    await shot(page, "r08-card-block-added-toast");
    const q2 = await qlen(page);
    await page.keyboard.press("Alt+U");
    await page.waitForTimeout(1500);
    note("card add to queue, then Alt+U: queue", [q2, await qlen(page)]);
    // Keyboard: focus a row on a wide page (album) to show the cluster by focus.
    await go(page, "https://music.youtube.com/browse/MPREb_K8qWMWVqXGi", 6000);
    await page.keyboard.press("Tab");
    const link = page.locator("ytmusic-shelf-renderer ytmusic-responsive-list-item-renderer").nth(2).locator(".title-column a").first();
    await link.focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    for (let i = 0; i < 4; i++) {
      const label = await page.evaluate(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a?.getAttribute("aria-label") || a?.textContent?.trim().slice(0, 30); });
      if (/^Play next/.test(label || "")) break;
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(700);
    await shot(page, "r09-keyboard-focus-in-row");
    note("keyboard: focused", await page.evaluate(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a?.getAttribute("aria-label"); }));
    note("errors 3", errors);
    await context.close();
  }
  // 4. The queue panel (classic or Wiz, whichever this session gets): moves, Remove, Undo, the picker, the bar Save,
  //    the picker by key, fullscreen, the notice.
  const got = { classic: false, wiz: false };
  let extrasDone = false;
  for (let attempt = 1; attempt <= 14 && !(got.classic && got.wiz); attempt++) {
    const { context, page, errors } = await launch({ dev: { buttons: { playNext: true, addToQueue: true, save: true, like: true, remove: true }, barSave: true, pretendSignedIn: true } });
    await go(page, WATCH, 9000);
    const wiz = await page.evaluate(() => !!document.querySelector("ytmusic-miniplayer"));
    const actionBar = await page.evaluate(() => !!document.querySelector("ytmusic-miniplayer yt-video-action-bar-view-model"));
    note(`session ${attempt}`, { wiz, actionBar });
    const tag = wiz ? "wiz" : "classic";
    if (got[tag]) {
      await context.close();
      continue;
    }
    const bar = page.locator(wiz ? "ytmusic-miniplayer" : "ytmusic-player-bar").first();
    const bb = await bar.boundingBox();
    await shot(page, `r10-${tag}-bar-save`, { x: 0, y: bb.y - 8, width: 1440, height: bb.height + 8 });
    const items = page.locator("ytmusic-player-queue #contents ytmusic-player-queue-item");
    await items.nth(4).hover();
    await page.waitForTimeout(800);
    await items.nth(4).locator("pp27-slot .split .main").hover();
    await page.waitForTimeout(600);
    await shot(page, `r11-${tag}-queue-every-button`);
    await items.nth(4).locator('pp27-slot button[aria-label^="Play next"]').click();
    await page.waitForTimeout(1500);
    await shot(page, `r12-${tag}-queue-moved-toast`);
    await page.locator("pp27-kit").locator("button", { hasText: "Undo" }).click();
    await page.waitForTimeout(1500);
    await items.nth(3).hover();
    await page.waitForTimeout(700);
    await items.nth(3).locator("pp27-slot .split .menu").hover();
    await page.waitForTimeout(500);
    await items.nth(3).locator("pp27-slot .split .menu").click();
    await page.waitForTimeout(1300);
    await shot(page, `r13-${tag}-picker-from-queue`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    await page.mouse.move(600, 150);
    await page.mouse.move(610, 160);
    await page.waitForTimeout(500);
    await page.keyboard.press("Alt+Shift+P");
    await page.waitForTimeout(1300);
    await shot(page, `r14-${tag}-picker-centred-by-key`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    if (!extrasDone) {
      extrasDone = true;
      await page.locator("ytmusic-player").click({ position: { x: 100, y: 100 } }).catch(() => {});
      await page.keyboard.press("f");
      await page.waitForTimeout(1500);
      await page.mouse.move(700, 300);
      await page.keyboard.press("Alt+N");
      await page.waitForTimeout(1500);
      await shot(page, "r15-fullscreen-toast");
      note("fullscreen element / kit host parent", await page.evaluate(() => [document.fullscreenElement?.tagName, document.querySelector("pp27-kit")?.parentElement?.tagName]));
      await page.keyboard.press("f");
      await page.waitForTimeout(800);
      await page.evaluate(() => document.dispatchEvent(new CustomEvent("pp27:dev", { detail: "notice" })));
      await page.waitForTimeout(800);
      await shot(page, "r16-not-working-notice");
    }
    note(`log ${tag}`, (await devLog(page)).filter((l) => /probe|bar|picker|popovers|fail/.test(l.what)));
    note(`errors ${tag}`, errors);
    got[tag] = true;
    await context.close();
  }
  // 5. Quick picks at common window widths (signed out, guide open).
  for (const width of [1280, 1366, 1440, 1536, 1920]) {
    const { context, page } = await launch({ width, dev: {} });
    await go(page, "https://music.youtube.com/", 6000);
    const row = page.locator("ytmusic-carousel ytmusic-responsive-list-item-renderer").nth(1);
    await row.hover();
    await page.waitForTimeout(900);
    await shot(page, `r17-quick-picks-${width}`, await box(row, 8));
    const l = (await devLog(page)).filter((x) => x.what === "attached").pop();
    note(`quick picks ${width}`, { row: Math.round((await row.boundingBox()).width), titleWithYtmOwnButtons: l?.titleBefore, titleWithOurs: l?.titleAfter });
    await context.close();
  }
  fs.writeFileSync(path.join(OUT, "real-run.json"), JSON.stringify(report, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
