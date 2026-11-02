import { createAccounts } from "../accounts/accounts"
import { composeActions, type Actions } from "./actions"
import { composeAnyTab } from "./any-tab"
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
import type { StartingOwner, StoreLifecycle } from "../store/store-lifecycle"
import { createTabViewProducer } from "../tab-view/producer"
import { createViewPublication } from "../tab-view/publication"
import { createTabs } from "../tabs/tabs"
import type { BuildId } from "../../shared/contracts"
import { siteBundles } from "../../shared/features/registration"

export type Services = { readonly tabs: ReturnType<typeof createTabs>; readonly badge: ToolbarBadge; dispose(): void }

/** Everything that needs a live store owner: Tabs and the tab view, Playlists, Accounts and the UI routes. */
export function composeServices(deps: {
  readonly native: NativeBrowser
  readonly runtime: RuntimePort
  readonly build: BuildId
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
  const privateSkips = {
    readPrivateSkips: async () => ({ kind: "unavailable", reason: "context" }) as const,
    subscribePrivateSkips: () => () => {}
  }
  const monitor = composeMonitor({ owner: { readSession: () => owner.readSession(), changeSession: change => owner.changeSession(change),
    subscribeView: fn => owner.subscribeView(fn) }, clock: { now: () => performance.now(), after: timerDeadline } })
  const producer = createTabViewProducer({ owner, addFlow: privateSkips, statuses: monitor.statusProducer, notices: monitor.noticeProducer, build })
  const unbindHello = browserTabs.bindHello(tabs, producer)
  const publication = createViewPublication({ owner, tabs, producer, privateSkips, clock,
    monitor })
  const playlists = createPlaylists({ owner, tabs, now: () => Date.now() })
  const actions = composeActions({ native: { ...native, runtime }, build, owner, tabs, playlists, registrar, writable: deps.consented,
    async requester(origin) {
      const [active] = await native.tabs.query({ active: true, windowId: origin.windowId }).catch(() => [])
      return { windowId: origin.windowId, incognito: origin.incognito, activeTabId: typeof active?.id === "number" ? active.id : null }
    } })
  const anyTab = composeAnyTab({ native, build, actions, tabs, registrar, consented: deps.consented, menuClicksHeard: deps.menuClicksHeard,
    i18n: createSiteI18n({ getMessage: (name, substitutions) => native.i18n.getMessage(name as never, substitutions) }) })
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
  const repaint = () => { void badge.refresh() }
  const changed = (_changes: unknown, area: string) => { if (area === "local" || area === "session") repaint() }
  native.storage.onChanged.addListener(changed)
  native.permissions.onAdded.addListener(repaint)
  native.permissions.onRemoved.addListener(repaint)
  repaint()
  return {
    tabs, badge,
    dispose() {
      for (const stop of [() => native.storage.onChanged.removeListener(changed), () => native.permissions.onAdded.removeListener(repaint),
        () => native.permissions.onRemoved.removeListener(repaint), () => badge.dispose(), () => monitor.dispose(), () => router.dispose(), () => accounts.dispose(), () => playlists.dispose(), () => publication.dispose(),
        unbindHello, () => producer.dispose(), () => tabs.dispose(), () => browserTabs.dispose()]) {
        try { stop() } catch {}
      }
    }
  }
}
