import { isJsonValue } from "../../shared/contracts/json"
import { sameSyncJson } from "./sync-write-admission"
import type { LegacyKey } from "./legacy"
import { planLegacyStartup, type MigrationContext, type StartupPlan, type StartupSnapshot } from "./legacy-startup"
import type { LocalWriteStorage } from "./local-filter-writer"

export type StartupHost = {
  readonly context: MigrationContext
  readSnapshot(): Promise<StartupSnapshot>
  removeLocal(keys: readonly LegacyKey[]): Promise<void>
  deleteDatabase(name: "yt-playlist-tools"): Promise<void>
  removeSession(keys: readonly ["channelCache"]): Promise<void>
}

export type StartupExecutionResult =
  | { readonly kind: "ok" }
  | Extract<StartupPlan, { kind: "newer-layout" | "invalid" | "unsupported-state" }>
  | { readonly kind: "unconfirmed"; readonly stage: "canonical-batch" | "local-remove" | "schema" }

function sameValue(left: unknown, right: unknown): boolean {
  return left === undefined || right === undefined ? left === right
    : isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right)
}

function sameCanonical(left: StartupSnapshot, right: StartupSnapshot): boolean {
  return sameValue(left.schema, right.schema) && sameValue(left.device, right.device) &&
    sameValue(left.settingsDocument, right.settingsDocument) && sameValue(left.unclaimed, right.unclaimed) &&
    sameValue(left.interimKeysPresent, right.interimKeysPresent)
}

export async function executeLegacyStartup(deps: {
  readonly local: Pick<LocalWriteStorage, "set">
  readonly host: StartupHost
}): Promise<StartupExecutionResult> {
  const { local, host } = deps
  const initial = await host.readSnapshot()
  const plan = planLegacyStartup(initial, host.context)
  switch (plan.kind) {
    case "newer-layout":
    case "invalid":
    case "unsupported-state": return plan
    case "current": return initial.schema === 1 ? { kind: "ok" } : { kind: "unconfirmed", stage: "schema" }
    case "fresh": {
      await local.set({ schema: plan.schema })
      return sameCanonical(await host.readSnapshot(), { ...initial, schema: plan.schema })
        ? { kind: "ok" } : { kind: "unconfirmed", stage: "schema" }
    }
    case "upgrade":
    case "resume": break
  }

  let expected = initial
  if (plan.kind === "upgrade") {
    const batch: unknown = plan.write
    if (!isJsonValue(batch) || batch === null || typeof batch !== "object" || Array.isArray(batch)) {
      throw new TypeError("Migration produced a non-JSON canonical batch")
    }
    await local.set(batch)
    expected = { ...initial, device: plan.write.device, settingsDocument: plan.write["doc:settings"], unclaimed: plan.write.unclaimed }
    const observed = await host.readSnapshot()
    if (!sameCanonical(observed, expected) || !sameValue(observed.legacy, initial.legacy)) {
      return { kind: "unconfirmed", stage: "canonical-batch" }
    }
  }
  const [remove, cleanup, schema] = plan.cleanup.steps
  await host.removeLocal(remove.keys)
  const removed = await host.readSnapshot()
  if (removed.legacy.presentKeys.length !== 0 || !sameCanonical(removed, expected)) {
    return { kind: "unconfirmed", stage: "local-remove" }
  }
  const settled = await Promise.allSettled([
    Promise.resolve().then(() => host.deleteDatabase(cleanup.database)),
    Promise.resolve().then(() => host.removeSession(cleanup.sessionKeys))
  ])
  for (const result of settled) if (result.status === "rejected") throw result.reason
  if (schema.required) await local.set({ schema: schema.value })
  expected = { ...expected, schema: schema.value }
  const final = await host.readSnapshot()
  return sameCanonical(final, expected) && final.legacy.presentKeys.length === 0
    ? { kind: "ok" } : { kind: "unconfirmed", stage: "schema" }
}
