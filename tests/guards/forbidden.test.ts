import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { readSources } from "./checker"
import { inspectForbidden, type ForbiddenRule } from "./forbidden"

const root = fileURLToPath(new URL("../../", import.meta.url))
const rules = (file: string, text: string) => inspectForbidden([{ file, text }]).map(finding => finding.rule)

describe("forbidden APIs", () => {
  for (const [rule, file, text] of [
    ["update-listener", "src/background/boot.ts", "browser.runtime.onUpdateAvailable.addListener(() => {})"],
    ["item-migrations", "src/background/store/item.ts", 'storage.defineItem("local:x", { version: 2, migrations: { 2: v => v } })'],
    ["oauth", "src/background/auth.ts", "chrome.identity.getAuthToken({ interactive: true })"],
    ["oauth", "src/ui/backend/auth.ts", "const { identity } = browser; void browser.identity"],
    ["outbound", "src/background/report.ts", 'navigator.sendBeacon("https://example.com", "{}")'],
    ["outbound", "src/ui/backend/telemetry.ts", 'await fetch("https://example.com/collect", { method: "POST" })'],
    ["outbound", "src/page/gateway/www-request.ts", 'window.fetch("https://www.youtube.com/youtubei/v1/browse")'],
    ["outbound", "src/site/core/socket.ts", 'new WebSocket("wss://example.com")'],
    ["container-id", "src/background/tabs/tabs.ts", "const store = tab.cookieStoreId"],
    ["container-id", "src/shared/model/device.ts", 'type Device = { "cookieStoreId": string }'],
    ["state-identity", "src/site/kit/picker/Picker.svelte", '<script lang="ts">let rows = $state([]); const picked = rows.find(row => row === chosen)</script>'],
    ["state-identity", "src/site/kit/picker/model.svelte.ts", "let selection = $state<Row | undefined>(); export const isPicked = (row: Row) => selection === row"],
    ["state-identity", "src/site/features/gather/view.svelte.ts", "const state = $state({ rows: [] as Row[] }); export const has = (row: Row) => state.rows.includes(row) || rows[0] === state"],
    ["state-identity", "src/site/kit/list.svelte.ts", "let rows = $state([] as Row[]); export const second = (row: Row) => rows[1] !== row"]
  ] as const satisfies readonly (readonly [ForbiddenRule, string, string])[]) {
    test(`${rule} fails in ${file}`, () => {
      expect(rules(file, text)).toContain(rule)
    })
  }

  test("permitted shapes pass: the gateway's own fetch, the port method, raw or primitive state, DOM state and ID comparisons", () => {
    expect(rules("src/page/adapters/live-www.ts", "const response = await win.fetch(url, init)")).toEqual([])
    expect(rules("src/page/gateway/www-request.ts", "return port.fetch(`https://www.youtube.com/youtubei/v1/${path}`, init)")).toEqual([])
    expect(
      rules(
        "src/site/kit/toaster/Toast.svelte",
        [
          '<script lang="ts">',
          "let view = $state.raw<ToastView | null>(null); let container = $state<HTMLDivElement | undefined>(); let count = $state(0); let open = $state<boolean>(false)",
          "const same = view === next || container === event.target || count === 3 || open !== false",
          'const rows = $state([] as Row[]); const found = rows.find(row => row.id === chosen.id); const at = rows.indexOf("x"); const empty = rows.length === 0',
          "</script>"
        ].join("\n")
      )
    ).toEqual([])
    expect(rules("src/background/store/item.ts", 'storage.defineItem("local:x", { fallback: 1 })')).toEqual([])
    expect(rules("src/ui/settings/state.svelte.ts", "let rows = $state([]); export const same = (row: unknown) => rows[0] === row")).toEqual([])
  })

  test("findings name the file and line", () => {
    expect(inspectForbidden([{ file: "src/background/boot.ts", text: "const a = 1\n\nbrowser.runtime.onUpdateAvailable" }])).toEqual([
      { file: "src/background/boot.ts", line: 3, rule: "update-listener", evidence: "onUpdateAvailable" }
    ])
  })

  test("the 1.x OAuth code and the rest of src/lib stay deleted (REL-CI-53)", () => {
    expect(existsSync(`${root}/src/lib`)).toBe(false)
  })

  test("current source registers no update listener, sends nothing, stores no container ID and compares no $state object by identity", () => {
    expect(inspectForbidden(readSources(root))).toEqual([])
  })
})
