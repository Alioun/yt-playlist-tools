import { describe, expect, test } from "bun:test"
import { flushSync } from "svelte"
import { toStore } from "svelte/store"
import type { MembershipRow, PlaylistRow, Site } from "../contracts"
import type { Key, PlaylistId } from "../model"
import {
  chooserSource, entry, itemSource, NOW, playlist, settle, undoing, type Facts, type Ledger
} from "../../../tools/fixtures/picker-model/fake-source"
import { PickerModel, titleProblem, type Mode, type PickerRow, type RowStatus, type TickOutcome } from "./model.svelte"
import type { AddAnswer, Listing, Mark } from "./source"

const WL = playlist("WL")
const ROAD = playlist("PLroad")
const MIX = playlist("PLmix")
const AMBIENT = playlist("PLambient")
const FIVE_MINUTES = 5 * 60 * 1000
const KEY: Key = { code: "KeyW", ctrl: false, alt: true, shift: false, meta: false }
const ROWS: readonly PlaylistRow[] = [
  { id: ROAD, title: "Road trip", privacy: "PRIVATE", count: 12, thumb: "https://i.ytimg.com/road.jpg" },
  { id: WL, title: "Watch later" },
  { id: MIX, title: "mix tape", privacy: "PUBLIC", count: 3 }
]
const BUSY = { kind: "ignored", reason: "busy" } as const
const UNCHANGED = { kind: "ignored", reason: "unchanged" } as const
const PRIVATE = { kind: "unavailable", reason: "private" } as const
const CLOSED = { kind: "closed" } as const

const listing = (rows: readonly PlaylistRow[] = ROWS, at = NOW): Listing => ({ rows, at })
const member = (id: PlaylistId, title: string, contains: boolean): MembershipRow => ({ id, title, contains })
const MEMBERS = [member(WL, "Watch later", false), member(ROAD, "Road trip", false), member(MIX, "mix tape", true)]
const titles = (picker: PickerModel) => picker.rows.map(row => row.title)
const checked = (picker: PickerModel) => picker.rows.filter(row => row.check === "on").map(row => row.id)

function row(picker: PickerModel, id: PlaylistId): PickerRow {
  const found = picker.rows.find(item => item.id === id)
  if (!found) throw new Error(`No row ${id}`)
  return found
}

function open(mode: Mode, site: Site = "www", facts: Partial<Facts> = {}): { picker: PickerModel; ledger: Ledger } {
  if (mode === "many") {
    const { source, ledger } = chooserSource(facts)
    return { picker: new PickerModel({ source, site, mode }), ledger }
  }
  const { source, ledger } = itemSource(facts)
  return { picker: new PickerModel({ source, site, mode }), ledger }
}

function openChooser(mode: "choose" | "many", facts: Partial<Facts> = {}) {
  const { source, ledger } = chooserSource(facts)
  return { picker: new PickerModel({ source, site: "www", mode }), ledger }
}

async function openedSave(site: Site = "www", facts: Partial<Facts> = {}) {
  const opened = open("save", site, facts)
  opened.ledger.answer("cachedList", listing())
  opened.ledger.answer("membership", { kind: "read", rows: MEMBERS })
  await settle()
  return opened
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const field of Object.values(value)) deepFreeze(field)
    Object.freeze(value)
  }
  return value
}

describe("loading", () => {
  test("cached rows paint before membership, and membership then sets the checks", async () => {
    const { picker, ledger } = open("save")
    expect(picker.rows).toEqual([])
    expect(picker.membership).toEqual({ kind: "checking" })
    ledger.answer("cachedList", listing())
    await settle()
    expect(titles(picker)).toEqual(["Watch later", "Road trip", "mix tape"])
    expect(picker.rows.map(item => item.check)).toEqual(["loading", "loading", "loading"])
    expect(row(picker, ROAD)).toMatchObject({ privacy: "PRIVATE", count: 12, thumb: "https://i.ytimg.com/road.jpg", listed: "listed" })
    ledger.answer("membership", { kind: "read", rows: MEMBERS })
    await settle()
    expect(picker.rows.map(item => [item.title, item.check])).toEqual([["Watch later", "off"], ["Road trip", "off"], ["mix tape", "on"]])
    expect(picker.membership).toEqual({ kind: "known", count: 1 })
    expect(ledger.calls("freshList")).toEqual([])
  })

  test("membership's set, order and titles win over a cached list that answers later, which still adds counts and thumbnails", async () => {
    const { picker, ledger } = open("save")
    ledger.answer("membership", {
      kind: "read",
      rows: [member(WL, "Watch later", false), member(MIX, "Mix Tape", true), member(AMBIENT, "Ambient", false)]
    })
    await settle()
    expect(titles(picker)).toEqual(["Watch later", "Mix Tape", "Ambient"])
    expect(row(picker, MIX).count).toBeNull()
    ledger.answer("cachedList", listing())
    await settle()
    expect(titles(picker)).toEqual(["Watch later", "Mix Tape", "Ambient"])
    expect(row(picker, MIX)).toMatchObject({ count: 3, privacy: "PUBLIC", check: "on" })
    expect(picker.rows.some(item => item.id === ROAD)).toBe(false)
  })

  test("a membership answer leaves an in-flight tick's row in place", async () => {
    const { picker, ledger } = open("save")
    ledger.answer("cachedList", listing())
    await settle()
    const ticked = picker.tick(ROAD)
    expect(row(picker, ROAD)).toMatchObject({ busy: true, check: "loading" })
    ledger.answer("membership", { kind: "read", rows: MEMBERS })
    await settle()
    expect(row(picker, ROAD)).toMatchObject({ busy: true, check: "off", status: { kind: "idle" } })
    ledger.answer("add", { kind: "added", entry: entry("sv-road"), undo: undoing() })
    expect(await ticked).toEqual({ kind: "added" })
    expect(row(picker, ROAD)).toMatchObject({ busy: false, check: "on", status: { kind: "added" } })
  })

  test("a confirmed tick outranks a membership read that answers after it", async () => {
    const { picker, ledger } = open("save")
    ledger.answer("cachedList", listing())
    await settle()
    const ticked = picker.tick(ROAD)
    ledger.answer("add", { kind: "added", entry: entry("sv-road"), undo: undoing() })
    await ticked
    ledger.answer("membership", { kind: "read", rows: MEMBERS })
    await settle()
    expect(checked(picker)).toEqual([ROAD, MIX])
  })

  test("unreadable membership leaves the rows unchecked, and a tick still reports already in", async () => {
    const { picker, ledger } = open("save")
    ledger.answer("cachedList", listing())
    ledger.answer("membership", { kind: "unreadable" })
    await settle()
    expect(picker.membership).toEqual({ kind: "unreadable" })
    expect(checked(picker)).toEqual([])
    const ticked = picker.tick(MIX)
    ledger.answer("add", { kind: "already-in" })
    expect(await ticked).toEqual({ kind: "already-in" })
    expect(row(picker, MIX)).toMatchObject({ check: "on", status: { kind: "already-in" } })
  })
})

describe("order and search", () => {
  test("YouTube puts Watch later first; YouTube Music keeps the source's order and adds no Watch later", async () => {
    const www = open("save", "www")
    const music = open("save", "music")
    const musicWithout = open("save", "music")
    www.ledger.answer("cachedList", listing())
    music.ledger.answer("cachedList", listing())
    musicWithout.ledger.answer("cachedList", listing(ROWS.filter(item => item.id !== WL)))
    await settle()
    expect(titles(www.picker)).toEqual(["Watch later", "Road trip", "mix tape"])
    expect(titles(music.picker)).toEqual(["Road trip", "Watch later", "mix tape"])
    expect(titles(musicWithout.picker)).toEqual(["Road trip", "mix tape"])
  })

  for (const mode of ["save", "choose", "many"] as const) {
    test(`Sort A-Z orders by title and search narrows by title in ${mode} mode`, async () => {
      const { picker, ledger } = open(mode, "www", { sortAZ: true })
      ledger.answer("cachedList", listing([...ROWS, { id: AMBIENT, title: "ambient" }]))
      await settle()
      expect(titles(picker)).toEqual(["ambient", "mix tape", "Road trip", "Watch later"])
      picker.query = "  TRIP "
      expect(titles(picker)).toEqual(["Road trip"])
      void picker.setSortAZ(false)
      expect(titles(picker)).toEqual(["Road trip"])
      picker.query = ""
      expect(titles(picker)).toEqual(["Watch later", "Road trip", "mix tape", "ambient"])
    })
  }

  test("Sort A-Z is saved for this device and reverts only when the owner refuses the latest change", async () => {
    const { picker, ledger } = open("save")
    const first = picker.setSortAZ(true)
    expect(picker.sortAZ).toBe(true)
    ledger.answer("saveSortAZ", { refused: "invalid" })
    expect(await first).toEqual({ kind: "refused", reason: "invalid" })
    expect(picker.sortAZ).toBe(false)
    const on = picker.setSortAZ(true)
    const off = picker.setSortAZ(false)
    ledger.answer("saveSortAZ", { refused: "invalid" })
    await on
    expect(picker.sortAZ).toBe(false)
    ledger.answer("saveSortAZ", { ok: true })
    expect(await off).toEqual({ kind: "saved" })
    expect(await picker.setSortAZ(false)).toEqual(UNCHANGED)
    expect(ledger.calls("saveSortAZ")).toEqual([[true], [true], [false]])
  })
})

describe("save mode", () => {
  const cases: [string, AddAnswer, TickOutcome, PickerRow["check"], RowStatus["kind"]][] = [
    ["added", { kind: "added", entry: entry("sv-road"), undo: undoing() }, { kind: "added" }, "on", "added"],
    ["already in", { kind: "already-in" }, { kind: "already-in" }, "on", "already-in"],
    ["couldn't save", { kind: "failed" }, { kind: "failed" }, "off", "save-failed"]
  ]
  for (const [name, answer, outcome, check, status] of cases) {
    test(`a tick shows busy, then ${name}`, async () => {
      const { picker, ledger } = await openedSave()
      const ticked = picker.tick(ROAD)
      expect(row(picker, ROAD)).toMatchObject({ busy: true, check: "off" })
      ledger.answer("add", answer)
      expect(await ticked).toEqual(outcome)
      expect(row(picker, ROAD)).toMatchObject({ busy: false, check, status: { kind: status } })
      expect(ledger.calls("add")).toEqual([[ROAD]])
    })
  }

  test("an untick removes only actual membership, reverts on failure and passes the owner's Undo through", async () => {
    const loading = open("save")
    loading.ledger.answer("cachedList", listing())
    await settle()
    expect(await loading.picker.untick(MIX)).toEqual(UNCHANGED)
    const { picker, ledger } = await openedSave()
    expect(await picker.untick(ROAD)).toEqual(UNCHANGED)
    expect(ledger.calls("remove")).toEqual([])
    const failing = picker.untick(MIX)
    expect(row(picker, MIX)).toMatchObject({ busy: true, check: "off" })
    ledger.answer("remove", { kind: "failed" })
    expect(await failing).toEqual({ kind: "failed" })
    expect(row(picker, MIX)).toMatchObject({ busy: false, check: "on", status: { kind: "remove-failed" } })
    const undo = undoing()
    const removing = picker.untick(MIX)
    ledger.answer("remove", { kind: "removed", undo })
    const removed = await removing
    expect(removed.kind === "removed" && removed.undo).toBe(undo)
    expect(row(picker, MIX)).toMatchObject({ check: "off", status: { kind: "removed" } })
    expect(picker.membership).toEqual({ kind: "known", count: 0 })
    expect(loading.ledger.calls("remove")).toEqual([])
  })

  test("an untick after this picker's own tick removes exactly the entry that tick added", async () => {
    const { picker, ledger } = await openedSave()
    const ticked = picker.tick(ROAD)
    ledger.answer("add", { kind: "added", entry: entry("sv-road"), undo: undoing() })
    await ticked
    const first = picker.untick(ROAD)
    ledger.answer("remove", { kind: "removed", undo: undoing() })
    await first
    const second = picker.untick(MIX)
    ledger.answer("remove", { kind: "removed", undo: undoing() })
    await second
    expect(ledger.calls("remove")).toEqual([[ROAD, entry("sv-road")], [MIX, null]])
  })

  test("a busy row ignores another tick or untick, and an unknown row is ignored, so no effect repeats", async () => {
    const { picker, ledger } = await openedSave()
    const first = picker.tick(ROAD)
    expect(await picker.tick(ROAD)).toEqual(BUSY)
    expect(await picker.untick(ROAD)).toEqual(BUSY)
    expect(await picker.tick(playlist("PLunknown"))).toEqual({ kind: "ignored", reason: "absent" })
    ledger.answer("add", { kind: "failed" })
    await first
    expect(ledger.calls("add")).toEqual([[ROAD]])
  })

  test("pins go through the source, live keys show and marks stay hidden", async () => {
    const { picker, ledger } = await openedSave("www", {
      quickSave: ROAD, keys: new Map([[MIX, KEY]]), marks: new Map<PlaylistId, Mark>([[ROAD, "missing"]])
    })
    expect(picker.pins).toBe("available")
    expect(row(picker, ROAD)).toMatchObject({ pinned: true, mark: null })
    expect(row(picker, MIX).key).toEqual(KEY)
    expect(await picker.pin(ROAD)).toEqual(UNCHANGED)
    const refused = picker.pin(MIX)
    ledger.answer("pin", { refused: "sync-full" })
    expect(await refused).toEqual({ kind: "refused", reason: "sync-full" })
    expect(row(picker, MIX)).toMatchObject({ pinned: false, check: "on", status: { kind: "refused", reason: "sync-full" } })
    const pinned = picker.pin(MIX)
    expect(await picker.pin(WL)).toEqual(BUSY)
    ledger.answer("pin", { ok: true })
    expect(await pinned).toEqual({ kind: "pinned" })
    expect(picker.rows.filter(item => item.pinned).map(item => item.id)).toEqual([MIX])
    expect(ledger.calls("pin")).toEqual([[MIX], [MIX]])
  })
})

describe("choose mode", () => {
  test("a pick saves the item, then stores the choice, and answers only after both", async () => {
    const { picker, ledger } = open("choose", "music")
    ledger.answer("cachedList", listing())
    await settle()
    expect(picker.membership).toEqual({ kind: "checking" })
    expect(ledger.calls("membership")).toEqual([[]])
    const undo = undoing()
    let outcome: TickOutcome | undefined
    const picking = picker.tick(MIX).then(value => (outcome = value))
    ledger.answer("add", { kind: "added", entry: entry("sv-mix"), undo })
    await settle()
    expect(outcome).toBeUndefined()
    expect(ledger.calls("choose")).toEqual([[MIX, true]])
    expect(await picker.tick(ROAD)).toEqual(BUSY)
    ledger.answer("choose", { ok: true })
    expect(await picking).toEqual({ kind: "picked", id: MIX, save: "added", undo, choice: { ok: true } })
    expect(row(picker, MIX)).toMatchObject({ check: "on", status: { kind: "added" } })
    expect(ledger.calls("add")).toEqual([[MIX]])
  })

  test("a failed save keeps the picker open and stores no choice", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    const picking = picker.tick(MIX)
    ledger.answer("add", { kind: "failed" })
    expect(await picking).toEqual({ kind: "failed" })
    expect(row(picker, MIX)).toMatchObject({ check: "off", status: { kind: "save-failed" } })
    expect(ledger.calls("choose")).toEqual([])
  })

  test("a refused choice after a confirmed save keeps the save and its Undo, and a retry stores only the choice", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    const undo = undoing()
    const picking = picker.tick(MIX)
    ledger.answer("add", { kind: "added", entry: entry("sv-mix"), undo })
    await settle()
    ledger.answer("choose", { refused: "sync-full" })
    expect(await picking).toEqual({ kind: "picked", id: MIX, save: "added", undo, choice: { refused: "sync-full" } })
    expect(picker.closed).toBe(false)
    expect(row(picker, MIX)).toMatchObject({ check: "off", busy: false, status: { kind: "unchosen", save: "added", reason: "sync-full", undo: "offered" } })
    const retry = picker.tick(MIX)
    await settle()
    ledger.answer("choose", { ok: true })
    expect(await retry).toEqual({ kind: "picked", id: MIX, save: "added", undo, choice: { ok: true } })
    expect(ledger.calls("add")).toEqual([[MIX]])
    expect(ledger.calls("choose")).toEqual([[MIX, true], [MIX, true]])
    expect(checked(picker)).toEqual([MIX])
    expect(row(picker, MIX).status).toEqual({ kind: "added" })
  })

  test("an already-saved pick whose choice is refused offers no Undo and retries the choice again on refusal", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    const picking = picker.tick(ROAD)
    ledger.answer("add", { kind: "already-in" })
    await settle()
    ledger.answer("choose", { refused: "update-needed" })
    expect(await picking).toEqual({ kind: "picked", id: ROAD, save: "already-in", undo: null, choice: { refused: "update-needed" } })
    expect(row(picker, ROAD).status).toEqual({ kind: "unchosen", save: "already-in", reason: "update-needed", undo: "none" })
    expect(await picker.undo(ROAD)).toEqual(UNCHANGED)
    const retry = picker.tick(ROAD)
    await settle()
    ledger.answer("choose", { refused: "sync-full" })
    expect(await retry).toEqual({ kind: "picked", id: ROAD, save: "already-in", undo: null, choice: { refused: "sync-full" } })
    expect(row(picker, ROAD).status).toEqual({ kind: "unchosen", save: "already-in", reason: "sync-full", undo: "none" })
    expect(ledger.calls("add")).toEqual([[ROAD]])
  })

  test("Undo on a saved but unchosen pick removes the save, and the next tick saves again", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    const undone: string[] = []
    const picking = picker.tick(MIX)
    ledger.answer("add", { kind: "added", entry: entry("sv-mix"), undo: () => { undone.push("sv-mix"); return Promise.resolve({ kind: "undone" }) } })
    await settle()
    ledger.answer("choose", { refused: "sync-full" })
    await picking
    expect(await picker.undo(MIX)).toEqual({ kind: "undone" })
    expect(undone).toEqual(["sv-mix"])
    expect(row(picker, MIX)).toMatchObject({ check: "off", status: { kind: "removed" } })
    expect(await picker.undo(MIX)).toEqual(UNCHANGED)
    const again = picker.tick(MIX)
    ledger.answer("add", { kind: "already-in" })
    await settle()
    ledger.answer("choose", { ok: true })
    expect(await again).toEqual({ kind: "picked", id: MIX, save: "already-in", undo: null, choice: { ok: true } })
    expect(ledger.calls("add")).toEqual([[MIX], [MIX]])
  })

  test("a failed Undo keeps the save and the choice retry", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    const picking = picker.tick(MIX)
    ledger.answer("add", { kind: "added", entry: entry("sv-mix"), undo: undoing("failed") })
    await settle()
    ledger.answer("choose", { refused: "sync-full" })
    await picking
    expect(await picker.undo(MIX)).toEqual({ kind: "failed" })
    expect(row(picker, MIX).status).toEqual({ kind: "unchosen", save: "added", reason: "sync-full", undo: "failed" })
    const retry = picker.tick(MIX)
    await settle()
    ledger.answer("choose", { ok: true })
    expect((await retry).kind).toBe("picked")
    expect(ledger.calls("add")).toEqual([[MIX]])
  })

  test("in a private window the first pick saves and leaves the quick-save playlist unchanged", async () => {
    const { picker, ledger } = open("choose", "www", { private: true, quickSave: ROAD })
    ledger.answer("cachedList", listing())
    await settle()
    expect(picker.pins).toBe("private")
    expect(await picker.pin(MIX)).toEqual(PRIVATE)
    const picking = picker.tick(MIX)
    ledger.answer("add", { kind: "added", entry: entry("sv-mix"), undo: undoing() })
    expect(await picking).toMatchObject({ kind: "picked", id: MIX, save: "added", choice: { skipped: "private" } })
    expect(ledger.calls("add")).toEqual([[MIX]])
    expect(ledger.calls("choose")).toEqual([])
    expect(ledger.calls("pin")).toEqual([])
    expect(picker.rows.filter(item => item.pinned).map(item => item.id)).toEqual([ROAD])
    expect(row(picker, MIX)).toMatchObject({ check: "off", status: { kind: "added" } })
  })

  test("a settings chooser stores the choice without touching YouTube, and its untick only clears the choice", async () => {
    const { picker, ledger } = openChooser("choose", { chosen: [ROAD] })
    ledger.answer("cachedList", listing())
    await settle()
    expect(checked(picker)).toEqual([ROAD])
    expect(await picker.tick(ROAD)).toEqual(UNCHANGED)
    const picking = picker.tick(MIX)
    ledger.answer("choose", { ok: true })
    expect(await picking).toEqual({ kind: "picked", id: MIX, save: null, undo: null, choice: { ok: true } })
    expect(checked(picker)).toEqual([MIX])
    const refused = picker.untick(MIX)
    ledger.answer("choose", { refused: "sync-full" })
    expect(await refused).toEqual({ kind: "refused", reason: "sync-full" })
    expect(row(picker, MIX)).toMatchObject({ check: "on", status: { kind: "refused", reason: "sync-full" } })
    const cleared = picker.untick(MIX)
    ledger.answer("choose", { ok: true })
    expect(await cleared).toEqual({ kind: "changed" })
    expect(checked(picker)).toEqual([])
    expect(ledger.calls("choose")).toEqual([[MIX, true], [MIX, false], [MIX, false]])
  })

  test("a chooser in a private window offers no setup change", async () => {
    for (const mode of ["choose", "many"] as const) {
      const { picker, ledger } = openChooser(mode, { private: true, chosen: [ROAD] })
      ledger.answer("cachedList", listing())
      await settle()
      expect(await picker.tick(MIX)).toEqual(PRIVATE)
      expect(await picker.untick(ROAD)).toEqual(PRIVATE)
      expect(picker.creation).toBe("private")
      expect(await picker.create("Focus", "PRIVATE")).toEqual(PRIVATE)
      expect(ledger.calls("choose")).toEqual([])
      expect(ledger.calls("create")).toEqual([])
    }
  })
})

describe("many mode", () => {
  test("ticks and unticks change only the chosen set; marked playlists lead and pins stay out", async () => {
    const GONE = playlist("PLgone")
    const { picker, ledger } = openChooser("many", {
      chosen: [MIX, GONE],
      marks: new Map<PlaylistId, Mark>([[MIX, "full"], [GONE, "missing"]]),
      quickSave: MIX,
      keys: new Map([[ROAD, KEY]])
    })
    ledger.answer("cachedList", listing())
    await settle()
    expect(picker.rows.map(item => [item.id, item.mark, item.check, item.listed])).toEqual([
      [MIX, "full", "on", "listed"], [GONE, "missing", "on", "gone"], [WL, null, "off", "listed"], [ROAD, null, "off", "listed"]
    ])
    expect(row(picker, GONE).title).toBeNull()
    expect(row(picker, ROAD).key).toEqual(KEY)
    expect(picker.membership).toEqual({ kind: "none" })
    expect(picker.pins).toBe("none")
    expect(row(picker, MIX).pinned).toBe(false)
    expect(await picker.pin(ROAD)).toEqual({ kind: "unavailable", reason: "mode" })
    const adding = picker.tick(ROAD)
    expect(row(picker, ROAD).busy).toBe(true)
    ledger.answer("choose", { ok: true })
    expect(await adding).toEqual({ kind: "changed" })
    expect(await picker.tick(ROAD)).toEqual(UNCHANGED)
    const removing = picker.untick(GONE)
    ledger.answer("choose", { refused: "update-needed" })
    expect(await removing).toEqual({ kind: "refused", reason: "update-needed" })
    expect(checked(picker)).toEqual([MIX, GONE, ROAD])
    expect(ledger.calls("choose")).toEqual([[ROAD, true], [GONE, false]])
  })
})

describe("refresh and freshness", () => {
  const ages: [string, number, number][] = [
    ["exactly five minutes old", NOW - FIVE_MINUTES, 0],
    ["older than five minutes", NOW - FIVE_MINUTES - 1, 1]
  ]
  for (const [name, at, fetches] of ages) {
    test(`opening with a cache ${name} makes ${fetches} refresh`, async () => {
      const { picker, ledger } = open("save")
      ledger.answer("cachedList", listing(ROWS, at))
      await settle()
      expect(ledger.calls("freshList")).toHaveLength(fetches)
      expect(picker.list).toEqual({ at, refreshing: fetches === 1, refreshable: true })
    })
  }

  test("opening with no cached list refreshes it once", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", null)
    await settle()
    expect(picker.list).toEqual({ at: null, refreshing: true, refreshable: true })
    ledger.answer("freshList", { kind: "listed", listing: listing(ROWS, NOW + 1) })
    await settle()
    expect(titles(picker)).toEqual(["Watch later", "Road trip", "mix tape"])
    expect(picker.list).toEqual({ at: NOW + 1, refreshing: false, refreshable: true })
    expect(ledger.calls("freshList")).toHaveLength(1)
  })

  test("↻ always reads fresh data, joins a refresh already in flight and keeps the rows when it fails", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    expect(ledger.calls("freshList")).toEqual([])
    const first = picker.refresh()
    expect(picker.refresh()).toBe(first)
    ledger.answer("freshList", { kind: "listed", listing: listing([{ id: AMBIENT, title: "Ambient" }], NOW + 1) })
    expect(await first).toEqual({ kind: "refreshed" })
    expect(titles(picker)).toEqual(["Ambient"])
    const second = picker.refresh()
    ledger.answer("freshList", { kind: "failed" })
    expect(await second).toEqual({ kind: "failed" })
    expect(titles(picker)).toEqual(["Ambient"])
    expect(picker.list).toEqual({ at: NOW + 1, refreshing: false, refreshable: true })
    expect(ledger.calls("freshList")).toHaveLength(2)
  })

  test("with no tab the saved list keeps its stamp, and refresh and creating stay unavailable", async () => {
    const at = NOW - 24 * FIVE_MINUTES
    const { picker, ledger } = openChooser("many", { tab: false })
    ledger.answer("cachedList", listing(ROWS, at))
    await settle()
    expect(ledger.calls("freshList")).toEqual([])
    expect(picker.list).toEqual({ at, refreshing: false, refreshable: false })
    expect(await picker.refresh()).toEqual({ kind: "unavailable", reason: "noTab" })
    expect(picker.creation).toBe("noTab")
    expect(await picker.create("Focus", "PRIVATE")).toEqual({ kind: "unavailable", reason: "noTab" })
    expect(ledger.calls("freshList")).toEqual([])
  })

  test("a refresh that finds no tab turns refresh off and keeps the saved stamp", async () => {
    const at = NOW - 2 * FIVE_MINUTES
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing(ROWS, at))
    await settle()
    ledger.answer("freshList", { kind: "noTab" })
    await settle()
    expect(picker.list).toEqual({ at, refreshing: false, refreshable: false })
    expect(await picker.refresh()).toEqual({ kind: "unavailable", reason: "noTab" })
    expect(ledger.calls("freshList")).toHaveLength(1)
  })

  test("an older list answer never replaces a newer one, and the stale cache adds no second refresh", async () => {
    const { picker, ledger } = open("choose")
    const refreshing = picker.refresh()
    ledger.answer("freshList", { kind: "listed", listing: listing([{ id: AMBIENT, title: "Ambient" }]) })
    await refreshing
    ledger.answer("cachedList", listing(ROWS, NOW - 2 * FIVE_MINUTES))
    await settle()
    expect(titles(picker)).toEqual(["Ambient"])
    expect(ledger.calls("freshList")).toHaveLength(1)
  })
})

describe("creating", () => {
  test("titles are trimmed, required, at most 150 characters and free of < and >", () => {
    expect(titleProblem("")).toBe("required")
    expect(titleProblem("   ")).toBe("required")
    expect(titleProblem(" Road <trip> ")).toBe("angle-brackets")
    expect(titleProblem("a>b")).toBe("angle-brackets")
    expect(titleProblem(` ${"x".repeat(150)} `)).toBeNull()
    expect(titleProblem("x".repeat(151))).toBe("too-long")
    expect(titleProblem("🎵".repeat(150))).toBeNull()
    expect(titleProblem("🎵".repeat(151))).toBe("too-long")
  })

  test("an invalid title or a creation the source can't do sends nothing", async () => {
    const { picker, ledger } = await openedSave()
    expect(await picker.create(" <b> ", "PUBLIC")).toEqual({ kind: "invalid", problem: "angle-brackets" })
    expect([picker.form.title, picker.form.privacy]).toEqual([" <b> ", "PUBLIC"])
    expect(ledger.calls("createWithItem")).toEqual([])
    for (const creation of ["signedOut", "noChannel"] as const) {
      const other = open("save", "www", { creation })
      expect(other.picker.creation).toBe(creation)
      expect(await other.picker.create("Focus", "PRIVATE")).toEqual({ kind: "unavailable", reason: creation })
      expect(other.ledger.calls("createWithItem")).toEqual([])
    }
  })

  test("a failed creation keeps the typed title and visibility, and a retry is one new request", async () => {
    const { picker, ledger } = await openedSave("www", { privacy: "UNLISTED" })
    expect(picker.form.privacy).toBe("UNLISTED")
    const first = picker.create("  Road trip 2 ", "PUBLIC")
    expect(picker.creating).toEqual({ kind: "pending" })
    expect(await picker.create("Other", "PRIVATE")).toEqual(BUSY)
    expect(ledger.calls("createWithItem")).toEqual([[{ title: "Road trip 2", privacy: "PUBLIC" }]])
    ledger.answer("createWithItem", { kind: "failed", reason: "rateLimited" })
    expect(await first).toEqual({ kind: "failed", reason: "rateLimited" })
    expect([picker.form.title, picker.form.privacy]).toEqual(["  Road trip 2 ", "PUBLIC"])
    expect(picker.creating).toEqual({ kind: "failed", reason: "rateLimited" })
    expect(picker.rows.some(item => item.listed === "new")).toBe(false)
    expect(ledger.calls("savePrivacy")).toEqual([])
    const retry = picker.create(picker.form.title, picker.form.privacy)
    ledger.answer("createWithItem", { kind: "created", id: AMBIENT, undo: null })
    expect(await retry).toEqual({ kind: "created", id: AMBIENT, choice: null })
    expect(ledger.calls("createWithItem")).toHaveLength(2)
  })

  test("the picker creates with its item, shows the playlist checked, and offers the visibility next time", async () => {
    const { picker, ledger } = await openedSave()
    expect(picker.form.privacy).toBe("PRIVATE")
    picker.form.title = " Road trip "
    expect(picker.titleCheck).toEqual({ problem: null, duplicate: true })
    const created = picker.create("Night drive", "PUBLIC")
    ledger.answer("createWithItem", { kind: "created", id: AMBIENT, undo: null })
    expect(await created).toEqual({ kind: "created", id: AMBIENT, choice: null })
    expect(row(picker, AMBIENT)).toMatchObject({ title: "Night drive", privacy: "PUBLIC", listed: "new", check: "on", status: { kind: "added" } })
    expect(titles(picker)).toEqual(["Watch later", "Night drive", "Road trip", "mix tape"])
    expect(picker.membership).toEqual({ kind: "known", count: 2 })
    expect(ledger.calls("savePrivacy")).toEqual([["PUBLIC"]])
    expect([picker.form.title, picker.form.privacy]).toEqual(["", "PUBLIC"])
    expect(picker.titleCheck).toEqual({ problem: "required", duplicate: false })
    const refreshed = picker.refresh()
    ledger.answer("freshList", { kind: "listed", listing: listing([...ROWS, { id: AMBIENT, title: "Night drive", count: 1 }], NOW + 1) })
    await refreshed
    expect(row(picker, AMBIENT)).toMatchObject({ listed: "listed", count: 1, check: "on" })
  })

  test("choose mode with an item creates with the item and makes the new playlist the pick", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    const undo = undoing()
    const created = picker.create("Focus", "UNLISTED")
    ledger.answer("createWithItem", { kind: "created", id: AMBIENT, undo })
    await settle()
    expect(ledger.calls("choose")).toEqual([[AMBIENT, true]])
    ledger.answer("choose", { ok: true })
    expect(await created).toEqual({ kind: "picked", id: AMBIENT, save: "created", undo, choice: { ok: true } })
    expect(ledger.calls("create")).toEqual([])
  })

  test("a chooser creates an empty playlist and selects it", async () => {
    const chooser = openChooser("choose")
    chooser.ledger.answer("cachedList", listing())
    const list = openChooser("many", { chosen: [ROAD] })
    list.ledger.answer("cachedList", listing())
    await settle()
    const picked = chooser.picker.create("Focus", "PRIVATE")
    expect(chooser.ledger.calls("create")).toEqual([[{ title: "Focus", privacy: "PRIVATE" }]])
    chooser.ledger.answer("create", { kind: "created", id: AMBIENT, undo: null })
    await settle()
    chooser.ledger.answer("choose", { ok: true })
    expect(await picked).toEqual({ kind: "picked", id: AMBIENT, save: null, undo: null, choice: { ok: true } })
    const added = list.picker.create("Focus", "PRIVATE")
    list.ledger.answer("create", { kind: "created", id: AMBIENT, undo: null })
    await settle()
    list.ledger.answer("choose", { ok: true })
    expect(await added).toEqual({ kind: "created", id: AMBIENT, choice: { ok: true } })
    expect(checked(list.picker)).toEqual([AMBIENT, ROAD])
    expect(row(list.picker, AMBIENT).listed).toBe("new")
    expect(list.ledger.calls("choose")).toEqual([[AMBIENT, true]])
  })

  test("a private window still creates with the item but never stores the last visibility", async () => {
    const { picker, ledger } = await openedSave("www", { private: true })
    expect(picker.creation).toBe("available")
    const created = picker.create("Focus", "PUBLIC")
    ledger.answer("createWithItem", { kind: "created", id: AMBIENT, undo: null })
    expect(await created).toEqual({ kind: "created", id: AMBIENT, choice: null })
    expect(ledger.calls("savePrivacy")).toEqual([])
  })
})

describe("lifecycle", () => {
  test("after close, late answers change nothing and no method starts an effect", async () => {
    const { picker, ledger } = open("save")
    ledger.answer("cachedList", listing())
    await settle()
    const ticked = picker.tick(ROAD)
    const view = () => JSON.stringify([picker.rows, picker.membership, picker.list, picker.creating])
    const before = view()
    picker.close()
    ledger.answer("membership", { kind: "read", rows: MEMBERS })
    ledger.answer("add", { kind: "added", entry: entry("sv-road"), undo: undoing() })
    expect(await ticked).toEqual(CLOSED)
    await settle()
    expect(view()).toBe(before)
    expect(picker.closed).toBe(true)
    expect(await picker.tick(MIX)).toEqual(CLOSED)
    expect(await picker.untick(MIX)).toEqual(CLOSED)
    expect(await picker.pin(MIX)).toEqual(CLOSED)
    expect(await picker.refresh()).toEqual(CLOSED)
    expect(await picker.create("Focus", "PRIVATE")).toEqual(CLOSED)
    expect(await picker.setSortAZ(true)).toEqual(CLOSED)
    for (const port of ["remove", "pin", "freshList", "createWithItem", "saveSortAZ"] as const) expect(ledger.calls(port)).toEqual([])
    expect(ledger.calls("add")).toHaveLength(1)
  })

  test("a picker closed before its list arrives shows nothing later and never refreshes", async () => {
    const { picker, ledger } = open("save")
    picker.close()
    ledger.answer("cachedList", listing(ROWS, NOW - 2 * FIVE_MINUTES))
    ledger.answer("membership", { kind: "read", rows: MEMBERS })
    await settle()
    expect(picker.rows).toEqual([])
    expect(picker.membership).toEqual({ kind: "checking" })
    expect(ledger.calls("freshList")).toEqual([])
  })

  test("closing while a first pick saves still stores the choice for the original account", async () => {
    const first = itemSource()
    const picker = new PickerModel({ source: first.source, site: "www", mode: "choose" })
    first.ledger.answer("cachedList", listing())
    await settle()
    const undo = undoing()
    const picking = picker.tick(MIX)
    picker.close()
    const second = itemSource()
    const reopened = new PickerModel({ source: second.source, site: "www", mode: "choose" })
    first.ledger.answer("add", { kind: "added", entry: entry("sv-mix"), undo })
    await settle()
    expect(first.ledger.calls("choose")).toEqual([[MIX, true]])
    first.ledger.answer("choose", { ok: true })
    expect(await picking).toEqual({ kind: "picked", id: MIX, save: "added", undo, choice: { ok: true } })
    expect(second.ledger.calls("add")).toEqual([])
    expect(second.ledger.calls("choose")).toEqual([])
    expect(picker.closed).toBe(true)
    expect(reopened.rows).toEqual([])
  })

  test("closing while a first pick's choice is pending still finishes it", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    const picking = picker.tick(MIX)
    ledger.answer("add", { kind: "already-in" })
    await settle()
    picker.close()
    ledger.answer("choose", { ok: true })
    expect(await picking).toEqual({ kind: "picked", id: MIX, save: "already-in", undo: null, choice: { ok: true } })
    expect(ledger.calls("choose")).toEqual([[MIX, true]])
  })

  test("a lapse in consent or account authority before the choice starts stops it", async () => {
    const { source, ledger, facts } = itemSource()
    const picker = new PickerModel({ source, site: "www", mode: "choose" })
    ledger.answer("cachedList", listing())
    await settle()
    const undo = undoing()
    const picking = picker.tick(MIX)
    picker.close()
    facts.authorized = false
    ledger.answer("add", { kind: "added", entry: entry("sv-mix"), undo })
    expect(await picking).toEqual({ kind: "picked", id: MIX, save: "added", undo, choice: { skipped: "unauthorized" } })
    await settle()
    expect(ledger.calls("choose")).toEqual([])
  })

  test("closing while a first pick creates its playlist still stores the choice", async () => {
    const { picker, ledger } = open("choose")
    ledger.answer("cachedList", listing())
    await settle()
    const creating = picker.create("Focus", "PUBLIC")
    picker.close()
    ledger.answer("createWithItem", { kind: "created", id: AMBIENT, undo: null })
    await settle()
    ledger.answer("choose", { ok: true })
    expect(await creating).toEqual({ kind: "picked", id: AMBIENT, save: "created", undo: null, choice: { ok: true } })
    expect(ledger.calls("savePrivacy")).toEqual([])
  })

  test("a closed picker's late answers never reach the picker opened after an account change", async () => {
    const first = open("save")
    first.ledger.answer("cachedList", listing())
    await settle()
    const ticked = first.picker.tick(ROAD)
    first.picker.close()
    const second = open("save")
    first.ledger.answer("membership", { kind: "read", rows: [member(ROAD, "Road trip", true)] })
    first.ledger.answer("add", { kind: "added", entry: entry("sv-road"), undo: undoing() })
    await ticked
    await settle()
    expect(second.picker.rows).toEqual([])
    expect(second.picker.membership).toEqual({ kind: "checking" })
    second.ledger.answer("cachedList", listing([{ id: AMBIENT, title: "Ambient" }]))
    await settle()
    expect(second.picker.rows.map(item => [item.id, item.check, item.busy])).toEqual([[AMBIENT, "loading", false]])
  })

  test("two open pickers keep separate state", async () => {
    const a = await openedSave("www")
    const b = await openedSave("music")
    a.picker.query = "road"
    const ticked = a.picker.tick(ROAD)
    expect(titles(b.picker)).toEqual(["Watch later", "Road trip", "mix tape"])
    expect(row(b.picker, ROAD).busy).toBe(false)
    a.ledger.answer("add", { kind: "added", entry: entry("sv-road"), undo: undoing() })
    await ticked
    expect(row(a.picker, ROAD).check).toBe("on")
    expect(row(b.picker, ROAD).check).toBe("off")
    expect(b.ledger.calls("add")).toEqual([])
  })

  test("the model never changes what the source hands it", async () => {
    const rows = deepFreeze(ROWS.map(item => ({ ...item })))
    const members = deepFreeze(MEMBERS.map(item => ({ ...item })))
    const chosen = deepFreeze([ROAD])
    const marks = new Map<PlaylistId, Mark>([[ROAD, "missing"]])
    const keys = new Map([[MIX, KEY]])
    const snapshot = () => JSON.stringify([rows, members, chosen, [...marks], [...keys]])
    const before = snapshot()
    const many = openChooser("many", { chosen, marks, keys, sortAZ: true })
    many.ledger.answer("cachedList", deepFreeze(listing(rows)))
    await settle()
    const ticked = many.picker.tick(MIX)
    many.ledger.answer("choose", { ok: true })
    await ticked
    const unticked = many.picker.untick(ROAD)
    many.ledger.answer("choose", { ok: true })
    await unticked
    const save = open("save", "www", { chosen, marks, keys })
    save.ledger.answer("cachedList", deepFreeze(listing(rows)))
    save.ledger.answer("membership", deepFreeze({ kind: "read", rows: members }))
    await settle()
    const removed = save.picker.untick(MIX)
    save.ledger.answer("remove", { kind: "removed", undo: undoing() })
    await removed
    expect(snapshot()).toBe(before)
  })
})

test("Svelte effects see rows and membership change as answers arrive", async () => {
  const { picker, ledger } = open("save")
  const seen: string[] = []
  const stop = toStore(() => `${picker.membership.kind}:${picker.rows.map(item => `${item.title}=${item.check}`).join(",")}`)
    .subscribe(value => { seen.push(value) })
  ledger.answer("cachedList", listing())
  await settle()
  flushSync()
  ledger.answer("membership", { kind: "read", rows: MEMBERS })
  await settle()
  flushSync()
  picker.query = "mix"
  flushSync()
  stop()
  expect(seen).toEqual([
    "checking:",
    "checking:Watch later=loading,Road trip=loading,mix tape=loading",
    "known:Watch later=off,Road trip=off,mix tape=on",
    "known:mix tape=on"
  ])
})


test.each(["list-first", "membership-first"] as const)("item choose membership is independent of choices with %s answers", async order => {
  const { picker, ledger } = open("choose", "www", { chosen: [ROAD] })
  expect(ledger.calls("membership")).toHaveLength(1)
  expect(picker.membership).toEqual({ kind: "checking" })
  if (order === "list-first") {
    ledger.answer("cachedList", listing())
    await settle()
  }
  ledger.answer("membership", { kind: "read", rows: MEMBERS })
  await settle()
  if (order === "membership-first") ledger.answer("cachedList", listing())
  await settle()
  expect(picker.membership).toEqual({ kind: "known", count: 1 })
  expect(checked(picker)).toEqual([ROAD])
  expect(row(picker, ROAD)).toMatchObject({ count: 12, thumb: "https://i.ytimg.com/road.jpg" })
  picker.query = "Road"
  expect(picker.membership).toEqual({ kind: "known", count: 1 })
  picker.close()
})
