import {
  defaultDevice,
  defaultFilter,
  defaultSettings,
  defaultSetup,
  documentKey,
  isAccountKey,
  isPlaylistId,
  parseDocumentKey,
  type AccountKey,
  type DocumentKey,
  type PlaylistId
} from "../../../src/shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import { createImportPlanner, type ImportPlan } from "../../../src/shared/settings-file"
import { encodeSyncDocument } from "../../../src/background/store/sync-codec"
import type { SettingsImportPlanInput } from "../../../src/background/store/settings-import-plan"

export function account(value: string): AccountKey {
  if (!isAccountKey(value)) throw new Error("fixture-account")
  return value
}
export function playlist(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw new Error("fixture-playlist")
  return value
}
export function object(value: unknown): JsonObject {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("fixture-json-object")
  return value
}
export function json(value: unknown): JsonValue {
  if (!isJsonValue(value)) throw new Error("fixture-json-value")
  return value
}
export const A = account("AAAAAAAAAAAAAAAA"),
  B = account("BBBBBBBBBBBBBBBB"),
  C = account("CCCCCCCCCCCCCCCC")
export const D = account("DDDDDDDDDDDDDDDD"),
  E = account("EEEEEEEEEEEEEEEE"),
  F = account("FFFFFFFFFFFFFFFF")
export const channel = "UCaaaaaaaaaaaaaaaaaaaaaa"
export const at = 9000
export const deviceId = "this-browser"
export function fresh(key: DocumentKey): string {
  return `fresh:${documentKey(key)}`
}
export function old(gen: string, data: JsonValue, extra: JsonObject = {}): JsonObject {
  return { ...extra, v: 1, gen, at: 10, by: "old-browser", data }
}
export function stamp(name: string, data: JsonValue, extra: JsonObject = {}): JsonObject {
  return { ...extra, v: 1, gen: `fresh:${name}`, at, by: deviceId, data }
}
export function tombstone(name: string, extra: JsonObject = {}): JsonObject {
  return { ...extra, v: 1, gen: `fresh:${name}`, at, by: deviceId, deleted: true }
}
export function fileData(): JsonObject {
  const settings = defaultSettings()
  settings.theme = "dark"
  settings.shortcuts.on = true
  settings.shortcuts.list = [{ id: "SAVE01", key: { code: "KeyX", ctrl: false, alt: true, shift: false, meta: false }, label: "  Imported row  ", watchLaterOnEveryAccount: false }]
  settings.musicActions.preset = true
  return object({
    format: 1,
    product: "Perchling",
    version: "2.0.0",
    date: "2026-10-30",
    settings,
    accounts: {
      [A]: {
        setup: {
          ...defaultSetup(),
          label: { name: "n".repeat(120) },
          autoAdd: [{ pl: "PL_in", takes: "both" }],
          targets: { SAVE01: "PL_target", GONE01: "PL_stale" },
          marks: { PL_in: "full", PL_stale: "missing" }
        },
        filters: { PL_in: { on: true, mode: "allow", channels: [[channel, "t".repeat(110), "h".repeat(35)]] } }
      },
      [B]: { setup: defaultSetup(), filters: {} },
      [D]: { setup: defaultSetup(), filters: {} },
      [E]: { setup: { ...defaultSetup(), gather: "PL_gather", marks: { PL_gather: "full", PL_stale: "missing" } }, filters: {} },
      [F]: { setup: defaultSetup(), filters: { PL_kept_alive: defaultFilter() } }
    }
  })
}
export function parse(data = fileData()): ImportPlan {
  const result = createImportPlanner("normal").importFile(JSON.stringify(data))
  if (result.kind !== "import-plan") throw new Error("fixture-file-refused")
  return result
}
export function currentLocal(syncOn = false): JsonObject {
  const settings = object(defaultSettings())
  settings.shortcuts = {
    ...object(settings.shortcuts),
    preset: true,
    future: "shortcut-extension",
    list: [{ id: "SAVE01", key: null, label: "Old row", watchLaterOnEveryAccount: false, rowFuture: "row-extension" }]
  }
  settings.musicKeys = { ...object(settings.musicKeys), preset: true }
  settings.future = { keep: [1, 2] }
  return {
    schema: 1,
    device: object({ ...defaultDevice(deviceId), consent: { v: 1, at: 7 }, syncOn, deviceFuture: "keep" }),
    lastAccount: B,
    sync: { joined: syncOn ? "joined-copy" : null, pushed: {}, status: syncOn ? "ok" : "off", editedSinceOff: false, everEdited: false, historyFuture: "keep" },
    "doc:settings": old("settings-old", settings, { envelope: "settings-extension" }),
    [`doc:setup:${A}`]: old("A-old", { ...defaultSetup(), autoAdd: [{ pl: "PL_before", takes: "videos" }], future: "setup-extension" }, { envelope: "A-extension" }),
    [`doc:filter:${A}:PL_in`]: old("A-in-old", { mode: "deny", on: false, channels: [[channel, "old", "old-handle", "future-column"]], future: "filter-extension" }),
    [`doc:filter:${A}:PL_kept`]: old("A-kept-old", json(defaultFilter())),
    [`doc:filter:${A}:PL_orphan`]: old("A-orphan-old", json(defaultFilter()), { orphanFuture: true }),
    [`doc:setup:${B}`]: old("B-old", { ...defaultSetup(), quickSave: "PL_before" }, { envelope: "B-extension" }),
    [`doc:filter:${B}:PL_B_keep`]: old("B-kept-old", json(defaultFilter())),
    [`doc:filter:${B}:PL_B_dead`]: { v: 1, gen: "B-dead-old", at: 10, by: "old-browser", deleted: true, future: "dead-extension" },
    [`doc:setup:${C}`]: old("C-old", { ...defaultSetup(), gather: "PL_untouched", future: { untouched: true } }),
    [`doc:filter:${C}:PL_C`]: old("C-filter-old", json(defaultFilter())),
    [`cache:${B}`]: { playlists: ["PL_created"], newlyCreated: ["PL_created"] },
    [`progress:${B}:0`]: { video: 13 },
    [`progress:${B}:15`]: { video: 22 },
    [`cache:${C}`]: { untouched: [1, 2, 3] },
    [`progress:${C}:3`]: { untouched: true },
    unclaimed: { untouched: true },
    outside: { keep: "all local data" }
  }
}
export function currentSession(): JsonObject {
  const collection: JsonObject = { v: 1, global: { keep: true }, accounts: { [A]: { keep: true }, [B]: { remove: true }, [C]: { keep: true } }, future: "collection-extension" }
  return {
    [`skips:${B}`]: { abcdefghijk: ["PL_before"] },
    [`cooldown:${B}`]: 123,
    [`skips:${C}`]: { abcdefghijk: "all" },
    paused: true,
    recent: [
      { acct: B, playlist: "PL_before", video: "abcdefghijk", at: 1 },
      { acct: C, playlist: "PL_C", video: "abcdefghijk", at: 2 }
    ],
    recentAdds: [{ kind: "single", acct: B, at: 1, video: { id: "abcdefghijk", title: "Removed" }, playlists: [{ id: "PL_before", title: "Before" }], source: { kind: "feature", feature: "gather" } }],
    shown: collection,
    breakage: collection,
    gather: collection,
    tabs: { "1": { site: "www", signedIn: true, acct: B }, "2": { site: "music", signedIn: true, acct: C }, "3": { site: "www", signedIn: true, acct: A } },
    outside: { keep: true }
  }
}
export function syncInventory(local: JsonObject): JsonObject {
  const records: JsonObject = { "s:meta": { v: 1, id: "joined-copy", created: 1, metaFuture: true } }
  const pushed: JsonObject = {}
  for (const [name, document] of Object.entries(local)) {
    const key = parseDocumentKey(name)
    if (!key) continue
    const encoded = encodeSyncDocument({ key, document })
    if (encoded.kind !== "encoded") throw new Error("fixture-encoding")
    for (const item of encoded.encoded.items) records[item.key] = item.value
    const gen = object(document).gen
    if (typeof gen !== "string") throw new Error("fixture-generation")
    pushed[name] = gen
  }
  local.sync = { ...object(local.sync), pushed }
  return records
}
export function scenario(syncOn = false): SettingsImportPlanInput {
  const local = currentLocal(syncOn)
  const sync = syncOn ? ({ kind: "on", records: syncInventory(local) } satisfies SettingsImportPlanInput["sync"]) : ({ kind: "off" } satisfies SettingsImportPlanInput["sync"])
  return { parsed: parse(), local, session: currentSession(), sync, at, generation: fresh }
}
export function expectedSettings(): JsonObject {
  return {
    theme: "dark",
    undoKey: { char: "u", code: "KeyU", ctrl: false, alt: true, shift: false, meta: false },
    autoAdd: { on: false, feedback: true, pct: 50, toolbarTick: true, toolbarPaused: true },
    shortcuts: {
      on: true,
      feedback: true,
      music: true,
      preset: true,
      picker: null,
      future: "shortcut-extension",
      list: [{ id: "SAVE01", key: { code: "KeyX", ctrl: false, alt: true, shift: false, meta: false }, label: "Imported row", watchLaterOnEveryAccount: false, rowFuture: "row-extension" }]
    },
    quickSave: { on: false, feedback: true, shortsShelves: false },
    queueButton: { on: false, feedback: true },
    watchButton: { on: false, feedback: true, shorts: false },
    cardMenu: { on: false, keepLinkMenu: false },
    browserMenu: { on: false, feedback: true },
    musicSection: true,
    musicActions: {
      on: false,
      feedback: true,
      preset: true,
      buttons: { next: true, queue: true, save: false, like: false, remove: false, bar: false, library: false, mix: false, album: false, artist: false }
    },
    musicKeys: { on: false, feedback: true, preset: true, keys: { next: null, queue: null, save: null, picker: null, like: null, remove: null, library: null, mix: null, album: null, artist: null } },
    anyTabKeys: { on: false, feedback: true },
    gather: { on: false, feedback: true, to: "player", order: "newest", close: false, auto: { unvisited: false, after: "1d", background: false, count: false, n: 10 } },
    future: { keep: [1, 2] }
  }
}
export function expectedPuts(): JsonObject {
  return {
    "doc:settings": stamp("doc:settings", expectedSettings(), { envelope: "settings-extension" }),
    [`doc:setup:${A}`]: stamp(
      `doc:setup:${A}`,
      {
        label: { name: "n".repeat(100) },
        autoAdd: [{ pl: "PL_in", takes: "both" }],
        targets: { SAVE01: "PL_target" },
        quickSave: null,
        musicSave: null,
        gather: null,
        marks: { PL_in: "full" },
        future: "setup-extension"
      },
      { envelope: "A-extension" }
    ),
    [`doc:filter:${A}:PL_in`]: stamp(`doc:filter:${A}:PL_in`, { mode: "allow", on: true, channels: [[channel, "t".repeat(100), "h".repeat(30), "future-column"]], future: "filter-extension" }),
    [`doc:setup:${E}`]: stamp(`doc:setup:${E}`, { label: null, autoAdd: [], targets: {}, quickSave: null, musicSave: null, gather: "PL_gather", marks: { PL_gather: "full" } }),
    [`doc:setup:${F}`]: stamp(`doc:setup:${F}`, { label: null, autoAdd: [], targets: {}, quickSave: null, musicSave: null, gather: null, marks: {} }),
    [`doc:filter:${F}:PL_kept_alive`]: stamp(`doc:filter:${F}:PL_kept_alive`, { mode: "deny", on: false, channels: [] })
  }
}
export const removedNames = [`doc:filter:${A}:PL_kept`, `doc:filter:${A}:PL_orphan`, `doc:setup:${B}`, `doc:filter:${B}:PL_B_dead`, `doc:filter:${B}:PL_B_keep`]
export function expectedTombstones(): JsonObject {
  return {
    [`doc:filter:${A}:PL_kept`]: tombstone(`doc:filter:${A}:PL_kept`),
    [`doc:filter:${A}:PL_orphan`]: tombstone(`doc:filter:${A}:PL_orphan`, { orphanFuture: true }),
    [`doc:setup:${B}`]: tombstone(`doc:setup:${B}`, { envelope: "B-extension" }),
    [`doc:filter:${B}:PL_B_dead`]: tombstone(`doc:filter:${B}:PL_B_dead`, { future: "dead-extension" }),
    [`doc:filter:${B}:PL_B_keep`]: tombstone(`doc:filter:${B}:PL_B_keep`)
  }
}
export const expectedDocumentOrder = [
  "doc:settings",
  `doc:setup:${A}`,
  `doc:filter:${A}:PL_in`,
  `doc:filter:${A}:PL_kept`,
  `doc:filter:${A}:PL_orphan`,
  `doc:setup:${B}`,
  `doc:filter:${B}:PL_B_dead`,
  `doc:filter:${B}:PL_B_keep`,
  `doc:setup:${E}`,
  `doc:setup:${F}`,
  `doc:filter:${F}:PL_kept_alive`
]
export function expectedSyncBatch() {
  const records = { ...expectedPuts(), ...expectedTombstones() }
  return expectedDocumentOrder.map(name => {
    const key = parseDocumentKey(name)
    if (!key) throw new Error("independent-expected-address")
    return { key, document: object(records[name]) }
  })
}
export function expectedSession(): JsonObject {
  const collection: JsonObject = { v: 1, global: { keep: true }, accounts: { [A]: { keep: true }, [C]: { keep: true } }, future: "collection-extension" }
  return {
    [`skips:${C}`]: { abcdefghijk: "all" },
    paused: true,
    recent: [{ acct: C, playlist: "PL_C", video: "abcdefghijk", at: 2 }],
    recentAdds: [],
    shown: collection,
    breakage: collection,
    gather: collection,
    tabs: { "2": { site: "music", signedIn: true, acct: C }, "3": { site: "www", signedIn: true, acct: A } },
    outside: { keep: true }
  }
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
