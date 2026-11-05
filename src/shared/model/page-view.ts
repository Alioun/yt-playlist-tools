import { decodeAccountCache, type AccountCache } from "./account-cache"
import { DecodeError, isRecord } from "./codec"
import { decodeDevice } from "./decodeDevice"
import { decodeFilter } from "./decodeFilter"
import { decodeSetup } from "./decodeSetup"
import { decodeSyncState } from "./decodeSyncState"
import { readStoredUnclaimed } from "./decodeUnclaimed"
import { CONSENT_VERSION, decodeDocument, STORAGE_SCHEMA_VERSION } from "./documents"
import { decodeLastAccount } from "./lastAccount"
import { readSettingsView, type SettingsView, type Snapshot } from "./settings-view"
import type { Device, Filter, Setup, SyncState, Unclaimed } from "./types"
import { isAccountKey, parseDocumentKey, type AccountKey, type PlaylistId } from "./validation"

export type PageDevice = { readonly kind: "missing" | "invalid" } | { readonly kind: "newer-version"; readonly version: number } | { readonly kind: "current"; readonly device: Snapshot<Device> }
/** One account setup this browser holds, with what it knows of the account and its playlists. */
export type PageSetup = {
  readonly acct: AccountKey
  readonly setup: Snapshot<Setup>
  readonly cache: AccountCache | null
  readonly filters: ReadonlyMap<PlaylistId, Snapshot<Filter>>
  /** Each filter's generation, which a confirmed mode switch names so it never clears a newer edit. */
  readonly filterGens: ReadonlyMap<PlaylistId, string>
}
/**
 * What the popup and settings show from `storage.local` (UI-POP-02), from one read decoded once. A record that
 * doesn't decode reads as absent, never as a guess.
 */
export type PageView =
  | {
      readonly kind: "view"
      readonly layout: "missing" | "current" | "invalid" | "newer-version"
      readonly device: PageDevice
      readonly settings: SettingsView
      readonly setups: readonly PageSetup[]
      readonly unclaimed: Snapshot<Unclaimed> | null
      readonly sync: Snapshot<SyncState> | null
      readonly lastAccount: AccountKey | null
      /**
       * An earlier version's choices are kept, unused, for review (ACC-48). Restore and Discard need the interim
       * conversion and checked playlist ownership, which stay off until ticket 25's live checks (G29).
       */
      readonly leftBehind: boolean
    }
  | { readonly kind: "unavailable"; readonly reason: "read" | "disposed" }

const pageKeys = new Set(["schema", "device", "lastAccount", "unclaimed", "sync", "pending:sync-join", "interimConversion"])
/** SYNC-08 steps 3 and 5: while the join question waits for an answer, the browser pushes nothing and its status reads `waiting`. */
function joinWaiting(raw: unknown): boolean {
  return isRecord(raw) && raw.kind === "sync-join" && raw.phase === "choice"
}
/**
 * The records a page view keeps from its one whole read (DATA-07). Watch progress and anything else, such as a
 * 1.x record the migration hasn't removed yet, are dropped at once and never redraw a page.
 */
export function pageViewKeeps(key: string): boolean {
  return pageKeys.has(key) || key.startsWith("doc:") || key.startsWith("cache:")
}

function attempt<T>(read: () => T): T | null {
  try {
    return read()
  } catch (error) {
    if (error instanceof DecodeError) return null
    throw error
  }
}
function pageDevice(raw: unknown): PageDevice {
  if (raw === undefined) return { kind: "missing" }
  if (!isRecord(raw) || !["id", "consent", "syncOn"].every(key => Object.hasOwn(raw, key))) return { kind: "invalid" }
  const device = attempt(() => decodeDevice(raw))
  if (!device) return { kind: "invalid" }
  if (device.consent && device.consent.v > CONSENT_VERSION) return { kind: "newer-version", version: device.consent.v }
  return { kind: "current", device }
}
function liveSetup(raw: unknown): Setup | null {
  const read = attempt(() => decodeDocument(raw, decodeSetup))
  return read?.kind === "value" ? read.document.data : null
}
function liveFilter(raw: unknown): { readonly filter: Filter; readonly gen: string } | null {
  const read = attempt(() => decodeDocument(raw, decodeFilter))
  return read?.kind === "value" ? { filter: read.document.data, gen: read.document.gen } : null
}

export function readPageView(records: Readonly<Record<string, unknown>>): PageView {
  const schema = records.schema
  const setups = new Map<AccountKey, Setup>()
  const filters = new Map<AccountKey, Map<PlaylistId, { readonly filter: Filter; readonly gen: string }>>()
  for (const [key, raw] of Object.entries(records)) {
    const document = parseDocumentKey(key)
    if (document?.kind === "setup") {
      const setup = liveSetup(raw)
      if (setup) setups.set(document.acct, setup)
    } else if (document?.kind === "filter") {
      const filter = liveFilter(raw)
      if (filter) filters.set(document.acct, (filters.get(document.acct) ?? new Map()).set(document.playlist, filter))
    }
  }
  const stored = attempt(() => readStoredUnclaimed(records.unclaimed))
  return {
    kind: "view",
    layout:
      schema === undefined
        ? "missing"
        : schema === STORAGE_SCHEMA_VERSION
          ? "current"
          : typeof schema === "number" && Number.isSafeInteger(schema) && schema > STORAGE_SCHEMA_VERSION
            ? "newer-version"
            : "invalid",
    device: pageDevice(records.device),
    settings: readSettingsView(records["doc:settings"]),
    setups: [...setups]
      .map(([acct, setup]) => {
        const cacheKey = `cache:${acct}`
        const own = [...(filters.get(acct) ?? [])]
        return {
          acct,
          setup,
          filters: new Map(own.map(([playlist, entry]) => [playlist, entry.filter])),
          filterGens: new Map(own.map(([playlist, entry]) => [playlist, entry.gen])),
          cache: Object.hasOwn(records, cacheKey) ? attempt(() => decodeAccountCache(records[cacheKey])) : null
        }
      })
      .sort((a, b) => (a.setup.label?.name ?? "").localeCompare(b.setup.label?.name ?? "") || a.acct.localeCompare(b.acct)),
    unclaimed: stored?.kind === "pending" ? stored.data : null,
    sync:
      records.sync === undefined
        ? null
        : attempt(() => {
            const state = decodeSyncState(records.sync)
            return joinWaiting(records["pending:sync-join"]) ? { ...state, status: "waiting" } : state
          }),
    lastAccount: attempt(() => decodeLastAccount(records)),
    leftBehind: Object.hasOwn(records, "interimConversion")
  }
}

export function setupOf(view: PageView, acct: AccountKey | null): PageSetup | undefined {
  return view.kind === "view" && acct !== null && isAccountKey(acct) ? view.setups.find(entry => entry.acct === acct) : undefined
}
