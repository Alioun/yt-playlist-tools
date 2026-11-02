import { createSiteI18n, type I18n, type NativeMessagePort, type SimpleMessageKey } from "../../shared/i18n"
import type { FeatureId } from "../../shared/contracts/vocabulary"
import { decodeSettings } from "../../shared/model/decodeSettings"
import { CONSENT_VERSION } from "../../shared/model/documents"
import { pageViewKeeps, readPageView } from "../../shared/model/page-view"
import { needsAccess } from "../../shared/features/access"
import { badgeColors, badgeFor, everyTabBadge, sameBadge, type Badge, type BadgeFacts } from "../badge/badge"
import type { SessionRead } from "../store/session-memory"
import { readTabStatuses } from "./page-status"
import type { StatusProducer } from "../tab-view/producer"
import type { TabLookup } from "../tabs/ports"
import type { BuildId } from "../../shared/contracts/vocabulary"

type BadgeDetails = { text?: string | null; color?: string; title?: string | null; tabId?: number }
export type BadgeAction = {
  setBadgeText(details: { text: string | null; tabId?: number }): Promise<void>
  setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>
  setTitle(details: { title: string | null; tabId?: number }): Promise<void>
}
export type BadgePorts = {
  readonly action: BadgeAction
  readonly local: { get(keys: null): Promise<Readonly<Record<string, unknown>>> }
  readonly owner: { readSession(): Promise<SessionRead> }
  readonly access: (site: "www" | "music") => Promise<boolean>
  readonly statuses: StatusProducer
  readonly tab: (tabId: number) => Promise<TabLookup>
  readonly build: BuildId
  readonly i18n: NativeMessagePort
  readonly clock: { after(milliseconds: number, run: () => void): () => void }
}
export type ToolbarBadge = {
  /** Recomputes from storage, session memory and site access. Callers pass any change they hear of. */
  refresh(): Promise<void>
  /** A key from any tab's or a gather's 3 s answer over everything, with its tooltip (YT-ANY-06, YT-GT-31). */
  flash(tabId: number, ok: boolean, title: string): void
  /** Auto-add added this tab's current video: its tick shows while the tick option is on and auto-add isn't paused (YT-AA-42). */
  tick(tabId: number): void
  /** The tab's video changed in-app, so its tick goes, even one a stopped worker forgot (ARC-MOD-38). */
  untick(tabId: number): void
  /** The tab loaded a new page, which drops the tab's own badge in the browser; the next refresh paints what it should show. */
  loaded(tabId: number): void
  dispose(): void
}

/** The toolbar badge's owner (UI-IA-08, FT-57, FT-58): one every-tab badge, and per-tab ones only where they differ. */
export function createToolbarBadge(ports: BadgePorts): ToolbarBadge {
  const i18n: I18n = createSiteI18n(ports.i18n)
  let shown: Badge = { text: "", color: null, reason: "none" }
  const perTab = new Map<number, Badge>()
  const flashes = new Map<number, () => void>()
  const ticks = new Set<number>()
  let running: Promise<void> | undefined, again = false, disposed = false

  function title(badge: Badge): string | null {
    switch (badge.reason) {
      case "consent": return i18n.message("badge_waiting")
      case "access": return i18n.message("badge_access")
      case "marks": return i18n.message("badge_marks")
      case "paused": return i18n.message("badge_paused")
      case "ticked": return i18n.message("badge_ticked")
      case "not-working": {
        const [first] = badge.features
        return badge.features.length === 1 && first ? i18n.message("badge_notWorking_one", { feature: featureName(first) })
          : i18n.message("badge_notWorking_other", { count: i18n.number(badge.features.length) })
      }
      default: return null
    }
  }
  const names: Readonly<Record<FeatureId, SimpleMessageKey>> = {
    "auto-add": "feature_name_1", shortcuts: "feature_name_2", "quick-save": "feature_name_3", "queue-button": "feature_name_4", "watch-button": "feature_name_5",
    "card-menu": "feature_name_6", "browser-menu": "feature_name_7", gather: "feature_name_8", "music-actions": "feature_name_9", "music-keys": "feature_name_10",
    "any-tab-keys": "feature_name_11", sync: "feature_name_12"
  }
  const featureName = (feature: FeatureId) => i18n.message(names[feature])
  async function paint(badge: Badge, tabId?: number) {
    const scope = tabId === undefined ? {} : { tabId }
    await ports.action.setBadgeText({ text: badge.text, ...scope })
    if (badge.color) await ports.action.setBadgeBackgroundColor({ color: badgeColors[badge.color], ...scope })
    await ports.action.setTitle({ title: title(badge), ...scope })
  }
  async function reset(tabId: number) {
    await ports.action.setBadgeText({ text: null, tabId })
    if (shown.color) await ports.action.setBadgeBackgroundColor({ color: badgeColors[shown.color], tabId })
    await ports.action.setTitle({ title: null, tabId })
  }
  async function facts(): Promise<{ facts: BadgeFacts; tabs: readonly number[] }> {
    const records = await ports.local.get(null)
    const view = readPageView(Object.fromEntries(Object.entries(records).filter(([key]) => pageViewKeeps(key))))
    const clear = { consentPending: false, accessMissing: false, marks: false, paused: false, notWorking: new Map(), ticked: new Set<number>() }
    if (view.kind !== "view" || view.device.kind === "newer-version" || view.layout === "newer-version") return { facts: clear, tabs: [] }
    const device = view.device.kind === "current" ? view.device.device : null
    const consentPending = !device?.consent || device.consent.v < CONSENT_VERSION || device.upgradeNote?.state === "pending"
    if (consentPending || view.settings.kind !== "value") return { facts: { ...clear, consentPending }, tabs: [] }
    const settings = decodeSettings(view.settings.settings)
    const [www, music, session] = await Promise.all([ports.access("www"), ports.access("music"), ports.owner.readSession()])
    const accessMissing = !www && needsAccess("www", settings) || !music && needsAccess("music", settings)
    const marks = view.setups.some(entry => Object.keys(entry.setup.marks).length > 0)
    const memory = session.kind === "memory" ? session.memory : null
    // Pausing auto-add clears the ticks, so "paused" shows on every tab (ARC-MOD-38).
    if (memory?.paused) ticks.clear()
    const ticked = settings.autoAdd.on && settings.autoAdd.toolbarTick ? new Set([...ticks].filter(tabId => memory?.tabs.has(tabId))) : new Set<number>()
    const notWorking = new Map<number, FeatureId[]>()
    if (memory) await Promise.all([...memory.tabs].slice(0, 50).map(async ([tabId, record]) => {
      const broken = (await readTabStatuses(ports, settings, tabId, record, null)).filter(row => row.state === "not-working").map(row => row.feature)
      if (broken.length) notWorking.set(tabId, broken)
    }))
    return {
      facts: { consentPending, accessMissing, marks, notWorking, ticked,
        paused: settings.autoAdd.on && settings.autoAdd.toolbarPaused && memory?.paused === true },
      tabs: memory ? [...memory.tabs.keys()] : []
    }
  }
  async function run() {
    const read = await facts()
    if (disposed) return
    const next = everyTabBadge(read.facts)
    if (!sameBadge(next, shown)) { shown = next; await paint(next) }
    for (const tabId of new Set([...read.tabs, ...perTab.keys()])) {
      if (flashes.has(tabId)) continue
      const own = badgeFor(read.facts, tabId)
      if (!sameBadge(own, next)) {
        if (!sameBadge(own, perTab.get(tabId) ?? next)) { perTab.set(tabId, own); await paint(own, tabId).catch(() => {}) }
      } else if (perTab.delete(tabId)) await reset(tabId).catch(() => {})
    }
  }
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (running) { again = true; return running }
    running = (async () => {
      try { do { again = false; await run() } while (again && !disposed) } catch {} finally { running = undefined }
    })()
    return running
  }
  return {
    refresh,
    flash(tabId, ok, label) {
      if (disposed) return
      flashes.get(tabId)?.()
      void ports.action.setBadgeText({ text: ok ? "✓" : "✕", tabId }).then(() => ports.action.setBadgeBackgroundColor({ color: ok ? badgeColors.teal : badgeColors.crimson, tabId }))
        .then(() => ports.action.setTitle({ title: label, tabId })).catch(() => {})
      const stop = ports.clock.after(3000, () => {
        flashes.delete(tabId)
        perTab.delete(tabId)
        void reset(tabId).catch(() => {}).then(() => refresh())
      })
      flashes.set(tabId, stop)
    },
    tick(tabId) {
      if (disposed) return
      ticks.add(tabId)
      void refresh()
    },
    untick(tabId) {
      if (disposed) return
      ticks.delete(tabId)
      if (flashes.has(tabId)) return
      perTab.delete(tabId)
      void reset(tabId).catch(() => {}).then(() => refresh())
    },
    loaded(tabId) {
      ticks.delete(tabId)
      perTab.delete(tabId)
    },
    dispose() {
      disposed = true
      for (const stop of flashes.values()) stop()
      flashes.clear()
    }
  }
}
export type { BadgeDetails }
