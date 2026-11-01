import { expect, mock, test } from "bun:test"
import { fireEvent, render, screen, within } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { flushSync } from "svelte"
import { toBeVisible } from "@testing-library/jest-dom/matchers"
import { PickerModel } from "../../shared/picker/model.svelte"
import type { PickerOptions } from "../../shared/picker/model.svelte"
import { isAccountKey } from "../../shared/model"
import { chooserSource, itemSource, NOW, playlist, entry, settle, undoing } from "../../../tools/fixtures/picker-model/fake-source"
import type { Ledger } from "../../../tools/fixtures/picker-model/fake-source"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import "../../../tools/fixtures/picker-ui/synthetic-layout"
import type { ChooserContext, ChooserRelease, PickerEvent } from "./types"
import { createPickerText } from "./text"
import PickerPanel from "./PickerPanel.svelte"
import PlaylistChooser from "./PlaylistChooser.svelte"

function visible(element: HTMLElement) { expect({ visible: toBeVisible(element).pass, text: element.textContent }).toEqual({ visible: true, text: element.textContent }) }

const alpha = playlist("PLalpha")
const beta = playlist("PLbeta")
const text = createPickerText(englishI18n())
const rows = [
  { id: alpha, title: "Synthetic Alpha", privacy: "PRIVATE", count: 1 },
  { id: beta, title: "Synthetic Beta", privacy: "UNLISTED", count: 2 }
] satisfies NonNullable<Awaited<ReturnType<PickerOptions["source"]["cachedList"]>>>["rows"]

function panel(options: PickerOptions) {
  const onoutcome = mock((_: PickerEvent) => {})
  const onrequestclose = mock(() => {})
  const picker = new PickerModel(options)
  const view = render(PickerPanel, { picker, text, purpose: { kind: "save" }, platform: "linux", onoutcome, onrequestclose })
  return { ...view, picker, onoutcome, onrequestclose }
}

async function list(ledger: Ledger) {
  ledger.answer("cachedList", { rows, at: NOW })
  await settle()
  flushSync()
}

test("cached rows work before membership arrives, and a pending action keeps focus and dispatches once", async () => {
  const { source, ledger } = itemSource()
  const view = panel({ source, site: "www", mode: "save" })
  await list(ledger)
  const search = screen.getByRole("searchbox", { name: "Search playlists" })
  expect(search).toHaveFocus()
  visible(screen.getByText("Checking where this video already is…"))
  const row = screen.getByRole("checkbox", { name: "Synthetic Alpha" })
  expect(row).not.toBeDisabled()
  await userEvent.setup().click(row)
  await userEvent.setup().click(row)
  expect(ledger.calls("add")).toEqual([[alpha]])
  expect(row).toHaveFocus()
  expect(row.getAttribute("aria-busy")).toBe("true")
  expect(row.getAttribute("aria-checked")).toBe("false")
  ledger.answer("add", { kind: "added", entry: entry("entry-alpha"), undo: undoing() })
  await settle(); flushSync()
  expect(row.getAttribute("aria-checked")).toBe("true")
  expect(view.onoutcome).toHaveBeenCalledWith({ kind: "tick", id: alpha, outcome: { kind: "added" } })
  expect(view.onoutcome).toHaveBeenCalledTimes(1)
})

test("pending removal stays checked, then a failed removal stays checked with its failure", async () => {
  const { source, ledger } = itemSource()
  panel({ source, site: "www", mode: "save" })
  await list(ledger)
  ledger.answer("membership", { kind: "read", rows: [{ ...rows[0]!, contains: true }] })
  await settle(); flushSync()
  const row = screen.getByRole("checkbox", { name: "Synthetic Alpha" })
  await userEvent.setup().click(row)
  expect(row.getAttribute("aria-checked")).toBe("true")
  expect(row).toHaveFocus()
  ledger.answer("remove", { kind: "failed" })
  await settle(); flushSync()
  expect(row.getAttribute("aria-checked")).toBe("true")
  visible(screen.getByText("Couldn't remove"))
})

test("ArrowDown, Home, End, arrows, Space and Enter activate only their intended row", async () => {
  const { source, ledger } = chooserSource()
  panel({ source, site: "www", mode: "many" })
  await list(ledger)
  const user = userEvent.setup()
  const first = screen.getByRole("checkbox", { name: "Synthetic Alpha" })
  const last = screen.getByRole("checkbox", { name: "Synthetic Beta" })
  await user.keyboard("{ArrowDown}")
  expect(first).toHaveFocus()
  await user.keyboard("{End}")
  expect(last).toHaveFocus()
  await user.keyboard("{ArrowUp}")
  expect(first).toHaveFocus()
  await user.keyboard("{ArrowDown}")
  expect(last).toHaveFocus()
  await user.keyboard("{Home}{Enter}")
  expect(ledger.calls("choose")).toEqual([[alpha, true]])
  ledger.answer("choose", { ok: true })
  await settle(); flushSync()
  await fireEvent.keyDown(screen.getByRole("checkbox", { name: "Synthetic Alpha" }), { key: "Enter", code: "Enter", repeat: true, bubbles: true, composed: true })
  await settle(); flushSync()
  expect(ledger.calls("choose")).toEqual([[alpha, true]])
  await user.keyboard(" ")
  expect(ledger.calls("choose")).toEqual([[alpha, true], [alpha, false]])
  ledger.answer("choose", { refused: "invalid" })
  await settle(); flushSync()
  expect(first.getAttribute("aria-checked")).toBe("true")
})

test("Enter in search chooses the first match once and text editing keeps its normal keys", async () => {
  const { source, ledger } = chooserSource()
  panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  const search = screen.getByRole("searchbox")
  await userEvent.setup().type(search, "Beta")
  await fireEvent.keyDown(search, { key: "Home" })
  expect(search).toHaveFocus()
  await fireEvent.keyDown(search, { key: "Enter" })
  await fireEvent.keyDown(search, { key: "Enter", repeat: true })
  expect(ledger.calls("choose")).toEqual([[beta, true]])
})

test("Escape is contained and requests closure without turning a model answer into closure", async () => {
  const { source, ledger } = chooserSource()
  const view = panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  const outside = mock(() => {})
  document.addEventListener("keydown", outside)
  try {
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Synthetic Alpha" }))
    ledger.answer("choose", { ok: true })
    await settle(); flushSync()
    expect(view.onrequestclose).not.toHaveBeenCalled()
    await userEvent.setup().keyboard("{Escape}")
    expect(outside).not.toHaveBeenCalled()
    expect(view.onrequestclose).toHaveBeenCalledWith({ reason: "escape" })
  } finally { document.removeEventListener("keydown", outside) }
})

test("a refused choose keeps the real prior choice and exposes the exact refusal", async () => {
  const { source, ledger } = chooserSource({ chosen: [alpha] })
  const view = panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Synthetic Beta" }))
  ledger.answer("choose", { refused: "sync-full" })
  await settle(); flushSync()
  expect(screen.getByRole("checkbox", { name: "Synthetic Alpha" }).getAttribute("aria-checked")).toBe("true")
  expect(screen.getByRole("checkbox", { name: "Synthetic Beta" }).getAttribute("aria-checked")).toBe("false")
  expect(view.onoutcome).toHaveBeenCalledWith({ kind: "tick", id: beta, outcome: { kind: "refused", reason: "sync-full" } })
  expect(view.onrequestclose).not.toHaveBeenCalled()
})

test("a saved item with a refused choice remains a partial outcome and does not close", async () => {
  const { source, ledger } = itemSource({ chosen: [beta] })
  const view = panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Synthetic Alpha" }))
  ledger.answer("add", { kind: "added", entry: entry("entry-alpha"), undo: undoing() })
  await settle(); flushSync()
  ledger.answer("choose", { refused: "sync-full" })
  await settle(); flushSync()
  visible(screen.getByText("This choice wasn't saved because browser sync is full."))
  expect(screen.getByRole("checkbox", { name: "Synthetic Beta" }).getAttribute("aria-checked")).toBe("true")
  expect(screen.getByRole("checkbox", { name: "Synthetic Alpha" }).getAttribute("aria-checked")).toBe("false")
  expect(view.onrequestclose).not.toHaveBeenCalled()
})

test("no-tab keeps cached rows usable, disables refresh and explains creation", async () => {
  const { source, ledger } = chooserSource({ tab: false })
  panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  expect(screen.getByRole("button", { name: "Refresh playlists" })).toBeDisabled()
  expect(screen.getByRole("checkbox", { name: "Synthetic Alpha" })).not.toBeDisabled()
  visible(screen.getByText(/^Saved list from /))
  visible(screen.getByText("Open YouTube to create playlists"))
  expect(ledger.calls("freshList")).toEqual([])
})

test("list failure is visible, and refresh never invents a successful answer", async () => {
  const { source, ledger } = chooserSource()
  const view = panel({ source, site: "www", mode: "choose" })
  ledger.answer("cachedList", null)
  await settle(); flushSync()
  ledger.answer("freshList", { kind: "failed" })
  await settle(); flushSync()
  visible(screen.getByText("Playlist data is unavailable. Refresh playlists to try again."))
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh playlists" }))
  ledger.answer("freshList", { kind: "failed" })
  await settle(); flushSync()
  visible(screen.getByText("Couldn't refresh playlists. Try again."))
  expect(view.onoutcome).toHaveBeenCalledWith({ kind: "refresh", outcome: { kind: "failed" } })
})

test("creation validates, permits duplicate titles, preserves typed text on failure and submits once", async () => {
  const { source, ledger } = chooserSource()
  const view = panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "New playlist" }))
  const title = screen.getByRole("textbox", { name: "Title" })
  expect(title).toHaveFocus()
  expect(screen.getByRole("button", { name: /^Create$/ })).toBeDisabled()
  await user.type(title, "<bad>")
  await user.tab()
  visible(screen.getByText("Titles can't contain < or >"))
  await user.clear(title)
  await user.type(title, "Synthetic Alpha")
  visible(screen.getByText("You already have a playlist called Synthetic Alpha."))
  const create = screen.getByRole("button", { name: /^Create$/ })
  expect(create).not.toBeDisabled()
  await user.click(create)
  await user.click(create)
  expect(ledger.calls("create")).toEqual([[{ title: "Synthetic Alpha", privacy: "PRIVATE" }]])
  ledger.answer("create", { kind: "failed", reason: "rateLimited" })
  await settle(); flushSync()
  expect(title).toHaveValue("Synthetic Alpha")
  visible(screen.getByText("YouTube won't create more playlists right now. Try again in a few minutes."))
  expect(view.onoutcome).toHaveBeenCalledWith({ kind: "create", outcome: { kind: "failed", reason: "rateLimited" } })
})

test("creation followed by a refused selection keeps the refusal visible and does not close the picker", async () => {
  const { source, ledger } = chooserSource()
  const view = panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "New playlist" }))
  await user.type(screen.getByRole("textbox", { name: "Title" }), "Synthetic created")
  await user.click(screen.getByRole("button", { name: /^Create$/ }))
  ledger.answer("create", { kind: "created", id: playlist("PLcreated"), undo: null })
  await settle(); flushSync()
  ledger.answer("choose", { refused: "sync-full" })
  await settle(); flushSync()
  expect(screen.queryByRole("form", { name: "New playlist" })).not.toBeNull()
  visible(within(screen.getByRole("form", { name: "New playlist" })).getByText("This choice wasn't saved because browser sync is full."))
  visible(screen.getByRole("form", { name: "New playlist" }))
  expect(view.onrequestclose).not.toHaveBeenCalled()
})

test("sort stays visibly confirmed while pending and reverts after refusal", async () => {
  const { source, ledger } = chooserSource()
  panel({ source, site: "www", mode: "many" })
  await list(ledger)
  const control = screen.getByRole("switch", { name: "Sort A–Z" })
  await userEvent.setup().click(control)
  expect(control.getAttribute("aria-checked")).toBe("false")
  await userEvent.setup().click(control)
  expect(ledger.calls("saveSortAZ")).toEqual([[true]])
  ledger.answer("saveSortAZ", { refused: "invalid" })
  await settle(); flushSync()
  expect(control.getAttribute("aria-checked")).toBe("false")
  visible(screen.getByText("The sort order wasn't saved. The previous order is shown."))
})

function context(): ChooserContext {
  const account = "synthetic_acct_1"
  if (!isAccountKey(account)) throw new Error("Invalid synthetic account")
  return { account, site: "www", private: false, purpose: { kind: "gather", accountName: "Synthetic account" } }
}

test("chooser is controlled, shows the supplied title, and uses independent models for independent opens", async () => {
  const first = chooserSource()
  const second = chooserSource()
  const ledgers = [first.ledger, second.ledger]
  let opens = 0
  const createSource = mock(() => {
    const source = [first.source, second.source][opens++]
    if (!source) throw new Error("Unexpected open")
    return source
  })
  const onrequest = mock(() => {})
  const onrelease = mock((event: ChooserRelease) => { event.picker.close() })
  const props = {
    open: false, context: context(), current: { kind: "playlist", id: beta, title: "Actual supplied title" },
    label: "Synthetic destination", availability: { kind: "available" }, createSource, text,
    platform: "linux", onrequest, onoutcome: mock(() => {}), onrelease
  } satisfies import("./types").PlaylistChooserProps
  const view = render(PlaylistChooser, { props })
  const trigger = screen.getByRole("button", { name: "Synthetic destination: Actual supplied title" })
  await userEvent.setup().click(trigger)
  expect(onrequest).toHaveBeenCalledWith({ kind: "open" })
  expect(createSource).not.toHaveBeenCalled()
  await view.rerender({ ...props, open: true })
  await list(ledgers[0]!)
  expect(screen.getByRole("searchbox")).toHaveFocus()
  await userEvent.setup().keyboard("{Escape}")
  expect(onrequest).toHaveBeenCalledWith({ kind: "close", reason: "escape" })
  await view.rerender({ ...props, open: false })
  expect(onrelease).toHaveBeenCalledWith(expect.objectContaining({ kind: "released", reason: "caller", context: props.context, pending: [] }))
  await settle(); flushSync()
  expect(trigger).toHaveFocus()
  await view.rerender({ ...props, open: true })
  await list(ledgers[1]!)
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Synthetic Alpha" }))
  expect(second.ledger.calls("choose")).toEqual([[alpha, true]])
  expect(first.ledger.calls("choose")).toEqual([])
})

test("private gather chooser is disabled with the exact explanation and performs no read", () => {
  const createSource = mock(() => chooserSource().source)
  render(PlaylistChooser, { props: {
    open: true, context: { ...context(), private: true }, current: { kind: "none" }, label: "Gather playlist",
    availability: { kind: "available" }, createSource, text, platform: "linux", onrequest: () => {}, onoutcome: () => {}, onrelease: (event: ChooserRelease) => event.picker.close()
  } })
  expect(screen.getByRole("button", { name: "Gather playlist: No playlist chosen" })).toBeDisabled()
  visible(screen.getByText("The gather playlist can't be changed in a private window."))
  expect(createSource).not.toHaveBeenCalled()
})

test("a private item's pick exposes its skipped choice without a default confirmation or closure", async () => {
  const { source, ledger } = itemSource({ private: true })
  const view = panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Synthetic Alpha" }))
  ledger.answer("add", { kind: "already-in" })
  await settle(); flushSync()
  expect(ledger.calls("choose")).toEqual([])
  expect(view.onoutcome).toHaveBeenCalledWith({ kind: "tick", id: alpha, outcome: { kind: "picked", id: alpha, save: "already-in", undo: null, choice: { skipped: "private" } } })
  expect(view.onrequestclose).not.toHaveBeenCalled()
  expect(screen.getByRole("checkbox", { name: "Synthetic Alpha" }).getAttribute("aria-checked")).toBe("false")
})

test("a failed save reports failure in place and does not display a checked fact", async () => {
  const { source, ledger } = itemSource()
  panel({ source, site: "www", mode: "save" })
  await list(ledger)
  const row = screen.getByRole("checkbox", { name: "Synthetic Alpha" })
  await userEvent.setup().click(row)
  ledger.answer("add", { kind: "failed" })
  await settle(); flushSync()
  expect(row).toHaveFocus()
  expect(row.getAttribute("aria-checked")).toBe("false")
  visible(screen.getByText("Couldn't save"))
})

test("unreadable membership and unknown list facts stay explicit", async () => {
  const { source, ledger } = itemSource()
  panel({ source, site: "music", mode: "save" })
  ledger.answer("cachedList", { rows: [{ id: alpha, title: "Synthetic Alpha" }], at: NOW })
  ledger.answer("membership", { kind: "unreadable" })
  await settle(); flushSync()
  visible(screen.getByText("Couldn't check where this song already is"))
  visible(screen.getByText("Visibility unavailable"))
  expect(screen.queryByText(/\d+ songs?/)).toBeNull()
})

test("a missing title is not replaced with a playlist identifier", async () => {
  const gone = playlist("PLgone")
  const { source, ledger } = chooserSource({ chosen: [gone] })
  const view = panel({ source, site: "www", mode: "choose" })
  ledger.answer("cachedList", { rows: [], at: NOW })
  await settle(); flushSync()
  visible(screen.getByRole("checkbox", { name: "Playlist title unavailable" }))
  visible(screen.getByText("No longer on YouTube, or not this account's"))
  expect(view.container.textContent).not.toContain("PLgone")
})

test("empty search does not clear a stored choice and can return to the list", async () => {
  const { source, ledger } = chooserSource({ chosen: [alpha] })
  panel({ source, site: "www", mode: "many" })
  await list(ledger)
  const user = userEvent.setup()
  const search = screen.getByRole("searchbox")
  await user.type(search, "Absent")
  visible(screen.getByText("No playlists match your search."))
  expect(screen.queryByRole("checkbox")).toBeNull()
  await user.clear(search)
  expect(screen.getByRole("checkbox", { name: "Synthetic Alpha" }).getAttribute("aria-checked")).toBe("true")
  expect(ledger.calls("choose")).toEqual([])
})

test.each([
  ["signedOut", "Sign in to YouTube to create playlists"],
  ["noChannel", "This account needs a YouTube channel to create playlists"]
] as const)("%s explains unavailable creation without reading or writing a creation", async (creation, message) => {
  const { source, ledger } = chooserSource({ creation })
  panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  visible(screen.getByText(message))
  expect(screen.queryByRole("button", { name: "New playlist" })).toBeNull()
  expect(ledger.calls("create")).toEqual([])
  expect(screen.getByRole("checkbox", { name: "Synthetic Alpha" })).not.toBeDisabled()
})

test("150 code points are accepted, longer titles are rejected, and creation trims the actual input", async () => {
  const { source, ledger } = chooserSource()
  panel({ source, site: "www", mode: "choose" })
  await list(ledger)
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "New playlist" }))
  const title = screen.getByRole("textbox", { name: "Title" })
  const create = screen.getByRole("button", { name: /^Create$/ })
  await fireEvent.input(title, { target: { value: "🌱".repeat(151) } })
  await fireEvent.blur(title)
  expect(create).toBeDisabled()
  visible(screen.getByText("Titles can contain at most 150 characters."))
  await fireEvent.input(title, { target: { value: "  " + "🌱".repeat(150) + "  " } })
  expect(create).not.toBeDisabled()
  await user.click(create)
  expect(ledger.calls("create")).toEqual([[{ title: "🌱".repeat(150), privacy: "PRIVATE" }]])
})

test("marks remove only a many-mode choice, and a refused pin leaves the actual pin in place", async () => {
  const many = chooserSource({ chosen: [alpha], marks: new Map([[alpha, "missing"], [beta, "full"]]) })
  const view = panel({ source: many.source, site: "www", mode: "many" })
  await list(many.ledger)
  visible(screen.getByText("Missing"))
  visible(screen.getByText("Full"))
  await userEvent.setup().click(screen.getByRole("button", { name: "Remove Synthetic Alpha from this choice" }))
  expect(many.ledger.calls("choose")).toEqual([[alpha, false]])
  expect(many.ledger.calls("remove")).toEqual([])
  many.ledger.answer("choose", { refused: "invalid" })
  await settle(); flushSync()
  expect(screen.getByRole("checkbox", { name: "Synthetic Alpha" }).getAttribute("aria-checked")).toBe("true")
  view.unmount()
  const pin = chooserSource({ quickSave: alpha })
  panel({ source: pin.source, site: "www", mode: "choose" })
  await list(pin.ledger)
  const control = screen.getByRole("button", { name: "Use Synthetic Beta for one-click save" })
  await userEvent.setup().click(control)
  pin.ledger.answer("pin", { refused: "sync-full" })
  await settle(); flushSync()
  expect(control.getAttribute("aria-pressed")).toBe("false")
  expect(screen.getByRole("button", { name: "One-click save goes to Synthetic Alpha" }).getAttribute("aria-pressed")).toBe("true")
})

function firstPick(options: Parameters<typeof itemSource>[0] = {}) {
  const { source, ledger } = itemSource(options)
  const onoutcome = mock((_: PickerEvent) => {})
  const picker = new PickerModel({ source, site: "www", mode: "choose" })
  render(PickerPanel, { picker, text, purpose: { kind: "quickSave" }, platform: "linux", onoutcome, onrequestclose: () => {} })
  return { picker, ledger, onoutcome }
}

test("a private first pick confirms the save and says the playlist choice isn't kept", async () => {
  const { ledger } = firstPick({ private: true })
  await list(ledger)
  const row = screen.getByRole("checkbox", { name: "Synthetic Alpha" })
  await userEvent.setup().click(row)
  ledger.answer("add", { kind: "added", entry: entry("entry-alpha"), undo: undoing() })
  await settle(); flushSync()
  visible(screen.getByText("Saved. Private windows don't keep your playlist choice."))
  expect(ledger.calls("choose")).toEqual([])
  expect(screen.getByRole("button", { name: "Use Synthetic Alpha for one-click save" })).toBeDisabled()
})

test("a refused first-pick choice keeps the picker open with the save, the failure, Undo, and a choice-only retry", async () => {
  const { picker, ledger } = firstPick()
  await list(ledger)
  const row = screen.getByRole("checkbox", { name: "Synthetic Alpha" })
  await userEvent.setup().click(row)
  ledger.answer("add", { kind: "added", entry: entry("entry-alpha"), undo: undoing() })
  await settle()
  ledger.answer("choose", { refused: "sync-full" })
  await settle(); flushSync()
  expect(picker.closed).toBe(false)
  visible(screen.getByText("Saved this video to Synthetic Alpha"))
  visible(screen.getByText("This choice wasn't saved because browser sync is full."))
  visible(screen.getByRole("button", { name: "Undo" }))
  await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }))
  await settle()
  expect(ledger.calls("add")).toEqual([[alpha]])
  expect(ledger.calls("choose")).toEqual([[alpha, true], [alpha, true]])
  ledger.answer("choose", { ok: true })
  await settle(); flushSync()
  expect(screen.queryByText("This choice wasn't saved because browser sync is full.")).toBeNull()
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
  expect(row.getAttribute("aria-checked")).toBe("true")
})

test("Undo after a refused first-pick choice removes the save", async () => {
  const { ledger } = firstPick()
  await list(ledger)
  const undo = mock(() => Promise.resolve({ kind: "undone" } as const))
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Synthetic Alpha" }))
  ledger.answer("add", { kind: "added", entry: entry("entry-alpha"), undo })
  await settle()
  ledger.answer("choose", { refused: "update-needed" })
  await settle(); flushSync()
  await userEvent.setup().click(screen.getByRole("button", { name: "Undo" }))
  await settle(); flushSync()
  expect(undo).toHaveBeenCalledTimes(1)
  visible(screen.getByText("Removed"))
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
})

test("a failed Undo says so and keeps the choice retry", async () => {
  const { ledger } = firstPick()
  await list(ledger)
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Synthetic Alpha" }))
  ledger.answer("add", { kind: "added", entry: entry("entry-alpha"), undo: undoing("failed") })
  await settle()
  ledger.answer("choose", { refused: "sync-full" })
  await settle(); flushSync()
  await userEvent.setup().click(screen.getByRole("button", { name: "Undo" }))
  await settle(); flushSync()
  visible(screen.getByText("Couldn't undo."))
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
  visible(screen.getByRole("button", { name: "Try again" }))
})

test("independent panels never share selection, search, or pending writes", async () => {
  const first = chooserSource()
  const second = chooserSource()
  const firstView = panel({ source: first.source, site: "www", mode: "many" })
  const secondView = panel({ source: second.source, site: "www", mode: "many" })
  await list(first.ledger)
  await list(second.ledger)
  const firstPanel = within(firstView.container)
  const secondPanel = within(secondView.container)
  await userEvent.setup().click(firstPanel.getByRole("checkbox", { name: "Synthetic Alpha" }))
  expect(second.ledger.calls("choose")).toEqual([])
  first.ledger.answer("choose", { ok: true })
  await settle(); flushSync()
  expect(firstPanel.getByRole("checkbox", { name: "Synthetic Alpha" }).getAttribute("aria-checked")).toBe("true")
  expect(secondPanel.getByRole("checkbox", { name: "Synthetic Alpha" }).getAttribute("aria-checked")).toBe("false")
  await userEvent.setup().type(firstPanel.getByRole("searchbox"), "Absent")
  expect(secondPanel.getByRole("searchbox")).toHaveValue("")
})

test("session release gives the caller the real pending outcome without choosing cancellation", async () => {
  const { source, ledger } = itemSource()
  let released: ChooserRelease | null = null
  const props = {
    open: true, context: context(), current: { kind: "none" }, label: "Synthetic destination",
    availability: { kind: "available" }, createSource: () => source, text, platform: "linux",
    onrequest: () => {}, onoutcome: mock(() => {}), onrelease: (event: ChooserRelease) => { released = event }
  } satisfies import("./types").PlaylistChooserProps
  const view = render(PlaylistChooser, { props })
  await list(ledger)
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Synthetic Alpha" }))
  await view.rerender({ ...props, open: false })
  function release(): ChooserRelease {
    if (!released) throw new Error("Expected an explicit session release")
    return released
  }
  expect(release().picker.closed).toBe(false)
  expect(release().pending).toHaveLength(1)
  ledger.answer("add", { kind: "already-in" })
  await settle(); flushSync()
  expect(ledger.calls("choose")).toEqual([[alpha, true]])
  ledger.answer("choose", { refused: "sync-full" })
  const event = await release().pending[0]
  expect(event).toEqual({ kind: "tick", id: alpha, outcome: { kind: "picked", id: alpha, save: "already-in", undo: null, choice: { refused: "sync-full" } } })
  expect(props.onoutcome).not.toHaveBeenCalled()
  release().picker.close()
})

test("two chooser containers release and mutate only their own model", async () => {
  const first = chooserSource()
  const second = chooserSource()
  const releaseFirst = mock((event: ChooserRelease) => event.picker.close())
  const releaseSecond = mock((event: ChooserRelease) => event.picker.close())
  const base = {
    open: true, context: context(), current: { kind: "none" }, label: "Synthetic destination",
    availability: { kind: "available" }, text, platform: "linux", onrequest: () => {}, onoutcome: () => {}
  } satisfies Omit<import("./types").PlaylistChooserProps, "createSource" | "onrelease">
  const firstView = render(PlaylistChooser, { props: {
    ...base, context: { ...base.context, purpose: { kind: "named", title: "Synthetic first chooser", subtitle: null } },
    createSource: () => first.source, onrelease: releaseFirst
  } })
  const secondView = render(PlaylistChooser, { props: {
    ...base, context: { ...base.context, purpose: { kind: "named", title: "Synthetic second chooser", subtitle: null } },
    createSource: () => second.source, onrelease: releaseSecond
  } })
  await list(first.ledger)
  expect(second.ledger.calls("cachedList")).toEqual([[]])
  await list(second.ledger)
  firstView.unmount()
  expect(releaseFirst).toHaveBeenCalledTimes(1)
  expect(releaseSecond).not.toHaveBeenCalled()
  const secondDialog = within(screen.getByRole("dialog", { name: "Synthetic second chooser" }))
  await userEvent.setup().click(secondDialog.getByRole("checkbox", { name: "Synthetic Alpha" }))
  expect(second.ledger.calls("choose")).toEqual([[alpha, true]])
  expect(first.ledger.calls("choose")).toEqual([])
  second.ledger.answer("choose", { refused: "sync-full" })
  await settle(); flushSync()
  expect(secondDialog.getByRole("checkbox", { name: "Synthetic Alpha" }).getAttribute("aria-checked")).toBe("false")
  secondView.unmount()
})
