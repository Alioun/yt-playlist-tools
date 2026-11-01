import { describe, expect, test } from "bun:test"
import { isTabView, isTabViewFor, isTabViewFacts, isFeatureStatusFor, type TabViewFacts } from "./tab-view"
import { account, wireView } from "../../../tools/fixtures/tab-view/cases"
import { build, nextBuild, checked } from "../../../tools/fixtures/page-link/support"
import { isAccountKey } from "../model/validation"

describe("complete TabView wire contract", () => {
  test("both sites and sign-in/privacy combinations carry complete views", () => {
    for (const site of ["www", "music"] as const) for (const signedIn of [false, true]) for (const privateWindow of [false, true]) {
      const view = wireView(site, signedIn, privateWindow)
      expect(isTabView(JSON.parse(JSON.stringify(view)))).toBe(true)
      expect(view.site).toBe(site)
      expect(view.signedIn).toBe(signedIn)
      expect(view.private).toBe(privateWindow)
      expect(view.features.map(feature => feature.id)).toEqual(site === "www"
        ? ["auto-add", "shortcuts", "quick-save", "queue-button", "watch-button", "card-menu", "gather"]
        : ["shortcuts", "music-actions", "music-keys"])
    }
  })

  const invalid = [
    ["missing build", (v: Record<string, unknown>) => { delete v.build }],
    ["missing complete field", (v: Record<string, unknown>) => { delete v.pickerSortAZ }],
    ["whole session", (v: Record<string, unknown>) => { v.session = { recent: [] } }],
    ["foreign account collection", (v: Record<string, unknown>) => { v.accounts = { BBBBBBBBBBBBBBBB: {} } }],
    ["raw account", (v: Record<string, unknown>) => { v.acct = "raw||datasync" }],
    ["unknown sign-in", (v: Record<string, unknown>) => { v.signedIn = null }],
    ["bad sort", (v: Record<string, unknown>) => { v.pickerSortAZ = "yes" }],
    ["bad pause", (v: Record<string, unknown>) => { v.paused = 1 }],
    ["bad build", (v: Record<string, unknown>) => { v.build = "" }],
    ["bad site", (v: Record<string, unknown>) => { v.site = "mobile" }],
    ["private confusion", (v: Record<string, unknown>) => { v.private = true }],
    ["invalid physical key", (v: Record<string, unknown>) => { v.undoKey = { code: "NoKey", ctrl: false, alt: false, shift: false, meta: false } }],
    ["key extension", (v: Record<string, unknown>) => { v.undoKey = { code: "KeyA", ctrl: false, alt: false, shift: false, meta: false, foreign: true } }],
    ["wrong-site options", (v: Record<string, unknown>) => { v.site = "music" }],
    ["missing feature status", (v: Record<string, unknown>) => { v.statuses = [] }],
    ["unknown notice", (v: Record<string, unknown>) => { v.notices = [{ kind: "healthy", features: ["auto-add"] }] }],
    ["working notice", (v: Record<string, unknown>) => { v.notices = [{ kind: "not-working", features: ["auto-add"] }] }],
    ["empty due notice", (v: Record<string, unknown>) => { v.notices = [{ kind: "not-working", features: [] }] }],
    ["bad setup label", (v: Record<string, unknown>) => { v.setup = { kind: "live", setup: { label: { name: 1 } } } }],
    ["foreign setup envelope", (v: Record<string, unknown>) => { v.setup = { kind: "none", acct: "BBBBBBBBBBBBBBBB" } }],
    ["bad filter tuple", (v: Record<string, unknown>) => { v.filters = [{ playlist: "PL_alpha", state: { kind: "value", filter: { mode: "allow", on: true, channels: [["bad", "Alpha"]] } } }] }],
    ["extra filter tuple item", (v: Record<string, unknown>) => { v.filters = [{ playlist: "PL_alpha", state: { kind: "value", filter: { mode: "allow", on: true, channels: [["UCAAAAAAAAAAAAAAAAAAAAAA", "Alpha", "@alpha", "foreign"]] } } }] }],
    ["bad filter state", (v: Record<string, unknown>) => { v.filters = [{ playlist: "PL_alpha", state: { kind: "newer-version", version: 2 } }] }],
    ["bad skip video", (v: Record<string, unknown>) => { v.skips = { kind: "normal", entries: [["bad", "all"]] } }],
    ["bad skip playlist", (v: Record<string, unknown>) => { v.skips = { kind: "normal", entries: [["aaaaaaaaaaa", ["!"]]] } }],
    ["duplicate skip video", (v: Record<string, unknown>) => { v.skips = { kind: "normal", entries: [["aaaaaaaaaaa", "all"], ["aaaaaaaaaaa", "all"]] } }],
    ["skip extension", (v: Record<string, unknown>) => { v.skips = { kind: "normal", entries: [], recent: [] } }],
    ["native object", (v: Record<string, unknown>) => { v.filters = new Map() }],
  ] satisfies readonly (readonly [string, (view: Record<string, unknown>) => void])[]
  test.each(invalid)("rejects %s", (_name, change) => {
    const value = { ...wireView() }
    change(value)
    expect(isTabView(value)).toBe(false)
  })

  test("rejects unknown fields at every serialized object", () => {
    function objects(value: unknown, path: (string | number)[] = []): (string | number)[][] {
      if (value === null || typeof value !== "object") return []
      return [...(Array.isArray(value) ? [] : [path]), ...Object.entries(value).flatMap(([key, child]) => objects(child, [...path, Array.isArray(value) ? Number(key) : key]))]
    }
    function extend(value: unknown, path: readonly (string | number)[]): unknown {
      if (!path.length) return value !== null && typeof value === "object" ? { ...value, foreignExtension: true } : value
      const [head, ...tail] = path
      if (Array.isArray(value)) return value.map((child, index) => index === head ? extend(child, tail) : child)
      if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === head ? extend(child, tail) : child]))
      throw Error("Invalid test path")
    }
    for (const site of ["www", "music"] as const) {
      const view = wireView(site)
      for (const path of objects(view)) expect(isTabView(extend(view, path))).toBe(false)
    }
  })

  test("every scalar field and array boundary rejects malformed values", () => {
    function corruptions(value: unknown, nullablePlaylist = false): unknown[] {
      if (value === null) return [{}]
      if (typeof value !== "object") return typeof value === "boolean" ? ["not-a-boolean"] : typeof value === "number" ? [-1] : nullablePlaylist ? [false] : [false, null]
      if (Array.isArray(value)) return [{}, Object.assign([...value], { foreign: true }),
        ...value.flatMap((child, index) => corruptions(child).map(bad => value.map((old, at) => at === index ? bad : old)))]
      return Object.entries(value).flatMap(([key, child]) => corruptions(child, ["quickSave", "musicSave", "gather"].includes(key)).map(bad => ({ ...value, [key]: bad })))
    }
    for (const site of ["www", "music"] as const) for (const value of corruptions(wireView(site))) expect(isTabView(value)).toBe(false)
    const view = wireView()
    expect(isTabView({ ...view, filters: [{ playlist: "PL_alpha", state: { kind: "default", filter: { mode: "allow", on: true, channels: [] } } }] })).toBe(false)
  })

  test("nullable Setup destinations accept absence and reject malformed scalars", () => {
    const view = wireView()
    if (!view.signedIn || view.setup.kind !== "live") throw Error("Expected the complete synthetic Setup")
    const setup = view.setup.setup
    for (const destination of ["quickSave", "musicSave", "gather"] as const) {
      const changed = (value: unknown) => ({ ...view, setup: { kind: "live", setup: { ...setup, [destination]: value } } })
      expect(isTabView(changed(null))).toBe(true)
      expect(isTabView(changed(false))).toBe(false)
      expect(isTabView(changed(42))).toBe(false)
    }
  })

  test("status detail and due notices bind exact enabled features and site dependencies", () => {
    const view = wireView("music")
    const status = { feature: "music-actions", state: "partly-working", jobs: ["queueInsert"], anchors: ["music-items"], actions: ["next"], kinds: ["missing"] }
    expect(isFeatureStatusFor("music", status)).toBe(true)
    expect(isFeatureStatusFor("www", status)).toBe(false)
    for (const changed of [
      { ...status, jobs: ["add"] }, { ...status, anchors: ["www-cards"] }, { ...status, actions: ["shuffle"] },
      { ...status, kinds: ["invented"] }, { ...status, state: "working" }, { ...status, feature: "sync" },
      { ...status, jobs: ["queueInsert", "queueInsert"] }, { ...status, extra: true }
    ]) expect(isFeatureStatusFor("music", changed)).toBe(false)
    const statuses = view.statuses.map(row => row.feature === "music-actions" ? { ...status, state: "not-working" } : row)
    expect(isTabView({ ...view, statuses, notices: [{ kind: "not-working", features: ["music-actions"] }] })).toBe(true)
    expect(isTabView({ ...view, statuses, notices: [{ kind: "not-working", features: ["auto-add"] }] })).toBe(false)
    expect(isTabView({ ...view, statuses: [...statuses, statuses[0]] })).toBe(false)
  })

  test("site gates, option scalars and every key are validated", () => {
    const view = wireView("music")
    for (const feature of view.features) {
      expect(isTabView({ ...view, features: view.features.map(row => row.id === feature.id ? { ...row, options: { ...row.options, on: false } } : row) })).toBe(false)
      if (feature.id === "music-keys") for (const name of Object.keys(feature.options.keys)) {
        expect(isTabView({ ...view, features: view.features.map(row => row.id === "music-keys"
          ? { ...row, options: { ...row.options, keys: { ...row.options.keys, [name]: { code: "bad" } } } } : row) })).toBe(false)
      }
    }
    expect(isTabView({ ...view, features: view.features.map(row => row.id === "shortcuts" ? { ...row, options: { ...row.options, music: false } } : row) })).toBe(false)
    const www = wireView()
    expect(isTabView({ ...www, features: www.features.map(row => row.id === "auto-add" ? { ...row, options: { ...row.options, pct: 101 } } : row) })).toBe(false)
    expect(isTabView({ ...www, features: www.features.map(row => row.id === "gather" ? { ...row, options: { ...row.options, auto: { ...row.options.auto, n: 7 } } } : row) })).toBe(false)
  })

  test("signed-out views carry no account-dependent data and facts reject mismatches", () => {
    const out = wireView("www", false)
    for (const accountData of [{ acct: account }, { setup: { kind: "none" } }, { filters: wireView().filters }, { skips: wireView().skips }]) {
      expect(isTabView({ ...out, ...accountData })).toBe(false)
    }
    const facts: TabViewFacts = { signedIn: true, acct: account, site: "www", build, private: false, tabId: 1, windowId: 2 }
    expect(isTabViewFor(facts, wireView())).toBe(true)
    for (const changed of [{ ...facts, build: nextBuild }, { ...facts, private: true }, { ...facts, site: "music" as const },
      { ...facts, acct: checked(isAccountKey, "BBBBBBBBBBBBBBBB") }]) expect(isTabViewFor(changed, wireView())).toBe(false)
    expect(isTabViewFacts({ ...facts, windowId: -1 })).toBe(false)
    expect(isTabViewFacts({ ...facts, revision: 1 })).toBe(false)
    expect(isTabView({ signedIn: true, acct: account, private: false, build })).toBe(false)
  })
})
