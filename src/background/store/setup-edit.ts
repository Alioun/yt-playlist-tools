import {
  DecodeError, decodeDocument, decodeFilter, decodeSetup, defaultFilter, documentKey, isAccountKey, isPlaylistId, isShortcutId, parseDocumentKey,
  type AccountKey, type DocumentKey, type Filter, type PlaylistId, type Settings, type Setup, type SetupContext, type ShortcutId
} from "../../shared/model"
import { readSettingsView, type Snapshot } from "../../shared/model/settings-view"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { changeAccountChoice, type AccountChoice } from "./accounts"

export type SetupDestination =
  | { readonly kind: "quick-save" | "music-save" | "gather" }
  | { readonly kind: "shortcut"; readonly shortcut: ShortcutId }

export type SetupDestinationExpectation =
  | { readonly setup: "none" }
  | { readonly setup: "live"; readonly playlist: PlaylistId | null }

export type SetupDestinationChange = {
  readonly acct: AccountKey
  readonly destination: SetupDestination
  readonly expected: SetupDestinationExpectation
  readonly playlist: PlaylistId | null
}

export type AccountSetupView =
  | { readonly kind: "none"; readonly acct: AccountKey }
  | { readonly kind: "live"; readonly acct: AccountKey; readonly setup: Snapshot<Setup> }

export type AccountSetupRead =
  | { readonly kind: "value"; readonly view: AccountSetupView }
  | { readonly kind: "newer-version" | "invalid" }

export type SetupEvent = { readonly kind: "setup-changed"; readonly source: "local" | "sync"; readonly acct: AccountKey }

export type SetupDestinationPlan =
  | { readonly kind: "unchanged" | "invalid" | "update-needed" | "remove" }
  | { readonly kind: "stale"; readonly reason: "setup" | "destination" | "shortcut" }
  | {
    readonly kind: "save"
    readonly key: Extract<DocumentKey, { kind: "setup" }>
    readonly setup: Setup
    readonly context: Readonly<Required<SetupContext>>
  }

const fields = { "quick-save": "quickSave", "music-save": "musicSave", gather: "gather" } as const satisfies
  Record<Exclude<SetupDestination["kind"], "shortcut">, keyof Setup>

function plain(raw: unknown, keys: readonly string[]): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !isJsonValue(raw)) return false
  const own = Reflect.ownKeys(raw)
  return own.length === keys.length && own.every(key => typeof key === "string" && keys.includes(key))
}

function parseDestination(raw: unknown): SetupDestination | undefined {
  if (plain(raw, ["kind"])) {
    const kind = raw.kind
    return kind === "quick-save" || kind === "music-save" || kind === "gather" ? Object.freeze({ kind }) : undefined
  }
  if (!plain(raw, ["kind", "shortcut"]) || raw.kind !== "shortcut") return
  const shortcut = raw.shortcut
  return isShortcutId(shortcut) ? Object.freeze({ kind: "shortcut", shortcut }) : undefined
}

function parseChoice(raw: unknown): PlaylistId | null | undefined {
  return raw === null || isPlaylistId(raw) ? raw : undefined
}

function parseExpectation(raw: unknown): SetupDestinationExpectation | undefined {
  if (plain(raw, ["setup"]) && raw.setup === "none") return Object.freeze({ setup: "none" })
  if (!plain(raw, ["setup", "playlist"]) || raw.setup !== "live") return
  const playlist = parseChoice(raw.playlist)
  return playlist === undefined ? undefined : Object.freeze({ setup: "live", playlist })
}

export function parseSetupDestinationChange(raw: unknown): SetupDestinationChange | undefined {
  if (!plain(raw, ["acct", "destination", "expected", "playlist"])) return
  const acct = raw.acct, destination = parseDestination(raw.destination), expected = parseExpectation(raw.expected), playlist = parseChoice(raw.playlist)
  if (!isAccountKey(acct) || !destination || !expected || playlist === undefined) return
  return Object.freeze({ acct, destination, expected, playlist })
}

function detach(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(detach)
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, detach(child)]))
}

function destinationOf(setup: Snapshot<Setup>, destination: SetupDestination): PlaylistId | null {
  const value = destination.kind === "shortcut"
    ? Object.hasOwn(setup.targets, destination.shortcut) ? setup.targets[destination.shortcut] : null
    : setup[fields[destination.kind]]
  return isPlaylistId(value) ? value : null
}

export function expectDestination(view: AccountSetupView, destination: SetupDestination): SetupDestinationExpectation {
  return view.kind === "none" ? { setup: "none" } : { setup: "live", playlist: destinationOf(view.setup, destination) }
}

function readSettings(records: Readonly<Record<string, unknown>>): Snapshot<Settings> | "newer-version" | "invalid" {
  const view = readSettingsView(records["doc:settings"])
  return view.kind === "value" ? view.settings : view.kind
}

type SetupDocument = { readonly kind: "none" } | { readonly kind: "live"; readonly setup: Setup } | { readonly kind: "newer-version" } | { readonly kind: "invalid" }

function readSetupDocument(records: Readonly<Record<string, unknown>>, acct: AccountKey): SetupDocument {
  const raw = records[documentKey({ kind: "setup", acct })]
  if (raw === undefined) return { kind: "none" }
  if (!isJsonValue(raw)) return { kind: "invalid" }
  try {
    const document = decodeDocument(detach(raw), decodeSetup)
    if (document.kind === "newer-version") return { kind: "newer-version" }
    return document.kind === "value" ? { kind: "live", setup: document.document.data } : { kind: "none" }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "invalid" }
    throw error
  }
}

export function readAccountSetup(records: Readonly<Record<string, unknown>>, acct: AccountKey): AccountSetupRead {
  const settings = readSettings(records), document = readSetupDocument(records, acct)
  if (settings === "invalid" || document.kind === "invalid") return { kind: "invalid" }
  if (document.kind === "newer-version") return { kind: "newer-version" }
  if (document.kind === "none") return { kind: "value", view: Object.freeze({ kind: "none", acct }) }
  const shortcuts = new Set(settings === "newer-version" ? Object.keys(document.setup.targets) : settings.shortcuts.list.map(row => row.id))
  const setup = { ...document.setup, targets: Object.fromEntries(Object.entries(document.setup.targets).filter(([id]) => shortcuts.has(id))) }
  return { kind: "value", view: Object.freeze({ kind: "live", acct, setup }) }
}

function accountFilters(records: JsonObject, acct: AccountKey): Record<string, Filter> | undefined {
  const filters: Record<string, Filter> = {}
  for (const [name, raw] of Object.entries(records)) {
    const key = parseDocumentKey(name)
    if (key?.kind !== "filter" || key.acct !== acct) continue
    try {
      const document = decodeDocument(raw, decodeFilter)
      if (document.kind === "value") filters[key.playlist] = document.document.data
      // Only a filter's presence decides whether the setup keeps it alive.
      else if (document.kind === "newer-version") filters[key.playlist] = defaultFilter()
    } catch (error) {
      if (error instanceof DecodeError) return
      throw error
    }
  }
  return filters
}

function watchLaterChosen(settings: Snapshot<Settings>, targets: Readonly<Record<string, string>>): ReadonlySet<PlaylistId> {
  const playlist = "WL"
  return isPlaylistId(playlist) && settings.shortcuts.list.some(row => row.watchLaterOnEveryAccount && !Object.hasOwn(targets, row.id))
    ? new Set([playlist]) : new Set<PlaylistId>()
}

export function planSetupDestination(input: { readonly records: JsonObject; readonly change: SetupDestinationChange }): SetupDestinationPlan {
  const { records, change } = input
  const settings = readSettings(records), document = readSetupDocument(records, change.acct)
  if (settings === "invalid" || document.kind === "invalid") return { kind: "invalid" }
  if (document.kind === "newer-version") return { kind: "update-needed" }
  const shortcutIds = new Set(settings === "newer-version"
    ? document.kind === "live" ? Object.keys(document.setup.targets) : []
    : settings.shortcuts.list.map(row => row.id))
  if (change.destination.kind === "shortcut") {
    if (settings !== "newer-version" && !shortcutIds.has(change.destination.shortcut)) return { kind: "stale", reason: "shortcut" }
    shortcutIds.add(change.destination.shortcut)
  }
  if (change.expected.setup !== document.kind) return { kind: "stale", reason: "setup" }
  if (change.expected.setup === "live" && document.kind === "live" && destinationOf(document.setup, change.destination) !== change.expected.playlist) {
    return { kind: "stale", reason: "destination" }
  }
  const filters = accountFilters(records, change.acct)
  if (!filters) return { kind: "invalid" }
  const targets = { ...(document.kind === "live" ? document.setup.targets : {}) }
  if (change.destination.kind === "shortcut") {
    if (change.playlist === null) delete targets[change.destination.shortcut]
    else targets[change.destination.shortcut] = change.playlist
  }
  // Unknown shared choices cannot justify pruning account references or marks.
  const additionalChosenPlaylists = settings === "newer-version"
    ? new Set(document.kind === "live" ? Object.keys(document.setup.marks).filter(isPlaylistId) : [])
    : watchLaterChosen(settings, targets)
  const context = { shortcutIds, additionalChosenPlaylists }
  const choice: AccountChoice = change.destination.kind === "shortcut"
    ? { kind: "shortcut-target", shortcut: change.destination.shortcut, playlist: change.playlist }
    : { kind: "save-target", field: fields[change.destination.kind], playlist: change.playlist }
  const result = changeAccountChoice({
    acct: change.acct, context, choice,
    current: document.kind === "live" ? { kind: "present", bodies: { setup: document.setup, filters } } : { kind: "absent" }
  })
  switch (result.kind) {
    case "unchanged": return { kind: "unchanged" }
    case "invalid": return { kind: "invalid" }
    case "remove": return { kind: "remove" }
    case "save": return { kind: "save", key: { kind: "setup", acct: change.acct }, setup: result.bodies.setup, context }
  }
}

export function planSetupAccountChoice(records: JsonObject, acct: AccountKey, choice: Extract<AccountChoice, { kind: "auto-add" | "takes" | "percentage" }>): SetupDestinationPlan {
  const settings = readSettings(records), document = readSetupDocument(records, acct)
  if (settings === "invalid" || document.kind === "invalid") return { kind: "invalid" }
  if (document.kind === "newer-version") return { kind: "update-needed" }
  const filters = accountFilters(records, acct)
  if (!filters) return { kind: "invalid" }
  const setup = document.kind === "live" ? document.setup : undefined
  const context = {
    shortcutIds: new Set(settings === "newer-version" ? Object.keys(setup?.targets ?? {}) : settings.shortcuts.list.map(row => row.id)),
    additionalChosenPlaylists: settings === "newer-version"
      ? new Set(Object.keys(setup?.marks ?? {}).filter(isPlaylistId)) : watchLaterChosen(settings, setup?.targets ?? {})
  }
  const result = changeAccountChoice({ acct, context, choice, current: setup
    ? { kind: "present", bodies: { setup, filters } } : { kind: "absent" } })
  switch (result.kind) {
    case "unchanged": return { kind: "unchanged" }
    case "invalid": return { kind: "invalid" }
    case "remove": return { kind: "remove" }
    case "save": return { kind: "save", key: { kind: "setup", acct }, setup: result.bodies.setup, context }
  }
}
