import { CONSENT_VERSION, STORAGE_SCHEMA_VERSION, decodeDevice, isAccountKey, parseDocumentKey, documentKey, type AccountKey } from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { objectShape } from "../../shared/contracts/object-shape"
import { planAccountSessionRemoval } from "./account-removal-session"
import { removalProgressShards } from "./account-removal-execution"
import { readConsentDevice } from "./consent-withdrawal"
import { keySettingsPending } from "./key-settings-progress"
import { featureProgressPending } from "./feature-settings-progress"
import { sameSyncJson } from "./sync-write-admission"
import { resetMetadata, type ResetMetadata } from "./sync-reset"
import type { SessionStorage } from "./session-memory"

export const receivedResetKey = "pending:sync-reset-receive"
export const resetNoticeText = "Your synced settings were deleted in another browser, so Perchling was reset here."
export type ResetNotice = { readonly id: string; readonly text: typeof resetNoticeText }
export type SyncResetReceiveHost = { readonly kind: "unavailable" } | {
  readonly kind: "available"
  removeLocal(names: readonly string[]): Promise<void>
  readonly session: SessionStorage
  publishNotice(notice: ResetNotice): Promise<"published" | "already-published" | "unconfirmed">
}
export type ReceivedResetMarker = {
  readonly v: 1; readonly kind: "received-reset"; readonly metadata: ResetMetadata
  readonly authority: JsonObject; readonly accounts: readonly AccountKey[]; readonly targets: readonly string[]
  readonly originalAuthority: JsonObject
  readonly recovery: { readonly kind: "none" } | { readonly kind: "prepared" | "authorized"; readonly authority: JsonObject }
  readonly phase: "session" | "local" | "commit" | "notice"
}
export type ReceivedResetResult =
  | { readonly kind: "ordinary" | "already-received" }
  | { readonly kind: "reset-received"; readonly metadata: ResetMetadata; readonly accounts: readonly AccountKey[] }
  | { readonly kind: "reset-held"; readonly reason: "metadata" | "authority" | "inventory" | "host" | "session" | "local" | "marker" | "notice" | "disposed"; readonly error?: unknown }
const object = (raw: unknown): raw is JsonObject => raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
const snapshot = (raw: JsonObject): JsonObject => JSON.parse(JSON.stringify(raw))
const markerJson = (marker: ReceivedResetMarker): JsonObject => ({ ...marker, accounts: [...marker.accounts], targets: [...marker.targets] })
function authority(records: JsonObject): JsonObject | undefined {
  const read = readConsentDevice(records)
  if (records.schema !== STORAGE_SCHEMA_VERSION || read.kind !== "supported" || read.device.consent?.v !== CONSENT_VERSION ||
    !read.device.syncOn || read.control && read.control.state.kind !== "agreed") return
  return { device: read.raw, control: records["consent:state"] ?? null,
    controlPresent: Object.hasOwn(records, "consent:state"), unclaimed: records.unclaimed ?? null,
    unclaimedPresent: Object.hasOwn(records, "unclaimed"), jobs: records["consent:jobs"] ?? null,
    jobsPresent: Object.hasOwn(records, "consent:jobs") }
}
export function readReceivedReset(raw: unknown): ReceivedResetMarker | undefined {
  if (!objectShape(raw, { v: v => v === 1, kind: v => v === "received-reset", metadata: v => !!resetMetadata(v),
    authority: object, originalAuthority: object,
    recovery: v => objectShape(v, { kind: k => k === "none" }) || objectShape(v, { kind: k => k === "prepared" || k === "authorized", authority: object }),
    accounts: v => Array.isArray(v) && v.length <= 128 && v.every(isAccountKey),
    targets: v => Array.isArray(v) && v.length <= 4096 && v.every(n => typeof n === "string"),
    phase: v => v === "session" || v === "local" || v === "commit" || v === "notice" })) return
  const metadata = resetMetadata(raw.metadata)
  if (!metadata || !object(raw.authority) || !object(raw.originalAuthority) || !object(raw.recovery) || !Array.isArray(raw.accounts) || !raw.accounts.every(isAccountKey) ||
    !Array.isArray(raw.targets) || !raw.targets.every((name): name is string => typeof name === "string") ||
    raw.phase !== "session" && raw.phase !== "local" && raw.phase !== "commit" && raw.phase !== "notice") return
  const accounts = [...new Set(raw.accounts)]
  if (accounts.length !== raw.accounts.length || new Set(raw.targets).size !== raw.targets.length) return
  const expected = new Set(["doc:settings", ...accounts.flatMap(acct => [`cache:${acct}`, ...removalProgressShards.map(shard => `progress:${acct}:${shard}`)])])
  for (const name of raw.targets) {
    const key = parseDocumentKey(name)
    if (!expected.has(name) && !(key && (key.kind === "setup" || key.kind === "filter") && accounts.includes(key.acct) && documentKey(key) === name)) return
  }
  if ([...expected].some(name => !raw.targets.includes(name))) return
  let recovery: ReceivedResetMarker["recovery"]
  if (raw.recovery.kind === "none") recovery = { kind: "none" }
  else if ((raw.recovery.kind === "prepared" || raw.recovery.kind === "authorized") && object(raw.recovery.authority))
    recovery = { kind: raw.recovery.kind, authority: snapshot(raw.recovery.authority) }
  else return
  return { v: 1, kind: "received-reset", metadata, authority: snapshot(raw.authority), accounts,
    originalAuthority: snapshot(raw.originalAuthority), recovery, targets: [...raw.targets], phase: raw.phase }
}
export function receivedResetResumable(records: JsonObject): boolean {
  const marker = readReceivedReset(records[receivedResetKey]), current = authority(records)
  return !!marker && marker.recovery.kind !== "prepared" && !!current && sameSyncJson(marker.authority, current)
}

export async function authorizeReceivedResetRecovery(deps: {
  readonly local: { get(keys: null): Promise<Readonly<Record<string, unknown>>>; set(items: JsonObject): Promise<void> }
  readonly record: JsonObject; readonly current: JsonObject; readonly stopped: () => boolean
}): Promise<"authorized" | "held"> {
  const marker = readReceivedReset(deps.record), binding = authority(deps.current)
  if (!marker || !binding || !sameSyncJson(deps.current[receivedResetKey] ?? null, deps.record)) return "held"
  let expected = snapshot(deps.current)
  for (const kind of ["prepared", "authorized"] as const) {
    const before = await deps.local.get(null)
    if (deps.stopped() || !object(before) || !sameSyncJson(before, expected)) return "held"
    const next: ReceivedResetMarker = { ...marker, authority: kind === "authorized" ? snapshot(binding) : marker.authority,
      recovery: { kind, authority: snapshot(binding) } }
    expected = { ...expected, [receivedResetKey]: markerJson(next) }
    try { await deps.local.set({ [receivedResetKey]: markerJson(next) }) } catch {}
    const after = await deps.local.get(null)
    if (deps.stopped() || !object(after) || !sameSyncJson(after, expected)) return "held"
  }
  return "authorized"
}

export async function receiveDeliberateReset(deps: {
  readonly local: { get(keys: readonly string[] | null): Promise<Readonly<Record<string, unknown>>>; set(items: Readonly<Record<string, JsonValue>>): Promise<void> }
  readonly host: SyncResetReceiveHost
  readonly remote: () => Promise<Readonly<Record<string, unknown>>>
  readonly stopped: () => boolean
  readonly revoke: (accounts: readonly AccountKey[]) => void
}): Promise<ReceivedResetResult> {
  const held = (reason: Extract<ReceivedResetResult, { kind: "reset-held" }>["reason"], error?: unknown): ReceivedResetResult =>
    ({ kind: "reset-held", reason, ...(error === undefined ? {} : { error }) })
  let stage: Extract<ReceivedResetResult, { kind: "reset-held" }>["reason"] = "authority"
  try {
    let records = await deps.local.get(null)
    if (deps.stopped()) return held("disposed")
    if (!object(records)) return held("inventory")
    const current = authority(records)
    // Sync-off returns before remote() or any change payload is inspected.
    if (!current) return Object.hasOwn(records, receivedResetKey) ? held("authority") : { kind: "ordinary" }
    let marker = readReceivedReset(records[receivedResetKey])
    if (Object.hasOwn(records, receivedResetKey) && !marker) return held("marker")
    if (marker && (marker.recovery.kind === "prepared" || !sameSyncJson(marker.authority, current))) return held("authority")
    if (!marker) {
      const remote = await deps.remote()
      if (deps.stopped()) return held("disposed")
      if (!object(remote)) return held("metadata")
      if (!Object.hasOwn(remote, "s:meta")) return { kind: "ordinary" }
      const raw = remote["s:meta"]
      if (!object(raw) || raw.v !== 1 || typeof raw.reset !== "boolean" && raw.reset !== undefined) return held("metadata")
      if (raw.reset !== true) return { kind: "ordinary" }
      const metadata = resetMetadata(raw)
      if (!metadata) return held("metadata")
      if (object(records.sync) && sameSyncJson(records.sync.resetReceived ?? null, metadata)) return { kind: "already-received" }
      if (Object.keys(records).some(name => ["pending:account-removal", "pending:sync-join", "pending:settings-import"].includes(name)) ||
        keySettingsPending(records) || featureProgressPending(records)) return held("authority")
      const accounts = new Set<AccountKey>(), documents: string[] = []
      for (const name of Object.keys(records)) {
        if (!name.startsWith("doc:")) continue
        const key = parseDocumentKey(name)
        if (!key || documentKey(key) !== name) return held("inventory")
        if (key.kind === "settings") documents.push(name)
        else if (key.kind === "setup" || key.kind === "filter") { documents.push(name); accounts.add(key.acct) }
      }
      if (accounts.size > 128 || documents.length > 1792) return held("inventory")
      const targets = [...new Set([...documents, "doc:settings", ...[...accounts].flatMap(acct =>
        [`cache:${acct}`, ...removalProgressShards.map(shard => `progress:${acct}:${shard}`)])])].sort()
      marker = { v: 1, kind: "received-reset", metadata, authority: snapshot(current), originalAuthority: snapshot(current),
        recovery: { kind: "none" }, accounts: [...accounts].sort(), targets, phase: "session" }
    }
    if (deps.host.kind !== "available") return held("host")
    const host = deps.host
    deps.revoke(marker.accounts)
    async function observe(expected: ReceivedResetMarker): Promise<JsonObject | undefined> {
      if (deps.stopped()) return
      const read = await deps.local.get(null)
      if (!object(read) || deps.stopped() || !receivedResetResumable(read) ||
        !sameSyncJson(read[receivedResetKey] ?? null, markerJson(expected))) return
      return read
    }
    async function checkpoint(next: ReceivedResetMarker): Promise<boolean> {
      stage = "marker"
      try { await deps.local.set({ [receivedResetKey]: { ...next, accounts: [...next.accounts], targets: [...next.targets] } }) } catch {}
      return !!await observe(next)
    }
    if (!await checkpoint(marker)) return held("marker")
    stage = "session"
    for (const acct of marker.accounts) {
      if (!await observe(marker)) return held("authority")
      const plan = planAccountSessionRemoval(acct, await host.session.get())
      if (plan.kind !== "supported") return held("session")
      for (const effect of plan.effects) {
        if (!await observe(marker)) return held("authority")
        let error: unknown
        try {
          if (effect.kind === "set") await host.session.set({ [effect.key]: effect.value })
          else await host.session.remove([effect.key])
        } catch (failure) { error = failure }
        const read = await host.session.get()
        if (!object(read)) return held("session", error)
        const applied = effect.kind === "set" ? sameSyncJson(read[effect.key] ?? null, effect.value) : !Object.hasOwn(read, `${effect.key.kind}:${effect.key.acct}`)
        if (!applied) return held("session", error)
      }
      const read = await host.session.get()
      if (!object(read) || !sameSyncJson(read, plan.expected)) return held("session")
    }
    marker = { ...marker, phase: "local" }
    if (!await checkpoint(marker)) return held("marker")
    stage = "local"
    for (let index = 0; index < marker.targets.length; index += 32) {
      if (!await observe(marker)) return held("authority")
      const names = marker.targets.slice(index, index + 32)
      let error: unknown
      try { await host.removeLocal(names) } catch (failure) { error = failure }
      const read = await observe(marker)
      if (!read || names.some(name => Object.hasOwn(read, name))) return held("local", error)
    }
    records = await observe(marker) ?? {}
    if (marker.targets.some(name => Object.hasOwn(records, name))) return held("local")
    marker = { ...marker, phase: "commit" }
    if (!await checkpoint(marker)) return held("marker")
    const beforeCommit = await observe(marker)
    if (!beforeCommit || !object(beforeCommit.sync)) return held("authority")
    const sync = { ...beforeCommit.sync, joined: marker.metadata.id, pushed: {}, status: "ok", editedSinceOff: false,
      everEdited: false, resetReceived: marker.metadata }
    try { await deps.local.set({ sync }) } catch {}
    const committed = await observe(marker)
    if (!committed || !sameSyncJson(committed.sync ?? null, sync)) return held("local")
    marker = { ...marker, phase: "notice" }
    if (!await checkpoint(marker)) return held("marker")
    stage = "notice"
    const notice = await host.publishNotice({ id: marker.metadata.id, text: resetNoticeText })
    if (notice === "unconfirmed") return held("notice")
    if (!await observe(marker)) return held("authority")
    stage = "marker"
    try { await host.removeLocal([receivedResetKey]) } catch {}
    const final = await deps.local.get(null), finalSession = await host.session.get()
    if (!object(final) || !object(finalSession) || deps.stopped() || !sameSyncJson(authority(final) ?? null, marker.authority) ||
      Object.hasOwn(final, receivedResetKey) || marker.targets.some(name => Object.hasOwn(final, name))) return held("local")
    for (const acct of marker.accounts) {
      const plan = planAccountSessionRemoval(acct, finalSession)
      if (plan.kind !== "supported" || plan.effects.length !== 0) return held("session")
    }
    return { kind: "reset-received", metadata: marker.metadata, accounts: marker.accounts }
  } catch (error) { return held(stage, error) }
}
