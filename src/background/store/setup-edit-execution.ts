import { prepareFirstEditHistory } from "./first-edit-provenance"
import { DOCUMENT_VERSION, decodeDocument, decodeSetup, documentKey, type AccountKey } from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { ChangeResult } from "../../shared/contracts/results"
import type { executeSharedSetting } from "./shared-setting-execution"
import { sameSyncJson } from "./sync-write-admission"
import { prepareDocumentBody } from "./write-preparation"
import { planAccountDocumentWrite, captureAccountRemoval, type RemovalCapture, type RemovalResult } from "./account-removal-execution"
import { planSetupDestination, readAccountSetup, type AccountSetupView, type SetupDestinationChange, type SetupDestinationPlan } from "./setup-edit"

export type SetupDestinationResult =
  | { readonly kind: "committed"; readonly view: AccountSetupView }
  | { readonly kind: "unchanged" }
  | { readonly kind: "stale"; readonly reason: "setup" | "destination" | "shortcut" }
  | { readonly kind: "result"; readonly result: Extract<ChangeResult, { refused: string }> }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "consent-held" | "sync-writer-required" | "stale" | "disposed" }
  | { readonly kind: "removal"; readonly result: Exclude<RemovalResult, { readonly kind: "committed" | "unchanged" }> }
  | { readonly kind: "failed"; readonly stage: "before-set" | "set"; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed" | "rejected"; readonly error: unknown }
  }

// The same owner lane ports as the shared Settings write, so Setup edits gain no second persistence path.
export type SetupEditPorts = Parameters<typeof executeSharedSetting>[0] & {
  readonly remove: (capture: RemovalCapture, expectedRecords: JsonObject) => Promise<RemovalResult>
}

function jsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

function copy(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  return Array.isArray(value) ? value.map(copy) : copyObject(value)
}

function copyObject(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]))
}

export async function executeSetupDestination(deps: SetupEditPorts, change: SetupDestinationChange): Promise<SetupDestinationResult> {
  return executeSetupEdit(deps, change.acct, records => planSetupDestination({ records, change }))
}

export async function executeSetupEdit(deps: SetupEditPorts, acct: AccountKey, planEdit: (records: JsonObject) => SetupDestinationPlan): Promise<SetupDestinationResult> {
  const invalid = { kind: "result", result: { refused: "invalid" } } as const
  const unavailable = { kind: "unavailable", reason: "sync-writer-required" } as const
  const stopped = { kind: "unavailable", reason: "disposed" } as const
  try {
    const records = await deps.local.get(null)
    if (deps.disposed()) return stopped
    const ready = deps.authority(records)
    if (ready.kind !== "ready") return { kind: "unavailable", reason: ready.reason === "account-context" ? "sync-writer-required" : ready.reason }
    if (!jsonObject(records)) return invalid
    const before = copyObject(records)
    const plan = planEdit(before)
    switch (plan.kind) {
      case "invalid": return invalid
      case "update-needed": return { kind: "result", result: { refused: "update-needed" } }
      case "stale": return { kind: "stale", reason: plan.reason }
      case "remove": {
        const captured = captureAccountRemoval(before, acct, ready)
        if (captured.kind === "unchanged") return { kind: "unavailable", reason: "stale" }
        if (captured.kind !== "captured") return { kind: "removal", result: captured }
        const removed = await deps.remove(captured.capture, before)
        if (removed.kind === "unchanged") return { kind: "unavailable", reason: "stale" }
        if (removed.kind !== "committed") return { kind: "removal", result: removed }
        try {
          const confirmed = await deps.local.get(null)
          if (deps.disposed() || deps.authority(confirmed).kind !== "ready") return { kind: "unconfirmed", cause: { kind: "authority" } }
          const read = readAccountSetup(confirmed, acct)
          return read.kind === "value" && read.view.kind === "none"
            ? { kind: "committed", view: read.view } : { kind: "unconfirmed", cause: { kind: "readback" } }
        } catch (error) { return { kind: "unconfirmed", cause: { kind: "read-failed", error } } }
      }
      case "unchanged": {
        if (!ready.device.syncOn) return { kind: "unchanged" }
        const admission = planAccountDocumentWrite({ local: before, sync: await deps.sync.get(), intent: { kind: "unchanged", key: { kind: "setup", acct } } })
        if (deps.disposed()) return stopped
        if (admission.kind === "unavailable") return unavailable
        if (admission.kind === "refused") return { kind: "result", result: { refused: admission.reason } }
        return { kind: "unchanged" }
      }
      case "save": break
    }
    const prepared = prepareDocumentBody({ kind: "setup", data: plan.setup, context: plan.context })
    if (prepared.kind !== "prepared") return invalid
    const name = documentKey(plan.key), raw = before[name]
    const envelope = { ...(jsonObject(raw) ? raw : {}), v: DOCUMENT_VERSION,
      gen: deps.generation(), at: deps.now(), by: ready.device.id, data: prepared.data }
    if ("deleted" in envelope) delete envelope.deleted
    if (!jsonObject(envelope) || decodeDocument(envelope, decodeSetup).kind !== "value") return invalid
    const items: JsonObject = { [name]: envelope }
    if (ready.device.syncOn) {
      const admission = planAccountDocumentWrite({ local: before, sync: await deps.sync.get(), intent: { kind: "changed", key: plan.key, document: envelope } })
      if (deps.disposed()) return stopped
      if (admission.kind === "unavailable") return unavailable
      if (admission.kind === "refused") return { kind: "result", result: { refused: admission.reason } }
      if (admission.kind === "planned" && ready.history) {
        if (!jsonObject(before.sync)) return unavailable
        const repaired = deps.repairHistory(before.sync, admission.repairs)
        if (repaired) items.sync = repaired
      }
    }
    const effective = items.sync ?? before.sync
    const patch = prepareFirstEditHistory({ history: Object.hasOwn(before, "sync") ? { kind: "present", raw: effective } : { kind: "absent" }, syncOn: ready.device.syncOn })
    if (patch.kind === "unavailable") return unavailable
    if (patch.kind === "set") items.sync = patch.sync
    if (deps.disposed()) return stopped
    const current = await deps.local.get(null)
    if (deps.disposed()) return stopped
    if (!jsonObject(current) || !sameSyncJson(current, before)) return { kind: "unavailable", reason: "stale" }
    const expected = copyObject({ ...before, ...items })
    try { await deps.local.set(items) } catch (error) {
      try {
        const after = await deps.local.get(null)
        return jsonObject(after) && sameSyncJson(after, before) ? { kind: "failed", stage: "set", error } : { kind: "unconfirmed", cause: { kind: "rejected", error } }
      } catch { return { kind: "unconfirmed", cause: { kind: "rejected", error } } }
    }
    try {
      const confirmed = await deps.local.get(null)
      if (deps.disposed()) return { kind: "unconfirmed", cause: { kind: "authority" } }
      if (!jsonObject(confirmed) || !sameSyncJson(confirmed, expected)) return { kind: "unconfirmed", cause: { kind: "readback" } }
      if (deps.authority(confirmed).kind !== "ready") return { kind: "unconfirmed", cause: { kind: "authority" } }
      const read = readAccountSetup(confirmed, acct)
      if (read.kind !== "value" || read.view.kind !== "live") return { kind: "unconfirmed", cause: { kind: "readback" } }
      return { kind: "committed", view: read.view }
    } catch (error) { return { kind: "unconfirmed", cause: { kind: "read-failed", error } } }
  } catch (error) { return { kind: "failed", stage: "before-set", error } }
}
