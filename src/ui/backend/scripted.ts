import type { PermissionGrant } from "../../shared/contracts/first-run"
import { uiContract, type UiMessages } from "../../shared/contracts/ui"
import { createMemoryNetwork } from "../../shared/rpc/memory"
import { createRpc } from "../../shared/rpc/rpc"
import type { JsonObject } from "../../shared/contracts/json"
import type { BackendOptions, LocalChange, LocalListener } from "./backend"
import { createBackend } from "./core"

export type ScriptedAnswer = { [K in keyof UiMessages]: { readonly kind: K; readonly result: UiMessages[K]["result"] } }[keyof UiMessages]
export type ScriptedBackendOptions = BackendOptions & {
  readonly records?: JsonObject
  readonly answers: readonly ScriptedAnswer[]
  readonly grants?: PermissionGrant & { readonly www: boolean }
}
export function createScriptedBackend(options: ScriptedBackendOptions) {
  let records = structuredClone(options.records ?? {})
  let grants = options.grants ?? { www: true, music: false, browserMenu: false }
  const listeners = new Set<LocalListener>(), reads: (readonly string[])[] = []
  const answers = [...options.answers]
  const network = createMemoryNetwork<undefined>({ delivery: "immediate" })
  // No sender capability is used by this scripted endpoint. Authentication is exercised by the native consumer.
  const transport = {
    send: network.connect(undefined).send,
    listen: network.connect(undefined).listen
  }
  const rpc = createRpc<UiMessages, undefined>(transport, { ...options, contract: uiContract })
  const unhandle = rpc.handle({
    authenticate: () => ({ kind: "accepted", context: undefined }),
    handlers: {
      "ui.clearAll": () => take("ui.clearAll"),
      "ui.change": () => take("ui.change"),
      "ui.syncedChoices": () => take("ui.syncedChoices"),
      "ui.accountInView": () => take("ui.accountInView"),
      "ui.playlists": () => take("ui.playlists"),
      "ui.create": () => take("ui.create"),
      "ui.resolveChannel": () => take("ui.resolveChannel")
    }
  })
  function take<K extends keyof UiMessages>(kind: K): UiMessages[K]["result"] {
    const next = answers.shift(), result: unknown = next?.result
    if (next?.kind !== kind || !uiContract[kind].result(result)) throw Error("Scripted answer unavailable")
    return structuredClone(result)
  }
  const backend = createBackend({
    local: {
      async get(keys) {
        reads.push([...keys])
        return structuredClone(Object.fromEntries(keys.filter(key => Object.hasOwn(records, key)).map(key => [key, records[key]])))
      },
      async all() {
        reads.push(["*"])
        return structuredClone(records)
      },
      onChanged: { addListener: fn => { listeners.add(fn) }, removeListener: fn => { listeners.delete(fn) } }
    },
    send: network.connect(undefined).send,
    access: {
      has: site => Promise.resolve(grants[site]),
      request: site => Promise.resolve(grants[site]),
      hasBrowserMenu: () => Promise.resolve(grants.browserMenu),
      requestCombined: () => Promise.resolve({ music: grants.music, browserMenu: grants.browserMenu })
    }
  }, options)
  return {
    backend,
    reads: () => reads.map(keys => [...keys]),
    listening: () => listeners.size,
    remaining: () => answers.length,
    grant(value: typeof grants) { grants = value },
    replace(items: JsonObject, area = "local") {
      const changes: LocalChange = Object.fromEntries(Object.entries(items).map(([key, value]) => [key, { oldValue: records[key], newValue: value }]))
      if (area === "local") records = { ...records, ...structuredClone(items) }
      for (const listener of listeners) listener(changes, area)
    },
    dispose() { backend.dispose(); unhandle(); rpc.dispose() }
  }
}
