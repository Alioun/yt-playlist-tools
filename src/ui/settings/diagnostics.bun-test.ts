import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
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

function diagnostics(options: { settings: object; health?: () => readonly UiFeatureHealth[]; grants?: { www: boolean; music: boolean }; respond?: ScriptedResponders; hash?: string }) {
  location.hash = options.hash ?? "#diagnostics"
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
const rows = () => [...document.querySelectorAll("[data-status]")].map(row => row.firstElementChild?.textContent?.replace(/\s+/g, " ").trim())

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

test("Report a problem sends the state the feature's row shows, not Working (HEALTH-27)", async () => {
  diagnostics({ settings: { quickSave: { on: true, feedback: true, shortsShelves: false } } })
  await waitFor(() => expect(rows()).toEqual(["Quick-save on thumbnails · YouTube No tab open"]), { timeout: 5000 })
  await userEvent.click(screen.getByRole("button", { name: "Report a problem" }))
  await userEvent.selectOptions(await screen.findByRole("combobox"), "quick-save")
  expect(document.querySelector("[data-report-values]")?.textContent).toBe("GitHub opens with 2.0.0 · Firefox · Quick-save on thumbnails · No YouTube tab open.")
}, 20_000)

test("a partly working status reaches Report a problem and the report in words, not gap names (HEALTH-24, HEALTH-27)", async () => {
  diagnostics({
    settings: { musicActions: { on: true, feedback: true }, gather: { on: true } },
    health: () => [
      { feature: "gather", site: "www", state: "partly-working", gaps: ["playlist"] },
      { feature: "music-actions", site: "music", state: "partly-working", gaps: ["casting"] }
    ]
  })
  await waitFor(() => expect(rows()).toEqual(["Gather tabs · YouTube Partly working Report a problem", "Quick actions · YouTube Music Partly working Report a problem"]), { timeout: 5000 })
  const report = document.querySelector("[data-report]")?.textContent ?? ""
  expect(report).toContain("gather on YouTube: Partly working (can't gather into a playlist)")
  expect(report).toContain("music-actions on YouTube Music: Partly working (can't tell when YouTube Music is casting)")
  await userEvent.click(within(document.querySelector('[data-status="music-actions"]') as HTMLElement).getByRole("button", { name: "Report a problem" }))
  await waitFor(() =>
    expect(document.querySelector("[data-report-values]")?.textContent).toBe("GitHub opens with 2.0.0 · Firefox · Quick actions · Partly working (can't tell when YouTube Music is casting).")
  )
}, 20_000)

test("an open Diagnostics page updates when a YouTube tab opens, without a reload (UI-SET-17)", async () => {
  let open = false
  const scripted = diagnostics({
    settings: { quickSave: { on: true, feedback: true, shortsShelves: false } },
    health: () => (open ? [{ feature: "quick-save", site: "www", state: "working", gaps: [] }] : []),
    respond: { "ui.diagnostics": () => ({ ...noTabs, tabs: { www: open, music: false } }) }
  })
  await waitFor(() => expect(rows()).toEqual(["Quick-save on thumbnails · YouTube No tab open"]), { timeout: 5000 })
  expect(await screen.findByText("Open YouTube to check")).toBeTruthy()
  open = true
  scripted.replace({ tabs: [[4, { site: "www", signedIn: false, acct: null }]] }, "session")
  await waitFor(() => expect(rows()).toEqual(["Quick-save on thumbnails · YouTube Working"]), { timeout: 5000 })
  expect(await screen.findByRole("button", { name: "Check now" })).toBeTruthy()
  expect(screen.queryByText("No YouTube tab is open. Open one and its statuses show here.")).toBeNull()
}, 20_000)

test("Check now's result and its failure are announced politely (HEALTH-23)", async () => {
  let runs = 0
  diagnostics({
    settings: { quickSave: { on: true, feedback: true, shortsShelves: false } },
    respond: {
      "ui.diagnostics": ({ check }) => {
        if (check && ++runs === 2) return { kind: "refused", reason: "no-tab" }
        return { ...noTabs, tabs: { www: true, music: false }, checks: runs ? [{ site: "www", at: runs, jobs: [{ job: "account", ok: true }, { job: "playlists", ok: false }] }] : [] }
      }
    }
  })
  const button = await screen.findByRole("button", { name: "Check now" }, { timeout: 5000 })
  await userEvent.click(button)
  const result = await screen.findByText("1 of 2 reads answered on YouTube.", {}, { timeout: 5000 })
  const liveRegion = result.closest('[role="status"]')
  expect(liveRegion).not.toBeNull()
  await userEvent.click(button)
  const failed = await screen.findByText("Couldn't run the check. Try again.", {}, { timeout: 5000 })
  expect(failed.closest('[role="status"]')).toBe(liveRegion)
  expect(screen.queryByText("1 of 2 reads answered on YouTube.")).toBeNull()
}, 20_000)

test("a health line is one whole sentence, says song on YouTube Music and says what casting costs (UI-SET-09)", async () => {
  const music = (gap: "membership" | "casting") => () => [{ feature: "music-actions" as const, site: "music" as const, state: "partly-working" as const, gaps: [gap] }]
  diagnostics({ settings: { musicActions: { on: true, feedback: true } }, health: music("membership"), hash: "#music" })
  expect(await screen.findByText("Partly working, because it can't show where a song is already saved.", {}, { timeout: 5000 })).toBeTruthy()
  cleanup()
  diagnostics({ settings: { musicActions: { on: true, feedback: true } }, health: music("casting"), hash: "#music" })
  expect(
    await screen.findByText("Partly working, because it can't tell when YouTube Music is casting. While you cast, queue changes may not reach the cast device.", {}, { timeout: 5000 })
  ).toBeTruthy()
  cleanup()
  diagnostics({ settings: { gather: { on: true } }, health: () => [{ feature: "gather", site: "www", state: "partly-working", gaps: ["playlist"] }], hash: "#youtube" })
  expect(await screen.findByText("Partly working, because it can't gather into a playlist.", {}, { timeout: 5000 })).toBeTruthy()
}, 30_000)

test("a broken Diagnostics row says why in a sentence, and a check of one read says read (UI-SET-17, HEALTH-23)", async () => {
  let checked = false
  diagnostics({
    settings: { anyTabKeys: { on: true, feedback: true } },
    health: () => [{ feature: "any-tab-keys", site: "music", state: "not-working", gaps: [] }],
    respond: {
      "ui.diagnostics": ({ check }) => {
        checked ||= check
        return { ...noTabs, tabs: { www: false, music: true }, checks: checked ? [{ site: "music", at: 1, jobs: [{ job: "nowPlaying", ok: true }] }] : [] }
      }
    }
  })
  const row = await waitFor(() => document.querySelector('[data-status="any-tab-keys"][data-site="music"]') ?? Promise.reject(Error("no row")), { timeout: 5000 })
  expect(within(row as HTMLElement).getByText("Not working right now, because YouTube Music changed something it relies on.")).toBeTruthy()
  await userEvent.click(await screen.findByRole("button", { name: "Check now" }))
  expect(await screen.findByText("1 of 1 read answered on YouTube Music.", {}, { timeout: 5000 })).toBeTruthy()
}, 20_000)

test("a status refresh cannot discard the result of the check in progress", async () => {
  const open = { ...noTabs, tabs: { www: true, music: false } }
  const result = { ...open, checks: [{ site: "www", at: 42, jobs: [{ job: "account", ok: true }] }] } as const
  const pending = Promise.withResolvers<typeof result>()
  let passiveReads = 0
  const scripted = diagnostics({
    settings: {},
    respond: {
      "ui.diagnostics": ({ check }) => check
        ? pending.promise
        : (passiveReads++, open)
    }
  })
  const button = await screen.findByRole("button", { name: "Check now" })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
  const previousReads = passiveReads
  scripted.replace({ breakage: {} }, "session")
  await waitFor(() => expect(passiveReads).toBeGreaterThan(previousReads))
  pending.resolve(result)
  expect(await screen.findByText("1 of 1 read answered on YouTube.")).toBeTruthy()
})
