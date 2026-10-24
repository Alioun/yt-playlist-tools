import { describe, expect, test } from "bun:test"
import { defaultSettings } from "../model/defaults"
import type { FeatureId } from "../contracts/vocabulary"
import { desired, pageLinkEntries, type RegistrationFeature } from "./registration"

const registry: readonly RegistrationFeature[] = [
  { id: "auto-add", setting: "autoAdd", pages: { www: { file: "feature-auto-add", needs: ["kit"] } } },
  { id: "shortcuts", setting: "shortcuts", pages: {
    www: { file: "feature-shortcuts-www", needs: ["kit"] },
    music: { file: "feature-shortcuts-music", needs: ["kit"], when: (s) => s.shortcuts.music }
  } },
  { id: "quick-save", setting: "quickSave", pages: { www: { file: "feature-quick-save", needs: ["kit"], lazy: "popovers" } } },
  { id: "queue-button", setting: "queueButton", pages: { www: { file: "feature-queue-button", needs: ["kit"] } } },
  { id: "watch-button", setting: "watchButton", pages: { www: { file: "feature-watch-button", needs: ["kit"], lazy: "popovers" } } },
  { id: "card-menu", setting: "cardMenu", pages: { www: { file: "feature-card-menu", needs: [] } } },
  { id: "browser-menu", setting: "browserMenu", pages: {} },
  { id: "music-actions", setting: "musicActions", pages: { music: { file: "feature-music-actions", needs: ["kit"], lazy: "popovers" } } },
  { id: "music-keys", setting: "musicKeys", pages: { music: { file: "feature-music-keys", needs: ["kit"], lazy: "popovers" } } },
  { id: "any-tab-keys", setting: "anyTabKeys", pages: {} },
  { id: "gather", setting: "gather", pages: { www: {
    matches: ["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"], needs: [],
    when: (s) => s.gather.auto.background || s.gather.auto.count
  } } },
  { id: "sync", setting: "device.syncOn", pages: {} }
]
const access = { www: true, music: true }
function enabled(...ids: FeatureId[]) {
  const settings = defaultSettings()
  for (const feature of registry) if (ids.includes(feature.id) && feature.setting !== "device.syncOn") settings[feature.setting].on = true
  return settings
}
const all = () => {
  const settings = enabled(...registry.map((feature) => feature.id))
  settings.gather.auto.count = true
  return settings
}
const plan = (settings = defaultSettings(), input = registry) => desired(input, settings, true, access, true)

describe("pure registration projection", () => {
  test("defaults and all-off select no page code", () => {
    expect(plan()).toEqual([])
    expect(plan(enabled())).toEqual([])
  })
  test("missing or old consent and unsupported schema select nothing", () => {
    expect(desired(registry, all(), false, access, true)).toEqual([])
    expect(desired(registry, all(), true, access, false)).toEqual([])
  })
  test("site access and music section gates", () => {
    expect(desired(registry, all(), true, { www: false, music: true }, true).map((r) => r.id)).toEqual(["pp-music-page", "pp-music"])
    expect(desired(registry, all(), true, { www: true, music: false }, true).map((r) => r.id)).toEqual(["pp-www-page", "pp-www"])
    expect(desired(registry, all(), true, { www: false, music: false }, true)).toEqual([])
    const settings = all()
    settings.musicSection = false
    expect(plan(settings).map((r) => r.id)).toEqual(["pp-www-page", "pp-www"])
  })
  for (const feature of registry) test(`${feature.id} alone selects only its declared page files`, () => {
    const settings = enabled(feature.id)
    if (feature.id === "gather") settings.gather.auto.background = true
    const actual = plan(settings)
    const sites = Object.keys(feature.pages)
    expect(actual.length).toBe(sites.length * 2)
    for (const site of ["www", "music"] as const) {
      const page = feature.pages[site]
      const pair = actual.filter((r) => r.id === `pp-${site}` || r.id === `pp-${site}-page`)
      if (!page) { expect(pair).toEqual([]); continue }
      const matches = page.matches ? [...page.matches] : [`https://${site}.youtube.com/*`]
      expect(pair).toEqual([
        { id: `pp-${site}-page`, js: [`page-${site}.js`], matches, world: "MAIN", runAt: "document_start", allFrames: false, persistAcrossSessions: true },
        { id: `pp-${site}`, js: [`core-${site}.js`, ...(page.needs.includes("kit") ? [`kit-${site}.js`] : []), ...(page.file ? [`${page.file}.js`] : [])], matches, world: "ISOLATED", runAt: "document_idle", allFrames: false, persistAcrossSessions: true }
      ])
    }
  })
  test("base switch and page predicate must both pass", () => {
    const settings = enabled("shortcuts")
    settings.shortcuts.music = false
    expect(plan(settings).map((r) => r.id)).toEqual(["pp-www-page", "pp-www"])
    settings.shortcuts.on = false
    settings.shortcuts.music = true
    expect(plan(settings)).toEqual([])
    settings.gather.auto.background = true
    expect(plan(settings)).toEqual([])
  })
  test("Gather stays file-free and narrows again when broad selection is removed", () => {
    const settings = enabled("gather")
    expect(plan(settings)).toEqual([])
    settings.gather.auto.unvisited = true
    expect(plan(settings)).toEqual([])
    for (const trigger of ["background", "count"] as const) {
      settings.gather.auto[trigger] = true
      expect(plan(settings)[1]?.js).toEqual(["core-www.js"])
      expect(plan(settings)[0]?.matches).toEqual(["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"])
      settings.cardMenu.on = true
      expect(plan(settings)[0]?.matches).toEqual(["https://www.youtube.com/*"])
      expect(plan(settings)[1]?.js).toEqual(["core-www.js", "feature-card-menu.js"])
      settings.cardMenu.on = false
      expect(plan(settings)[0]?.matches).toHaveLength(2)
      settings.gather.auto[trigger] = false
    }
  })
  test("all twelve preserve supplied feature order and never eagerly load popovers", () => {
    const actual = plan(all())
    expect(actual[1]?.js).toEqual(["core-www.js", "kit-www.js", "feature-auto-add.js", "feature-shortcuts-www.js", "feature-quick-save.js", "feature-queue-button.js", "feature-watch-button.js", "feature-card-menu.js"])
    expect(actual[3]?.js).toEqual(["core-music.js", "kit-music.js", "feature-shortcuts-music.js", "feature-music-actions.js", "feature-music-keys.js"])
    expect(actual.every((r) => !r.js.includes("popovers.js"))).toBe(true)
    const reversed = [...registry].reverse()
    expect(plan(all(), reversed)[1]?.js).toEqual(["core-www.js", "kit-www.js", "feature-card-menu.js", "feature-watch-button.js", "feature-queue-button.js", "feature-quick-save.js", "feature-shortcuts-www.js", "feature-auto-add.js"])
    expect(plan(all(), reversed)).toEqual(plan(all(), reversed))
  })
  test("input arrays and settings are immutable and returned arrays are independent", () => {
    const settings = all()
    const before = JSON.stringify({ registry, settings, access })
    const actual = plan(settings)
    actual[0]?.matches.push("invalid")
    actual[1]?.js.reverse()
    expect(plan(settings)[0]?.matches).toEqual(["https://www.youtube.com/*"])
    expect(JSON.stringify({ registry, settings, access })).toBe(before)
    expect(plan(settings)[1]?.matches).toEqual(["https://www.youtube.com/*"])
  })
  test("same-site duplicate dependencies and feature files occur once", () => {
    const input: RegistrationFeature[] = [
      { id: "auto-add", setting: "autoAdd", pages: { www: { file: "shared-feature", needs: ["kit", "kit"] } } },
      { id: "shortcuts", setting: "shortcuts", pages: { www: { file: "shared-feature", needs: ["kit"] } } }
    ]
    expect(plan(all(), input)[1]?.js).toEqual(["core-www.js", "kit-www.js", "shared-feature.js"])
  })
  test("declaration boundary rejects off-site matches, unsafe files, and conflicting owners", () => {
    for (const matches of [["https://music.youtube.com/*"], ["https://www.youtube.com.evil/*"], ["http://www.youtube.com/*"], ["<all_urls>"], [], ["https://www.youtube.com/*#bad"]]) {
      const input: RegistrationFeature[] = [{ id: "auto-add", setting: "autoAdd", pages: { www: { matches, needs: [] } } }]
      expect(() => pageLinkEntries(input)).toThrow("matches")
      expect(() => plan(defaultSettings(), input)).toThrow("matches")
    }
    for (const file of ["../feature", "feature.js", "", "kit-www", "popovers"]) {
      expect(() => pageLinkEntries([{ id: "auto-add", setting: "autoAdd", pages: { www: { file, needs: [] } } }])).toThrow()
    }
    expect(() => pageLinkEntries([registry[0]!, registry[0]!])).toThrow("Duplicate")
    expect(() => pageLinkEntries([
      { id: "auto-add", setting: "autoAdd", pages: { www: { file: "same", needs: [] } } },
      { id: "shortcuts", setting: "shortcuts", pages: { music: { file: "same", needs: [] } } }
    ])).toThrow("Conflicting")
    expect(pageLinkEntries(registry)["feature-auto-add"]).toEqual({ kind: "feature", site: "www" })
  })
})
