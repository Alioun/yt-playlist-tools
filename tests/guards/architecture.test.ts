import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { inspect, inventoryChanges, readAliases, readSources, rules, type Finding, type Rule } from "./checker"
import { legacyInventory } from "./legacy-inventory"

const root = fileURLToPath(new URL("../../", import.meta.url))
const browser = 'import { browser } from "wxt/browser";\n'

test("source discovery excludes each adjacent test convention", () => {
  const directory = mkdtempSync(join(root, "tests/guards/.source-scan-"))
  try {
    mkdirSync(join(directory, "src"))
    for (const file of ["value.ts", "value.test.ts", "value.spec.ts", "value.bun-test.ts", "value.d.ts"]) {
      writeFileSync(join(directory, "src", file), 'export const synthetic = true')
    }
    expect(readSources(directory).map(source => source.file)).toEqual(["src/value.ts"])
  } finally {
    rmSync(directory, { recursive: true })
  }
})

function findings(file: string, text: string) {
  return inspect([{ file, text }])
}

function hasRule(file: string, text: string, rule: Rule) {
  expect(findings(file, text).filter(finding => finding.rule === rule).length).toBeGreaterThan(0)
}

for (const example of [
  { rule: "imports", file: "src/shared/example.ts", text: 'import "@/background/boot"' },
  { rule: "env", file: "src/site/core/example.ts", text: "import.meta.env.FIREFOX" },
  { rule: "page-console", file: "src/page/example.ts", text: 'console.log("synthetic")' },
  { rule: "entrypoints", file: "src/background/boot.ts", text: 'import "wxt/utils/define-background"' },
  { rule: "storage-writes", file: "src/ui/example.ts", text: "chrome.storage.local.set({})" },
  { rule: "running-cost", file: "src/background/example.ts", text: "setInterval(handler, 10)" },
] satisfies { rule: Rule; file: string; text: string }[]) {
  test(`${example.rule} reports its offending file and line`, () => {
    const actual = findings(example.file, `// synthetic\n\n${example.text}`).filter(finding => finding.rule === example.rule)
    expect(actual.map(finding => [finding.file, finding.line])).toEqual([[example.file, 3]])
  })
}

describe("import boundaries", () => {
  test.each([
    ['import { boot } from "../../background/boot"'],
    ['import type { Store } from "@/background/store"'],
    ['export { boot } from "~/background/boot"'],
    ['export type { Store } from "../../background/store"'],
    ['const lazy = import("@/background/boot")'],
    ['const legacy = require("~/background/boot")'],
    ['import store = require("../../background/store")'],
    ['type Store = import("@/background/store").Store'],
    ['import "../shared/../../tools/watch"'],
    ['import "wxt/browser"'],
    ['import type { Browser } from "wxt/browser"'],
    ['import { browser } from "#imports"'],
    ['defineContentScript({ main() {} })'],
    ['browser.runtime.sendMessage({})'],
    ['const api = { browser }'],
    ['const lazy = import(moduleName)'],
    ['import "svelte"'],
  ])("rejects a shared module using %s", text => {
    hasRule("src/shared/rules/example.ts", text, "imports")
  })

  test.each([
    ["src/shared/model/value.ts", 'import type { Value } from "../contracts/value"'],
    ["src/shared/picker/state.ts", 'import { tick } from "svelte"'],
    ["src/page/routes/www.ts", 'export * from "@/shared/contracts"'],
    ["src/site/features/button.ts", 'import { show } from "$kit"'],
    ["src/site/core/adapters/runtime.ts", browser],
    ["src/background/adapters/browser.ts", browser],
    ["src/ui/backend/browser.ts", browser],
    ["src/entrypoints/background.ts", browser + 'import { boot } from "@/background/boot"'],
    ["src/shared/value.ts", 'const browser = { value: 1 }; export { browser }'],
  ])("permits the declared dependency of %s", (file, text) => {
    expect(findings(file, text).filter(finding => finding.rule === "imports")).toEqual([])
  })

  test("honors configured aliases and path normalization", () => {
    const actual = inspect([{ file: "src/site/feature.ts", text: 'import type { Store } from "$store/state"' }], {
      "$store/*": ["./src/background/*"],
    })
    expect(actual.map(finding => finding.rule)).toEqual(["imports"])
    hasRule("src/shared/example.ts", 'import "@/shared/../background/boot"', "imports")
    expect(inspect([{ file: "src/shared/example.ts", text: 'import "$fallback/state"' }], {
      "$fallback/*": ["src/shared/*", "src/background/*"],
    }).map(finding => finding.rule)).toEqual(["imports"])
  })

  test("type-only imports do not supply runtime auto-import bindings", () => {
    hasRule("src/entrypoints/page.ts", 'import type { browser } from "wxt/browser"; browser.tabs.query({})', "imports")
  })

  test("reports the source line of an invalid script", () => {
    expect(findings("src/shared/example.ts", "const valid = 1\nconst broken = ;")
      .filter(finding => finding.reason === "syntax-error").map(finding => finding.line)).toEqual([2])
  })
})

describe("environment and page logging", () => {
  test.each([
    "import.meta.env.FIREFOX",
    'import.meta["env"]["FIREFOX"]',
    'const env = import.meta.env; env.FIREFOX',
    'const { FIREFOX } = import.meta.env',
  ])("rejects environment access outside platform through %s", text => {
    hasRule("src/site/core/platform.ts", text, "env")
  })

  test("platform accepts direct literal member reads only", () => {
    expect(findings("src/shared/platform.ts", "export const firefox = import.meta.env.FIREFOX")).toEqual([])
    for (const text of ["const env = import.meta.env", 'import.meta.env["FIREFOX"]', 'import.meta["env"].FIREFOX']) {
      hasRule("src/shared/platform.ts", text, "env")
    }
  })

  test.each([
    'console.log("synthetic")',
    'globalThis["console"]["warn"]("synthetic")',
    'const output = window.console; output.error("synthetic")',
    'const { log: write } = console; write("synthetic")',
    'console[method]("synthetic")',
  ])("rejects page logging through %s", text => {
    hasRule("src/page/gateway.ts", text, "page-console")
  })

  test("ignores comments, strings, property names and erased types", () => {
    expect(findings("src/page/gateway.ts", `
      // console.error(import.meta.env.FIREFOX)
      const message = "console.log import.meta.env setInterval"
      const record = { console: 1 }
      type Log = typeof console.log
      export { record, message }
    `)).toEqual([])
    expect(findings("src/page/gateway.ts", 'function sample(console: { log(): void }) { console.log() }')).toEqual([])
  })

  test("reads Svelte scripts with their original line numbers", () => {
    const result = findings("src/page/Gateway.svelte", '<p>synthetic 😀</p>\n<script lang="ts">\nconsole.log("synthetic")\n</script>')
    expect(result.filter(finding => finding.rule === "page-console").map(finding => finding.line)).toEqual([3])
  })
})

describe("thin entrypoints", () => {
  test("definition imports cannot move into implementation modules", () => {
    hasRule("src/background/boot.ts", 'export { defineBackground } from "wxt/utils/define-background"', "entrypoints")
    expect(findings("src/entrypoints/background.ts", 'import { defineBackground } from "wxt/utils/define-background"')).toEqual([])
  })

  test("counts physical lines, including comments and blanks", () => {
    expect(findings("src/entrypoints/page.ts", Array(15).fill("// synthetic").join("\n") + "\n")).toEqual([])
    const actual = findings("src/entrypoints/page.ts", Array(16).fill("// synthetic").join("\n"))
    expect(actual.map(finding => [finding.rule, finding.evidence])).toEqual([["entrypoints", "16"]])
  })
})

describe("storage write ownership", () => {
  test.each([
    'browser.storage.local.set({ synthetic: true })',
    'browser["storage"]["sync"]["remove"]("synthetic")',
    'const area = browser.storage.session; area.clear()',
    'const { local: area } = browser.storage; area.set({ synthetic: true })',
    'const { storage: { sync: { remove: erase } } } = browser; erase("synthetic")',
    'const write = browser.storage.local.set; write({ synthetic: true })',
    'const operation = "set"; browser.storage.local[operation]({ synthetic: true })',
    'const api = browser; const area = api.storage.local; area.set({})',
    'globalThis.chrome.storage.local.clear()',
  ])("rejects writes through %s", text => {
    hasRule("src/background/accounts/save.ts", browser + text, "storage-writes")
  })

  test("resolves renamed and namespace browser imports", () => {
    hasRule("src/ui/backend/browser.ts", 'import { browser as api } from "wxt/browser"; api.storage.local.clear()', "storage-writes")
    hasRule("src/ui/backend/browser.ts", 'import * as api from "wxt/browser"; api.browser.storage.sync.remove("synthetic")', "storage-writes")
  })

  test("recognizes explicitly named storage parameters", () => {
    hasRule("src/background/accounts/save.ts", 'function save(storage: StorageAreas) { storage.local.set({}) }', "storage-writes")
    hasRule("src/ui/backend/browser.ts", 'function save(browser: Browser) { browser.storage.local.clear() }', "storage-writes")
  })

  test("allows store writes, reads, and unrelated local APIs", () => {
    expect(findings("src/background/store/save.ts", browser + 'browser.storage.local.set({})')
      .filter(finding => finding.rule === "storage-writes")).toEqual([])
    expect(findings("src/ui/backend/browser.ts", browser + 'browser.storage.local.get("synthetic")')).toEqual([])
    expect(findings("src/site/feature.ts", 'const cache = new Map(); cache.set("synthetic", true)')).toEqual([])
  })
})

describe("event driven running cost", () => {
  test.each([
    'setInterval(() => {}, 1000)',
    'const repeat = globalThis["setInterval"]; repeat(() => {}, 1000)',
    'browser["alarms"].create("synthetic", {})',
    'const { alarms: clock } = browser; clock.create("synthetic", {})',
    'browser.alarms[operation]("synthetic", {})',
    'browser.tabs.onUpdated.addListener(() => {})',
    'const { onCreated: changes } = browser.windows; changes.addListener(() => {})',
    'browser["webNavigation"].onCommitted.addListener(() => {})',
    'browser.contextMenus.onShown.addListener(() => {})',
    'const refresh = browser.menus["refresh"]; refresh()',
  ])("rejects background work through %s", text => {
    hasRule("src/background/adapters/browser.ts", browser + text, "running-cost")
  })

  test.each([
    'browser.storage.onChanged.addListener(() => {})',
    'const { onChanged: changes } = browser.storage.local; changes.addListener(() => {})',
    'const area = browser.storage.sync; area["onChanged"].addListener(() => {})',
  ])("rejects page storage listeners through %s", text => {
    hasRule("src/site/core/adapters/runtime.ts", browser + text, "running-cost")
  })

  test.each([
    'node.addEventListener("click", () => {})',
    'const bind = node["addEventListener"]; bind("click", () => {})',
    'new MutationObserver(() => {})',
    'new window["ResizeObserver"](() => {})',
    'const Watch = IntersectionObserver; new Watch(() => {})',
    'const delay = setTimeout; delay(() => {}, 1)',
    'const { requestAnimationFrame: draw } = window; draw(() => {})',
  ])("requires scoped feature and kit resources through %s", text => {
    for (const file of ["src/site/features/example/feature.ts", "src/site/kit/overlay.ts"]) hasRule(file, text, "running-cost")
  })

  test.each([
    'observer.observe(document, { subtree: true })',
    'observer.observe(document["body"], { ["subtree"]: true })',
    'const root = document.documentElement; observer.observe(root, { subtree: true })',
    'const root = document.querySelector("ytd-app"); const options = { subtree: true }; observer.observe(root, options)',
    'observer.observe(document.querySelector("ytmusic-app"), { subtree: true })',
  ])("rejects a broad subtree observation through %s", text => {
    hasRule("src/site/core/items.ts", text, "running-cost")
  })

  test("permits scoped resources, bounded observers, and allowed background listeners", () => {
    expect(findings("src/site/features/example/feature.ts", `
      scope.listen(node, "click", handler)
      scope.timeout(handler, 20)
      scope.observe(node, { childList: true })
    `)).toEqual([])
    expect(findings("src/site/core/scope.ts", `
      node.addEventListener("click", handler)
      new MutationObserver(handler).observe(node, { subtree: true })
      observer.observe(document.body, { childList: true })
      setTimeout(handler, 20)
    `)).toEqual([])
    expect(findings("src/background/adapters/browser.ts", browser + `
      browser.runtime.onMessage.addListener(handler)
      browser.storage.sync.onChanged.addListener(handler)
      browser.commands.onCommand.addListener(handler)
      browser.contextMenus.onClicked.addListener(handler)
    `)).toEqual([])
  })

  test("checks actual receiver parameters and variables", () => {
    hasRule("src/site/features/example/feature.ts", 'function install(node: HTMLElement) { node["addEventListener"]("click", handler) }', "running-cost")
    hasRule("src/site/core/items.ts", 'function install(observer: MutationObserver) { observer.observe(document.body, { subtree: true }) }', "running-cost")
    hasRule("src/site/core/items.ts", 'const observer = new MutationObserver(handler); observer.observe(document.body, { subtree: true })', "running-cost")
    hasRule("src/site/features/example/feature.ts", 'function install(node: HTMLElement) { const { addEventListener: bind } = node; bind("click", handler) }', "running-cost")
    hasRule("src/site/core/items.ts", 'function install(observer: MutationObserver) { const watch = observer.observe; watch(document.body, { subtree: true }) }', "running-cost")
  })
})

describe("frozen legacy inventory", () => {
  const sample: Finding = { file: "src/page/gateway.ts", line: 3, rule: "page-console", reason: "page-console", evidence: "console.log" }

  test("new files, rules, expressions, and duplicate offenses cannot use an old exception", () => {
    for (const mutation of [{ file: "src/page/new.ts" }, { rule: "env" as const }, { evidence: "console.warn" }]) {
      expect(inventoryChanges([{ ...sample, ...mutation }], [sample]).some(change => change.startsWith("New violation:"))).toBe(true)
    }
    expect(inventoryChanges([sample, sample], [sample])).toHaveLength(1)
  })

  test("resolved violations require deleting their frozen entries", () => {
    expect(inventoryChanges([], [sample])).toEqual(["Remove resolved inventory entry: src/page/gateway.ts:3 [page-console/page-console] console.log"])
    expect(inventoryChanges([{ ...sample, line: 8 }], [sample])).toEqual([])
  })

  test("entrypoint line budgets can shrink but cannot grow", () => {
    const entry: Finding = { ...sample, rule: "entrypoints", reason: "entrypoint-lines", evidence: "30" }
    expect(inventoryChanges([{ ...entry, evidence: "29" }], [entry])).toEqual([])
    expect(inventoryChanges([{ ...entry, evidence: "31" }], [entry])[0]).toContain("New violation:")
  })

  test("the reviewed inventory can only lose entries", () => {
    const admitted = new Set([
      "72925dd803056efa27a073af6be059eeb90fc6f35dd0485c98a06b096b9841ac",
      "38c556898580333fe4be7330a7184b8cddba41db280233c0d24dd48c9e1cec1d",
      "7702ad981ba0188847e80418ce7f401efb10561b4ba573411393e9b9f4a2b492",
      "365f0a75a2b36dbf273288c454b0cc8ee820b87daa094471adf48c83a2e15a42",
      "e4c9fe087a26b21ee618affc6a7073361c9da8331702ad7f8483801f3c413ebb",
      "ec1d224f295eccd19ca9137d637fa8504837472a782dfc320595d11c87dd17ec",
      "03e93da45dc67265085d37c8984b41ae39ce8df0f02584878a6a9073bb69bb1e",
      "f4e79712cd8f5aee810ddc05a69b0598b59112efb34a5218cbe4d2f742013ac1",
      "877891855852064cfc00b61fd899b8ec12cfd54d570139bfaa13168b9b5d389b",
      "4d9abbc307b2a7c4d7777d18c6a2845d40d80d8aaedd4bcd0706b63ea7c789d9",
      "b68128ffe600b16efce682c7b83c4c0debf7e546ad0f978cf4764f98fd2d4e4d",
      "0654e1c1f4ed550341bded8a6cac755568f82e0a6ddc39bf1a5849e0faee7253",
      "d0307628ab9d2bb28376dc5deea600b4d5ae91fa05f4766c2a43d218f9136060",
      "74395da7f42c879775bc6c05b985f456264b94ae0a2c742afd36db2b76643c75",
      "b470b45a25633de87dd544ee8aa3ada5f1c26cf6164764503df5af2d2a385c0e",
    ])
    for (const finding of legacyInventory) {
      const key = createHash("sha256").update(JSON.stringify([finding.file, finding.rule, finding.reason, finding.evidence])).digest("hex")
      expect(admitted.delete(key), `Inventory addition or duplicate: ${finding.file}:${finding.line}`).toBe(true)
    }
  })

  const current = inspect(readSources(root), readAliases(root))
  for (const rule of rules) {
    test(`current source obeys ${rule} except for its exact frozen findings`, () => {
      expect(inventoryChanges(current.filter(finding => finding.rule === rule), legacyInventory.filter(finding => finding.rule === rule))).toEqual([])
    })
  }
})
