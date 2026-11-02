import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { checkBudget, sitePieces, type PerfBudget } from "../../scripts/check-budget"

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const budget: PerfBudget = {
  sites: {
    www: { page: 5, core: 5, kit: 28, "auto-add": 3, shortcuts: 1, "quick-save": 2, "queue-button": 1, "watch-button": 3.5, "card-menu": 1.25 },
    music: { page: 5, core: 4, kit: 27, shortcuts: 1, "music-actions": 5, "music-keys": 1 }
  },
  totals: { www: 49.75, music: 43 },
  lazy: { popovers: 50 },
  popup: { www: { js: 40, css: 8 }, music: { js: 40, css: 8 }, lazy: 45 },
  settings: { js: 60, css: 10, lazy: 45 },
  firstRun: { js: 30 },
  background: 25,
  exceptions: []
}

function noise(length: number, seed: number): string {
  let state = seed
  return Array.from({ length }, () => String.fromCharCode(35 + ((state = (state * 1103515245 + 12345) % 2 ** 31) % 57))).join("")
}

/** A JavaScript statement that weighs `kb` KB at gzip -9, give or take a few bytes. */
function weighing(kb: number, seed = Math.round(kb * 1000)): string {
  const statement = (length: number) => `\`${noise(length, seed)}\`;`
  let low = 0
  let high = Math.ceil(kb * 1024 * 2)
  while (low < high) {
    const middle = (low + high) >> 1
    if (gzipSync(statement(middle), { level: 9 }).byteLength < kb * 1024) low = middle + 1
    else high = middle
  }
  return statement(low)
}

type Overrides = { files?: Record<string, string>; evidence?: Record<string, string[]>; manifest?: object }

async function build(browser: "chrome" | "firefox", overrides: Overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "check-budget-"))
  roots.push(root)
  const directory = join(root, `${browser}-mv3`)
  const files: Record<string, string> = {
    "manifest.json": JSON.stringify(overrides.manifest ?? { manifest_version: 3 }),
    "background.js": weighing(1),
    "popovers.js": weighing(2),
    "popup.html": `<script type="module" src="/chunks/popup-AAAAAAAA.js"></script><link rel="modulepreload" href="/chunks/shared-BBBBBBBB.js"><link rel="stylesheet" href="/assets/popup-CCCCCCCC.css">`,
    "chunks/popup-AAAAAAAA.js": `import{a}from"./shared-BBBBBBBB.js";import(\`./MusicTab-DDDDDDDD.js\`);${weighing(3)}`,
    "chunks/shared-BBBBBBBB.js": weighing(1),
    "chunks/MusicTab-DDDDDDDD.js": `import{a}from"./shared-BBBBBBBB.js";${weighing(2)}`,
    "assets/popup-CCCCCCCC.css": weighing(0.5),
    "options.html": `<script type="module" src="/chunks/options-EEEEEEEE.js"></script>`,
    "chunks/options-EEEEEEEE.js": `import(\`./YouTube-FFFFFFFF.js\`);${weighing(3)}`,
    "chunks/YouTube-FFFFFFFF.js": weighing(1),
    "onboarding.html": `<script type="module" src="/chunks/onboarding-GGGGGGGG.js"></script>`,
    "chunks/onboarding-GGGGGGGG.js": `import(\`./UpgradeNote-HHHHHHHH.js\`);${weighing(3)}`,
    "chunks/UpgradeNote-HHHHHHHH.js": weighing(1),
    ...Object.fromEntries(Object.values(sitePieces()).flat().map(piece => [piece.file, weighing(0.5, piece.file.length)])),
    ...overrides.files
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(directory, path, ".."), { recursive: true })
    await writeFile(join(directory, path), content)
  }
  const evidenceDir = join(root, "page-link", `${browser}-build`)
  await mkdir(evidenceDir, { recursive: true })
  const labels = [...new Set([...Object.values(sitePieces()).flat().map(piece => piece.file.replace(/\.js$/, "")), "popovers"])]
  for (const label of labels) {
    const modules = overrides.evidence?.[label] ?? [`/repo/src/${label}.ts`]
    await writeFile(join(evidenceDir, `${label}.json`), JSON.stringify({ chunks: [{ file: `${label}.js`, modules }] }))
  }
  return directory
}

const row = (result: ReturnType<typeof checkBudget>, id: string) => result.reports[0]!.rows.find(item => item.id === id)

describe("check:budget", () => {
  test("passes a build whose every piece, page and lazy chunk is within budget", async () => {
    const result = checkBudget([await build("chrome"), await build("firefox")], budget)
    expect(result.failures).toEqual([])
    expect(row(result, "www/card-menu")?.kb).toBeCloseTo(0.5, 2)
    expect(row(result, "popup/lazy/MusicTab")?.kb).toBeCloseTo(row(result, "popup/music/js")!.kb - row(result, "popup/www/js")!.kb, 5)
  })

  test("counts the popup's first view by its scripts, modulepreloads and their static imports, once each", async () => {
    const result = checkBudget([await build("chrome")], budget)
    const popupOnly = checkBudget([await build("chrome", { files: { "chunks/shared-BBBBBBBB.js": "" } })], budget)
    expect(row(result, "popup/www/js")!.kb - row(popupOnly, "popup/www/js")!.kb).toBeCloseTo(1, 1)
    expect(row(result, "popup/lazy/MusicTab")!.kb).toBeCloseTo(2, 1)
  })

  test("weighs a lazy chunk opened from another lazy chunk by what it adds to the code its importers loaded", async () => {
    const result = checkBudget([await build("chrome", { files: {
      "chunks/options-EEEEEEEE.js": `import(\`./YouTube-FFFFFFFF.js\`);import(\`./Music-JJJJJJJJ.js\`);${weighing(3)}`,
      "chunks/YouTube-FFFFFFFF.js": `import{a}from"./section-KKKKKKKK.js";import{b}from"./youtube-only-MMMMMMMM.js";import(\`./Picker-LLLLLLLL.js\`);${weighing(1)}`,
      "chunks/Music-JJJJJJJJ.js": `import{a}from"./section-KKKKKKKK.js";import(\`./Picker-LLLLLLLL.js\`);${weighing(1.5)}`,
      "chunks/section-KKKKKKKK.js": weighing(4),
      "chunks/youtube-only-MMMMMMMM.js": weighing(2.5),
      "chunks/Picker-LLLLLLLL.js": `import{a}from"./section-KKKKKKKK.js";import{b}from"./youtube-only-MMMMMMMM.js";${weighing(0.75)}`
    } })], budget)
    expect(row(result, "settings/lazy/YouTube")!.kb).toBeCloseTo(7.5, 0)
    expect(row(result, "settings/lazy/Picker")!.kb).toBeCloseTo(0.75 + 2.5, 0)
  })

  test("fails a piece over its budget in either build, naming the browser and the row", async () => {
    const over = { files: { "feature-card-menu.js": weighing(1.4) } }
    const result = checkBudget([await build("chrome"), await build("firefox", over)], budget)
    expect(result.failures).toEqual([expect.stringMatching(/^firefox: www\/card-menu is 1\.\d+ KB, over its budget of 1\.25 KB$/)])
  })

  test("lets a dated exception allow an overrun, and fails when the row grows past it", async () => {
    const over = { files: { "feature-card-menu.js": weighing(1.4) } }
    const excepted = { ...budget, exceptions: [{ row: "www/card-menu", kb: 1.6, since: "2026-11-02", why: "carries Items" }] }
    expect(checkBudget([await build("chrome", over)], excepted).failures).toEqual([])
    const grown = { files: { "feature-card-menu.js": weighing(1.7) } }
    expect(checkBudget([await build("chrome", grown)], excepted).failures).toEqual([expect.stringMatching(/www\/card-menu is 1\.\d+ KB, over its exception of 1\.6 KB/)])
  })

  test("fails an exception whose row is back within budget, or that allows far more than it measures", async () => {
    const directory = await build("chrome")
    const unneeded = { ...budget, exceptions: [{ row: "www/card-menu", kb: 2, since: "2026-11-02", why: "carries Items" }] }
    expect(checkBudget([directory], unneeded).failures).toEqual([expect.stringContaining("www/card-menu is within its 1.25 KB budget")])
    const overrun = { files: { "feature-card-menu.js": weighing(1.4) } }
    const slack = { ...budget, exceptions: [{ row: "www/card-menu", kb: 2.5, since: "2026-11-02", why: "carries Items" }] }
    expect(checkBudget([await build("chrome", overrun)], slack).failures).toEqual([expect.stringMatching(/allows 2\.5 KB but it measures 1\.\d+ KB; lower the exception to 1\.\d/)])
  })

  test("fails a budget file whose pieces aren't the registry's or whose rows don't sum to the site total", async () => {
    const directory = await build("chrome")
    const { "card-menu": _, ...www } = budget.sites.www
    const missing = { ...budget, sites: { ...budget.sites, www: { ...www, "card-menu-old": 1.25 } } }
    expect(checkBudget([directory], missing).failures).toContainEqual(expect.stringContaining("www pieces are auto-add, card-menu-old,"))
    const unbalanced = { ...budget, sites: { ...budget.sites, music: { ...budget.sites.music, kit: 28 } } }
    expect(checkBudget([directory], unbalanced).failures).toEqual([expect.stringContaining("music rows sum to 44 KB, not the site total 43 KB")])
    const stray = { ...budget, exceptions: [{ row: "www/nothing", kb: 1, since: "2026-11-02", why: "x" }] }
    expect(checkBudget([directory], stray).failures).toEqual([expect.stringContaining("names no gated row: www/nothing")])
  })

  test("fails Svelte's runtime outside the kits and popovers, Bits UI outside popovers, kit code in a feature, page CSS and manifest injection", async () => {
    const directory = await build("chrome", {
      manifest: { manifest_version: 3, content_scripts: [], web_accessible_resources: [] },
      files: { "assets/page-www-IIIIIIII.css": "a{}" },
      evidence: {
        "core-www": ["/repo/node_modules/svelte/src/internal/client/runtime.js"],
        "kit-www": ["/repo/node_modules/bits-ui/dist/index.js"],
        "feature-quick-save": ["/repo/src/site/kit/overlay/index.ts"]
      }
    })
    expect(checkBudget([directory], budget).failures).toEqual([
      "chrome: manifest has content_scripts (Q-PERF-6)",
      "chrome: manifest has web_accessible_resources (Q-PERF-6)",
      "chrome: assets/page-www-IIIIIIII.css belongs to no extension page; page scripts inject their CSS (Q-PERF-21)",
      "chrome: core-www.js carries Svelte's runtime (/repo/node_modules/svelte/src/internal/client/runtime.js)",
      "chrome: feature-quick-save.js carries kit code instead of linking it (/repo/src/site/kit/overlay/index.ts)",
      "chrome: kit-www.js carries Bits UI (/repo/node_modules/bits-ui/dist/index.js)"
    ])
  })

  test("fails a page whose lazy chunk imports an entry that waits on a top-level await", async () => {
    const entry = `const window = await getCurrent();import(\`./MusicTab-DDDDDDDD.js\`);${weighing(3)}`
    const deadlock = await build("chrome", { files: { "chunks/popup-AAAAAAAA.js": entry, "chunks/MusicTab-DDDDDDDD.js": `import{a}from"./popup-AAAAAAAA.js";${weighing(2)}` } })
    expect(checkBudget([deadlock], budget).failures).toEqual(["chrome: popup.html: chunks/MusicTab-DDDDDDDD.js imports chunks/popup-AAAAAAAA.js, which has a top-level await (Q-PERF-35 rule 3)"])
    const insideFunction = await build("chrome", { files: { "chunks/popup-AAAAAAAA.js": `async function f(){await g()}import(\`./MusicTab-DDDDDDDD.js\`);${weighing(3)}`, "chunks/MusicTab-DDDDDDDD.js": `import{a}from"./popup-AAAAAAAA.js";${weighing(2)}` } })
    expect(checkBudget([insideFunction], budget).failures).toEqual([])
  })

  test("refuses to measure a build with source maps", async () => {
    const directory = await build("chrome", { files: { "core-www.js.map": "{}" } })
    expect(checkBudget([directory], budget).failures).toEqual(["chrome: source maps in the build; measure a store build"])
  })
})
