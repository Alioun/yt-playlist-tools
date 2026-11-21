import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen, waitFor } from "@testing-library/svelte"
import catalogue from "../../public/_locales/en/messages.json"
import { englishI18n, scriptedMessages } from "../../../tools/fixtures/localization/scripted"
import { createI18n } from "../../shared/i18n"
import type { JsonObject } from "../../shared/contracts/json"
import type { UiFeatureHealth } from "../../shared/contracts/ui-pages"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { createScriptedBackend, type ScriptedResponders } from "../backend/scripted"
import Settings from "./Settings.svelte"

const build = (() => {
  const value = "diagnostics-test"
  if (!isBuildId(value)) throw Error("build")
  return value
})()
const acct = "AAAAAAAAAAAAAAAA"
afterEach(() => {
  cleanup()
  location.hash = ""
})
const stamped = (data: object) => ({ v: 1, gen: "g", at: 1, by: "device", data }) as never
const agreed = { schema: 1, device: { id: "device", consent: { v: 1, at: 1_700_000_000_000 }, syncOn: false } }
const noTabs = { kind: "diagnostics", tabs: { www: false, music: false }, signals: [], checks: [] } as const

function diagnostics(options: { settings: object; health?: () => readonly UiFeatureHealth[]; grants?: { www: boolean; music: boolean }; respond?: ScriptedResponders }) {
  location.hash = "#diagnostics"
  const scripted = createScriptedBackend({
    build,
    deadline: () => () => {},
    answers: [],
    records: { ...agreed, "doc:settings": stamped(options.settings) } as JsonObject,
    grants: { browserMenu: true, ...(options.grants ?? { www: true, music: true }) },
    respond: {
      "ui.accountInView": () => ({ kind: "account", source: "recent", tabId: 4, signedIn: true, acct: acct as never }),
      "ui.status": () => ({ kind: "status", paused: false, tab: { kind: "other" }, health: options.health?.() ?? [] }),
      "ui.diagnostics": () => noTabs,
      ...options.respond
    }
  })
  const page = {
    backend: scripted.backend,
    i18n: englishI18n(),
    platform: { browser: "firefox", os: "linux" } as const,
    private: false,
    version: "2.0.0",
    beta: false,
    open: () => {},
    openSettings: () => {},
    openFirstRun: () => {},
    applyTheme: () => {},
    commands: { read: async () => ({ kind: "unavailable" }) as const, named: async () => null },
    canonical: async () => createI18n(scriptedMessages(), catalogue)
  }
  render(Settings, { page: page as never, markSrc: "mark.svg" })
  return scripted
}
const rows = () => [...document.querySelectorAll("[data-status]")].map(row => row.textContent?.replace(/\s+/g, " ").trim())

test("a feature on both sites keeps one row per site, YouTube first, whichever tabs answered (UI-SET-17)", async () => {
  let health: readonly UiFeatureHealth[] = [
    { feature: "any-tab-keys", site: "music", state: "working", gaps: [] },
    { feature: "any-tab-keys", site: "www", state: "working", gaps: [] }
  ]
  diagnostics({ settings: { anyTabKeys: { on: true, feedback: true } }, health: () => health })
  await waitFor(() => expect(rows()).toEqual(["Keys from any tab · YouTube Working", "Keys from any tab · YouTube Music Working"]), { timeout: 5000 })
  cleanup()
  health = [{ feature: "any-tab-keys", site: "www", state: "working", gaps: [] }]
  diagnostics({ settings: { anyTabKeys: { on: true, feedback: true } }, health: () => health })
  await waitFor(() => expect(rows()).toEqual(["Keys from any tab · YouTube Working", "Keys from any tab · YouTube Music No tab open"]), { timeout: 5000 })
}, 20_000)

test("a site's missing access holds only that site's row (UI-SET-17)", async () => {
  diagnostics({
    settings: { shortcuts: { on: true, feedback: true, music: true, preset: false, picker: null, list: [] } },
    grants: { www: false, music: true },
    health: () => [{ feature: "shortcuts", site: "music", state: "not-working", gaps: [] }]
  })
  await waitFor(() => expect(rows()).toEqual(["Playlist shortcuts · YouTube Needs site access", "Playlist shortcuts · YouTube Music Not working Report a problem"]), { timeout: 5000 })
}, 20_000)

test("a row with no tab of its site open says so and what to do (UI-SET-17)", async () => {
  diagnostics({ settings: { quickSave: { on: true, feedback: true, shortsShelves: false } } })
  await waitFor(() => expect(rows()).toEqual(["Quick-save on thumbnails · YouTube No tab open"]), { timeout: 5000 })
  expect(screen.getByText("No YouTube tab is open. Open one and its statuses show here.")).toBeTruthy()
  expect(screen.queryByText("No YouTube Music tab is open. Open one and its statuses show here.")).toBeNull()
}, 20_000)
