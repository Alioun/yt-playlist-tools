import { classifyRetainedAuthority, archivedKeys } from "./interim-canonical-authority"
import { prepareFirstEditHistory, readFirstEditProvenance } from "./first-edit-provenance"
import {
  CONSENT_VERSION, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION, DecodeError,
  decodeDevice, decodeDocument, decodeFilter, decodeSettings, decodeSetup, decodeSyncState,
  documentKey, isAccountKey, isPlaylistId, parseDocumentKey, readStoredUnclaimed,
  type AccountKey, type Filter, type PlaylistId
} from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { LocalWriteStorage } from "./local-filter-writer"
import { LEGACY_DELETE_KEYS } from "./legacy"
import { mergeUnclaimedChoices, type AccountSnapshot, type ClaimMergeNotice } from "./accounts"
import { sameSyncJson } from "./sync-write-admission"
import { materializeDocumentBody } from "./write-preparation"

export type ClaimAuthority = {
  readonly acct: AccountKey
  readonly lease: string
  readonly browserSession: string
  readonly consentGeneration: string
  readonly signedIn: true
  readonly incognito: false
}
export type ClaimAuthorityState =
  | { readonly kind: "ready"; readonly authority: ClaimAuthority }
  | { readonly kind: "unavailable" }
export type ClaimOwnership =
  | {
    readonly kind: "fixture-owned"
    readonly authority: ClaimAuthority
    readonly lineage: "local-migration-only"
    readonly ownedPlaylistIds: ReadonlySet<PlaylistId>
  }
  | { readonly kind: "unavailable" }
export type ClaimHost =
  | { readonly kind: "unavailable" }
  | {
    readonly kind: "fixture"
    readonly authority: { read(): Promise<ClaimAuthorityState> }
    readonly session: { takeLookup(authority: ClaimAuthority): Promise<boolean> }
    readonly ownership: { lookup(authority: ClaimAuthority): Promise<ClaimOwnership> }
  }
export type ClaimWriteObservation =
  | { readonly kind: "resolved" }
  | { readonly kind: "rejected"; readonly error: unknown }
export type ClaimTransactionResult =
  | { readonly kind: "absent" | "consumed" | "empty-source" | "no-match" }
  | { readonly kind: "committed"; readonly notice: ClaimMergeNotice; readonly write: ClaimWriteObservation }
  | { readonly kind: "unavailable"; readonly reason:
    "authority" | "startup" | "sync-on" | "inventory" | "ownership" |
    "checked-this-session" | "removal-required" | "notice-pending" | "stale" }
  | { readonly kind: "invalid"; readonly field: string }
  | { readonly kind: "failed"; readonly stage: "before-set" | "set-not-observed"; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly write: ClaimWriteObservation; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown }
  }

type Refusal = Extract<ClaimTransactionResult, { kind: "unavailable" | "invalid" }>
const unavailable = (reason: Extract<Refusal, { kind: "unavailable" }>["reason"]): Refusal => ({ kind: "unavailable", reason })
function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}
function copyJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(copyJson)
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyJson(child)]))
}
function snapshot(raw: unknown): JsonObject | undefined {
  if (!isJsonObject(raw) || Object.keys(Object.prototype).length > 0) return
  const copy = copyJson(raw)
  return isJsonObject(copy) ? copy : undefined
}
function validAuthority(state: ClaimAuthorityState): ClaimAuthority | undefined {
  if (state.kind !== "ready") return
  const authority = state.authority
  if (!isAccountKey(authority.acct) || authority.signedIn !== true || authority.incognito !== false ||
    [authority.lease, authority.browserSession, authority.consentGeneration].some(value => typeof value !== "string" || value.length === 0)) return
  return Object.freeze({ acct: authority.acct, lease: authority.lease, browserSession: authority.browserSession,
    consentGeneration: authority.consentGeneration, signedIn: true, incognito: false })
}
function sameAuthority(a: ClaimAuthority, state: ClaimAuthorityState): boolean {
  const b = validAuthority(state)
  return b !== undefined && a.acct === b.acct && a.lease === b.lease && a.browserSession === b.browserSession &&
    a.consentGeneration === b.consentGeneration
}

function readContext(records: JsonObject, acct: AccountKey) {
  const retained = classifyRetainedAuthority(records)
  const exempt = retained.kind === "canonical-archive" ? archivedKeys(retained.checkpoint) : new Set<string>()
  if (records.schema !== STORAGE_SCHEMA_VERSION || retained.kind === "held" ||
    LEGACY_DELETE_KEYS.some(key => Object.hasOwn(records, key) && !exempt.has(key))) return unavailable("startup")
  const rawDevice = records.device
  if (!isJsonObject(rawDevice) || !["id", "consent", "syncOn", "upgradeNote", "claimNotice", "lastAccount",
    "newPlaylistVisibility", "pickerSortAZ", "detailedLog", "recentAdds", "legacyCleared"].every(key => Object.hasOwn(rawDevice, key))) {
    return unavailable("startup")
  }
  let field = "device"
  try {
    const device = decodeDevice(rawDevice)
    if (device.consent?.v !== CONSENT_VERSION || device.upgradeNote?.state === "pending") return unavailable("startup")
    if (device.syncOn) return unavailable("sync-on")
    field = "settings"
    const settings = decodeDocument(records["doc:settings"], decodeSettings)
    if (settings.kind !== "value") return unavailable("inventory")
    field = "sync"
    let history: { raw: JsonObject; editedSinceOff: boolean } | undefined
    if (Object.hasOwn(records, "sync")) {
      if (!isJsonObject(records.sync) || readFirstEditProvenance({ kind: "present", raw: records.sync }).kind === "invalid") return { kind: "invalid", field } satisfies Refusal
      const sync = decodeSyncState(records.sync)
      if (sync.status !== "off") return unavailable("inventory")
      history = { raw: records.sync, editedSinceOff: sync.editedSinceOff }
    }
    field = "unclaimed"
    const unclaimed = readStoredUnclaimed(records.unclaimed)
    field = "inventory"
    const setupName = documentKey({ kind: "setup", acct })
    const setup = decodeDocument(records[setupName], decodeSetup)
    if (Object.hasOwn(records, setupName) && setup.kind !== "value") return unavailable("inventory")
    const filters: Record<string, Filter> = {}
    for (const name of Object.keys(records)) {
      if (name === `doc:filter:${acct}` || name.startsWith(`${setupName}:`)) return unavailable("inventory")
      if (!name.startsWith(`doc:filter:${acct}:`)) continue
      const key = parseDocumentKey(name)
      if (key?.kind !== "filter" || documentKey(key) !== name) return unavailable("inventory")
      const filter = decodeDocument(records[name], decodeFilter)
      if (filter.kind !== "value") return unavailable("inventory")
      Object.defineProperty(filters, key.playlist, { value: filter.document.data, enumerable: true })
    }
    if (setup.kind !== "value" && Object.keys(filters).length > 0) return unavailable("inventory")
    const current: AccountSnapshot = setup.kind === "value"
      ? { kind: "present", bodies: { setup: setup.document.data, filters } } : { kind: "absent" }
    return { kind: "ready", device, rawDevice, settings: settings.document.data, current, unclaimed, history, setupName } as const
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "invalid", field } satisfies Refusal
    throw error
  }
}

/** Non-owning transaction. The combined owner holds its lane through full readback. */
export async function executeLocalClaim(deps: {
  readonly local: LocalWriteStorage
  readonly host: Extract<ClaimHost, { kind: "fixture" }>
  readonly now: () => number
  readonly generation: () => string
}): Promise<ClaimTransactionResult> {
  try {
    const authority = validAuthority(await deps.host.authority.read())
    if (!authority) return unavailable("authority")
    const baseline = snapshot(await deps.local.get(null))
    if (!baseline) return { kind: "invalid", field: "snapshot" }
    const context = readContext(baseline, authority.acct)
    if (context.kind !== "ready") return context
    if (context.unclaimed.kind !== "pending") return { kind: context.unclaimed.kind }
    if (context.device.claimNotice !== null) return unavailable("notice-pending")
    const source = context.unclaimed.data
    if (source.autoAdd.length === 0 && source.shortcutPlaylist === null && Object.keys(source.filters).length === 0) return { kind: "empty-source" }
    if (!sameAuthority(authority, await deps.host.authority.read())) return unavailable("stale")
    if (!await deps.host.session.takeLookup(authority)) return unavailable("checked-this-session")
    if (!sameAuthority(authority, await deps.host.authority.read())) return unavailable("stale")
    const ownership = await deps.host.ownership.lookup(authority)
    if (!sameAuthority(authority, await deps.host.authority.read())) return unavailable("stale")
    const preflight = snapshot(await deps.local.get(null))
    if (!preflight || !sameSyncJson(baseline, preflight)) return unavailable("stale")
    if (!sameAuthority(authority, await deps.host.authority.read())) return unavailable("stale")
    if (ownership.kind !== "fixture-owned" || ownership.lineage !== "local-migration-only" ||
      !sameAuthority(authority, { kind: "ready", authority: ownership.authority })) return unavailable("ownership")
    const ownedPlaylistIds = new Set<PlaylistId>()
    for (const playlist of ownership.ownedPlaylistIds) {
      if (!isPlaylistId(playlist)) return unavailable("ownership")
      ownedPlaylistIds.add(playlist)
    }
    const merge = mergeUnclaimedChoices({ acct: authority.acct, unclaimed: source,
      current: context.current, settings: context.settings, ownedPlaylistIds })
    if (merge.kind !== "matched") return { kind: merge.kind }
    if (merge.account.kind === "remove") return unavailable("removal-required")
    const device = { ...context.rawDevice, claimNotice: merge.notice }
    if (!isJsonObject(device)) return { kind: "invalid", field: "device" }
    decodeDevice(device)
    const items: Record<string, JsonValue> = { device, unclaimed: null }
    if (merge.account.kind === "retain") {
      const changes = [
        ...(merge.account.setup.kind === "save" ? [{ kind: "setup" as const, name: context.setupName, data: merge.account.setup.data }] : []),
        ...merge.account.filtersToAdd.map(filter => ({ kind: "filter" as const,
          name: documentKey({ kind: "filter", acct: authority.acct, playlist: filter.playlist }), data: filter.data }))
      ]
      for (const change of changes) {
        const body = change.kind === "setup"
          ? materializeDocumentBody({ kind: "setup", data: change.data })
          : materializeDocumentBody({ kind: "filter", data: change.data })
        if (body.kind !== "prepared") return { kind: "invalid", field: "body" }
        const old = baseline[change.name]
        const envelope = { ...(isJsonObject(old) ? old : {}),
          v: DOCUMENT_VERSION, gen: deps.generation(), at: deps.now(), by: context.device.id, data: body.data }
        if ("deleted" in envelope) delete envelope.deleted
        if (!isJsonObject(envelope)) return { kind: "invalid", field: "envelope" }
        const decoded = change.kind === "setup" ? decodeDocument(envelope, decodeSetup) : decodeDocument(envelope, decodeFilter)
        if (decoded.kind !== "value") return { kind: "invalid", field: "envelope" }
        items[change.name] = envelope
      }
      if (changes.length > 0) {
        const patch = prepareFirstEditHistory({ history: context.history ? { kind: "present", raw: context.history.raw } : { kind: "absent" }, syncOn: false })
        if (patch.kind === "unavailable") return { kind: "invalid", field: "sync" }
        if (patch.kind === "set") items.sync = patch.sync
      }
    }
    const expected = snapshot({ ...baseline, ...items })
    if (!expected) return { kind: "invalid", field: "batch" }
    if (!sameAuthority(authority, await deps.host.authority.read())) return unavailable("stale")
    let write: ClaimWriteObservation
    try { await deps.local.set(items); write = { kind: "resolved" } }
    catch (error) { write = { kind: "rejected", error } }
    function unconfirmed(cause: Extract<ClaimTransactionResult, { kind: "unconfirmed" }>["cause"]): ClaimTransactionResult {
      return { kind: "unconfirmed", write, cause }
    }
    try {
      const readback = snapshot(await deps.local.get(null))
      if (!sameAuthority(authority, await deps.host.authority.read())) return unconfirmed({ kind: "authority" })
      if (readback && sameSyncJson(readback, expected)) return { kind: "committed", notice: merge.notice, write }
      if (write.kind === "rejected" && readback && sameSyncJson(readback, baseline)) {
        return { kind: "failed", stage: "set-not-observed", error: write.error }
      }
      return unconfirmed({ kind: "readback" })
    } catch (error) { return unconfirmed({ kind: "read-failed", error }) }
  } catch (error) { return { kind: "failed", stage: "before-set", error } }
}
