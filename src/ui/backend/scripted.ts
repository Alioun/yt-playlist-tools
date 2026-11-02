import type { PermissionGrant } from "../../shared/contracts/first-run"
import { uiContract, type UiMessages } from "../../shared/contracts/ui"
import { createMemoryNetwork } from "../../shared/rpc/memory"
import { createRpc } from "../../shared/rpc/rpc"
import type { JsonObject } from "../../shared/contracts/json"
import type { BackendOptions, LocalChange, LocalListener } from "./backend"
import { createBackend } from "./core"
import { gatherPush, type GatherPush } from "../../shared/contracts/ui-gather"

export type ScriptedAnswer = { [K in keyof UiMessages]: { readonly kind: K; readonly result: UiMessages[K]["result"] } }[keyof UiMessages]
export type ScriptedResponders = { readonly [K in keyof UiMessages]?: (payload: UiMessages[K]["payload"]) => UiMessages[K]["result"] }
export type ScriptedBackendOptions = BackendOptions & {
  readonly records?: JsonObject
  readonly answers: readonly ScriptedAnswer[]
  /** Answers by kind, for pages that call the same route many times in no fixed order. Queued answers go first. */
  readonly respond?: ScriptedResponders
  readonly grants?: PermissionGrant & { readonly www: boolean }
}
export function createScriptedBackend(options: ScriptedBackendOptions) {
  let records = structuredClone(options.records ?? {})
  let grants = options.grants ?? { www: true, music: false, browserMenu: false }
  const listeners = new Set<LocalListener>(), reads: (readonly string[])[] = []
  const pushListeners = new Set<(message: unknown) => unknown>()
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
      "ui.clearAll": payload => take("ui.clearAll", payload),
      "ui.change": payload => take("ui.change", payload),
      "ui.syncedChoices": payload => take("ui.syncedChoices", payload),
      "ui.accountInView": payload => take("ui.accountInView", payload),
      "ui.playlists": payload => take("ui.playlists", payload),
      "ui.create": payload => take("ui.create", payload),
      "ui.resolveChannel": payload => take("ui.resolveChannel", payload),
      "ui.status": payload => take("ui.status", payload),
      "ui.pause": payload => take("ui.pause", payload),
      "ui.recentAdds": payload => take("ui.recentAdds", payload),
      "ui.device": payload => take("ui.device", payload),
      "ui.filter": payload => take("ui.filter", payload),
      "ui.filterChannel": payload => take("ui.filterChannel", payload),
      "ui.removeKeptFilters": payload => take("ui.removeKeptFilters", payload),
      "ui.diagnostics": payload => take("ui.diagnostics", payload),
      "ui.withdraw": payload => take("ui.withdraw", payload),
      "ui.removeSetup": payload => take("ui.removeSetup", payload),
      "ui.exportSettings": payload => take("ui.exportSettings", payload),
      "ui.importSettings": payload => take("ui.importSettings", payload),
      "ui.noteSeen": payload => take("ui.noteSeen", payload),
      "ui.noteAgree": payload => take("ui.noteAgree", payload),
      "ui.playingNow": payload => take("ui.playingNow", payload),
      "ui.add": payload => take("ui.add", payload),
      "ui.gather": payload => take("ui.gather", payload),
      "ui.gatherUndo": payload => take("ui.gatherUndo", payload),
      "ui.gathers": payload => take("ui.gathers", payload)
    }
  })
  function take<K extends keyof UiMessages>(kind: K, payload: UiMessages[K]["payload"]): UiMessages[K]["result"] {
    const responder = options.respond?.[kind] as ((payload: UiMessages[K]["payload"]) => UiMessages[K]["result"]) | undefined
    if (responder && answers[0]?.kind !== kind) {
      const result: unknown = responder(payload)
      if (!uiContract[kind].result(result)) throw Error(`Scripted ${kind} answer is invalid`)
      return structuredClone(result) as UiMessages[K]["result"]
    }
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
    },
    pushes: { listen(receive) { pushListeners.add(receive); return () => { pushListeners.delete(receive) } } }
  }, options)
  return {
    backend,
    reads: () => reads.map(keys => [...keys]),
    listening: () => listeners.size,
    remaining: () => answers.length,
    grant(value: typeof grants) { grants = value },
    /** The background's `ui.gatherProgress`; answers what the page answered, as the browser hands back the first answer. */
    pushGather(payload: GatherPush): unknown {
      for (const receive of [...pushListeners]) { const answer = receive(gatherPush(options.build, payload)); if (answer !== undefined) return answer }
      return undefined
    },
    replace(items: JsonObject, area = "local") {
      const changes: LocalChange = Object.fromEntries(Object.entries(items).map(([key, value]) => [key, { oldValue: records[key], newValue: value }]))
      if (area === "local") records = { ...records, ...structuredClone(items) }
      for (const listener of listeners) listener(changes, area)
    },
    dispose() { backend.dispose(); unhandle(); rpc.dispose() }
  }
}
