import type { Site } from "../../shared/contracts/vocabulary"
import { desired, popoversBundle, siteBundles, type RegisteredScript } from "../../shared/features/registration"
import {
  RegistrarError,
  type EnsureWhat,
  type FailureFact,
  type Injection,
  type ObservedScript,
  type OwnerSnapshot,
  type ProbeObservation,
  type Refusal,
  type Registrar,
  type RegistrarPorts,
  type RegistrationObservation,
  type TabFact
} from "./ports"

export const ownedRegistrationIds = ["pp-www-page", "pp-www", "pp-music-page", "pp-music"] as const satisfies readonly RegisteredScript["id"][]
const sites: readonly Site[] = ["www", "music"]
type Snapshot = { readonly owner: Extract<OwnerSnapshot, { kind: "ok" }>; readonly epoch: number; readonly scripts: RegisteredScript[]; readonly intent: RegisteredScript[] }

function same(actual: ObservedScript, wanted: RegisteredScript): boolean {
  return (
    actual.id === wanted.id &&
    actual.world === wanted.world &&
    actual.runAt === wanted.runAt &&
    actual.allFrames === wanted.allFrames &&
    actual.persistAcrossSessions === wanted.persistAcrossSessions &&
    !actual.matchOriginAsFallback &&
    actual.css.length === 0 &&
    actual.excludeMatches.length === 0 &&
    JSON.stringify(actual.js) === JSON.stringify(wanted.js) &&
    JSON.stringify(actual.matches) === JSON.stringify(wanted.matches)
  )
}
function siteOfId(id: RegisteredScript["id"]): Site {
  return id === "pp-www" || id === "pp-www-page" ? "www" : "music"
}
function isolated(scripts: readonly RegisteredScript[], site: Site): RegisteredScript | undefined {
  return scripts.find(script => script.id === `pp-${site}`)
}
function featureFiles(script: RegisteredScript, site: Site): string[] {
  return script.js.filter(file => file !== `${siteBundles[site].core}.js` && file !== `${siteBundles[site].kit}.js`)
}
function matches(tab: TabFact, script: RegisteredScript): boolean {
  const url = new URL(tab.url)
  url.hash = ""
  return script.matches.some(pattern =>
    new RegExp(
      `^${pattern
        .split("*")
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`
    ).test(url.href)
  )
}
function eligible(tab: TabFact): boolean {
  return !tab.discarded && !tab.frozen
}
function paced(tabs: readonly TabFact[]): TabFact[] {
  const priority = (tab: TabFact) => (tab.active && tab.focusedWindow ? 0 : tab.audible ? 1 : 2)
  return [...tabs].filter(eligible).sort((a, b) => priority(a) - priority(b) || b.lastAccessed - a.lastAccessed || a.id - b.id)
}
function loaded(probe: Extract<ProbeObservation, { kind: "observed" }>, file: string, ports: RegistrarPorts): boolean {
  return probe.loaded.some(entry => entry.file === file && entry.build === ports.build)
}
function refuse(reason: Refusal): never {
  throw new RegistrarError({ kind: "refused", reason })
}
function asRegistrarError(error: unknown): RegistrarError {
  return error instanceof RegistrarError ? error : new RegistrarError({ kind: "unexpected" })
}
function failed(fact: FailureFact): never {
  throw new RegistrarError(fact)
}
async function boundary<T>(operation: Extract<FailureFact, { kind: "port" }>["operation"], call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof RegistrarError) throw error
    return failed({ kind: "port", operation })
  }
}

export function createRegistrar(ports: RegistrarPorts): Registrar {
  let disposed = false
  let epoch = 0
  let requested = 0
  let completed = 0
  let scheduled: Promise<void> | undefined
  let tail = Promise.resolve()
  let previous: readonly RegisteredScript[] = []
  let previousIntent: readonly RegisteredScript[] = []

  function alive(token: number): void {
    if (disposed) refuse("disposed")
    if (token !== epoch) refuse("superseded")
  }
  function current(snapshot: Snapshot): void {
    alive(snapshot.epoch)
    const now = ports.owner.current()
    if (now.kind !== "ok") refuse("owner-not-ready")
    if (now.revision !== snapshot.owner.revision || now.consent !== snapshot.owner.consent || now.schemaOk !== snapshot.owner.schemaOk) refuse("superseded")
  }
  async function authority(snapshot: Snapshot, site: Site): Promise<void> {
    current(snapshot)
    if (!snapshot.owner.consent) refuse("consent")
    if (!snapshot.owner.schemaOk) refuse("schema")
    const access = await boundary("access", () => ports.access.contains(site))
    current(snapshot)
    if (!access) refuse("access")
  }
  async function snapshot(token: number): Promise<Snapshot> {
    const readiness = await boundary("ready", () => ports.owner.ready())
    alive(token)
    if (readiness !== "ok") refuse("owner-not-ready")
    const owner = ports.owner.current()
    if (owner.kind !== "ok") refuse("owner-not-ready")
    const detached = structuredClone(owner)
    const access: Record<Site, boolean> = { www: false, music: false }
    const result: Snapshot = { owner: detached, epoch: token, scripts: [], intent: [] }
    if (owner.consent && owner.schemaOk) {
      for (const site of sites) {
        access[site] = await boundary("access", () => ports.access.contains(site))
        current(result)
      }
    }
    return {
      ...result,
      scripts: desired(ports.registry, detached.settings, detached.consent, access, detached.schemaOk),
      intent: desired(ports.registry, detached.settings, detached.consent, { www: true, music: true }, detached.schemaOk)
    }
  }
  function serialize(work: () => Promise<void>): Promise<void> {
    const run = tail
      .then(() => {
        if (disposed) refuse("disposed")
        return work()
      })
      .catch(error => {
        throw asRegistrarError(error)
      })
    tail = run.catch(() => {})
    return run
  }
  async function observe(): Promise<RegistrationObservation> {
    if (disposed) return { kind: "unavailable" }
    try {
      return { kind: "observed", scripts: await ports.scripting.list() }
    } catch {
      return { kind: "unavailable" }
    }
  }
  async function mutate(
    snapshot: Snapshot,
    operation: "register" | "update" | "unregister",
    scripts: readonly RegisteredScript[],
    ids: readonly RegisteredScript["id"][]
  ): Promise<readonly ObservedScript[]> {
    current(snapshot)
    if (operation !== "unregister") for (const site of new Set(scripts.map(script => siteOfId(script.id)))) await authority(snapshot, site)
    let call: "resolved" | "rejected" = "resolved"
    try {
      if (operation === "register") await ports.scripting.register(scripts)
      else if (operation === "update") await ports.scripting.update(scripts)
      else await ports.scripting.unregister(ids)
    } catch {
      call = "rejected"
    }
    const after = await observe()
    if (
      call === "rejected" ||
      after.kind !== "observed" ||
      (operation === "unregister" ? after.scripts.some(script => ids.some(id => id === script.id)) : scripts.some(script => !after.scripts.some(actual => same(actual, script))))
    ) {
      return failed({ kind: "registration", operation, call, after })
    }
    current(snapshot)
    return after.scripts
  }
  async function probe(snapshot: Snapshot, tab: TabFact): Promise<Extract<ProbeObservation, { kind: "observed" }>> {
    await authority(snapshot, tab.site)
    const after = await boundary("probe", () => ports.probe.inspect({ tabId: tab.id, site: tab.site, build: ports.build }))
    current(snapshot)
    if (after.kind === "unavailable") return failed({ kind: "probe-unavailable", after })
    return after
  }
  async function tab(snapshot: Snapshot, tabId: number, site?: Site, script?: RegisteredScript): Promise<TabFact> {
    current(snapshot)
    const found = await boundary("tabs", () => ports.tabs.get(tabId))
    current(snapshot)
    if (found.kind !== "found" || !eligible(found.tab) || (site !== undefined && found.tab.site !== site) || (script && !matches(found.tab, script))) refuse("tab-unavailable")
    return found.tab
  }
  async function inject(snapshot: Snapshot, initial: TabFact, files: readonly string[], script?: RegisteredScript, prerequisites: readonly string[] = []): Promise<void> {
    let inspected = await probe(snapshot, initial)
    const documentId = inspected.documentId
    if (prerequisites.some(file => !loaded(inspected, file, ports))) refuse("prerequisite-missing")
    for (const file of files) {
      const target = await tab(snapshot, initial.id, initial.site, script)
      inspected = await probe(snapshot, target)
      if (inspected.documentId !== documentId) refuse("document-changed")
      if (loaded(inspected, file, ports)) continue
      await authority(snapshot, target.site)
      await tab(snapshot, target.id, target.site, script)
      const injection: Injection = { tabId: target.id, site: target.site, build: ports.build, documentId, world: file.startsWith("page-") ? "MAIN" : "ISOLATED", file }
      let call: "resolved" | "rejected" = "resolved"
      try {
        await ports.scripting.executeScript(injection)
      } catch {
        call = "rejected"
      }
      let after: ProbeObservation = { kind: "unavailable", reason: "not-observed" }
      if (!disposed) {
        try {
          after = await probe(snapshot, target)
        } catch (error) {
          if (error instanceof RegistrarError && error.fact.kind === "probe-unavailable") after = error.fact.after
        }
      }
      if (call === "rejected" || after.kind !== "observed" || after.documentId !== documentId || !loaded(after, file, ports)) {
        return failed({ kind: "injection", injection, call, after })
      }
      current(snapshot)
    }
  }
  async function pass(token: number): Promise<void> {
    const state = await snapshot(token)
    let actual = await boundary("list", () => ports.scripting.list())
    current(state)
    const remove = ownedRegistrationIds.filter(id => actual.some(script => script.id === id) && !state.scripts.some(script => script.id === id))
    if (remove.length) actual = await mutate(state, "unregister", [], remove)
    for (const site of sites) {
      const wanted = state.scripts.filter(script => siteOfId(script.id) === site)
      const updates = wanted.filter(script => actual.some(existing => existing.id === script.id && !same(existing, script)))
      if (updates.length) actual = await mutate(state, "update", updates, [])
      const additions = wanted.filter(script => !actual.some(existing => existing.id === script.id))
      if (additions.length) actual = await mutate(state, "register", additions, [])
    }
    const eager = state.scripts.filter(script => script.world === "ISOLATED" && featureFiles(script, siteOfId(script.id)).some(file => !isolated(previous, siteOfId(script.id))?.js.includes(file)))
    const missingAccess = sites.filter(site => isolated(state.intent, site) && !isolated(state.scripts, site) && (isolated(previous, site) || !isolated(previousIntent, site)))
    if (eager.length || missingAccess.length) {
      const tabs = paced(await boundary("tabs", () => ports.tabs.list()))
      current(state)
      for (const candidate of tabs) {
        const wanted = eager.find(script => siteOfId(script.id) === candidate.site && matches(candidate, script))
        if (wanted) {
          try {
            const target = await tab(state, candidate.id, candidate.site, wanted)
            await inject(state, target, [`${siteBundles[target.site].page}.js`, ...wanted.js], wanted)
          } catch (error) {
            const skipped =
              error instanceof RegistrarError &&
              ((error.fact.kind === "refused" && error.fact.reason === "tab-unavailable") ||
                (error.fact.kind === "probe-unavailable" && ["closed", "inaccessible", "unsupported"].includes(error.fact.after.reason)))
            if (!skipped) throw error
          }
        } else if (missingAccess.includes(candidate.site)) {
          current(state)
          await boundary("offer", () => ports.access.offer(candidate.id, candidate.site))
          current(state)
        }
      }
    }
    current(state)
    previous = state.scripts
    previousIntent = state.intent
  }
  function reconcile(): Promise<void> {
    if (disposed) return Promise.reject(new RegistrarError({ kind: "refused", reason: "disposed" }))
    epoch += 1
    requested += 1
    if (scheduled) return scheduled
    scheduled = serialize(async () => {
      let firstFailure: RegistrarError | undefined
      try {
        while (!disposed && completed < requested) {
          const through = requested
          const token = epoch
          try {
            await pass(token)
          } catch (error) {
            const failure = asRegistrarError(error)
            if (!(failure.fact.kind === "refused" && failure.fact.reason === "superseded" && token !== epoch)) firstFailure ??= failure
          }
          completed = through
        }
        if (firstFailure) throw firstFailure
      } finally {
        scheduled = undefined
      }
    })
    return scheduled
  }
  async function ensure(tabId: number, what: EnsureWhat): Promise<void> {
    return serialize(async () => {
      const state = await snapshot(epoch)
      if (!state.owner.consent) refuse("consent")
      if (!state.owner.schemaOk) refuse("schema")
      if (!Object.values(what).includes(true)) return
      const target = await tab(state, tabId)
      const names = siteBundles[target.site]
      const files = [
        ...(what.core || what.kit ? [`${names.page}.js`, `${names.core}.js`] : []),
        ...(what.kit ? [`${names.kit}.js`] : []),
        ...(what.jobs ? [`${names.jobs}.js`] : []),
        ...(what.popovers ? [`${popoversBundle}.js`] : [])
      ]
      const needed = what.popovers ? [names.page, names.core, names.kit] : what.jobs ? [names.page, names.core] : []
      const prerequisites = needed.map(name => `${name}.js`).filter(file => !files.includes(file))
      await inject(state, target, files, undefined, prerequisites)
    })
  }
  const background = () => {
    if (disposed) return
    void reconcile().catch(error => {
      if (!disposed && error instanceof RegistrarError) {
        try {
          ports.backgroundError(error)
        } catch {}
      }
    })
  }
  const startup = () => {
    previous = []
    background()
  }
  const unsubscribe: (() => void)[] = []
  try {
    unsubscribe.push(ports.owner.subscribe(background))
    unsubscribe.push(ports.access.subscribe(background))
    unsubscribe.push(ports.startup.subscribe(startup))
  } catch (error) {
    disposed = true
    for (const stop of unsubscribe) {
      try {
        stop()
      } catch {}
    }
    throw asRegistrarError(error)
  }
  background()
  return {
    reconcile,
    ensure,
    dispose() {
      if (disposed) return
      disposed = true
      epoch += 1
      let failure: RegistrarError | undefined
      for (const stop of unsubscribe) {
        try {
          stop()
        } catch (error) {
          failure ??= asRegistrarError(error)
        }
      }
      if (failure) throw failure
    }
  }
}
