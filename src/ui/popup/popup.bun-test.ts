import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte"
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
    backend: scripted.backend, i18n: englishI18n(), platform: { browser: "chrome", os: "windows" } as const, private: false, windowId: 1,
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

test("Playing now shows the song from the tab it read and saves it there, as that tab's account, with Quick actions off", async () => {
  const saves: unknown[] = []
  popup({ ...agreed, "doc:settings": stamped({ musicActions: { on: false, feedback: true } }),
    [`doc:setup:${acct}`]: stamped({ musicSave: "PLm" }), [`cache:${acct}`]: { listAt: 1, playlists: [{ id: "PLm", title: "Mix" }], order: {}, created: [], labelAt: null } }, {
    "ui.playingNow": () => ({ kind: "song", tabId: 9, acct: acct as never, song: { videoId: "aaaaaaaaaaa" as never, title: "Song", artist: "Band", pos: 1, len: 100 } }),
    "ui.add": payload => { saves.push(payload); return { kind: "added", text: "Saved to Mix." } }
  }, { www: true, music: true, browserMenu: false })
  await userEvent.click(await screen.findByRole("tab", { name: "YouTube Music" }))
  await userEvent.click(await screen.findByRole("button", { name: "Save Song to Mix" }, { timeout: 5000 }))
  expect(await screen.findByText("Saved to Mix.")).toBeTruthy()
  expect(saves).toEqual([{ tabId: 9, acct, request: { site: "music", video: "aaaaaaaaaaa", title: "Song", via: "quick-save", opener: "playing-now" } }])
}, 20_000)

test("Recent adds names what made each add, Playing now and keys from any tab included", async () => {
  const entry = (feature: string, title: string) => ({ at: Date.now() - 60_000, source: { kind: "feature", feature }, gather: false,
    playlists: [{ id: "PLm", title: "Mix" }], videos: [{ id: "aaaaaaaaaaa", title }] })
  popup({ ...agreed }, { "ui.recentAdds": () => ({ kind: "recent", entries: [entry("playing-now", "Song"), entry("any-tab-keys", "Talk")] as never }) })
  await userEvent.click(await screen.findByRole("button", { name: "Recent adds" }))
  const sheet = await screen.findByRole("dialog", { name: "Recent adds" })
  expect(await within(sheet).findByText(/^Playing now/)).toBeTruthy()
  expect(within(sheet).getByText(/^Keys from any tab/)).toBeTruthy()
}, 20_000)

const gatherOn = { ...agreed, "doc:settings": stamped({ gather: { on: true, feedback: true, to: "playlist", order: "newest", close: true } }),
  [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" }, gather: "PLa" }), [`cache:${acct}`]: { listAt: 1, playlists: [{ id: "PLa", title: "Later" }], order: {}, created: [], labelAt: null } }
const line = (text: string, action: unknown = null, tone = "confirmation") => ({ kind: "line", line: { text, tone, action } }) as never

test("Gather answers in its row with Undo, and Undo answers there too", async () => {
  const calls: string[] = []
  popup(gatherOn, {
    "ui.gathers": () => { calls.push("gathers"); return { kind: "gathers", running: false, line: null } },
    "ui.gather": () => { calls.push("gather"); return line("Saved 3 videos to Later and closed their tabs.", { kind: "undo", id: "g1" }) },
    "ui.gatherUndo": payload => { calls.push(`undo ${payload.id}`); return line("Removed 3 videos from Later and reopened their tabs.") }
  })
  await userEvent.click(await screen.findByRole("button", { name: "Gather" }))
  expect(await screen.findByText("Saved 3 videos to Later and closed their tabs.")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Undo" }))
  expect(await screen.findByText("Removed 3 videos from Later and reopened their tabs.")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
  expect(calls).toEqual(["gathers", "gather", "undo g1"])
})

test("Enter gathers while nothing in the popup has focus, and keeps its own meaning on a focused control", async () => {
  let gathers = 0
  popup(gatherOn, {
    "ui.gathers": () => ({ kind: "gathers", running: false, line: { text: "Last gather: 2 videos into Later, 5 minutes ago", tone: "muted", action: { kind: "undo", id: "g0" } } }),
    "ui.gather": () => { gathers++; return line("Gathered 4 videos into YouTube's player.") }
  })
  expect(await screen.findByText("Last gather: 2 videos into Later, 5 minutes ago")).toBeTruthy()
  screen.getByRole("switch", { name: "Gather tabs" }).focus()
  await userEvent.keyboard("{Enter}")
  expect(gathers).toBe(0)
  ;(document.activeElement as HTMLElement | null)?.blur()
  await userEvent.keyboard("{Enter}")
  expect(await screen.findByText("Gathered 4 videos into YouTube's player.")).toBeTruthy()
  expect(gathers).toBe(1)
})

test("a gather's progress and result pushed for this window show in the row, and only its result counts as shown", async () => {
  const { scripted } = popup(gatherOn, { "ui.gathers": () => ({ kind: "gathers", running: false, line: null }) })
  await screen.findByRole("button", { name: "Gather" })
  expect(scripted.pushGather({ windowId: 1, running: true, line: { text: "Checking 12 of 40…", tone: "muted", action: null } })).toBeUndefined()
  expect(await screen.findByText("Checking 12 of 40…")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Gather" })).toHaveAttribute("aria-disabled", "true")
  expect(scripted.pushGather({ windowId: 1, running: false, line: { text: "Saved 40 videos to Later.", tone: "confirmation", action: { kind: "undo", id: "g2" } } }))
    .toEqual({ shown: true })
  expect(await screen.findByText("Saved 40 videos to Later.")).toBeTruthy()
  expect(scripted.pushGather({ windowId: 7, running: false, line: { text: "Elsewhere", tone: "confirmation", action: null } })).toBeUndefined()
})

test("a failure shows its own action, and a gather with no gather playlist opens the chooser, then gathers once one is picked", async () => {
  let gathers = 0
  const { opened } = popup({ ...gatherOn, [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" } }) }, {
    "ui.gathers": () => ({ kind: "gathers", running: false, line: null }),
    "ui.gather": () => ++gathers === 1 ? line("Choose a gather playlist for Ann first.", { kind: "choose" }, "muted") : line("Saved 2 videos to Later."),
    "ui.playlists": payload => payload.action === "open"
      ? { kind: "open", operation: payload.operation, cached: { rows: [{ id: "PLa" as never, title: "Later" }], at: Date.now() }, freshness: "fresh", refresh: null }
      : { kind: "released", operation: payload.operation },
    "ui.change": payload => ({ kind: "destination", outcome: { kind: "confirmed", playlist: (payload.change as unknown as { playlist: never }).playlist } })
  })
  await userEvent.click(await screen.findByRole("button", { name: "Gather" }))
  expect(await screen.findByText("Choose a gather playlist for Ann first.")).toBeTruthy()
  expect(await screen.findByRole("button", { name: "Gather playlist: No playlist chosen" }, { timeout: 5000 })).toHaveAttribute("aria-expanded", "true")
  expect(opened).toEqual([])
  // happy-dom leaves the floating picker unpositioned, so its rows count as hidden to role queries.
  const row = await waitFor(() => { const found = document.querySelector<HTMLElement>('[data-picker-row="PLa"]'); if (!found) throw Error("no row"); return found }, { timeout: 5000 })
  await userEvent.click(row)
  expect(await screen.findByText("Saved 2 videos to Later.")).toBeTruthy()
  expect(gathers).toBe(2)
}, 20_000)

test("the claim result shows once with what Perchling left out, and OK dismisses it for the account it named (ACC-32)", async () => {
  const seen: unknown[] = []
  popup({ ...agreed, device: { ...agreed.device, claimNotice: { acct, dropped: 2, claim: { autoAddAdded: 1, filtersAdded: 0, shortcut: { kind: "filled", shortcut: "orig01" } } } },
    [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" } }) }, { "ui.claimSeen": payload => { seen.push(payload); return { kind: "noted" } } })
  expect(await screen.findByText("Perchling set up your 1.x auto-add playlists and shortcut for Ann.", {}, { timeout: 5000 })).toBeTruthy()
  expect(screen.getByText("Perchling left out 2 of them, because they weren't on this account.")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "OK" }))
  expect(seen).toEqual([{ acct }])
})

test("a claim that skipped the shortcut names that on its own and claims nothing about it (REL-MIG-37)", async () => {
  popup({ ...agreed, device: { ...agreed.device, claimNotice: { acct, dropped: 0, claim: { autoAddAdded: 1, filtersAdded: 0, shortcut: { kind: "skipped", reason: "deleted-original" } } } },
    [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" } }) })
  expect(await screen.findByText("Perchling checked your choices from 1.x for Ann.", {}, { timeout: 5000 })).toBeTruthy()
  expect(screen.getByText("Your 1.x shortcut was deleted, so Perchling left it out.")).toBeTruthy()
})

test("the unclaimed 1.x setup offers Switch account and Discard, which deletes it (ACC-33)", async () => {
  let discarded = 0
  const { opened } = popup({ ...agreed, unclaimed: { from: "1.4.5", at: 1, autoAdd: [], shortcutPlaylist: null, filters: {} } },
    { "ui.discardUnclaimed": () => { discarded++; return { kind: "discarded" } } })
  expect(await screen.findByText("Your playlists from 1.x belong to another YouTube account.", {}, { timeout: 5000 })).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Switch account" }))
  expect(opened).toEqual(["https://www.youtube.com/channel_switcher"])
  await userEvent.click(screen.getByRole("button", { name: "Discard" }))
  expect(discarded).toBe(1)
})

test("with two setups the header's account is a menu of which setup to show, which changes only what the popup shows (UI-POP-07)", async () => {
  const bea = "BBBBBBBBBBBBBBBB"
  const { opened } = popup({ ...agreed, "doc:settings": stamped({ autoAdd: { on: true, feedback: true, pct: 50 } }),
    [`doc:setup:${acct}`]: stamped({ label: { name: "Ann", handle: "@ann" }, autoAdd: [{ pl: "PLa", takes: "videos" }] }),
    [`doc:setup:${bea}`]: stamped({ label: { name: "Bea" }, autoAdd: [{ pl: "PLb", takes: "videos" }, { pl: "PLc", takes: "videos" }] }) })
  const button = await screen.findByRole("button", { name: "Show the setup for" }, { timeout: 5000 })
  expect(await screen.findByText("1 playlist · adds at 50 %")).toBeTruthy()
  await userEvent.click(button)
  const menu = await screen.findByRole("menu", { name: "Show the setup for" }, { timeout: 5000 })
  expect(within(menu).getAllByRole("menuitemradio").map(item => [item.textContent?.trim(), item.getAttribute("aria-checked")])).toEqual([["Ann@ann", "true"], ["Bea", "false"]])
  expect(within(menu).getByText("This only changes what you see here. YouTube stays on the account you're signed in as.")).toBeTruthy()
  expect(within(menu).queryByRole("menuitem", { name: "Sign in" })).toBeNull()
  await userEvent.click(within(menu).getByRole("menuitemradio", { name: /Bea/ }))
  expect(screen.queryByRole("menu")).toBeNull()
  expect(await screen.findByText("2 playlists · adds at 50 %")).toBeTruthy()
  expect(within(screen.getByRole("button", { name: "Show the setup for" })).getByText("Bea")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Show the setup for" }))
  await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Manage account setups" }))
  expect(opened).toEqual(["settings#accounts"])
})

test("with one setup the header's account is a label, not a menu", async () => {
  popup({ ...agreed, [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" } }) })
  expect(await screen.findByText("Ann", {}, { timeout: 5000 })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Show the setup for" })).toBeNull()
})

const thisVideo = (video: Record<string, unknown> = {}) => ({ kind: "video", tabId: 4, acct, video: { video: "aaaaaaaaaaa", title: "First video",
  state: { kind: "counting", goal: 50, watched: 30 }, watched: 30, playlists: [{ pl: "PLa", pct: 50, outcome: "waiting" }, { pl: "PLb", pct: 90, outcome: "waiting" }],
  channel: { id: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "Band", handle: "@band" }, ...video } }) as never
const videoSetup = (filters: Record<string, unknown> = {}) => ({ ...agreed, "doc:settings": stamped({ autoAdd: { on: true, feedback: true, pct: 50 } }),
  [`doc:setup:${acct}`]: stamped({ label: { name: "Ann" }, autoAdd: [{ pl: "PLa", takes: "videos" }, { pl: "PLb", takes: "both", pct: 90 }] }),
  [`cache:${acct}`]: { listAt: 1, playlists: [{ id: "PLa", title: "Music" }, { id: "PLb", title: "Talks" }], order: {}, created: [], labelAt: null }, ...filters })

test("This video shows the tab's video, its status line and a watched meter with a tick per goal (UI-POP-12, UI-POP-13)", async () => {
  popup(videoSetup(), { "ui.thisTab": () => thisVideo() })
  const card = await screen.findByRole("region", { name: "This video" }, { timeout: 5000 })
  expect(await within(card).findByText("First video")).toBeTruthy()
  expect(within(card).getByText("Auto-adds at 50 % · 30 % watched")).toBeTruthy()
  const meter = within(card).getByRole("meter", { name: "30 % watched" })
  expect(meter).toHaveAttribute("aria-valuenow", "30")
  expect([...meter.querySelectorAll("[data-goal]")].map(tick => [tick.getAttribute("data-goal"), tick.getAttribute("data-reached")])).toEqual([["50", "false"], ["90", "false"]])
})

test("This video's details list each playlist's outcome, and Don't auto-add skips the video for the tab's account (UI-POP-14)", async () => {
  const skips: unknown[] = []
  popup(videoSetup(), { "ui.thisTab": () => thisVideo({ state: { kind: "partly", added: ["PLa"], pending: ["PLb"], goal: 90 }, watched: 60,
    playlists: [{ pl: "PLa", pct: 50, outcome: "added" }, { pl: "PLb", pct: 90, outcome: "waiting" }] }),
    "ui.skip": payload => { skips.push(payload); return { kind: "skipped" } } })
  const card = await screen.findByRole("region", { name: "This video" }, { timeout: 5000 })
  expect(await within(card).findByText("Added to Music · Talks at 90 %")).toBeTruthy()
  await userEvent.click(within(card).getByRole("button", { name: "Details" }))
  const details = card.querySelector("[data-this-video-details]") as HTMLElement
  expect([...details.querySelectorAll("li")].map(row => row.textContent)).toEqual(["MusicAuto-added", "TalksAt 90 %"])
  await userEvent.click(within(card).getByRole("button", { name: "Don't auto-add this video" }))
  expect(skips).toEqual([{ tabId: 4, acct, video: "aaaaaaaaaaa", skip: true }])
})

test("a skipped video reads Not auto-adding this video with Undo, which unskips it (UI-POP-12, R23)", async () => {
  const skips: unknown[] = []
  popup(videoSetup(), { "ui.thisTab": () => thisVideo({ state: { kind: "skipped" }, playlists: [{ pl: "PLa", pct: 50, outcome: "skipped" }] }),
    "ui.skip": payload => { skips.push(payload); return { kind: "unskipped" } } })
  const card = await screen.findByRole("region", { name: "This video" }, { timeout: 5000 })
  expect(await within(card).findByText("Not auto-adding this video")).toBeTruthy()
  await userEvent.click(within(card).getByRole("button", { name: "Undo" }))
  expect(skips).toEqual([{ tabId: 4, acct, video: "aaaaaaaaaaa", skip: false }])
})

test("this channel's controls list it in a playlist's filter, and ask before clearing kept channels of the other mode (YT-CF-15)", async () => {
  const changes: unknown[] = []
  popup(videoSetup({ [`doc:filter:${acct}:PLb`]: { ...(stamped({ mode: "deny", on: false, channels: [["UCbbbbbbbbbbbbbbbbbbbbbb", "Talk"], ["UCcccccccccccccccccccccc", "Chat"]] }) as object), gen: "gen-b" } }),
    { "ui.thisTab": () => thisVideo(), "ui.filterChannel": payload => { changes.push(payload.change); return { kind: "confirmed" } } })
  const card = await screen.findByRole("region", { name: "This video" }, { timeout: 5000 })
  await userEvent.click(await within(card).findByRole("button", { name: "Details" }))
  expect(within(card).getByText("Channel filters · Band")).toBeTruthy()
  const music = card.querySelector("[data-channel-row=PLa]") as HTMLElement
  await userEvent.click(within(music).getByRole("button", { name: "Deny" }))
  const talks = card.querySelector("[data-channel-row=PLb]") as HTMLElement
  await userEvent.click(within(talks).getByRole("button", { name: "Allow only" }))
  const ask = within(card).getByRole("alertdialog")
  expect(within(ask).getByText("Turn on Allow only for Talks? This clears its 2 denied channels.")).toBeTruthy()
  await userEvent.click(within(ask).getByRole("button", { name: "Switch" }))
  expect(changes).toEqual([
    { acct, playlist: "PLa", channel: ["UCaaaaaaaaaaaaaaaaaaaaaa", "Band", "@band"], action: "list", mode: "deny", clearListed: false, expectedGeneration: null },
    { acct, playlist: "PLb", channel: ["UCaaaaaaaaaaaaaaaaaaaaaa", "Band", "@band"], action: "list", mode: "allow", clearListed: true, expectedGeneration: "gen-b" }
  ])
})

test("Playing now's save offers Undo in its line, which takes the song back in the same tab as the same account (YM-POP-3)", async () => {
  const undos: unknown[] = []
  popup({ ...agreed, [`doc:setup:${acct}`]: stamped({ musicSave: "PLm" }), [`cache:${acct}`]: { listAt: 1, playlists: [{ id: "PLm", title: "Mix" }], order: {}, created: [], labelAt: null } }, {
    "ui.playingNow": () => ({ kind: "song", tabId: 9, acct: acct as never, song: { videoId: "aaaaaaaaaaa" as never, title: "Song", artist: "Band", pos: 1, len: 100 } }),
    "ui.add": () => ({ kind: "added", text: "Saved to Mix.", undo: { kind: "add", id: "u1" } }),
    "ui.addUndo": payload => { undos.push(payload); return { kind: "undone" } }
  }, { www: true, music: true, browserMenu: false })
  await userEvent.click(await screen.findByRole("tab", { name: "YouTube Music" }))
  await userEvent.click(await screen.findByRole("button", { name: "Save Song to Mix" }, { timeout: 5000 }))
  expect(await screen.findByText("Saved to Mix.")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Undo" }))
  expect(undos).toEqual([{ tabId: 9, acct, handle: { kind: "add", id: "u1" } }])
  await waitFor(() => expect(screen.queryByText("Saved to Mix.")).toBeNull())
}, 20_000)
