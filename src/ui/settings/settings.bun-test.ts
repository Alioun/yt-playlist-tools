import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import catalogue from "../../public/_locales/en/messages.json"
import { englishI18n, scriptedMessages } from "../../../tools/fixtures/localization/scripted"
import { createI18n } from "../../shared/i18n"
import type { JsonObject } from "../../shared/contracts/json"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { createScriptedBackend, type ScriptedResponders } from "../backend/scripted"
import Settings from "./Settings.svelte"

const build = (() => { const value = "settings-test"; if (!isBuildId(value)) throw Error("build"); return value })()
const acct = "AAAAAAAAAAAAAAAA"
afterEach(() => { cleanup(); location.hash = "" })
const stamped = (data: object) => ({ v: 1, gen: "g", at: 1, by: "device", data }) as never
const agreed = { schema: 1, device: { id: "device", consent: { v: 1, at: 1_700_000_000_000 }, syncOn: false } }

function settings(records: JsonObject, respond: ScriptedResponders = {}, hash = "") {
  location.hash = hash
  const opened: string[] = []
  const scripted = createScriptedBackend({ build, deadline: () => () => {}, answers: [], records, grants: { www: true, music: true, browserMenu: true }, respond: {
    "ui.accountInView": () => ({ kind: "account", source: "recent", tabId: 4, signedIn: true, acct: acct as never }),
    "ui.status": () => ({ kind: "status", paused: false, tab: { kind: "other" }, health: [] }),
    ...respond
  } })
  const page = {
    backend: scripted.backend, i18n: englishI18n(), platform: { browser: "firefox", os: "linux" } as const, private: false, version: "2.0.0", beta: false,
    open: (url: string) => { opened.push(url) }, openSettings: () => {}, openFirstRun: () => { opened.push("first-run") }, applyTheme: () => {},
    commands: { read: async () => ({ kind: "unavailable" }) as const, named: async () => null }, canonical: async () => createI18n(scriptedMessages(), catalogue)
  }
  render(Settings, { page: page as never, markSrc: "mark.svg" })
  return { opened }
}

test("Settings opens on YouTube with every feature card, and the nav lists the eight sections", async () => {
  settings({ ...agreed, "doc:settings": stamped({ queueButton: { on: true, feedback: true } }) })
  const nav = await screen.findByRole("navigation", { name: "Settings sections" }, { timeout: 5000 })
  expect(within(nav).getAllByRole("link").map(link => link.textContent?.trim())).toEqual(["YouTube", "YouTube Music", "Everywhere", "Accounts", "Appearance", "Privacy & data", "Diagnostics", "About"])
  // happy-dom's role queries are slow over a whole section, so each card is queried on its own.
  const card = async (feature: string) => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const found = document.querySelector<HTMLElement>(`[data-feature-card="${feature}"]`)
      if (found) return found
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw Error(`no ${feature} card`)
  }
  expect(within(await card("gather")).getByRole("switch", { name: "Gather tabs" })).toHaveAttribute("aria-checked", "false")
  const queue = await card("queue-button")
  expect(within(queue).getByRole("switch", { name: "Queue button on thumbnails" })).toHaveAttribute("aria-checked", "true")
  expect(within(queue).getByRole("switch", { name: "Show feedback" })).toHaveAttribute("aria-checked", "true")
}, 20_000)

test("before consent Privacy & data says so and marks its nav entry", async () => {
  settings({ schema: 1, device: { id: "device", consent: null, syncOn: false } }, { "ui.accountInView": () => { throw Error("read before consent") } }, "#privacy")
  expect(await screen.findByText("You haven't agreed yet, so nothing runs on YouTube.", {}, { timeout: 5000 })).toBeTruthy()
  expect(within(screen.getByRole("link", { name: /Privacy & data/ })).getByRole("img", { name: "Needs you" })).toBeTruthy()
}, 20_000)

test("withdrawing asks first, then sends the stored agreement", async () => {
  const sent: unknown[] = []
  settings(agreed, { "ui.withdraw": payload => { sent.push(payload.expected); return { kind: "withdrawn" } } }, "#privacy")
  await userEvent.click(await screen.findByRole("button", { name: "Withdraw and pause everything" }, { timeout: 5000 }))
  await userEvent.click(await screen.findByRole("button", { name: "Withdraw" }, { timeout: 5000 }))
  expect(await screen.findByText("Withdrawn. Every feature has stopped in this browser.", {}, { timeout: 5000 })).toBeTruthy()
  expect(sent).toEqual([{ v: 1, at: 1_700_000_000_000 }])
}, 20_000)

test("removing an account setup shows ACC-25's confirmation for this browser and removes it", async () => {
  const calls: string[] = []
  settings({ ...agreed, [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" }, autoAdd: [{ pl: "PLa", takes: "videos" }] }) }, {
    "ui.removeSetup": payload => { calls.push(payload.action); return payload.action === "prepare" ? { kind: "confirm", token: "t1", scope: "this-browser" } : { kind: "removed" } }
  }, "#accounts")
  await userEvent.click(await screen.findByRole("button", { name: "Remove" }, { timeout: 5000 }))
  const dialog = await screen.findByRole("alertdialog", {}, { timeout: 5000 })
  expect(dialog.textContent).toContain("Remove Ann's setup? Its auto-add playlists, channel filters, shortcut playlists and quick-save playlists are deleted from this browser.")
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }))
  expect(await screen.findByText("Removed.", {}, { timeout: 5000 })).toBeTruthy()
  expect(calls).toEqual(["prepare", "confirm"])
}, 20_000)

test("a feature link opens its section and rings its card", async () => {
  settings(agreed, {}, "#feature-music-keys")
  const card = await screen.findByRole("region", { name: /Quick-action shortcuts/ }, { timeout: 5000 })
  for (let attempt = 0; attempt < 40 && !card.hasAttribute("data-ring"); attempt++) await new Promise(resolve => setTimeout(resolve, 25))
  expect(card.hasAttribute("data-ring")).toBe(true)
}, 20_000)

test("the diagnostics report names features and statuses, never the account", async () => {
  settings({ ...agreed, "doc:settings": stamped({ autoAdd: { on: true, feedback: true } }), [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" } }) }, {
    "ui.status": () => ({ kind: "status", paused: false, tab: { kind: "other" }, health: [{ feature: "auto-add", site: "www", state: "partly-working", gaps: ["membership"] }] })
  }, "#diagnostics")
  const report = await screen.findByText(/Perchling 2\.0\.0/, {}, { timeout: 5000 })
  expect(report.textContent).toContain("Features on: auto-add")
  expect(report.textContent).toContain("auto-add on YouTube: partly-working (membership)")
  expect(report.textContent).not.toContain(acct)
  expect(report.textContent).not.toContain("Ann")
  expect(screen.getByText("Partly working")).toBeTruthy()
}, 20_000)

test("the Gather tabs card shows the last gather with Undo, and Undo's answer in its place", async () => {
  const undone: string[] = []
  settings({ ...agreed, "doc:settings": stamped({ gather: { on: true, feedback: true, to: "player", order: "newest", close: false } }) }, {
    "ui.gathers": () => ({ kind: "gathers", running: false, line: { text: "Last gather: 3 videos into Later, 5 minutes ago", tone: "muted", action: { kind: "undo", id: "g7" } } }),
    "ui.gatherUndo": payload => { undone.push(payload.id); return { kind: "line", line: { text: "Removed 3 videos from Later and reopened their tabs.", tone: "confirmation", action: null } } }
  }, "#feature-gather")
  const line = await screen.findByText("Last gather: 3 videos into Later, 5 minutes ago", {}, { timeout: 5000 })
  await userEvent.click(within(line).getByRole("button", { name: "Undo" }))
  expect(await screen.findByText("Removed 3 videos from Later and reopened their tabs.", {}, { timeout: 5000 })).toBeTruthy()
  expect(undone).toEqual(["g7"])
  expect(screen.getByRole("link", { name: "Based on GatherTube by Karim Elgazar" })).toHaveAttribute("href", "https://github.com/karimelgazar/gathertube")
}, 20_000)

test("ticking an automatic gather option with no gather playlist opens the chooser first, and the pick ticks it (YT-GT-16)", async () => {
  const sent: unknown[] = []
  settings({ ...agreed, "doc:settings": stamped({ gather: { on: true, feedback: true, to: "player", order: "newest", close: false } }),
    [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" } }), [`cache:${acct}`]: { listAt: Date.now(), playlists: [{ id: "PLa", title: "Later" }], order: {}, created: [], labelAt: null } }, {
    "ui.gathers": () => ({ kind: "gathers", running: false, line: null }),
    "ui.playlists": payload => payload.action === "open"
      ? { kind: "open", operation: payload.operation, cached: { rows: [{ id: "PLa" as never, title: "Later" }], at: Date.now() }, freshness: "fresh", refresh: null }
      : { kind: "released", operation: payload.operation },
    "ui.change": payload => {
      sent.push(payload.change)
      const change = payload.change as { kind: string; playlist?: string }
      return change.kind === "setup-destination" ? { kind: "destination", outcome: { kind: "confirmed", playlist: change.playlist as never } }
        : { kind: "shared-setting", outcome: { kind: "confirmed", change: payload.change as never, status: "changed" } } as never
    }
  }, "#feature-gather")
  const box = await screen.findByRole("checkbox", { name: /Save and close video tabs I open in the background/ }, { timeout: 5000 })
  expect(box).toHaveAccessibleDescription("Choose a gather playlist first.")
  await userEvent.click(box)
  expect(box).not.toBeChecked()
  expect(await screen.findByText("Choose a gather playlist for Ann first.")).toBeTruthy()
  expect(await screen.findByRole("button", { name: "Gather playlist: No playlist chosen" }, { timeout: 5000 })).toHaveAttribute("aria-expanded", "true")
  expect(sent).toEqual([])
  // happy-dom leaves the floating picker unpositioned, so its rows count as hidden to role queries.
  const row = await waitFor(() => { const found = document.querySelector<HTMLElement>('[data-picker-row="PLa"]'); if (!found) throw Error("no row"); return found }, { timeout: 5000 })
  await userEvent.click(row)
  await waitFor(() => expect(sent).toEqual([{ kind: "setup-destination", acct, destination: { kind: "gather" }, playlist: "PLa", expected: { setup: "live", playlist: null } },
    { kind: "option", field: "gather.auto.background", value: true }]))
}, 20_000)

test("with synced settings full and a kept filter, Everywhere offers Remove kept filters and asks the background to remove them (SYNC-14)", async () => {
  const removed: unknown[] = []
  settings({ schema: 1, device: { id: "device", consent: { v: 1, at: 1_700_000_000_000 }, syncOn: true },
    sync: { joined: "history", pushed: {}, status: "full", editedSinceOff: false },
    "doc:settings": stamped({}), [`doc:setup:${acct}`]: stamped({ autoAdd: [{ pl: "PL_on", takes: "videos" }] }),
    [`doc:filter:${acct}:PL_on`]: stamped({ mode: "deny", on: true, channels: [] }), [`doc:filter:${acct}:PL_kept`]: stamped({ mode: "deny", on: true, channels: [] })
  }, { "ui.removeKeptFilters": payload => { removed.push(payload); return { kind: "removed", filters: 1 } } }, "#everywhere")
  const button = await screen.findByRole("button", { name: "Remove kept filters" }, { timeout: 5000 })
  expect(screen.getByText("Filters of playlists you no longer auto-add to.")).toBeTruthy()
  await userEvent.click(button)
  for (let turn = 0; turn < 100 && !removed.length; turn++) await new Promise(resolve => setTimeout(resolve, 10))
  expect(removed).toEqual([{}])
}, 20_000)

test("Diagnostics runs Check now only when clicked, shows what answered, and puts the session's signals in the report (HEALTH-22 to HEALTH-24)", async () => {
  const checks: boolean[] = []
  const signal = { site: "www", feature: "quick-save", job: "add", route: "service.add", kind: "missing", pageType: "watch", clientVersion: "2.2", shape: null, count: 2, firstSeen: 1, lastSeen: 2 } as const
  settings({ ...agreed, "doc:settings": stamped({ quickSave: { on: true, feedback: true, shortsShelves: false } }) }, {
    "ui.diagnostics": ({ check }) => {
      checks.push(check)
      return { kind: "diagnostics", tabs: { www: true, music: false }, signals: [signal],
        checks: check ? [{ site: "www", at: 5, jobs: [{ job: "account", ok: true }, { job: "playlists", ok: false }] }] : [] }
    }
  }, "#diagnostics")
  const button = await screen.findByRole("button", { name: "Check now" }, { timeout: 5000 })
  for (let turn = 0; turn < 100 && !checks.length; turn++) await new Promise(resolve => setTimeout(resolve, 10))
  expect(checks).toEqual([false])
  await userEvent.click(button)
  expect(await screen.findByText("1 of 2 reads answered on YouTube.", {}, { timeout: 5000 })).toBeTruthy()
  expect(checks).toEqual([false, true])
  const report = document.querySelector("[data-report]")?.textContent ?? ""
  expect(report).toContain("YouTube: account ok, playlists failed")
  expect(report).toContain("YouTube missing feature=quick-save job=add route=service.add page=watch client=2.2 ×2")
}, 20_000)

test("with no YouTube tab open, Check now gives way to Open YouTube (HEALTH-23)", async () => {
  const { opened } = settings({ ...agreed, "doc:settings": stamped({}) }, {
    "ui.diagnostics": () => ({ kind: "diagnostics", tabs: { www: false, music: false }, signals: [], checks: [] })
  }, "#diagnostics")
  expect(await screen.findByText("Open YouTube to check", {}, { timeout: 5000 })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Check now" })).toBeNull()
  await userEvent.click(screen.getByRole("button", { name: "Open YouTube" }))
  expect(opened).toEqual(["https://www.youtube.com/"])
}, 20_000)
