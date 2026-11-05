import type { FeatureStatus } from "../../shared/contracts/tab-view"
import type { HealthGap, UiFeatureHealth, UiTabFacts } from "../../shared/contracts/ui-pages"
import type { BuildId, Site } from "../../shared/contracts/vocabulary"
import { decodeSettings } from "../../shared/model/decodeSettings"
import type { PageStatusSource } from "../router/ui-pages"
import type { SessionRead } from "../store/session-memory"
import type { SettingsRead } from "../store/local-filter-writer"
import { enabledTabFeatures, type StatusProducer } from "../tab-view/producer"
import type { TabLookup } from "../tabs/ports"
import type { TabRecord } from "../tabs/records"
import type { Settings } from "../../shared/model/types"
import type { EnabledMonitorFeature, MonitorStatus } from "../monitor/ports"
import type { TabContext } from "../tabs/ports"

/** The Monitor's statuses for any enabled feature, background ones included (HEALTH-29). */
export type MonitorStatuses = (
  context: TabContext,
  enabled: readonly EnabledMonitorFeature[]
) => Promise<{ readonly kind: "statuses"; readonly statuses: readonly MonitorStatus[] } | { readonly kind: "unavailable" }>
/**
 * The features that run from the background rather than a page script, read against a tab of their site: Save from
 * the browser's menu, Keys from any tab, Gather tabs without its automatic page script, and Settings sync (HEALTH-29).
 */
export function backgroundFeatures(settings: Settings, syncOn: boolean, site: Site, paged: readonly { readonly id: string }[]): EnabledMonitorFeature[] {
  const extra: EnabledMonitorFeature[] = []
  if (site === "www" && settings.browserMenu.on) extra.push({ id: "browser-menu", options: { ...structuredClone(settings.browserMenu), on: true } })
  if (settings.anyTabKeys.on && (site === "www" || settings.musicSection)) extra.push({ id: "any-tab-keys", options: { ...structuredClone(settings.anyTabKeys), on: true } })
  if (site === "www" && settings.gather.on && !paged.some(feature => feature.id === "gather")) extra.push({ id: "gather", options: structuredClone(settings.gather) } as EnabledMonitorFeature)
  if (site === "www" && syncOn) extra.push({ id: "sync", options: { on: true } })
  return extra
}
const destinationGaps = { player: "player", queue: "queue", playlist: "playlist" } as const

const rank = { working: 0, "partly-working": 1, "not-working": 2 } as const
const MAX_TABS = 20

function gaps(status: Pick<FeatureStatus, "jobs" | "actions" | "kinds">): HealthGap[] {
  const result: HealthGap[] = []
  if (status.jobs.includes("membership")) result.push("membership")
  if (status.actions.length) result.push("actions")
  if (status.kinds.includes("cannot-measure")) result.push("measure")
  return result
}

type StatusDeps = { readonly statuses: StatusProducer; readonly tab: (tabId: number) => Promise<TabLookup>; readonly build: BuildId }
type HealthDeps = StatusDeps & { readonly monitor?: MonitorStatuses; readonly syncOn?: () => Promise<boolean> }
/** One known tab's feature statuses, from the status producer, as the tab view and the badge read them. */
export async function readTabStatuses(deps: StatusDeps, settings: Settings, tabId: number, record: TabRecord, incognito: boolean | null): Promise<readonly FeatureStatus[]> {
  const lookup = await deps.tab(tabId)
  if (lookup.kind !== "tab" || (incognito !== null && lookup.tab.incognito !== incognito)) return []
  const site: Site = record.site
  const enabled = enabledTabFeatures(settings, site)
  if (!enabled?.length) return []
  const info = record.signedIn ? ({ site, build: deps.build, signedIn: true, acct: record.acct } as const) : ({ site, build: deps.build, signedIn: false, acct: null } as const)
  const read = await deps.statuses.read({ tab: { ...lookup.tab, site }, info }, enabled)
  return read.kind === "statuses" ? read.statuses : []
}
/** A tab's health rows for the popup and settings: its page features' statuses and the background features' (HEALTH-29). */
async function readTabHealth(deps: HealthDeps, settings: Settings, syncOn: boolean, tabId: number, record: TabRecord, incognito: boolean | null): Promise<readonly UiFeatureHealth[]> {
  const site: Site = record.site
  if (!deps.monitor) return (await readTabStatuses(deps, settings, tabId, record, incognito)).map(status => ({ feature: status.feature, site, state: status.state, gaps: gaps(status) }))
  const lookup = await deps.tab(tabId)
  if (lookup.kind !== "tab" || (incognito !== null && lookup.tab.incognito !== incognito)) return []
  const paged = enabledTabFeatures(settings, site) ?? []
  const enabled = [...paged, ...backgroundFeatures(settings, syncOn, site, paged)]
  if (!enabled.length) return []
  const info = record.signedIn ? ({ site, build: deps.build, signedIn: true, acct: record.acct } as const) : ({ site, build: deps.build, signedIn: false, acct: null } as const)
  const read = await deps.monitor({ tab: { ...lookup.tab, site }, info }, enabled)
  if (read.kind !== "statuses") return []
  return read.statuses.map(status => ({
    feature: status.feature,
    site,
    state: status.state,
    gaps: [...gaps(status), ...status.destinations.map(destination => destinationGaps[destination])].slice(0, 6)
  }))
}
/**
 * The popup's and settings' health facts (UI-POP-09): over a YouTube or YouTube Music tab, that tab's statuses;
 * over any other tab, the worst status of each feature across the open tabs of each site. The tab registry in
 * session memory says which tabs our site core answered from.
 */
export function createPageStatus(deps: {
  readonly owner: { readSession(): Promise<SessionRead>; read(view: "settings"): Promise<SettingsRead> }
  readonly statuses: StatusProducer
  readonly tab: (tabId: number) => Promise<TabLookup>
  readonly build: BuildId
  readonly monitor?: MonitorStatuses
  readonly syncOn?: () => Promise<boolean>
}): PageStatusSource {
  return async ui => {
    const [session, settingsRead] = await Promise.all([deps.owner.readSession(), deps.owner.read("settings")])
    if (session.kind !== "memory") return
    const active = ui.requester.activeTabId === null ? undefined : session.memory.tabs.get(ui.requester.activeTabId)
    const tab: UiTabFacts =
      active && ui.requester.activeTabId !== null
        ? active.signedIn
          ? { kind: "site", site: active.site, tabId: ui.requester.activeTabId, signedIn: true, acct: active.acct }
          : { kind: "site", site: active.site, tabId: ui.requester.activeTabId, signedIn: false, acct: null }
        : { kind: "other" }
    if (settingsRead.kind !== "value") return { tab, health: [] }
    const settings = decodeSettings(settingsRead.settings)
    const syncOn = (await deps.syncOn?.().catch(() => false)) ?? false
    const targets = tab.kind === "site" ? [tab.tabId] : [...session.memory.tabs.keys()].slice(0, MAX_TABS)
    const worst = new Map<string, UiFeatureHealth>()
    await Promise.all(
      targets.map(async tabId => {
        const record = session.memory.tabs.get(tabId)
        if (!record) return
        for (const next of await readTabHealth(deps, settings, syncOn, tabId, record, ui.requester.incognito)) {
          const key = `${record.site}:${next.feature}`
          const previous = worst.get(key)
          if (!previous || rank[next.state] > rank[previous.state]) worst.set(key, next)
        }
      })
    )
    return { tab, health: [...worst.values()] }
  }
}
