import type { AccountKey } from "../../shared/model"
import { planAccountSessionRemoval } from "./account-removal-session"
import { accountRemovalLocalName, removalProgressShards, type AccountRemovalHost, type RemovalLocalKey } from "./account-removal-execution"
import { sameSyncJson } from "./sync-write-admission"
import { isJsonValue } from "../../shared/contracts/json"

export type ReceivedRemovalCleanup =
  | { readonly kind: "confirmed" }
  | { readonly kind: "session-layout" }
  | { readonly kind: "rejected"; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly cause: "authority" | "readback" }

// The receiver runs this before the Setup tombstone lands. A restart then still finds the live
// acknowledged Setup and the same incoming tombstone, so it repeats only the cleanup that is left.
export async function cleanReceivedSetupRemoval(acct: AccountKey, ports: {
  readonly host: Exclude<AccountRemovalHost, { kind: "unavailable" }>
  current(): Promise<Readonly<Record<string, unknown>> | undefined>
  accepted(): void
}): Promise<ReceivedRemovalCleanup> {
  const plan = planAccountSessionRemoval(acct, await ports.host.session.get())
  if (plan.kind !== "supported") return { kind: "session-layout" }
  const before = await ports.current()
  if (!before) return { kind: "unconfirmed", cause: "authority" }
  const keys: RemovalLocalKey[] = [{ kind: "cache", acct }, ...removalProgressShards.map(shard => ({ kind: "progress", acct, shard } as const))]
  const present = keys.filter(key => Object.hasOwn(before, accountRemovalLocalName(key, acct)))
  ports.accepted()
  try {
    if (present.length) await ports.host.removeLocal(present)
    for (const effect of plan.effects) {
      if (effect.kind === "set") await ports.host.session.set({ [effect.key]: effect.value })
      else await ports.host.session.remove([effect.key])
    }
  } catch (error) { return { kind: "rejected", error } }
  const after = await ports.current()
  if (!after) return { kind: "unconfirmed", cause: "authority" }
  const session = await ports.host.session.get()
  if (present.some(key => Object.hasOwn(after, accountRemovalLocalName(key, acct))) ||
    !isJsonValue(session) || !sameSyncJson(session, plan.expected)) return { kind: "unconfirmed", cause: "readback" }
  return { kind: "confirmed" }
}
