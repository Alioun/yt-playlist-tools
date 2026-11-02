import type { FeatureStatus } from "../../shared/contracts/tab-view"
import type { HealthGap, UiFeatureHealth, UiTabFacts } from "../../shared/contracts/ui-pages"
import type { BuildId, Site } from "../../shared/contracts/vocabulary"
import { decodeSettings } from "../../shared/model/decodeSettings"
import type { PageStatusSource } from "../router/ui-pages"
import type { SessionRead } from "../store/session-memory"
import type { SettingsRead } from "../store/local-filter-writer"
import { enabledTabFeatures, type StatusProducer } from "../tab-view/producer"
import type { TabLookup } from "../tabs/ports"

const rank = { working: 0, "partly-working": 1, "not-working": 2 } as const
const MAX_TABS = 20

function gaps(status: FeatureStatus): HealthGap[] {
  const result: HealthGap[] = []
  if (status.jobs.includes("membership")) result.push("membership")
  if (status.actions.length) result.push("actions")
  if (status.kinds.includes("cannot-measure")) result.push("measure")
  return result
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
}): PageStatusSource {
  return async ui => {
    const [session, settingsRead] = await Promise.all([deps.owner.readSession(), deps.owner.read("settings")])
    if (session.kind !== "memory") return
    const active = ui.requester.activeTabId === null ? undefined : session.memory.tabs.get(ui.requester.activeTabId)
    const tab: UiTabFacts = active && ui.requester.activeTabId !== null
      ? active.signedIn ? { kind: "site", site: active.site, tabId: ui.requester.activeTabId, signedIn: true, acct: active.acct }
        : { kind: "site", site: active.site, tabId: ui.requester.activeTabId, signedIn: false, acct: null }
      : { kind: "other" }
    if (settingsRead.kind !== "value") return { tab, health: [] }
    const settings = decodeSettings(settingsRead.settings)
    const targets = tab.kind === "site" ? [tab.tabId] : [...session.memory.tabs.keys()].slice(0, MAX_TABS)
    const worst = new Map<string, UiFeatureHealth>()
    await Promise.all(targets.map(async tabId => {
      const record = session.memory.tabs.get(tabId)
      if (!record) return
      const lookup = await deps.tab(tabId)
      if (lookup.kind !== "tab" || lookup.tab.incognito !== ui.requester.incognito) return
      const site: Site = record.site
      const enabled = enabledTabFeatures(settings, site)
      if (!enabled?.length) return
      const info = record.signedIn ? { site, build: deps.build, signedIn: true, acct: record.acct } as const
        : { site, build: deps.build, signedIn: false, acct: null } as const
      const read = await deps.statuses.read({ tab: { ...lookup.tab, site }, info }, enabled)
      if (read.kind !== "statuses") return
      for (const status of read.statuses) {
        const key = `${site}:${status.feature}`
        const previous = worst.get(key)
        const next: UiFeatureHealth = { feature: status.feature, site, state: status.state, gaps: gaps(status) }
        if (!previous || rank[next.state] > rank[previous.state]) worst.set(key, next)
      }
    }))
    return { tab, health: [...worst.values()] }
  }
}
