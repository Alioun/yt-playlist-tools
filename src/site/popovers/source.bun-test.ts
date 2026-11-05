import { expect, test } from "bun:test"
import type { TabActions } from "../core/actions"
import type { TabAddRequest, TabDestinationChange, TabRemoveRequest } from "../../shared/contracts/tab-actions"
import type { PlaylistId } from "../../shared/model"
import { PickerModel } from "../../shared/picker/model.svelte"
import { placePicker } from "./placement"
import { pagePickerSource } from "./source"
import { musicPickerAnchor, type OpenPicker } from "./types"
import { playlist, video, wireView } from "../../../tools/fixtures/tab-view/cases"

const other = "PL_beta" as PlaylistId
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function source(site: "www" | "music", mode: OpenPicker["mode"] = { kind: "save" }, extra: Partial<ReturnType<typeof wireView>> = {}) {
  const adds: TabAddRequest[] = [], removes: TabRemoveRequest[] = [], destinations: TabDestinationChange[] = [], jobs: string[] = []
  const released: string[] = [], devices: unknown[] = []
  const actions = {
    release: (handle: { id: string }) => { released.push(handle.id) },
    device: async (change: { field: string }) => { devices.push(change); return change.field === "newPlaylistVisibility" ? { kind: "refused", reason: "private" } : { kind: "confirmed" } },
    add: async (request: TabAddRequest) => { adds.push(request); return { kind: "report", outcomes: { [other]: { kind: "added" } }, toast: null, feedback: true, undo: { kind: "add", id: "a1" }, titles: {} } },
    remove: async (request: TabRemoveRequest) => { removes.push(request); return { kind: "removed", playlist: other, video, feedback: true, toast: null, undo: { kind: "remove", id: "r1" }, titles: {} } },
    destination: async (change: TabDestinationChange) => { destinations.push(change); return { kind: "confirmed" } },
    playlists: async () => ({ kind: "cached", listing: { rows: [{ id: playlist, title: "Favourites" }, { id: other, title: "Beta" }], at: Date.now() } })
  } as unknown as TabActions
  const view = { ...wireView(site), ...extra } as ReturnType<typeof wireView>
  const built = pagePickerSource({ actions, view, now: () => Date.now(), live: () => true,
    request: { video, anchor: { kind: "window" }, mode, opener: site === "music" ? "music-actions" : "quick-save" },
    page: { run: async job => { jobs.push(job.job.kind); return { ok: true, data: [], route: "r" } as never } } })
  return { built, adds, removes, destinations, jobs, released, devices }
}

test("Sort A–Z and the last visibility save through the background, and a private refusal reads as private", async () => {
  const www = source("www")
  expect(await www.built.saveSortAZ(true)).toEqual({ ok: true })
  expect(await www.built.savePrivacy("PUBLIC")).toEqual({ refused: "private" })
  expect(www.devices).toEqual([{ field: "pickerSortAZ", value: true }, { field: "newPlaylistVisibility", value: "PUBLIC" }])
})

test("New playlist starts on this browser's last visibility, else Private (YT-NEW-03)", () => {
  expect(new PickerModel({ source: source("www", { kind: "save" }, { newPlaylistVisibility: "PUBLIC" }).built, site: "www", mode: "save" }).form.privacy).toBe("PUBLIC")
  expect(new PickerModel({ source: source("www").built, site: "www", mode: "save" }).form.privacy).toBe("PRIVATE")
})

test("releasing the source lets go of every add and removal handle it received, once", async () => {
  const www = source("www")
  await www.built.item.add(other)
  await www.built.item.remove(other, null)
  expect(www.released).toEqual([])
  www.built.release(); www.built.release()
  expect(www.released).toEqual(["a1", "r1"])
})

test("on YouTube Music the picker saves and removes as a YouTube Music add, and pins YouTube Music's one-click playlist", async () => {
  const music = source("music")
  expect(music.built.quickSave).toBe(playlist)
  await music.built.item.add(other)
  await music.built.item.remove(other, null)
  expect(music.adds).toEqual([{ site: "music", video, via: "picker", opener: "music-actions", playlist: other }])
  expect(music.removes[0]).toMatchObject({ site: "music", playlist: other, tick: { kind: "add", id: "a1" } })
  expect(await music.built.pin(other)).toEqual({ ok: true })
  expect(music.destinations).toEqual([{ destination: { kind: "music-save" }, playlist: other, expected: { setup: "live", playlist } }])
  const www = source("www")
  await www.built.pin(other)
  expect(www.destinations[0]?.destination).toEqual({ kind: "quick-save" })
})

test("choose mode on YouTube Music picks YouTube Music's one-click playlist and shows the shortcut keys live there", async () => {
  const music = source("music", { kind: "choose", shortcut: null })
  expect(music.built.chosen).toEqual([playlist])
  expect(music.built.keys.has(playlist)).toBe(true)
  await music.built.choose(other, true)
  expect(music.destinations[0]?.destination).toEqual({ kind: "music-save" })
})

test("a picker with marks off reads no membership, so no row is checked and nothing says it couldn't check", async () => {
  const music = source("music")
  const picker = new PickerModel({ source: music.built, site: "music", mode: "save", marks: false })
  await settle()
  expect(music.jobs).toEqual([])
  expect(picker.membership).toEqual({ kind: "none" })
  expect(picker.rows.map(row => row.check)).toEqual(["off", "off"])
  const www = source("www")
  new PickerModel({ source: www.built, site: "www", mode: "save" })
  await settle()
  expect(www.jobs).toEqual(["membership"])
})

test("by key on YouTube Music the picker opens below the shown Save button, else centred above the player bar", () => {
  const button = document.createElement("button"), bar = document.createElement("ytmusic-player-bar")
  document.body.append(button, bar)
  bar.getBoundingClientRect = () => ({ left: 0, top: 720, width: 1280, height: 72, right: 1280, bottom: 792, x: 0, y: 720, toJSON() {} })
  expect(musicPickerAnchor(document, button)).toEqual({ kind: "below", element: button })
  expect(musicPickerAnchor(document, null)).toEqual({ kind: "above", element: bar })
  bar.remove()
  expect(musicPickerAnchor(document, null)).toEqual({ kind: "window" })
  expect(placePicker({ kind: "above", box: { left: 0, top: 720, width: 1280, height: 72 } }, { width: 320, height: 400 }, { width: 1280, height: 800 }))
    .toEqual({ left: 480, top: 312, maxHeight: 400 })
  button.remove()
})
