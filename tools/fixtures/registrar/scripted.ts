import { isBuildId, type BuildId, type Site } from "../../../src/shared/contracts/vocabulary"
import { defaultSettings } from "../../../src/shared/model/defaults"
import type { Settings } from "../../../src/shared/model/types"
import type { RegisteredScript, RegistrationFeature } from "../../../src/shared/features/registration"
import type { Injection, ObservedScript, OwnerSnapshot, ProbeObservation, RegistrarError, RegistrarPorts, TabFact } from "../../../src/background/registrar/ports"

export function buildId(value: string): BuildId {
  if (!isBuildId(value)) throw Error("Invalid fixture build")
  return value
}
export const fixtureBuild = buildId("registrar-fixture-current")
export const fixtureRegistry: readonly RegistrationFeature[] = [
  { id: "auto-add", setting: "autoAdd", pages: { www: { file: "feature-auto-add", needs: ["kit"] } } },
  { id: "card-menu", setting: "cardMenu", pages: { www: { file: "feature-card-menu", needs: [] } } },
  { id: "music-actions", setting: "musicActions", pages: { music: { file: "feature-music-actions", needs: ["kit"] } } },
  {
    id: "gather",
    setting: "gather",
    pages: {
      www: {
        needs: [],
        matches: ["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"],
        when: settings => settings.gather.auto.background || settings.gather.auto.count
      }
    }
  }
]
export function settings(...enabled: ("autoAdd" | "cardMenu" | "musicActions" | "gather")[]): Settings {
  const result = defaultSettings()
  for (const feature of enabled) result[feature].on = true
  return result
}
export function observedScript(script: RegisteredScript): ObservedScript {
  return { ...structuredClone(script), css: [], excludeMatches: [], matchOriginAsFallback: false }
}
export function tabFact(id: number, extra: Partial<TabFact> = {}): TabFact {
  return { id, site: "www", url: "https://www.youtube.com/watch?v=fixture", active: false, focusedWindow: false, audible: false, lastAccessed: id, discarded: false, frozen: false, ...extra }
}
export function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

export type Operation = "ready" | "access" | "offer" | "tabs-list" | "tabs-get" | "probe" | "list" | "register" | "update" | "unregister" | "execute"
export type Call =
  | { readonly operation: "ready" | "tabs-list" | "list" }
  | { readonly operation: "access"; readonly site: Site }
  | { readonly operation: "offer"; readonly tabId: number; readonly site: Site }
  | { readonly operation: "tabs-get" | "probe"; readonly tabId: number }
  | { readonly operation: "register" | "update"; readonly scripts: readonly RegisteredScript[] }
  | { readonly operation: "unregister"; readonly ids: readonly RegisteredScript["id"][] }
  | { readonly operation: "execute"; readonly injection: Injection }
export type Step = {
  readonly wait?: Promise<void>
  readonly entered?: () => void
  readonly before?: () => void
  readonly outcome?: { readonly kind: "resolve" | "reject"; readonly apply: "all" | "first" | "none" }
  readonly probe?: ProbeObservation
}
export type ScriptedRegistrar = ReturnType<typeof scriptedRegistrar>

export function scriptedRegistrar(
  initial: { readonly settings?: Settings; readonly consent?: boolean; readonly schemaOk?: boolean; readonly held?: boolean; readonly registry?: readonly RegistrationFeature[] } = {}
) {
  let owner: OwnerSnapshot = initial.held
    ? { kind: "held", revision: 0 }
    : {
        kind: "ok",
        revision: 0,
        settings: structuredClone(initial.settings ?? settings()),
        consent: initial.consent ?? true,
        schemaOk: initial.schemaOk ?? true
      }
  const ownerListeners = new Set<() => void>()
  const accessListeners = new Set<() => void>()
  const startupListeners = new Set<() => void>()
  const scripts = new Map<string, ObservedScript>()
  const tabs = new Map<number, TabFact>()
  const documents = new Map<number, { documentId: string; loaded: Map<string, BuildId> }>()
  const access: Record<Site, boolean> = { www: true, music: true }
  const calls: Call[] = []
  const errors: RegistrarError[] = []
  const steps = new Map<Operation, Step[]>()
  let mutationsActive = 0
  let maxMutationsActive = 0
  function subscribe(listeners: Set<() => void>, listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  function emit(listeners: Set<() => void>) {
    for (const listener of [...listeners]) listener()
  }
  async function invoke(call: Call, effect: (apply: "all" | "first" | "none", step: Step) => void = () => {}) {
    calls.push(structuredClone(call))
    const step = steps.get(call.operation)?.shift() ?? {}
    const mutation = ["register", "update", "unregister", "execute"].includes(call.operation)
    if (mutation) {
      mutationsActive += 1
      maxMutationsActive = Math.max(maxMutationsActive, mutationsActive)
    }
    try {
      step.entered?.()
      if (step.wait) await step.wait
      step.before?.()
      effect(step.outcome?.apply ?? "all", step)
      if (step.outcome?.kind === "reject") throw Error("Scripted port rejection")
      return step
    } finally {
      if (mutation) mutationsActive -= 1
    }
  }
  const ports: RegistrarPorts = {
    build: fixtureBuild,
    registry: initial.registry ?? fixtureRegistry,
    owner: {
      async ready() {
        await invoke({ operation: "ready" })
        return owner.kind === "ok" ? "ok" : "held"
      },
      current: () => structuredClone(owner),
      subscribe: listener => subscribe(ownerListeners, listener)
    },
    access: {
      async contains(site) {
        await invoke({ operation: "access", site })
        return access[site]
      },
      async offer(tabId, site) {
        await invoke({ operation: "offer", tabId, site })
        return "offered"
      },
      subscribe: listener => subscribe(accessListeners, listener)
    },
    startup: { subscribe: listener => subscribe(startupListeners, listener) },
    tabs: {
      async list() {
        await invoke({ operation: "tabs-list" })
        return structuredClone([...tabs.values()])
      },
      async get(tabId) {
        await invoke({ operation: "tabs-get", tabId })
        const tab = tabs.get(tabId)
        return tab ? { kind: "found", tab: structuredClone(tab) } : { kind: "unavailable" }
      }
    },
    probe: {
      async inspect({ tabId }) {
        const step = await invoke({ operation: "probe", tabId })
        if (step.probe) return structuredClone(step.probe)
        const document = documents.get(tabId)
        if (!tabs.has(tabId) || !document) return { kind: "unavailable", reason: "closed" }
        return { kind: "observed", documentId: document.documentId, loaded: [...document.loaded].map(([file, build]) => ({ file, build })) }
      }
    },
    scripting: {
      async list() {
        await invoke({ operation: "list" })
        return structuredClone([...scripts.values()])
      },
      async register(input) {
        await invoke({ operation: "register", scripts: input }, apply => {
          for (const script of apply === "none" ? [] : apply === "first" ? input.slice(0, 1) : input) {
            if (scripts.has(script.id)) throw Error("Duplicate scripted registration")
            scripts.set(script.id, observedScript(script))
          }
        })
      },
      async update(input) {
        await invoke({ operation: "update", scripts: input }, apply => {
          for (const script of apply === "none" ? [] : apply === "first" ? input.slice(0, 1) : input) {
            if (!scripts.has(script.id)) throw Error("Missing scripted registration")
            scripts.set(script.id, observedScript(script))
          }
        })
      },
      async unregister(ids) {
        await invoke({ operation: "unregister", ids }, apply => {
          for (const id of apply === "none" ? [] : apply === "first" ? ids.slice(0, 1) : ids) scripts.delete(id)
        })
      },
      async executeScript(injection) {
        await invoke({ operation: "execute", injection }, apply => {
          if (apply === "none") return
          const document = documents.get(injection.tabId)
          if (!tabs.has(injection.tabId) || !document || document.documentId !== injection.documentId) throw Error("Scripted document changed")
          document.loaded.set(injection.file, injection.build)
        })
      }
    },
    backgroundError: error => {
      errors.push(error)
    }
  }
  return {
    ports,
    calls,
    errors,
    scripts,
    tabs,
    documents,
    get maxMutationsActive() {
      return maxMutationsActive
    },
    get listenerCounts() {
      return [ownerListeners.size, accessListeners.size, startupListeners.size]
    },
    scriptNext(operation: Operation, step: Step) {
      const pending = steps.get(operation) ?? []
      pending.push(step)
      steps.set(operation, pending)
    },
    pauseNext(operation: Operation) {
      const entered = deferred<void>()
      const release = deferred<void>()
      const pending = steps.get(operation) ?? []
      pending.push({ entered: () => entered.resolve(), wait: release.promise })
      steps.set(operation, pending)
      return { entered: entered.promise, release: () => release.resolve() }
    },
    changeOwner(change: { readonly settings?: Settings; readonly consent?: boolean; readonly schemaOk?: boolean; readonly held?: boolean }, notify = true) {
      owner = change.held
        ? { kind: "held", revision: owner.revision + 1 }
        : {
            kind: "ok",
            revision: owner.revision + 1,
            settings: structuredClone(change.settings ?? (owner.kind === "ok" ? owner.settings : settings())),
            consent: change.consent ?? (owner.kind === "ok" && owner.consent),
            schemaOk: change.schemaOk ?? (owner.kind === "ok" && owner.schemaOk)
          }
      if (notify) emit(ownerListeners)
    },
    changeAccess(site: Site, granted: boolean, notify = true) {
      access[site] = granted
      if (notify) emit(accessListeners)
    },
    startup() {
      emit(startupListeners)
    },
    open(tab: TabFact, loaded: readonly { readonly file: string; readonly build: BuildId }[] = [], documentId = `document-${tab.id}`) {
      tabs.set(tab.id, structuredClone(tab))
      documents.set(tab.id, { documentId, loaded: new Map(loaded.map(entry => [entry.file, entry.build])) })
    },
    close(tabId: number) {
      tabs.delete(tabId)
      documents.delete(tabId)
    },
    executions() {
      return calls.flatMap(call => (call.operation === "execute" ? [call.injection] : []))
    },
    mutations() {
      return calls.filter(call => ["register", "update", "unregister", "execute"].includes(call.operation))
    }
  }
}
