import type { FeatureStatus } from "../../shared/contracts/tab-view"
import type { HealthGap, UiFeatureHealth, UiTabFacts } from "../../shared/contracts/ui-pages"
import type { BuildId, Site } from "../../shared/contracts/vocabulary"
import { decodeSettings } from "../../shared/model/decodeSettings"
import type { PageStatusSource } from "../router/ui-pages"
import type { SessionRead } from "../store/session-memory"
import type { SettingsRead } from "../store/local-filter-writer"
import { enabledTabFeatures, type StatusProducer } from "../tab-view/producer"
import type { NativeTab, TabLookup } from "../tabs/ports"
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
// The Monitor reads the session once per tab, so each site's read stops at its most recently seen tabs.
const MAX_TABS = 20
/**
 * A registered tab is open on its site only while the browser still shows that site in it. Nothing tells the
 * background when a tab goes to another site, so its row stays until a status read finds it (ARC-ACC-70).
 */
function openTab(lookup: TabLookup, record: TabRecord, incognito: boolean | null): (NativeTab & { readonly site: Site }) | null {
  if (lookup.kind !== "tab" || lookup.tab.site !== record.site || (incognito !== null && lookup.tab.incognito !== incognito)) return null
  return { ...lookup.tab, site: record.site }
}

function gaps(status: Pick<FeatureStatus, "jobs" | "actions" | "kinds">): HealthGap[] {
  const result: HealthGap[] = []
  if (status.jobs.includes("membership")) result.push("membership")
  if (status.jobs.includes("playlists")) result.push("playlists")
  if (status.actions.length) result.push("actions")
  if (status.jobs.includes("castState")) result.push("casting")
  if (status.kinds.includes("cannot-measure")) result.push("measure")
  return result
}

type StatusDeps = { readonly statuses: StatusProducer; readonly tab: (tabId: number) => Promise<TabLookup>; readonly build: BuildId }
type HealthDeps = StatusDeps & { readonly monitor?: MonitorStatuses; readonly syncOn?: () => Promise<boolean> }
/** One known tab's feature statuses, from the status producer, as the tab view and the badge read them. */
export async function readTabStatuses(deps: StatusDeps, settings: Settings, tabId: number, record: TabRecord, incognito: boolean | null): Promise<readonly FeatureStatus[]> {
  const tab = openTab(await deps.tab(tabId), record, incognito)
  if (!tab) return []
  const site: Site = record.site
  const enabled = enabledTabFeatures(settings, site)
  if (!enabled?.length) return []
  const info = record.signedIn ? ({ site, build: deps.build, signedIn: true, acct: record.acct } as const) : ({ site, build: deps.build, signedIn: false, acct: null } as const)
  const read = await deps.statuses.read({ tab, info }, enabled)
  return read.kind === "statuses" ? read.statuses : []
}
/** An open tab's health rows for the popup and settings: its page features' statuses and the background features' (HEALTH-29). */
async function readTabHealth(deps: HealthDeps, settings: Settings, syncOn: boolean, tab: NativeTab & { readonly site: Site }, record: TabRecord): Promise<readonly UiFeatureHealth[]> {
  const site = tab.site
  if (!deps.monitor) return (await readTabStatuses(deps, settings, tab.tabId, record, null)).map(status => ({ feature: status.feature, site, state: status.state, gaps: gaps(status) }))
  const paged = enabledTabFeatures(settings, site) ?? []
  const enabled = [...paged, ...backgroundFeatures(settings, syncOn, site, paged)]
  if (!enabled.length) return []
  const info = record.signedIn ? ({ site, build: deps.build, signedIn: true, acct: record.acct } as const) : ({ site, build: deps.build, signedIn: false, acct: null } as const)
  const read = await deps.monitor({ tab, info }, enabled)
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
 * session memory says which tabs our site core answered from, and the browser says which of them are still there.
 */
export function createPageStatus(deps: {
  readonly owner: { readSession(): Promise<SessionRead>; read(view: "settings"): Promise<SettingsRead> }
  readonly statuses: StatusProducer
  readonly tab: (tabId: number) => Promise<TabLookup>
  readonly build: BuildId
  readonly monitor?: MonitorStatuses
  readonly syncOn?: () => Promise<boolean>
  /** Hears each registered tab that closed or went to another site. Dropping its row tells every open page (UI-SET-17). */
  readonly left?: (tabId: number) => void
}): PageStatusSource {
  return async ui => {
    const [session, settingsRead] = await Promise.all([deps.owner.readSession(), deps.owner.read("settings")])
    if (session.kind !== "memory") return
    const registry = session.memory.tabs
    const open = async (tabId: number, record: TabRecord) => {
      const lookup = await deps.tab(tabId)
      if (lookup.kind === "gone" || (lookup.kind === "tab" && lookup.tab.site !== record.site)) deps.left?.(tabId)
      const tab = openTab(lookup, record, ui.requester.incognito)
      return tab ? [{ tab, record }] : []
    }
    const activeRecord = ui.requester.activeTabId === null ? undefined : registry.get(ui.requester.activeTabId)
    const [active] = activeRecord && ui.requester.activeTabId !== null ? await open(ui.requester.activeTabId, activeRecord) : []
    const tab: UiTabFacts = !active
      ? { kind: "other" }
      : active.record.signedIn
        ? { kind: "site", site: active.tab.site, tabId: active.tab.tabId, signedIn: true, acct: active.record.acct }
        : { kind: "site", site: active.tab.site, tabId: active.tab.tabId, signedIn: false, acct: null }
    if (settingsRead.kind !== "value") return { tab, health: [] }
    const settings = decodeSettings(settingsRead.settings)
    const syncOn = (await deps.syncOn?.().catch(() => false)) ?? false
    const seen = (record: TabRecord) => record.seenAt ?? record.at ?? 0
    const recent = [...registry].sort(([, a], [, b]) => seen(b) - seen(a))
    const read = { www: 0, music: 0 }
    const targets = active ? [active] : (await Promise.all(recent.map(([tabId, record]) => open(tabId, record)))).flat().filter(row => read[row.tab.site]++ < MAX_TABS)
    const worst = new Map<string, UiFeatureHealth>()
    await Promise.all(
      targets.map(async ({ tab: target, record }) => {
        for (const next of await readTabHealth(deps, settings, syncOn, target, record)) {
          const key = `${record.site}:${next.feature}`
          const previous = worst.get(key)
          if (!previous || rank[next.state] > rank[previous.state]) worst.set(key, next)
        }
      })
    )
    return { tab, health: [...worst.values()] }
  }
}
