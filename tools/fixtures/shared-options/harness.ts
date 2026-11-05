import { createStartingLocalFilterWriter, type ConfirmedViewChange } from "../../../src/background/store/local-filter-writer"
import { createBrowserStartingLocalFilterWriter } from "../../../src/background/adapters/starting-owner"
import { isJsonValue, type JsonObject } from "../../../src/shared/contracts/json"
import { startingOwnerFixture, gate } from "../starting-owner/support"
export { gate }
export const ui = { kind: "ui", windowId: 1, incognito: false } as const
export type Route = "owner" | "native"
export type Fault = "none" | "reject-before" | "reject-after" | "ignore" | "mismatch" | "readback-fail"

export function object(value: unknown): JsonObject {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Expected finite JSON object")
  return value
}

export function world(route: Route, initial: JsonObject) {
  const h = startingOwnerFixture(initial)
  const trace: { kind: "get"; keys: readonly string[] | null }[] = []
  const batches: JsonObject[] = [],
    events: ConfirmedViewChange[] = []
  const marker = new Error("Synthetic shared option storage fault")
  let fault: Fault = "none",
    afterSet = false
  let readHook: (() => Promise<void>) | undefined, setHook: (() => Promise<void>) | undefined
  const local = {
    async get(keys: readonly string[] | null) {
      trace.push({ kind: "get", keys: keys === null ? null : [...keys] })
      if (readHook) await readHook()
      if (afterSet && fault === "readback-fail") throw marker
      return h.options.local.get(keys)
    },
    async set(items: Readonly<JsonObject>) {
      batches.push(structuredClone(items))
      if (setHook) await setHook()
      if (fault === "reject-before") throw marker
      if (fault !== "ignore") await h.options.local.set(items)
      afterSet = true
      if (fault === "mismatch")
        h.mutate(records => {
          object(object(records["doc:settings"]).data).theme = "light"
        })
      if (fault === "reject-after") throw marker
    }
  }
  const options = { ...h.options, local }
  const { now, generation, syncClock } = options
  if (!now || !generation || !syncClock) throw Error("Finite fixture clock is required")
  const owner =
    route === "native"
      ? createBrowserStartingLocalFilterWriter(h.native, options)
      : createStartingLocalFilterWriter({
          ...options,
          now,
          generation,
          syncClock,
          claim: { kind: "unavailable" },
          sync: {
            get: () => h.native.storage.sync.get(null),
            set: items => h.native.storage.sync.set(items),
            subscribe(changed) {
              const listener = () => changed()
              h.native.storage.sync.onChanged.addListener(listener)
              return () => h.native.storage.sync.onChanged.removeListener(listener)
            }
          },
          session: {
            get: () => h.native.storage.session.get(null),
            set: items => h.native.storage.session.set(items),
            remove: keys => h.native.storage.session.remove(keys.map(key => `${key.kind}:${key.acct}`))
          }
        })
  const unsubscribe = owner.subscribeView(event => events.push(structuredClone(event)))
  return {
    h,
    owner,
    trace,
    batches,
    events,
    marker,
    fault(value: Fault) {
      fault = value
      afterSet = false
    },
    readHook(value?: () => Promise<void>) {
      readHook = value
    },
    setHook(value?: () => Promise<void>) {
      setHook = value
    },
    async dispose() {
      unsubscribe()
      await owner.dispose()
    }
  }
}
