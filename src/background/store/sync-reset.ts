import { decodeSyncMeta, decodeSyncState, STORAGE_SCHEMA_VERSION } from "../../shared/model"
import { objectShape } from "../../shared/contracts/object-shape"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { sameSyncJson } from "./sync-write-admission"
import { syncMutationTime, type SyncMutationPace } from "./sync-mutation-pacing"
import type { SyncClock } from "./local-filter-writer"

const markerKey = "pending:clear-all"
const natural = (raw: unknown): raw is number => typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
const text = (raw: unknown): raw is string => typeof raw === "string" && raw.length > 0
export type ResetMetadata = { readonly v: 1; readonly reset: true; readonly id: string; readonly created: number }
export type SyncedClearMarker = {
  readonly v: 2; readonly kind: "clear-all"; readonly scope: "synced"
  readonly metadata: ResetMetadata; readonly phase: "set" | "remove" | "done"
  readonly notBefore: number; readonly wait: "pace" | "opaque"
  readonly diagnostic: JsonValue
}
export type ResetEffect = { readonly operation: "set" | "remove" | "marker-set"; readonly names: readonly string[];
  readonly outcome: { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown } }
export type SyncedResetResult =
  | { readonly kind: "confirmed"; readonly marker: SyncedClearMarker; readonly effects: readonly ResetEffect[] }
  | { readonly kind: "deferred"; readonly notBefore: number; readonly marker: SyncedClearMarker; readonly effects: readonly ResetEffect[] }
  | { readonly kind: "unavailable"; readonly reason: "layout" | "newer-layout" | "marker" | "clock" | "disposed" }
  | { readonly kind: "unconfirmed"; readonly stage: "marker" | "sync"; readonly effects: readonly ResetEffect[]; readonly error?: unknown }
export type SyncResetPorts = {
  readonly local: {
    get(keys: readonly string[]): Promise<Readonly<Record<string, unknown>>>
    set(items: Readonly<Record<string, JsonValue>>): Promise<void>
  }
  readonly sync: {
    get(): Promise<Readonly<Record<string, unknown>>>
    set(items: Readonly<Record<string, JsonValue>>): Promise<void>
    remove(keys: readonly string[]): Promise<void>
  }
  readonly pace: SyncMutationPace
  readonly clock: Pick<SyncClock, "now" | "wallNow">
  readonly generation: () => string
}
export function resetMetadata(raw: unknown): ResetMetadata | undefined {
  try {
    if (!objectShape(raw, { v: v => v === 1, reset: v => v === true, id: text, created: natural })) return
    const value = decodeSyncMeta(raw)
    if (value.v === 1 && value.reset === true) return { v: 1, reset: true, id: value.id, created: value.created }
  } catch {}
}
export function readSyncedClearMarker(raw: unknown): SyncedClearMarker | undefined {
  if (!objectShape(raw, { v: v => v === 2, kind: v => v === "clear-all", scope: v => v === "synced",
    metadata: v => resetMetadata(v) !== undefined, phase: v => v === "set" || v === "remove" || v === "done",
    notBefore: natural, wait: v => v === "pace" || v === "opaque", diagnostic: isJsonValue })) return
  const metadata = resetMetadata(raw.metadata)
  if (!metadata || !natural(raw.notBefore) || !isJsonValue(raw.diagnostic) ||
    raw.phase !== "set" && raw.phase !== "remove" && raw.phase !== "done" || raw.wait !== "pace" && raw.wait !== "opaque") return
  return { v: 2, kind: "clear-all", scope: "synced", metadata, phase: raw.phase,
    notBefore: raw.notBefore, wait: raw.wait, diagnostic: raw.diagnostic }
}
const jsonRecord = (raw: unknown): raw is JsonObject => raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
function failureDiagnostic(error: unknown): JsonObject {
  return error instanceof Error ? { name: error.name, message: error.message } : { name: null, message: null }
}

export function createSyncReset(ports: SyncResetPorts) {
  const ownedOpaque = new Set<string>()
  async function write(marker: SyncedClearMarker, live: () => boolean, effects: ResetEffect[]): Promise<boolean> {
    let outcome: ResetEffect["outcome"] = { kind: "resolved" }
    try { await ports.local.set({ [markerKey]: marker }) } catch (error) { outcome = { kind: "rejected", error } }
    effects.push({ operation: "marker-set", names: [markerKey], outcome })
    if (!live()) return false
    const read = await ports.local.get([markerKey])
    const actual = readSyncedClearMarker(read[markerKey])
    return live() && !!actual && sameSyncJson(actual, marker)
  }
  return {
    async prepare(): Promise<{ readonly kind: "prepared"; readonly marker: SyncedClearMarker } | Extract<SyncedResetResult, { kind: "unavailable" }>> {
      const local = await ports.local.get(["schema", markerKey, "sync"])
      if (Object.hasOwn(local, markerKey)) {
        const marker = readSyncedClearMarker(local[markerKey])
        if (marker) {
          const key = `${marker.metadata.id}:${marker.notBefore}`
          if (marker.wait === "opaque" && !ownedOpaque.has(key)) {
            const time = syncMutationTime(ports.pace, ports.clock)
            if (!time) return { kind: "unavailable", reason: "clock" }
            const restored = { ...marker, notBefore: Math.max(marker.notBefore, time.wall + 60000) }
            ownedOpaque.add(`${restored.metadata.id}:${restored.notBefore}`)
            ports.pace.nextInvocation = Math.max(ports.pace.nextInvocation, time.mono + 60000)
            return { kind: "prepared", marker: restored }
          }
          return { kind: "prepared", marker }
        }
        return { kind: "unavailable", reason: "marker" }
      }
      if (typeof local.schema === "number" && local.schema > STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "newer-layout" }
      if (local.schema !== STORAGE_SCHEMA_VERSION && local.schema !== undefined) return { kind: "unavailable", reason: "layout" }
      const time = syncMutationTime(ports.pace, ports.clock)
      if (!time) return { kind: "unavailable", reason: "clock" }
      let notBefore = time.wall + Math.max(0, ports.pace.nextInvocation - time.mono)
      let wait: SyncedClearMarker["wait"] = "pace"
      if (Object.hasOwn(local, "sync")) {
        try {
          const gate = decodeSyncState(local.sync).opaqueWrite?.gate
          if (gate) { notBefore = Math.max(notBefore, gate.notBefore, time.wall + 60000); wait = "opaque" }
        } catch { return { kind: "unavailable", reason: "marker" } }
      }
      const remote = await ports.sync.get()
      const used = new Set<string>()
      if (jsonRecord(local.sync) && typeof local.sync.joined === "string") used.add(local.sync.joined)
      if (jsonRecord(remote["s:meta"]) && typeof remote["s:meta"].id === "string") used.add(remote["s:meta"].id)
      let id = ports.generation()
      for (let attempt = 0; attempt < 8 && used.has(id); attempt++) id = ports.generation()
      if (!text(id) || used.has(id)) return { kind: "unavailable", reason: "marker" }
      const metadata: ResetMetadata = { v: 1, reset: true, id, created: time.wall }
      decodeSyncMeta(metadata)
      return { kind: "prepared", marker: { v: 2, kind: "clear-all", scope: "synced", metadata,
        phase: "set", notBefore, wait, diagnostic: null } }
    },
    async run(initial: SyncedClearMarker, live: () => boolean): Promise<SyncedResetResult> {
      const effects: ResetEffect[] = []
      let marker = initial
      const event = syncMutationTime(ports.pace, ports.clock)
      if (!event) return { kind: "unavailable", reason: "clock" }
      try {
        if (!live()) return { kind: "unavailable", reason: "disposed" }
        const current = readSyncedClearMarker((await ports.local.get([markerKey]))[markerKey])
        if (!current || !sameSyncJson(current, marker)) return { kind: "unavailable", reason: "marker" }
        // A persisted in-flight call is uncertain after restart, even if wall time advanced.
        if (marker.wait === "opaque") ports.pace.nextInvocation = Math.max(ports.pace.nextInvocation, event.mono + Math.max(0, marker.notBefore - event.wall))
        for (let opportunity = 0; opportunity < 2; opportunity++) {
          if (!live()) return { kind: "unavailable", reason: "disposed" }
          const time = syncMutationTime(ports.pace, ports.clock)
          if (!time) return { kind: "unavailable", reason: "clock" }
          const floor = Math.max(ports.pace.nextInvocation, time.mono + Math.max(0, marker.notBefore - time.wall))
          if (time.mono < floor || marker.wait === "opaque" && event.wall < marker.notBefore)
            return { kind: "deferred", marker, effects, notBefore: floor }
          const remote = await ports.sync.get()
          if (!live() || !jsonRecord(remote)) return { kind: "unconfirmed", stage: "sync", effects }
          const exact = Object.keys(remote).length === 1 && sameSyncJson(remote["s:meta"] ?? null, marker.metadata)
          if (marker.phase === "done" || marker.phase === "remove" && exact) {
            if (!exact) return { kind: "unconfirmed", stage: "sync", effects }
            marker = { ...marker, phase: "done", wait: "pace" }
            if (!await write(marker, live, effects)) return { kind: "unconfirmed", stage: "marker", effects }
            return { kind: "confirmed", marker, effects }
          }
          if (marker.phase === "remove" && !sameSyncJson(remote["s:meta"] ?? null, marker.metadata)) return { kind: "unconfirmed", stage: "sync", effects }
          const names = marker.phase === "set" ? ["s:meta"] : Object.keys(remote).filter(name => name !== "s:meta").sort().slice(0, 32)
          const armed: SyncedClearMarker = { ...marker, wait: "opaque", notBefore: time.wall + 60000 }
          if (!await write(armed, live, effects)) return { kind: "unconfirmed", stage: "marker", effects }
          ownedOpaque.add(`${armed.metadata.id}:${armed.notBefore}`)
          if (!live()) return { kind: "unavailable", reason: "disposed" }
          const invoked = syncMutationTime(ports.pace, ports.clock)
          if (!invoked || invoked.mono < ports.pace.nextInvocation) return { kind: "unconfirmed", stage: "marker", effects }
          ports.pace.nextInvocation = invoked.mono + 5000
          let outcome: ResetEffect["outcome"] = { kind: "resolved" }
          try {
            if (marker.phase === "set") await ports.sync.set({ "s:meta": marker.metadata })
            else await ports.sync.remove(names)
          } catch (error) { outcome = { kind: "rejected", error } }
          effects.push({ operation: marker.phase === "set" ? "set" : "remove", names, outcome })
          if (!live()) return { kind: "unavailable", reason: "disposed" }
          const read = await ports.sync.get()
          if (!jsonRecord(read)) return { kind: "unconfirmed", stage: "sync", effects }
          const applied = sameSyncJson(read["s:meta"] ?? null, marker.metadata) &&
            (marker.phase === "set" || names.every(name => !Object.hasOwn(read, name)))
          const after = syncMutationTime(ports.pace, ports.clock)
          if (!after) return { kind: "unavailable", reason: "clock" }
          marker = { ...marker, phase: applied ? "remove" : marker.phase,
            wait: outcome.kind === "rejected" ? "opaque" : "pace",
            notBefore: Math.max(invoked.wall + 5000, outcome.kind === "rejected" ? after.wall + 60000 : 0),
            diagnostic: outcome.kind === "rejected" ? failureDiagnostic(outcome.error) : marker.diagnostic }
          if (marker.wait === "opaque") ownedOpaque.add(`${marker.metadata.id}:${marker.notBefore}`)
          if (outcome.kind === "rejected") ports.pace.nextInvocation = Math.max(ports.pace.nextInvocation, after.mono + 60000)
          if (!await write(marker, live, effects)) return { kind: "unconfirmed", stage: "marker", effects }
          if (!applied && outcome.kind === "resolved") return { kind: "unconfirmed", stage: "sync", effects }
        }
        return { kind: "deferred", marker, effects, notBefore: ports.pace.nextInvocation }
      } catch (error) { return { kind: "unconfirmed", stage: "sync", effects, error } }
    }
  }
}
