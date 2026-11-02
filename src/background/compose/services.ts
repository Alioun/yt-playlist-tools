import { createAccounts } from "../accounts/accounts"
import { composeActions, type Actions } from "./actions"
import { composeAnyTab } from "./any-tab"
import { composePlayingNow } from "./playing-now"
import { createSiteI18n } from "../../shared/i18n"
import type { NativeBrowser } from "../adapters/browser"
import { runtimeTransport, timerDeadline, type RuntimePort } from "../adapters/runtime"
import { createBrowserTabs } from "../adapters/tabs"
import { createPlaylists } from "../playlists/playlists"
import type { Registrar } from "../registrar/ports"
import { createUiRouter } from "../router/ui-playlists"
import { createPageStatus } from "./page-status"
import { createToolbarBadge, type ToolbarBadge } from "./badge"
import { composeMonitor } from "./monitor"
import { composeGather } from "./gather"
import type { StartingOwner, StoreLifecycle } from "../store/store-lifecycle"
import { createTabViewProducer } from "../tab-view/producer"
import { createViewPublication } from "../tab-view/publication"
import { createTabs } from "../tabs/tabs"
import type { BuildId } from "../../shared/contracts"
import { siteBundles } from "../../shared/features/registration"

export type Services = {
  readonly tabs: ReturnType<typeof createTabs>
  readonly actions: Actions
  readonly anyTab: ReturnType<typeof composeAnyTab>
  readonly badge: ToolbarBadge
  readonly gather: ReturnType<typeof composeGather>
  dispose(): void
}

/** Everything that needs a live store owner: Tabs and the tab view, Playlists, Accounts and the UI routes. */
export function composeServices(deps: {
  readonly native: NativeBrowser
  readonly runtime: RuntimePort
  readonly build: BuildId
  readonly browser: "chrome" | "firefox"
  readonly owner: StartingOwner
  readonly lifecycle: StoreLifecycle
  readonly registrar: Registrar
  readonly consented: () => boolean
  readonly menuClicksHeard: boolean
}): Services {
  const { native, build, owner, registrar } = deps
  const runtime = { ...deps.runtime, id: native.runtime.id, getURL: (path: string) => native.runtime.getURL(path as never) }
  const browserTabs = createBrowserTabs({ ...native, runtime }, { build, deadline: timerDeadline })
  const clock = { now: () => performance.now(), wallNow: () => Date.now(), after: timerDeadline }
  const tabs = createTabs({
    session: { read: () => owner.readSession(), change: change => owner.changeSession(change) },
    native: browserTabs.port,
    registrar: { async ensure(tabId) {
      try { await registrar.ensure(tabId, { core: true }); return { kind: "ready" } } catch { return { kind: "unavailable" } }
    } },
    accounts: {
      lastAccount: async () => null,
      async hasSetup(acct) { const read = await owner.readSetup(acct); return read.kind === "value" && read.view.kind === "live" }
    },
    clock, enabled: deps.consented
  })
  const monitor = composeMonitor({ owner: { readSession: () => owner.readSession(), changeSession: change => owner.changeSession(change),
    subscribeView: fn => owner.subscribeView(fn) }, clock: { now: () => performance.now(), after: timerDeadline } })
  const badge = createToolbarBadge({
    action: {
      setBadgeText: details => native.action.setBadgeText(details as never),
      setBadgeBackgroundColor: details => native.action.setBadgeBackgroundColor(details),
      setTitle: details => native.action.setTitle(details as never)
    },
    local: { get: () => native.storage.local.get(null) }, owner, statuses: monitor.statusProducer,
    access: site => native.permissions.contains({ origins: [siteBundles[site].match] }), tab: tabId => browserTabs.port.get(tabId), build,
    i18n: { getMessage: (name, substitutions) => native.i18n.getMessage(name as never, substitutions) },
    clock: { after: (milliseconds, run) => { const timer = setTimeout(run, milliseconds); return () => clearTimeout(timer) } }
  })
  const playlists = createPlaylists({ owner, tabs, now: () => Date.now() })
  const actions = composeActions({ native: { ...native, runtime }, build, owner, tabs, playlists, registrar, writable: deps.consented,
    ticked: tabId => badge.tick(tabId),
    closed(listener) {
      native.tabs.onRemoved.addListener(listener)
      return () => native.tabs.onRemoved.removeListener(listener)
    },
    async requester(origin) {
      const [active] = await native.tabs.query({ active: true, windowId: origin.windowId }).catch(() => [])
      return { windowId: origin.windowId, incognito: origin.incognito, activeTabId: typeof active?.id === "number" ? active.id : null }
    } })
  const siteI18n = createSiteI18n({ getMessage: (name, substitutions) => native.i18n.getMessage(name as never, substitutions) })
  const anyTab = composeAnyTab({ native, build, actions, tabs, registrar, consented: deps.consented, menuClicksHeard: deps.menuClicksHeard, i18n: siteI18n,
    flash: (tabId, ok, title) => badge.flash(tabId, ok, title) })
  const reconcileMenu = () => { void anyTab.reconcileMenu() }
  const stopMenuSettings = owner.subscribe(reconcileMenu)
  native.permissions.onAdded.addListener(reconcileMenu)
  native.permissions.onRemoved.addListener(reconcileMenu)
  reconcileMenu()
  const producer = createTabViewProducer({ owner, addFlow: actions.flow, statuses: workingStatuses, notices: noNotices, build })
  const unbindHello = browserTabs.bindHello(tabs, producer)
  const publication = createViewPublication({ owner, tabs, producer, privateSkips: actions.flow, clock,
    monitor: { subscribeView: () => () => {} } })
  const accounts = createAccounts({ owner, tabs, claim: { kind: "unavailable", reason: "production-ownership-required" }, now: () => Date.now() })
  const gather = composeGather({ native: { ...native, runtime }, senders: { ...native, runtime },
    browser: deps.browser, build, owner, tabs, nativeTabs: browserTabs.port, addFlow: actions.flow, settings: incognito => actions.settings(incognito), registrar,
    statuses: monitor.statusProducer, i18n: siteI18n, flash: (tabId, ok, title) => badge.flash(tabId, ok, title) })
  const producer = createTabViewProducer({ owner, addFlow: actions.flow, statuses: monitor.statusProducer, notices: monitor.noticeProducer, build })
  // A hello starts a page load, since each site core says hello once.
  const unbindHello = browserTabs.bindHello(tabs, producer, context => {
    actions.pageStarted(context.tab.tabId)
    badge.loaded(context.tab.tabId)
    void accounts.onSeen(context).catch(() => {})
    gather.hello(context, hello)
  })
  const publication = createViewPublication({ owner, tabs, producer, privateSkips: actions.flow, clock, monitor })
  const autoAddRoutes = createAutoAddTabRouter({ transport: runtimeTransport(deps.runtime), senders: { ...native, runtime }, build,
    deadline: timerDeadline, tabs, owner, untick: tabId => badge.untick(tabId), now: () => Date.now() })
  async function readAccess() {
    const has = (origins: string[]) => native.permissions.contains({ origins })
    return { www: await has([siteBundles.www.match]), music: await has([siteBundles.music.match]),
      browserMenu: await native.permissions.contains({ permissions: ["contextMenus"] }) }
  }
  const router = createUiRouter({
    lifecycle: deps.lifecycle, sharedSettings: owner, owner,
    native: { runtime, windows: native.windows, tabs: native.tabs },
    services: { kind: "ready", tabs, playlists },
    firstRun: {
      readAccess,
      lookup: {
        sync: { get: () => native.storage.sync.get(null), subscribe(changed) {
          const listener = () => changed()
          native.storage.sync.onChanged.addListener(listener)
          return () => native.storage.sync.onChanged.removeListener(listener)
        } },
        clock, isCurrent: () => true
      }
    },
    transport: runtimeTransport(deps.runtime),
    rpc: { build, deadline: timerDeadline },
    playingNow: composePlayingNow({ native, tabs, registrar, actions, consented: deps.consented }),
    add: createPlayingSave({ actions, i18n: siteI18n, consented: deps.consented }),
    gather: gather.routes,
    woke: () => gather.woke("ui"),
    pages: {
      owner,
      session: { get: async key => (await native.storage.session.get(key))[key] },
      status: createPageStatus({ owner, statuses: monitor.statusProducer, tab: tabId => browserTabs.port.get(tabId), build }),
      withdraw: (origin, expected) => deps.lifecycle.withdrawConsent(origin, expected),
      readAccess: () => readAccess(),
      version: () => native.runtime.getManifest().version,
      now: () => Date.now()
    }
  })
  const repaint = () => { void badge.refresh() }
  const changed = (_changes: unknown, area: string) => { if (area === "local" || area === "session") repaint() }
  native.storage.onChanged.addListener(changed)
  native.permissions.onAdded.addListener(repaint)
  native.permissions.onRemoved.addListener(repaint)
  repaint()
  return {
    tabs, actions, anyTab, badge, gather,
    dispose() {
      for (const stop of [() => native.storage.onChanged.removeListener(changed), () => native.permissions.onAdded.removeListener(repaint),
        () => native.permissions.onRemoved.removeListener(repaint), () => badge.dispose(), () => router.dispose(), () => autoAddRoutes.dispose(),
        () => accounts.dispose(), () => gather.dispose(), stopMenuSettings, () => native.permissions.onAdded.removeListener(reconcileMenu),
        () => native.permissions.onRemoved.removeListener(reconcileMenu), () => anyTab.dispose(), () => actions.dispose(), () => playlists.dispose(),
        () => publication.dispose(), () => monitor.dispose(),
        unbindHello, () => producer.dispose(), () => tabs.dispose(), () => browserTabs.dispose()]) {
        try { stop() } catch {}
      }
    }
  }
}
