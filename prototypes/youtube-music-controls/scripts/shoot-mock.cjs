// THROWAWAY PROTOTYPE (ticket 27). Screenshots of the clickable mock. Start it first (`bun run dev -- --port 4827`),
// then: CHROMIUM=/path/to/chrome node scripts/shoot-mock.cjs [baseUrl]
const { chromium } = require("playwright-core");
const path = require("node:path");
const BASE = process.argv[2] || "http://localhost:4827/";
const OUT = path.resolve(__dirname, "../screenshots");

const shots = [
  { name: "m01-home-variant-A-in-the-row", q: "scene=home&variant=A", act: [{ hover: '[data-item="row:s2@qp"] .ab.row >> nth=0', trigger: '[data-item="row:s2@qp"]' }] },
  { name: "m02-home-variant-B-reserved-slot", q: "scene=home&variant=B", act: [{ trigger: '[data-item="row:s2@qp"]' }] },
  { name: "m03-home-variant-C-floating-pill", q: "scene=home&variant=C", act: [{ trigger: '[data-item="row:s2@qp"]' }] },
  { name: "m04-home-card", q: "scene=home&panel=0", act: [{ trigger: '[data-item="card:a3"]' }, { hoverIn: '[data-item="card:a3"] .ab >> nth=1' }] },
  { name: "m05-album-header-and-row", q: "scene=album&panel=0", act: [{ trigger: '[data-item="row:s1@a1"]' }, { hoverIn: '[data-item="row:s1@a1"] .ab >> nth=0' }] },
  { name: "m06-queue-every-button", q: "scene=playing&panel=0&b-save=1&b-like=1&b-remove=1&barSave=1", act: [{ trigger: '[data-item="q:q4"]' }, { hoverIn: '[data-item="q:q4"] .split .main' }] },
  { name: "m07-queue-moved-toast", q: "scene=playing&panel=0", act: [{ trigger: '[data-item="q:q5"]' }, { click: '[data-item="q:q5"] .ab >> nth=0' }, { wait: 900 }] },
  { name: "m08-row-play-next-toast", q: "scene=album&panel=0", act: [{ trigger: '[data-item="row:s5@a1"]' }, { click: '[data-item="row:s5@a1"] .ab >> nth=0' }, { wait: 900 }] },
  { name: "m09-album-block-toast", q: "scene=album&panel=0", act: [{ click: '[data-item="header:a1"] .ab >> nth=0' }, { wait: 900 }] },
  { name: "m10-picker-anchored", q: "scene=album&panel=0&b-save=1", act: [{ trigger: '[data-item="row:s5@a1"]' }, { click: '[data-item="row:s5@a1"] .split .menu' }, { wait: 900 }] },
  { name: "m11-picker-choose-mode", q: "scene=album&panel=0&b-save=1&quickSave=none", act: [{ trigger: '[data-item="row:s15@a1"]' }, { click: '[data-item="row:s15@a1"] .split .main' }, { wait: 900 }] },
  { name: "m12-picker-centred-by-key", q: "scene=home&panel=0", act: [{ mouse: [760, 160] }, { press: "Alt+Shift+P" }, { wait: 900 }] },
  { name: "m13-picker-new-playlist", q: "scene=album&panel=0&b-save=1", act: [{ trigger: '[data-item="row:s5@a1"]' }, { click: '[data-item="row:s5@a1"] .split .menu' }, { wait: 700 }, { click: "button.newpl" }, { type: "Night drive" }, { wait: 300 }] },
  { name: "m14-player-bar-save", q: "scene=home&panel=0&barSave=1", act: [{ hoverIn: '[data-cluster="bar"] .split .main' }, { wait: 500 }] },
  { name: "m15-wiz-miniplayer-save", q: "scene=home&panel=0&barSave=1&player=wiz", act: [{ hoverIn: '[data-cluster="bar"] .split .menu' }, { wait: 500 }] },
  { name: "m16-fullscreen-toast", q: "scene=playing&panel=0&fullscreen=1", act: [{ mouse: [700, 400] }, { press: "Alt+N" }, { wait: 900 }] },
  { name: "m17-keyboard-focus", q: "scene=album&panel=0", act: [{ focus: '[data-item="row:s5@a1"] .title' }, { press: "Tab" }, { press: "Tab" }, { wait: 600 }] },
  { name: "m18-key-on-album-card", q: "scene=home&panel=0", act: [{ trigger: '[data-item="card:a2"]' }, { press: "Alt+P" }, { wait: 700 }] },
  { name: "m19-not-working-notice", q: "scene=home&panel=0&notWorking=1", act: [{ trigger: '[data-item="row:s2@qp"]' }, { wait: 700 }] },
  { name: "m20-casting", q: "scene=playing&panel=0&casting=1", act: [{ trigger: '[data-item="q:q4"]' }, { hoverIn: '[data-item="q:q4"] .ab >> nth=0' }, { wait: 500 }] },
  { name: "m21-signed-out", q: "scene=playing&panel=0&signedIn=0&b-save=1&b-like=1&b-remove=1&barSave=1", act: [{ trigger: '[data-item="q:q4"]' }] },
  { name: "m22-states-sheet", q: "scene=states&panel=0&chrome=0", h: 1500 },
  { name: "m23-prototype-panel", q: "scene=home&variant=A&panel=1", act: [] },
];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/tmp/pw/browsers/chromium-1248/chrome-linux64/chrome", args: ["--headless=new"] });
  for (const s of shots) {
    const p = await b.newPage({ viewport: { width: 1440, height: s.h || 900 } });
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    const chrome = s.name.includes("variant") || s.name.includes("panel") ? "" : "&chrome=0";
    await p.goto(`${BASE}?${s.q}${chrome}${s.q.includes("panel") ? "" : "&panel=0"}`);
    await p.waitForTimeout(1200);
    for (const a of s.act || []) {
      if (a.trigger) await p.locator(a.trigger).first().hover({ position: { x: 30, y: 10 } });
      if (a.hover) await p.locator(a.hover).hover();
      if (a.hoverIn) {
        await p.waitForTimeout(250);
        await p.locator(a.hoverIn).hover();
      }
      if (a.click) {
        await p.waitForTimeout(250);
        await p.locator(a.click).click();
      }
      if (a.focus) {
        await p.keyboard.press("Shift+Tab");
        await p.locator(a.focus).first().focus();
      }
      if (a.press) await p.keyboard.press(a.press);
      if (a.type) await p.keyboard.type(a.type);
      if (a.mouse) await p.mouse.move(a.mouse[0], a.mouse[1]);
      if (a.wait) await p.waitForTimeout(a.wait);
    }
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    console.log(s.name, errs.length ? errs.join(" | ") : "ok");
    await p.close();
  }
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
