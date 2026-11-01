import { createLocalFilterWriter, createStartingLocalFilterWriter, type ConfirmedViewChange } from "../../../src/background/store/local-filter-writer"
import { documentKey } from "../../../src/shared/model"
import { readConsentDevice, withdrawalIntentItems, withdrawalItems, agreementItems } from "../../../src/background/store/consent-withdrawal"
import { settingsImportKey } from "../../../src/background/store/settings-import-persistence"
import type { SettingsImportHost } from "../../../src/background/store/settings-import-execution"
import { createRemovalHarness, type RemovalFixtureState } from "../account-removal-execution/run"
import { scenario, fileData, expectedDocumentOrder, removedNames, object, at, A, B, C, D, E, F } from "../settings-import-plan/specimens"
export { A, B, C, D, E, F, object, settingsImportKey }
export const ui = { kind: "ui", windowId: 1, incognito: false } as const
export const fileText = () => JSON.stringify(fileData())
export type Fault = "reject-before" | "reject-after" | "ignore" | "mismatch" | "interrupt-before" | "interrupt-after"
export function initial(syncOn = false): RemovalFixtureState {
  const input = scenario(syncOn)
  input.local.unclaimed = null
  input.local["consent:state"] = { v: 1, kind: "consent-state", deviceId: "this-browser", generation: 1, lastAgreementAt: 7,
    legacyBasis: { kind: "observed", agreement: { v: 1, at: 7 } }, state: { kind: "agreed", current: { v: 1, at: 7 }, prior: null } }
  return { local: input.local, session: input.session, sync: input.sync.kind === "on" ? input.sync.records : {} }
}
export function world(syncOn = false, saved = initial(syncOn), options: { cleanup?: boolean } = {}) {
  const h = createRemovalHarness(saved)
  const calls: { readonly n: number; readonly kind: string; readonly state: RemovalFixtureState }[] = []
  const events: { readonly event: ConfirmedViewChange; readonly state: RemovalFixtureState }[] = []
  let ordinal = 0, generation = 0, reads = 0, remoteReads = 0, dead = false, forbidStamp = false
  let fault: { readonly at: number; readonly mode: Fault } | undefined
  let hook: ((when: "before" | "after", n: number, kind: string) => void) | undefined
  const stampNames = expectedDocumentOrder.filter(name => syncOn || !removedNames.includes(name))
  async function effect(kind: string, apply: () => Promise<void>) {
    const n = ++ordinal, mode = fault?.at === n ? fault.mode : undefined
    calls.push({ n, kind, state: h.state() }); hook?.("before", n, kind)
    if (dead || mode === "interrupt-before" || mode === "reject-before") {
      if (mode === "interrupt-before") dead = true
      throw Error("Synthetic import rejection before effect")
    }
    if (mode !== "ignore") await apply()
    if (mode === "mismatch") h.foreign(state => { state.local.outside = { changed: true } })
    hook?.("after", n, kind)
    if (mode === "interrupt-after") dead = true
    if (mode === "interrupt-after" || mode === "reject-after") throw Error("Synthetic import rejection after effect")
  }
  if (h.deps.removal.kind !== "fixture") throw Error("Missing accepted finite session collaborator")
  const baseSession = h.deps.removal.session
  const settingsImport: SettingsImportHost = options.cleanup === false ? { kind: "unavailable" } : { kind: "fixture",
    async removeLocal(keys) {
      await effect("local.remove", async () => h.foreign(state => {
        for (const key of keys) {
          const name = key.kind === "document" ? documentKey(key.key) : key.kind === "cache" ? `cache:${key.acct}` : `progress:${key.acct}:${key.shard}`
          delete state.local[name]
        }
      }))
    },
    session: {
      async get() { if (dead) throw Error("Synthetic import process stopped"); return baseSession.get() },
      async set(items) { return effect("session.set", () => baseSession.set(items)) },
      async remove(keys) { return effect("session.remove", () => baseSession.remove(keys)) }
    }
  }
  const deps = { ...h.deps, settingsImport, now: () => at,
    generation() {
      if (forbidStamp) throw Error("Restart must retain accepted stamps")
      const index = generation++, name = stampNames[index % stampNames.length]
      if (!name) throw Error("Missing import stamp identity")
      return index < stampNames.length ? `fresh:${name}` : `fresh:${Math.floor(index / stampNames.length)}:${name}`
    },
    local: {
      async get(keys: readonly string[] | null) { reads++; if (dead) throw Error("Synthetic import process stopped"); return h.deps.local.get(keys) },
      async set(items: Parameters<typeof h.deps.local.set>[0]) { return effect(`local.set:${Object.keys(items).join(",")}`, () => h.deps.local.set(items)) }
    },
    sync: { ...h.deps.sync, async get() { remoteReads++; return h.deps.sync.get() } }
  }
  const startup = { ...h.startup, context: { ...h.startup.context, deviceId: "this-browser" } }
  let owner = createLocalFilterWriter(deps)
  const listen = () => owner.subscribeView(event => events.push({ event, state: h.state() }))
  let unsubscribe = listen()
  return { h, deps, startup, calls, events, get owner() { return owner },
    counts: () => ({ writes: ordinal, reads, remoteReads, generation }),
    fault(at: number, mode: Fault) { fault = { at, mode } },
    hook(value?: typeof hook) { hook = value },
    withdraw(intent = false) {
      const read = readConsentDevice(h.state().local)
      if (read.kind !== "supported") throw Error("Expected current consent device")
      const items = intent ? withdrawalIntentItems(read) : withdrawalItems(read)
      if (!items) throw Error("Expected withdrawal transition")
      h.foreign(state => { Object.assign(state.local, items) })
    },
    agree() {
      const read = readConsentDevice(h.state().local)
      if (read.kind !== "supported") throw Error("Expected withdrawn consent device")
      const items = agreementItems(read, at + 1)
      if (!items) throw Error("Expected new agreement")
      h.foreign(state => { Object.assign(state.local, items) })
    },
    async restart(starting = true) {
      unsubscribe(); await owner.dispose(); dead = false; fault = undefined; hook = undefined; forbidStamp = true
      if (starting) {
        const fresh = createStartingLocalFilterWriter({ ...deps, startup }); owner = fresh
        const ready = await fresh.ready().then(value => ({ kind: "ready", value }), error => ({ kind: "blocked", error }))
        unsubscribe = listen(); return ready
      }
      owner = createLocalFilterWriter(deps); unsubscribe = listen(); return { kind: "preinitialized" }
    },
    async prepare(text = fileText()) {
      const answer = await owner.prepareSettingsImport(ui, text)
      if (answer.kind !== "confirmation-required") throw Error(`Expected actual import confirmation, got ${JSON.stringify(answer)}`)
      return answer
    },
    async dispose() { unsubscribe(); await owner.dispose() }
  }
}

export function payload(state: RemovalFixtureState): RemovalFixtureState {
  const local = structuredClone(state.local)
  delete local[settingsImportKey]; delete local["consent:jobs"]
  return { ...structuredClone(state), local }
}
