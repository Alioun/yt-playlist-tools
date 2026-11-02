import type { createLocalFilterWriter } from "../store/local-filter-writer"
import { sessionAccountCurrent } from "../store/session-memory"
import type { TabProjectionRequest } from "../store/tab-projection"
import type { AddFlow } from "../add-flow/add-flow"
import type { TabContext, TabViewProducer } from "../tabs/ports"
import { decodeSettings } from "../../shared/model/decodeSettings"
import { features } from "../../shared/features/registry"
import {
  isTabFeature, isFeatureStatusFor, isTabView, isTabViewFacts, isTabViewFor, sameTabViewFacts,
  type DueNotice, type FeatureStatus, type TabFeature, type TabView, type TabViewFacts
} from "../../shared/contracts/tab-view"
import { isTabPing } from "../../shared/contracts/tabs"
import type { BuildId, Site } from "../../shared/contracts/vocabulary"
import type { Settings } from "../../shared/model/types"

export type StatusRead = { readonly kind: "statuses"; readonly facts: TabViewFacts; readonly statuses: readonly FeatureStatus[]; current(): boolean } |
  { readonly kind: "unavailable" }
export type NoticeRead = { readonly kind: "notices"; readonly facts: TabViewFacts; readonly notices: readonly DueNotice[]; current(): boolean } |
  { readonly kind: "unavailable" }
export type StatusProducer = { read(context: TabContext, enabled: readonly TabFeature[]): Promise<StatusRead> }
export type NoticeProducer = { read(context: TabContext, statuses: readonly FeatureStatus[]): Promise<NoticeRead> }
export type TabViewPorts = {
  readonly owner: Pick<ReturnType<typeof createLocalFilterWriter>, "readTabProjection" | "readSession">
  readonly addFlow: Pick<AddFlow, "readPrivateSkips">
  readonly statuses: StatusProducer
  readonly notices: NoticeProducer
  readonly build: BuildId
}

export function tabViewFacts(context: TabContext): TabViewFacts {
  const common = { site: context.tab.site, build: context.info.build, tabId: context.tab.tabId, windowId: context.tab.windowId, private: context.tab.incognito }
  return context.info.signedIn ? { ...common, signedIn: true, acct: context.info.acct } : { ...common, signedIn: false, acct: null }
}
/** The page features on for a site, with their options, as a tab view and the Monitor name them. */
export function enabledTabFeatures(settings: Settings, site: Site): TabFeature[] | undefined {
  const enabled: unknown[] = []
  for (const feature of features) {
    if (feature.setting === "device.syncOn" || !settings[feature.setting].on || site === "music" && !settings.musicSection) continue
    const page = feature.pages[site]
    if (!page || page.when && !page.when(settings)) continue
    enabled.push({ id: feature.id, options: structuredClone(settings[feature.setting]) })
  }
  return enabled.every(isTabFeature) ? enabled : undefined
}
export function createTabViewProducer(ports: TabViewPorts): TabViewProducer<TabView> & { dispose(): void } {
  let disposed = false
  const unavailable = { kind: "unavailable" } as const
  async function produce(input: TabContext): ReturnType<TabViewProducer<TabView>["produce"]> {
    try {
      const info: unknown = { signedIn: input.info.signedIn, acct: input.info.acct, site: input.info.site, build: input.info.build }
      if (disposed || !isTabPing(info) || info.site !== input.tab.site || info.build !== ports.build) return unavailable
      const context: TabContext = { tab: structuredClone(input.tab), info }
      const facts = tabViewFacts(context)
      if (!isTabViewFacts(facts)) return unavailable
      const request: TabProjectionRequest = { private: facts.private, account: context.info.signedIn
        ? { kind: "signed-in", acct: context.info.acct } : { kind: "signed-out" } }
      const before = await ports.owner.readSession()
      if (disposed || before.kind !== "memory") return unavailable
      const read = await ports.owner.readTabProjection(request)
      if (disposed || read.kind !== "projection") return unavailable
      const projection = read.projection
      if (projection.private !== facts.private || projection.settings.kind !== "value" ||
        projection.account.kind === "unknown" || (projection.account.kind === "signed-in") !== facts.signedIn ||
        projection.account.kind === "signed-in" && projection.account.acct !== facts.acct) return unavailable
      const settings = decodeSettings(projection.settings.settings)
      const enabled = enabledTabFeatures(settings, facts.site)
      if (!enabled) return unavailable
      const health = await ports.statuses.read(structuredClone(context), structuredClone(enabled))
      if (disposed || health.kind !== "statuses" || !isTabViewFacts(health.facts) || !sameTabViewFacts(facts, health.facts) || !health.current()) return unavailable
      const statuses = structuredClone(health.statuses)
      if (!statuses.every(status => isFeatureStatusFor(facts.site, status)) || statuses.length !== enabled.length ||
        new Set(statuses.map(status => status.feature)).size !== statuses.length ||
        !enabled.every(feature => statuses.some(status => status.feature === feature.id))) return unavailable
      const due = await ports.notices.read(structuredClone(context), structuredClone(statuses))
      if (disposed || due.kind !== "notices" || !isTabViewFacts(due.facts) || !sameTabViewFacts(facts, due.facts) || !due.current()) return unavailable
      const notices = structuredClone(due.notices)
      let setup: unknown = null, filters: unknown = [], skips: unknown = null
      if (projection.account.kind === "signed-in") {
        if (projection.account.setup.kind !== "value" || projection.account.setup.view.acct !== facts.acct ||
          projection.account.filters.some(row => row.state.kind === "invalid" || row.state.kind === "newer-version")) return unavailable
        const own = projection.account.setup.view
        setup = own.kind === "none" ? { kind: "none" } : { kind: "live", setup: structuredClone(own.setup) }
        filters = structuredClone(projection.account.filters)
        if (context.tab.incognito && context.info.signedIn) {
          if (projection.account.skips.kind !== "private-required") return unavailable
          const privateRead = await ports.addFlow.readPrivateSkips({ revision: before.revision,
            context: { tab: { ...context.tab, incognito: true }, info: context.info } })
          if (disposed || privateRead.kind !== "skips") return unavailable
          skips = { kind: "private", entries: privateRead.entries }
        } else {
          if (projection.account.skips.kind !== "normal") return unavailable
          skips = { kind: "normal", entries: structuredClone(projection.account.skips.entries) }
        }
      }
      // Owner holds and account revocation can change while health or private memory is pending.
      const current = await ports.owner.readTabProjection(request)
      if (disposed || current.kind !== "projection" || JSON.stringify(current.projection) !== JSON.stringify(projection)) return unavailable
      const after = await ports.owner.readSession()
      if (disposed || after.kind !== "memory" || !sessionAccountCurrent(before.revision, after.revision, facts.acct)) return unavailable
      if (context.tab.incognito && context.info.signedIn) {
        const latest = await ports.addFlow.readPrivateSkips({ revision: before.revision,
          context: { tab: { ...context.tab, incognito: true }, info: context.info } })
        if (disposed || latest.kind !== "skips" || JSON.stringify(skips) !== JSON.stringify({ kind: "private", entries: latest.entries })) return unavailable
      }
      const view: unknown = { ...context.info, private: facts.private, features: enabled, pickerSortAZ: projection.pickerSortAZ,
        undoKey: settings.undoKey, paused: projection.paused, setup, filters, skips, statuses, notices }
      return !disposed && health.current() && due.current() && isTabViewFor(facts, view) ? { kind: "view", view } : unavailable
    } catch { return unavailable }
  }
  return { produce, isView: isTabView, dispose() { disposed = true } }
}
