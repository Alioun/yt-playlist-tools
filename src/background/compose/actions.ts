import { createAddFlow, type AccountSettings, type AddFlow, type Feature, type Opener, type Owner, type Shared, type Target } from "../add-flow/add-flow"
import { authenticateTab, runtimeTransport, timerDeadline, type RuntimePort, type TabContext } from "../adapters/runtime"
import type { NativeSender, SenderOriginPorts } from "../adapters/sender-origin"
import { createTabsExecution } from "../gather/execution"
import type { Playlists } from "../playlists/playlists"
import type { Registrar } from "../registrar/ports"
import { projectDestination } from "../router/first-run-results"
import type { StartingOwner } from "../store/store-lifecycle"
import type { Requester, Tabs } from "../tabs/ports"
import type { BuildId, FeatureId, Origin, Site } from "../../shared/contracts"
import { toastPlan, type ExplicitOutcome } from "../../shared/rules/outcomes"
import { tabActionContract, type PlaylistTitles, type TabActionMessages, type TabAddReport, type TabAddRequest, type TabCreated, type TabPlaylists, type TabUndoReport } from "../../shared/contracts/tab-actions"
import type { PopupAddRequest } from "../../shared/contracts/ui-add"
import { cacheRows } from "../../shared/model/account-cache"
import { decodeSettings } from "../../shared/model/decodeSettings"
import { defaultSettings } from "../../shared/model/defaults"
import type { AccountKey, Filter, PlaylistId, Settings, Setup } from "../../shared/model"
import { createRpc } from "../../shared/rpc/rpc"

type Switch = { readonly on: boolean; readonly feedback?: boolean }
type AccountView = { readonly setup: Setup | null; readonly filters: ReadonlyMap<PlaylistId, Filter>; readonly titles: PlaylistTitles }

const switches: Partial<Record<FeatureId, (settings: Settings) => Switch>> = {
  "auto-add": s => s.autoAdd, shortcuts: s => s.shortcuts, "quick-save": s => s.quickSave, "queue-button": s => s.queueButton,
  "watch-button": s => s.watchButton, "browser-menu": s => s.browserMenu, "any-tab-keys": s => s.anyTabKeys,
  "music-actions": s => s.musicActions, "music-keys": s => s.musicKeys, gather: s => s.gather
}

/**
 * AddFlow reads the owner synchronously, so each action first loads the tab's projection: shared settings for
 * every feature's switch and Show feedback, Keep a list of recent adds, and the acting account's setup, filters
 * and cached playlist titles (ARC-MSG-05).
 */
export function createAddFlowOwner(owner: Pick<StartingOwner, "readTabProjection" | "readPlaylistCache">, writable: () => boolean) {
  let settings: Settings = defaultSettings()
  // Keep a list of recent adds is on by default (DATA-52).
  let recentAdds = true
  const accounts = new Map<AccountKey, AccountView>()
  async function cachedTitles(acct: AccountKey, incognito: boolean, site: Site): Promise<PlaylistTitles> {
    const read = await owner.readPlaylistCache({ acct, private: incognito }).catch(() => null)
    if (read?.kind !== "cache" || read.cache === null) return {}
    return Object.fromEntries(cacheRows(read.cache, site).filter(row => row.title).map(row => [row.id, row.title]))
  }
  async function load(incognito: boolean, acct: AccountKey | null, site: Site): Promise<void> {
    const read = await owner.readTabProjection({ private: incognito, account: acct === null ? { kind: "unknown" } : { kind: "signed-in", acct } })
    if (read.kind !== "projection") return
    const projection = read.projection
    if (projection.settings.kind === "value") settings = decodeSettings(projection.settings.settings)
    recentAdds = projection.recentAdds
    if (projection.account.kind !== "signed-in") return
    const setup = projection.account.setup
    const filters = new Map<PlaylistId, Filter>()
    for (const entry of projection.account.filters) {
      if (entry.state.kind === "value" || entry.state.kind === "default") filters.set(entry.playlist, structuredClone(entry.state.filter) as Filter)
    }
    accounts.set(projection.account.acct, {
      setup: setup.kind === "value" && setup.view.kind === "live" ? structuredClone(setup.view.setup) as Setup : null, filters,
      titles: await cachedTitles(projection.account.acct, incognito, site)
    })
  }
  function opened(feature: Feature): Opener {
    switch (feature.kind) {
      case "auto-add": return "auto-add"
      case "shortcut": return "shortcuts"
      case "quick-save": case "picker": return feature.opener
    }
  }
  function targets(feature: Feature, view: AccountView | undefined): readonly Target[] {
    const setup = view?.setup
    switch (feature.kind) {
      case "auto-add": return (setup?.autoAdd ?? []).map(({ pl }) => {
        const playlist = pl as PlaylistId, filter = view?.filters.get(playlist)
        return filter ? { playlist, filter } : { playlist }
      })
      case "shortcut": {
        const shortcut = settings.shortcuts.list.find(entry => entry.id === feature.shortcut)
        if (!shortcut) return []
        if (shortcut.watchLaterOnEveryAccount) return [{ playlist: "WL" as PlaylistId }]
        const playlist = setup?.targets[feature.shortcut]
        return playlist ? [{ playlist: playlist as PlaylistId }] : []
      }
      case "quick-save": {
        const playlist = feature.site === "music" ? setup?.musicSave : setup?.quickSave
        return playlist ? [{ playlist: playlist as PlaylistId }] : []
      }
      case "picker": return []
    }
  }
  const port: Owner = {
    shared(feature): Shared {
      const opener = opened(feature)
      // Playing now shows only while the YouTube Music section is on, whichever of its features are (YM-POP-10).
      if (opener === "playing-now") return { on: settings.musicSection, feedback: true }
      const current = switches[opener]?.(settings)
      return { on: current?.on === true, feedback: current?.feedback !== false }
    },
    account(feature, acct): AccountSettings { return { targets: targets(feature, accounts.get(acct)), created: {} } },
    writable,
    // The store has no Missing or Full mark writer yet; marks stay unrecorded until it does.
    mark() {},
    recentAdds: () => recentAdds,
    titles: acct => accounts.get(acct)?.titles ?? {}
  }
  return { port, load }
}

export type ActingTab = { readonly tabId: number; readonly incognito: boolean; readonly site: Site }
export type Actions = {
  readonly flow: AddFlow
  /** An explicit add in a tab the background chose, as that tab's account (YT-ANY-05, YT-BM-04). */
  addInTab(tab: ActingTab, request: TabAddRequest): Promise<TabAddReport>
  /** Playing now's save in the tab it read, only while that tab still shows `acct` in the popup's window kind (ARC-ACC-68). */
  addFromPopup(tab: ActingTab, acct: AccountKey, request: PopupAddRequest): Promise<TabAddReport | { readonly kind: "account-changed" }>
  settings(incognito: boolean): Promise<Settings | null>
  dispose(): void
}

/** The add flow over the Tabs engine, and the tab routes a page's user actions use (06 §6.8.2). */
export function composeActions(deps: {
  readonly native: SenderOriginPorts & { readonly runtime: SenderOriginPorts["runtime"] & RuntimePort }
  readonly build: BuildId
  readonly owner: Pick<StartingOwner, "readTabProjection" | "readSession" | "changeSession" | "changeSetupDestination" | "readPlaylistCache">
  readonly tabs: Tabs
  readonly playlists: Playlists
  readonly registrar: Pick<Registrar, "ensure">
  readonly writable: () => boolean
  readonly requester: (origin: Extract<Origin, { kind: "ui" }>) => Promise<Requester | null>
  readonly log?: (line: string) => void
}): Actions {
  const { native, owner, tabs, playlists, registrar } = deps
  const view = createAddFlowOwner(owner, deps.writable)
  const flow = createAddFlow({
    execution: createTabsExecution(tabs, deps.requester),
    owner: view.port,
    session: { read: () => owner.readSession(), change: change => owner.changeSession(change) },
    now: () => Date.now(),
    wait: ms => new Promise(resolve => { setTimeout(resolve, ms) }),
    generation: () => crypto.randomUUID()
  })
  const log = deps.log ?? (line => console.info(`[Perchling] ${line}`))
  const rpc = createRpc<TabActionMessages, NativeSender>(runtimeTransport(native.runtime), { build: deps.build, deadline: timerDeadline, contract: tabActionContract })

  async function pinned(context: TabContext, acct: AccountKey | null): Promise<boolean> {
    const [known] = await tabs.known({ kind: "tab", tabId: context.origin.tabId })
    return known !== undefined && known.acct === acct && known.privateTab === context.origin.incognito
  }
  function titlesOf(acct: AccountKey | null, ids: readonly PlaylistId[]): PlaylistTitles {
    if (acct === null) return {}
    const known = view.port.titles(acct)
    return Object.fromEntries(ids.flatMap(id => known[id] ? [[id, known[id]]] : []))
  }
  async function addIn(tab: ActingTab, acct: AccountKey | null, request: TabAddRequest | PopupAddRequest): Promise<TabAddReport> {
    await view.load(tab.incognito, acct, tab.site)
    const { memory: _memory, ...report } = await flow.add(request, { kind: "tab", tabId: tab.tabId, incognito: tab.incognito })
    if (report.kind !== "report" && report.kind !== "stopped") return report
    const ids = Object.keys(report.outcomes) as PlaylistId[]
    if (ids.length) log(`add (${request.via}) ${Object.entries(report.outcomes).map(([playlist, outcome]) => `${playlist}=${outcome.kind === "failed" ? outcome.failure : outcome.kind}`).join(" ")}`)
    // A pick's toast belongs to its picker, but a save from the browser's menu or a key from any tab has no picker to plan it.
    const toast = report.kind === "report" && report.toast === null && request.via === "picker" && (request.opener === "browser-menu" || request.opener === "any-tab-keys")
      ? toastPlan({ kind: "quick-save", outcomes: report.outcomes as Record<PlaylistId, ExplicitOutcome> }, report.feedback) : report.toast
    return { ...report, toast, titles: titlesOf(acct, ids) } as TabAddReport
  }
  function requestOf(context: TabContext): Requester {
    return { windowId: context.windowId, incognito: context.origin.incognito, activeTabId: context.origin.tabId }
  }
  const unbind = rpc.handle({ authenticate: authenticateTab(native), handlers: {
    async "tab.add"({ acct, request }, context): Promise<TabAddReport> {
      if (request.site !== context.site || !await pinned(context, acct)) return { kind: "no-tab" }
      return addIn({ tabId: context.origin.tabId, incognito: context.origin.incognito, site: context.site }, acct, request)
    },
    async "tab.remove"({ acct, request }, context) {
      if (request.site !== context.site || !await pinned(context, acct)) return { kind: "no-tab" }
      await view.load(context.origin.incognito, acct, context.site)
      const { memory: _memory, ...report } = await flow.remove(request, context.origin)
      return report.kind === "removed" ? { ...report, titles: titlesOf(acct, [report.playlist]) } : report
    },
    async "tab.undo"({ acct, request }, context): Promise<TabUndoReport> {
      if (!await pinned(context, acct)) return { kind: "no-tab" }
      const report = await flow.undo(request, context.origin)
      switch (report.kind) {
        case "undone": return { kind: "undone" }
        case "failed": return { kind: "failed", completed: report.completed, of: report.of, failure: report.failure, toast: report.toast }
        case "stopped": return { kind: "stopped", completed: report.completed, of: report.of }
        default: return { kind: report.kind }
      }
    },
    "tab.release"({ handle }) { flow.release(handle); return null },
    async "tab.need"(_request, context) {
      try { await registrar.ensure(context.origin.tabId, { popovers: true }); return { kind: "ok" } } catch { return { kind: "failed" } }
    },
    async "tab.playlists"({ acct, request }, context): Promise<TabPlaylists> {
      if (acct === null || !await pinned(context, acct)) return { kind: "noTab" }
      // A cached read never reaches YouTube; the picker asks for a refresh itself when the list is stale (YT-PK-02).
      if (!request.refresh) {
        const read = await owner.readPlaylistCache({ acct, private: context.origin.incognito }).catch(() => null)
        if (read?.kind !== "cache") return { kind: "failed" }
        return { kind: "cached", listing: read.cache === null || read.cache.listAt === null ? null : { rows: cacheRows(read.cache, context.site), at: read.cache.listAt } }
      }
      const open = await playlists.list(acct, { site: context.site, req: requestOf(context), originalTab: context.origin.tabId, refresh: true })
      if (open.kind !== "open") return { kind: "failed" }
      const fresh = await (open.refresh ?? Promise.resolve(null))
      if (fresh?.kind === "listed") return { kind: "listed", listing: { rows: fresh.listing.rows, at: fresh.listing.at } }
      return { kind: fresh?.outcome.kind === "no-tab" ? "noTab" : "failed" }
    },
    async "tab.create"({ acct, request }, context): Promise<TabCreated> {
      if (acct === null || !await pinned(context, acct)) return { kind: "failed", reason: "failed" }
      const answer = await playlists.create(acct, { site: context.site, req: requestOf(context), originalTab: context.origin.tabId })
        .submit({ title: request.title, privacy: request.privacy, ...(request.video === null ? {} : { videoId: request.video }) })
      if (answer.kind === "created") return { kind: "created", id: answer.id }
      const outcome = answer.kind === "not-created" ? answer.outcome : null
      return { kind: "failed", reason: outcome?.kind === "result" && !outcome.result.ok && outcome.result.http === 429 ? "rateLimited" : "failed" }
    },
    async "tab.destination"({ acct, request }, context) {
      if (acct === null || !await pinned(context, acct)) return { kind: "refused", reason: "unavailable" }
      const change = { kind: "setup-destination", acct, ...request } as const
      try {
        const result = await owner.changeSetupDestination({ kind: "ui", windowId: context.windowId, incognito: context.origin.incognito },
          { acct, destination: request.destination, expected: request.expected, playlist: request.playlist })
        return projectDestination(change, result)
      } catch { return { kind: "refused", reason: "rejected" } }
    }
  } })
  return {
    flow,
    async addInTab(tab, request) {
      const [known] = await tabs.known({ kind: "tab", tabId: tab.tabId })
      if (!known || known.privateTab !== tab.incognito) return { kind: "no-tab" }
      return addIn(tab, known.acct, request)
    },
    async addFromPopup(tab, acct, request) {
      const [known] = await tabs.known({ kind: "tab", tabId: tab.tabId })
      if (!known) return { kind: "no-tab" }
      if (known.acct !== acct || known.privateTab !== tab.incognito) return { kind: "account-changed" }
      return addIn(tab, acct, request)
    },
    async settings(incognito) {
      const read = await owner.readTabProjection({ private: incognito, account: { kind: "unknown" } }).catch(() => null)
      return read?.kind === "projection" && read.projection.settings.kind === "value" ? decodeSettings(read.projection.settings.settings) : null
    },
    dispose() {
      unbind()
      rpc.dispose()
      void flow.quiesce()
    }
  }
}
