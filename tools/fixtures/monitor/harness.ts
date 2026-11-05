import { createMonitor, type Monitor } from "../../../src/background/monitor/monitor"
import type { AnchorObservation, HealthFacts, JobRoutes, MonitorAuthority, RouteFact } from "../../../src/background/monitor/ports"
import { createTabViewProducer, tabViewFacts } from "../../../src/background/tab-view/producer"
import { createAddFlow } from "../../../src/background/add-flow/add-flow"
import type { TabContext } from "../../../src/background/tabs/ports"
import { sameTabViewFacts, isTabFeature, type PageFeatureId, type TabFeature } from "../../../src/shared/contracts/tab-view"
import { isBreakageSignal, isWatchId, type BreakageSignal, type DiagnosticVocabulary } from "../../../src/shared/contracts/diagnostics"
import { isRouteId } from "../../../src/shared/contracts/identifiers"
import { isMonitorInstance, type MonitorInstance } from "../../../src/background/store/monitor-session"
import { features, type AnchorId } from "../../../src/shared/features/registry"
import { defaultSettings, type AccountKey } from "../../../src/shared/model"
import type { Site, JobId, BreakageKind } from "../../../src/shared/contracts/vocabulary"
import { tabsFixture, build, nativeTab, a, settle } from "../tabs/harness"
import { projectionSeed, document } from "../tab-projection/harness"
import type { RemovalFixtureState } from "../account-removal-execution/run"

function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw Error("Invalid synthetic Monitor vocabulary")
  return value
}
export const primary = checked(isRouteId, "synthetic-primary"),
  fallback = checked(isRouteId, "synthetic-fallback")
export const watch = checked(isWatchId, "SYNTHETIC-MONITOR-1")
export const vocabulary: DiagnosticVocabulary = { routes: [primary, fallback], watchIds: [watch], schemaKeys: ["status", "items"] }
export const instance = (value = "0000000000000001") => checked(isMonitorInstance, value)
export const context = (site: Site = "www", privateTab = false, tabId = 1, acct: AccountKey | null = a): TabContext => ({
  tab: { ...nativeTab(tabId), site, incognito: privateTab, windowId: privateTab ? 2 : 1 },
  info: acct === null ? { site, build, signedIn: false, acct: null } : { site, build, signedIn: true, acct }
})
export function pageFeature(id: PageFeatureId): TabFeature {
  const settings = defaultSettings()
  const names = {
    "auto-add": "autoAdd",
    shortcuts: "shortcuts",
    "quick-save": "quickSave",
    "queue-button": "queueButton",
    "watch-button": "watchButton",
    "card-menu": "cardMenu",
    gather: "gather",
    "music-actions": "musicActions",
    "music-keys": "musicKeys"
  } as const
  if (id === "music-keys") for (const action of ["next", "queue", "save", "like", "remove", "library", "mix", "album", "artist"] as const) settings.musicKeys.keys[action] = settings.undoKey
  const value: unknown = { id, options: { ...settings[names[id]], on: true } }
  if (!isTabFeature(value)) throw Error("Invalid synthetic enabled options")
  return value
}
export function syntheticHealthFacts(site: Site): HealthFacts {
  const jobs = new Map<JobId, JobRoutes>(),
    anchorFacts = new Map<AnchorId, AnchorObservation>()
  for (const feature of features) {
    const health = feature.health[site]
    if (!health) continue
    for (const job of [...health.required, ...health.optional, ...Object.values(health.actions ?? {}).flat()])
      jobs.set(job, {
        routes: [
          { route: primary, state: "usable" },
          { route: fallback, state: "usable" }
        ]
      })
    for (const anchor of [...health.anchors, ...(health.optionalAnchors ?? [])]) anchorFacts.set(anchor, { kind: "not-applicable" })
  }
  return {
    site,
    core: "present",
    accountKeys: "present",
    jobs,
    anchors: anchorFacts,
    gather: { player: "usable", queue: "usable", playlist: "usable" },
    background: new Map([["sync", { state: "working", kinds: [] }]])
  }
}
export function signalValue(kind: BreakageKind, patch: Partial<BreakageSignal> = {}): BreakageSignal {
  const value: unknown = {
    site: "www",
    feature: "auto-add",
    job: "add",
    route: primary,
    kind,
    watchId: kind === "missing" || kind === "threw" ? watch : null,
    shape: kind === "unrecognised" ? { kind: "object", fields: [] } : null,
    clientVersion: "1.0",
    pageType: "watch",
    count: 1,
    firstSeen: 0,
    lastSeen: 0,
    ...patch
  }
  if (!isBreakageSignal(value, vocabulary)) throw Error("Invalid synthetic signal")
  return value
}
export function compactSeed(): RemovalFixtureState {
  const seed = projectionSeed()
  seed.local["doc:settings"] = document({ autoAdd: { on: true } })
  seed.session = { unknown: { keep: true } }
  return seed
}
export function monitorWorld(seed = compactSeed()) {
  const world = tabsFixture(seed),
    monitors: Monitor[] = []
  const healths = new Map<number, HealthFacts>(),
    eligibility = new Map<number, { visible: boolean; fullscreen: boolean }>()
  const subscribers = new Set<Parameters<MonitorAuthority["subscribe"]>[0]>()
  let authorityGeneration = 0,
    authorityHeld = false,
    stopped = false
  let beforeCapture: () => Promise<void> = async () => {}
  let beforeHealth: () => Promise<void> = async () => {}
  const authority: MonitorAuthority = {
    async capture(input) {
      const expected = authorityGeneration
      await beforeCapture()
      const native = await world.ports.native.get(input.tab.tabId),
        info = world.accounts.get(input.tab.tabId),
        visible = eligibility.get(input.tab.tabId)
      if (stopped || authorityHeld || expected !== authorityGeneration || native.kind !== "tab" || native.tab.site === null || !info || !visible) return { kind: "unavailable" }
      const actual = tabViewFacts({ tab: { ...native.tab, site: native.tab.site }, info })
      if (!sameTabViewFacts(actual, tabViewFacts(input))) return { kind: "unavailable" }
      return { kind: "context", facts: actual, ...visible, current: () => !stopped && !authorityHeld && expected === authorityGeneration }
    },
    async health(input) {
      const expected = authorityGeneration
      await beforeHealth()
      const facts = healths.get(input.tab.tabId)
      if (stopped || authorityHeld || expected !== authorityGeneration || !facts) return { kind: "unavailable" }
      return { kind: "health", facts: structuredClone(facts), current: () => !stopped && !authorityHeld && expected === authorityGeneration }
    },
    subscribe(changed) {
      subscribers.add(changed)
      return () => {
        subscribers.delete(changed)
      }
    }
  }
  function emit(event: Parameters<Parameters<MonitorAuthority["subscribe"]>[0]>[0]) {
    authorityGeneration++
    for (const subscriber of [...subscribers]) subscriber(event)
  }
  function addMonitor(id: MonitorInstance) {
    const monitor = createMonitor({ owner: world.owner, authority, vocabulary, instance: id, clock: world.clock })
    monitors.push(monitor)
    return monitor
  }
  const monitor = addMonitor(instance())
  const flow = createAddFlow({
    session: world.session,
    owner: {
      writable: () => !stopped,
      shared() {
        throw Error("Synthetic Monitor consumer never changes feature choices")
      },
      account() {
        throw Error("Synthetic Monitor consumer never executes destination jobs")
      },
      mark() {
        throw Error("Synthetic Monitor consumer never marks a playlist")
      },
      recentAdds() {
        throw Error("Synthetic Monitor consumer never lists an add")
      },
      titles() {
        throw Error("Synthetic Monitor consumer never lists an add")
      }
    },
    async execution() {
      throw Error("Synthetic Monitor consumer never executes jobs")
    },
    now: world.clock.now,
    generation: () => "synthetic-monitor-add-flow",
    async wait() {
      throw Error("Synthetic Monitor consumer never waits on an AddFlow action")
    }
  })
  const producer = createTabViewProducer({ owner: world.owner, addFlow: flow, statuses: monitor.statusProducer, notices: monitor.noticeProducer, build })
  return {
    ...world,
    monitor,
    flow,
    producer,
    authority,
    addMonitor,
    seedContext(input: TabContext, view: { visible: boolean; fullscreen: boolean }, facts: HealthFacts) {
      world.seedTab(input.tab, input.info)
      eligibility.set(input.tab.tabId, structuredClone(view))
      healths.set(input.tab.tabId, structuredClone(facts))
      emit({ kind: "context", tabId: input.tab.tabId })
    },
    changeHealth(input: TabContext, edit: (facts: HealthFacts) => HealthFacts) {
      const found = healths.get(input.tab.tabId)
      if (!found) throw Error("Synthetic health facts must be explicitly seeded")
      healths.set(input.tab.tabId, edit(structuredClone(found)))
      emit({ kind: "context", tabId: input.tab.tabId })
    },
    routes(input: TabContext, job: JobId, primaryState: RouteFact["state"], fallbackState = primaryState) {
      const found = healths.get(input.tab.tabId)
      if (!found) throw Error("Synthetic health facts must be explicitly seeded")
      const jobs = new Map(found.jobs)
      jobs.set(job, {
        routes: [
          { route: primary, state: primaryState },
          { route: fallback, state: fallbackState }
        ]
      })
      healths.set(input.tab.tabId, { ...found, jobs })
      emit({ kind: "context", tabId: input.tab.tabId })
    },
    visibility(input: TabContext, visible: boolean, fullscreen: boolean) {
      eligibility.set(input.tab.tabId, { visible, fullscreen })
      emit({ kind: "context", tabId: input.tab.tabId })
    },
    hold(value: boolean) {
      authorityHeld = value
      emit({ kind: "held" })
    },
    beforeCapture(fn: typeof beforeCapture) {
      beforeCapture = fn
    },
    beforeHealth(fn: typeof beforeHealth) {
      beforeHealth = fn
    },
    removed(acct: AccountKey) {
      emit({ kind: "removal", acct })
    },
    async advance(milliseconds: number) {
      world.clock.advance(milliseconds)
      await settle()
    },
    async dispose() {
      stopped = true
      for (const engine of monitors) engine.dispose()
      producer.dispose()
      await flow.quiesce()
      await world.dispose()
    }
  }
}
