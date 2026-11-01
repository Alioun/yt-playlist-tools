import {
  CONSENT_VERSION, STORAGE_SCHEMA_VERSION, DecodeError, decodeDevice, decodeDocument, decodeFilter,
  defaultFilter, isAccountKey, parseDocumentKey, type AccountKey, type Filter, type Key, type Settings, type Setup, type PlaylistId, type VideoId
} from "../../shared/model"
import { isJsonValue } from "../../shared/contracts/json"
import { objectShape } from "../../shared/contracts/object-shape"
import { readSettingsView, type SettingsView, type Snapshot } from "../../shared/model/settings-view"
import { readAccountSetup, type AccountSetupRead } from "./setup-edit"
import type { SessionMemory, SessionUnavailableReason, Skip } from "./session-memory"

export type ProjectionAccount =
  | { readonly kind: "signed-in"; readonly acct: AccountKey }
  | { readonly kind: "signed-out" | "unknown"; readonly acct?: never }
export type TabProjectionRequest = { readonly private: boolean; readonly account: ProjectionAccount }
export type NormalWindowRouting = { readonly kind: "normal-window"; readonly windowId: number; readonly incognito: false }
export type TabProjectionUnavailable = { readonly kind: "unavailable"; readonly reason: SessionUnavailableReason | "pending-removal" }
export type TabProjectionInvalid = { readonly kind: "invalid"; readonly part: "request" | "device" }
export type ProjectedSkip = readonly [video: VideoId, playlists: Skip]
export type ProjectedFilter = {
  readonly playlist: PlaylistId
  readonly state:
    | { readonly kind: "value" | "default"; readonly filter: Snapshot<Filter> }
    | { readonly kind: "newer-version"; readonly version: number }
    | { readonly kind: "invalid" }
}
export type TabStorageProjection = {
  readonly private: boolean
  readonly settings: SettingsView
  readonly pickerSortAZ: boolean
  readonly paused: boolean
  readonly account:
    | { readonly kind: "signed-out" | "unknown"; readonly acct?: never }
    | {
      readonly kind: "signed-in"
      readonly acct: AccountKey
      readonly setup: AccountSetupRead
      readonly filters: readonly ProjectedFilter[]
      readonly skips: { readonly kind: "normal"; readonly entries: readonly ProjectedSkip[] } | { readonly kind: "private-required" }
    }
}
export type TabProjectionRead = { readonly kind: "projection"; readonly projection: TabStorageProjection } | TabProjectionUnavailable | TabProjectionInvalid
export type LastAccountRead =
  | { readonly kind: "account"; readonly acct: AccountKey }
  | { readonly kind: "none" }
  | { readonly kind: "newer-version" | "invalid"; readonly part: "setup" }
  | TabProjectionUnavailable | TabProjectionInvalid

export function isTabProjectionRequest(value: unknown): value is TabProjectionRequest {
  const account = (v: unknown) => objectShape(v, { kind: x => x === "signed-in", acct: isAccountKey }) ||
    objectShape(v, { kind: x => x === "signed-out" || x === "unknown" })
  return objectShape(value, { private: v => typeof v === "boolean", account })
}
export function isNormalWindowRouting(value: unknown): value is NormalWindowRouting {
  return objectShape(value, { kind: v => v === "normal-window", incognito: v => v === false,
    windowId: v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 })
}

export function readProjectionDevice(records: Readonly<Record<string, unknown>>):
  | { readonly kind: "ready"; readonly pickerSortAZ: boolean; readonly lastAccount: AccountKey | null }
  | TabProjectionUnavailable | TabProjectionInvalid {
  const schema = records.schema
  if (typeof schema === "number" && Number.isSafeInteger(schema) && schema > STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "newer-layout" }
  if (schema !== STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "startup" }
  const raw = records.device
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !isJsonValue(raw) ||
    !["id", "consent", "syncOn"].every(key => Object.hasOwn(raw, key))) return { kind: "invalid", part: "device" }
  try {
    const device = decodeDevice(raw)
    if (device.consent?.v !== CONSENT_VERSION) return { kind: "unavailable", reason: "consent-held" }
    if (device.upgradeNote?.state === "pending") return { kind: "unavailable", reason: "startup" }
    const acct = device.lastAccount
    return { kind: "ready", pickerSortAZ: device.pickerSortAZ, lastAccount: acct !== null && isAccountKey(acct) ? acct : null }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "invalid", part: "device" }
    throw error
  }
}

function projectKey(key: Snapshot<Key> | null): Key | null {
  return key === null ? null : { code: key.code, ctrl: key.ctrl, alt: key.alt, shift: key.shift, meta: key.meta,
    ...(key.char === undefined ? {} : { char: key.char }) }
}
function projectSettings(raw: unknown): SettingsView {
  const read = readSettingsView(raw)
  if (read.kind !== "value") return read
  const s = read.settings, buttons = s.musicActions.buttons, keys = s.musicKeys.keys
  const settings: Settings = {
    theme: s.theme, undoKey: projectKey(s.undoKey),
    autoAdd: { on: s.autoAdd.on, feedback: s.autoAdd.feedback, pct: s.autoAdd.pct, toolbarTick: s.autoAdd.toolbarTick, toolbarPaused: s.autoAdd.toolbarPaused },
    shortcuts: { on: s.shortcuts.on, feedback: s.shortcuts.feedback, music: s.shortcuts.music, preset: s.shortcuts.preset, picker: projectKey(s.shortcuts.picker),
      list: s.shortcuts.list.map(row => ({ id: row.id, label: row.label, key: projectKey(row.key), watchLaterOnEveryAccount: row.watchLaterOnEveryAccount })) },
    quickSave: { on: s.quickSave.on, feedback: s.quickSave.feedback, shortsShelves: s.quickSave.shortsShelves },
    queueButton: { on: s.queueButton.on, feedback: s.queueButton.feedback },
    watchButton: { on: s.watchButton.on, feedback: s.watchButton.feedback, shorts: s.watchButton.shorts },
    cardMenu: { on: s.cardMenu.on, keepLinkMenu: s.cardMenu.keepLinkMenu },
    browserMenu: { on: s.browserMenu.on, feedback: s.browserMenu.feedback }, musicSection: s.musicSection,
    musicActions: { on: s.musicActions.on, feedback: s.musicActions.feedback, preset: s.musicActions.preset,
      buttons: { next: buttons.next, queue: buttons.queue, save: buttons.save, like: buttons.like, remove: buttons.remove, bar: buttons.bar,
        library: buttons.library, mix: buttons.mix, album: buttons.album, artist: buttons.artist } },
    musicKeys: { on: s.musicKeys.on, feedback: s.musicKeys.feedback, preset: s.musicKeys.preset,
      keys: { next: projectKey(keys.next), queue: projectKey(keys.queue), save: projectKey(keys.save), picker: projectKey(keys.picker),
        like: projectKey(keys.like), remove: projectKey(keys.remove), library: projectKey(keys.library), mix: projectKey(keys.mix), album: projectKey(keys.album), artist: projectKey(keys.artist) } },
    anyTabKeys: { on: s.anyTabKeys.on, feedback: s.anyTabKeys.feedback },
    gather: { on: s.gather.on, feedback: s.gather.feedback, to: s.gather.to, order: s.gather.order, close: s.gather.close,
      auto: { unvisited: s.gather.auto.unvisited, after: s.gather.auto.after, background: s.gather.auto.background, count: s.gather.auto.count, n: s.gather.auto.n } }
  }
  return { kind: "value", settings }
}
function projectSetup(records: Readonly<Record<string, unknown>>, acct: AccountKey): AccountSetupRead {
  const read = readAccountSetup(records, acct)
  if (read.kind !== "value" || read.view.kind !== "live") return read
  const s = read.view.setup
  const setup: Setup = {
    label: s.label === null ? null : { name: s.label.name, ...(s.label.handle === undefined ? {} : { handle: s.label.handle }), ...(s.label.avatar === undefined ? {} : { avatar: s.label.avatar }) },
    autoAdd: s.autoAdd.map(row => ({ pl: row.pl, takes: row.takes, ...(row.pct === undefined ? {} : { pct: row.pct }) })),
    targets: { ...s.targets }, quickSave: s.quickSave, musicSave: s.musicSave, gather: s.gather, marks: { ...s.marks }
  }
  return { kind: "value", view: { kind: "live", acct, setup } }
}
function projectFilter(filter: Filter): Filter {
  return { mode: filter.mode, on: filter.on, channels: filter.channels.map(([id, title, handle]) => handle === undefined ? [id, title] : [id, title, handle]) }
}

function accountFilters(records: Readonly<Record<string, unknown>>, acct: AccountKey): readonly ProjectedFilter[] {
  const filters: ProjectedFilter[] = []
  for (const name of Object.keys(records).sort()) {
    const key = parseDocumentKey(name)
    if (key?.kind !== "filter" || key.acct !== acct) continue
    let state: ProjectedFilter["state"]
    try {
      const raw = records[name]
      if (!isJsonValue(raw)) state = { kind: "invalid" }
      else {
        const doc = decodeDocument(structuredClone(raw), decodeFilter)
        state = doc.kind === "value" ? { kind: "value", filter: projectFilter(doc.document.data) }
          : doc.kind === "newer-version" ? { kind: "newer-version", version: doc.version }
          : { kind: "default", filter: defaultFilter() }
      }
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error
      state = { kind: "invalid" }
    }
    filters.push({ playlist: key.playlist, state })
  }
  return filters
}

// An absent filter row uses the model's default. An unreadable row never does.
export function projectTabStorage(input: {
  readonly records: Readonly<Record<string, unknown>>; readonly request: TabProjectionRequest
  readonly memory: SessionMemory; readonly pickerSortAZ: boolean
}): TabStorageProjection {
  const { records, request, memory, pickerSortAZ } = input
  const shared = { private: request.private, settings: projectSettings(records["doc:settings"]), pickerSortAZ, paused: memory.paused }
  if (request.account.kind !== "signed-in") return { ...shared, account: { kind: request.account.kind } }
  const acct = request.account.acct
  const entries: ProjectedSkip[] = [...(request.private ? [] : memory.skips.get(acct) ?? [])]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([video, skip]): ProjectedSkip => [video, skip === "all" ? "all" : [...skip]])
  return { ...shared, account: {
    kind: "signed-in", acct, setup: projectSetup(records, acct), filters: accountFilters(records, acct),
    skips: request.private ? { kind: "private-required" } : { kind: "normal", entries }
  } }
}

export function projectLastAccount(records: Readonly<Record<string, unknown>>, acct: AccountKey | null): LastAccountRead {
  if (acct === null) return { kind: "none" }
  const setup = readAccountSetup(records, acct)
  if (setup.kind !== "value") return { kind: setup.kind, part: "setup" }
  return setup.view.kind === "live" ? { kind: "account", acct } : { kind: "none" }
}
