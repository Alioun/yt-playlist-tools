import { createStoreLifecycle, clearMarkerKey, type BlockedState, type ClearAllResult, type LifecycleState, type StartingOwner, type StoreLifecycle,
  type StoreLifecycleDependencies } from "./store-lifecycle"
import type { createStartingLocalFilterWriter } from "./local-filter-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type StoreLifecycleProofs = [
  Check<Equal<StartingOwner, ReturnType<typeof createStartingLocalFilterWriter>>>,
  Check<Equal<ReturnType<StoreLifecycle["owner"]>, StartingOwner | undefined>>,
  Check<Equal<Extract<LifecycleState, { owner: unknown }>["kind"], "active" | "held">>,
  Check<Equal<"owner" extends keyof BlockedState ? true : false, false>>,
  Check<Equal<Parameters<StoreLifecycleDependencies["local"]["get"]>[0], readonly [typeof clearMarkerKey]>>,
  Check<Equal<Extract<ClearAllResult, { kind: "cleared" }>["next"], "first-run">>,
  Check<Equal<"clear" extends keyof StoreLifecycleDependencies["local"] ? true : false, false>>,
  Check<Equal<"withdrawConsent" extends keyof StoreLifecycle ? true : false, true>>
]

function negative(deps: StoreLifecycleDependencies, lifecycle: StoreLifecycle, state: LifecycleState) {
  // @ts-expect-error The supervisor cannot read the whole local area.
  void deps.local.get(null)
  // @ts-expect-error The supervisor cannot read a credential value by name.
  void deps.local.get(["refreshToken"])
  // @ts-expect-error The supervisor cannot read two keys at once.
  void deps.local.get([clearMarkerKey, "device"])
  // @ts-expect-error The supervisor writes only the fixed marker.
  void deps.local.set({ device: { consent: null } })
  // @ts-expect-error The marker has one fixed shape.
  void deps.local.set({ [clearMarkerKey]: { v: 2, kind: "clear-all" } })
  // @ts-expect-error Session values are never read.
  void deps.session.get()
  // @ts-expect-error The database port deletes only this extension's database.
  void deps.deleteDatabase("other")
  // @ts-expect-error A blocked, starting or clearing state exposes no owner.
  void state.owner
  // @ts-expect-error A popup origin cannot request Clear all.
  void lifecycle.clearAll({ kind: "ui", page: "popup", origin: { kind: "ui", windowId: 1, incognito: false } }, { alsoSynced: false })
  // @ts-expect-error A tab origin cannot request Clear all.
  void lifecycle.clearAll({ kind: "tab", tabId: 1, incognito: false }, { alsoSynced: false })
  // @ts-expect-error The synced choice is required and explicit.
  void lifecycle.clearAll({ kind: "unavailable", reason: "privacy", page: "settings" }, {})
  // @ts-expect-error Construction takes no preloaded owner.
  void createStoreLifecycle({ ...deps, owner: lifecycle.owner() })
  void lifecycle.withdrawConsent
  if (state.kind === "active") void state.owner.ready()
}
void negative
