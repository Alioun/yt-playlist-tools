import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen, within } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import catalogue from "../../public/_locales/en/messages.json"
import { englishI18n, scriptedMessages } from "../../../tools/fixtures/localization/scripted"
import { createI18n } from "../../shared/i18n"
import type { JsonObject } from "../../shared/contracts/json"
import { isBuildId } from "../../shared/contracts/vocabulary"
import type { UiStatus } from "../../shared/contracts/ui-pages"
import { createScriptedBackend, type ScriptedResponders } from "../backend/scripted"
import Popup from "./Popup.svelte"

const build = (() => { const value = "popup-test"; if (!isBuildId(value)) throw Error("build"); return value })()
const acct = "AAAAAAAAAAAAAAAA"
afterEach(() => { cleanup(); localStorage.clear() })
const stamped = (data: object) => ({ v: 1, gen: "g", at: 1, by: "device", data }) as never
const agreed = { schema: 1, device: { id: "device", consent: { v: 1, at: 1 }, syncOn: false } }
const status = (overrides: Partial<Extract<UiStatus, { kind: "status" }>> = {}): UiStatus =>
  ({ kind: "status", paused: false, tab: { kind: "site", site: "www", tabId: 4, signedIn: true, acct: acct as never }, health: [], ...overrides })

function popup(records: JsonObject, respond: ScriptedResponders = {}, grants = { www: true, music: false, browserMenu: false }) {
  const opened: string[] = [], sent: unknown[] = []
  const scripted = createScriptedBackend({ build, deadline: () => () => {}, answers: [], records, grants, respond: {
    "ui.accountInView": () => ({ kind: "account", source: "active", tabId: 4, signedIn: true, acct: acct as never }),
    "ui.status": () => status(),
    "ui.change": payload => { sent.push(payload.change); return { kind: "feature-setting", outcome: { kind: "confirmed", change: payload.change as never, status: "changed", limitedMusic: false, conflicts: 0, menuPermission: "unchanged" } } },
    ...respond
  } })
  const page = {
    backend: scripted.backend, i18n: englishI18n(), platform: { browser: "chrome", os: "windows" } as const, private: false,
    open: (url: string) => { opened.push(url) }, openSettings: (hash?: string) => { opened.push(`settings${hash ? `#${hash}` : ""}`) },
    openFirstRun: () => { opened.push("first-run") }, applyTheme: () => {}, version: "2.0.0", beta: false, commands: { read: async () => ({ kind: "unavailable" }) as const, named: async () => null },
    canonical: async () => createI18n(scriptedMessages(), catalogue)
  }
  render(Popup, { page: page as never, markSrc: "mark.svg" })
  return { opened, sent, scripted }
}

test("before consent it shows the waiting banner, reads no account, and switching a feature on raises the consent sheet", async () => {
  const { opened, sent } = popup({ schema: 1, device: { id: "device", consent: null, syncOn: false } },
    { "ui.accountInView": () => { throw Error("read before consent") } })
  expect(await screen.findByText("Waiting for your OK")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Review" }))
  expect(opened).toEqual(["first-run"])
  await userEvent.click(screen.getByRole("switch", { name: "Queue button on thumbnails" }))
  const sheet = await screen.findByRole("dialog", { name: "Before this feature can run" })
  expect(within(sheet).getByRole("button", { name: "Agree and turn on Queue button on thumbnails" })).toBeTruthy()
  expect(sent).toEqual([])
})

test("after consent the YouTube tab lists the eight rows in order, with summaries, and a switch sends its change", async () => {
  const { sent } = popup({ ...agreed,
    "doc:settings": stamped({ autoAdd: { on: true, feedback: true, pct: 60 }, quickSave: { on: true, feedback: true } }),
    [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" }, autoAdd: [{ pl: "PLa", takes: "videos" }, { pl: "PLb", takes: "both" }], quickSave: "PLa" }),
    [`cache:${acct}`]: { listAt: 1, playlists: [{ id: "PLa", title: "Later" }], order: {}, created: [], labelAt: null } })
  const list = await screen.findByRole("list", { name: "YouTube" })
  await screen.findByText("2 playlists · adds at 60 %")
  expect(within(list).getAllByRole("switch").map(row => row.getAttribute("aria-label"))).toEqual(["Auto-add", "Playlist shortcuts", "Quick-save on thumbnails",
    "Queue button on thumbnails", "Watch-page button", "Right-click for the video menu", "Save from the browser's menu", "Gather tabs"])
  expect(screen.getByText("One click saves to Later")).toBeTruthy()
  expect(screen.getByText("Ann")).toBeTruthy()
  await userEvent.click(screen.getByRole("switch", { name: "Watch-page button" }))
  expect(sent).toEqual([{ kind: "feature", feature: "watch-button", value: true }])
})

test("a feature on without site access is held with its reason and Give access", async () => {
  popup({ ...agreed, "doc:settings": stamped({ queueButton: { on: true, feedback: true } }) }, {}, { www: false, music: false, browserMenu: false })
  const row = await screen.findByRole("switch", { name: "Queue button on thumbnails" })
  await screen.findAllByText("Needs site access")
  expect(row).toHaveAttribute("data-held")
  expect(screen.getAllByRole("button", { name: "Give access" }).length).toBeGreaterThan(0)
  expect(await screen.findByText("Perchling doesn't have access to YouTube.")).toBeTruthy()
})

test("a feature that isn't working shows the strip with Details, and Pause asks the background", async () => {
  let paused = false
  const { opened } = popup({ ...agreed, "doc:settings": stamped({ autoAdd: { on: true, feedback: true } }) }, {
    "ui.status": () => status({ paused, health: [{ feature: "auto-add", site: "www", state: "not-working", gaps: [] }] }),
    "ui.pause": payload => { paused = payload.paused; return { kind: "paused", paused } }
  })
  expect(await screen.findByText("Auto-add isn't working in this tab because YouTube changed something.")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Details" }))
  expect(opened).toEqual(["settings#diagnostics"])
  await userEvent.click(screen.getByRole("button", { name: "Pause" }))
  expect(await screen.findByRole("button", { name: "Resume" })).toBeTruthy()
  expect(screen.getByText("Paused until you resume it or restart the browser")).toBeTruthy()
})

test("the YouTube Music tab is its own part, with the section switch", async () => {
  popup({ ...agreed })
  await userEvent.click(await screen.findByRole("tab", { name: "YouTube Music" }))
  expect(await screen.findByRole("switch", { name: "On YouTube Music" })).toHaveAttribute("aria-checked", "true")
  expect(screen.getByText("Your features below run on music.youtube.com")).toBeTruthy()
  expect(screen.getByRole("switch", { name: "Playlist shortcuts here too" })).toBeDisabled()
})
