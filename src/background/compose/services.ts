import { createAccounts } from "../accounts/accounts"
import { composeActions, type Actions } from "./actions"
import type { NativeBrowser } from "../adapters/browser"
import { runtimeTransport, timerDeadline, type RuntimePort } from "../adapters/runtime"
import { createBrowserTabs } from "../adapters/tabs"
import { createPlaylists } from "../playlists/playlists"
import type { Registrar } from "../registrar/ports"
import { createUiRouter } from "../router/ui-playlists"
import type { StartingOwner, StoreLifecycle } from "../store/store-lifecycle"
import { createTabViewProducer, tabViewFacts, type NoticeProducer, type StatusProducer } from "../tab-view/producer"
import { createViewPublication } from "../tab-view/publication"
import { createTabs } from "../tabs/tabs"
import type { BuildId } from "../../shared/contracts"
import { siteBundles } from "../../shared/features/registration"

export type Services = { readonly tabs: ReturnType<typeof createTabs>; readonly actions: Actions; dispose(): void }

/**
 * Until the Monitor's production authority is bound (B35), every feature that's on reads as working, which is
 * what the Monitor reports for a tab with no breakage evidence, and no notice is due.
 */
const workingStatuses: StatusProducer = { async read(context, enabled) {
  return { kind: "statuses", facts: tabViewFacts(context), current: () => true,
    statuses: enabled.map(feature => ({ feature: feature.id, state: "working", jobs: [], anchors: [], actions: [], kinds: [] })) }
} }
const noNotices: NoticeProducer = { async read(context) {
  return { kind: "notices", facts: tabViewFacts(context), notices: [], current: () => true }
} }

/** Everything that needs a live store owner: Tabs and the tab view, Playlists, Accounts and the UI routes. */
export function composeServices(deps: {
  readonly native: NativeBrowser
  readonly runtime: RuntimePort
  readonly build: BuildId
  readonly owner: StartingOwner
  readonly lifecycle: StoreLifecycle
  readonly registrar: Registrar
  readonly consented: () => boolean
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
  const playlists = createPlaylists({ owner, tabs, now: () => Date.now() })
  const actions = composeActions({ native: { ...native, runtime }, build, owner, tabs, playlists, registrar, writable: deps.consented,
    async requester(origin) {
      const [active] = await native.tabs.query({ active: true, windowId: origin.windowId }).catch(() => [])
      return { windowId: origin.windowId, incognito: origin.incognito, activeTabId: typeof active?.id === "number" ? active.id : null }
    } })
  const producer = createTabViewProducer({ owner, addFlow: actions.flow, statuses: workingStatuses, notices: noNotices, build })
  const unbindHello = browserTabs.bindHello(tabs, producer)
  const publication = createViewPublication({ owner, tabs, producer, privateSkips: actions.flow, clock,
    monitor: { subscribeView: () => () => {} } })
  const accounts = createAccounts({ owner, tabs, claim: { kind: "unavailable", reason: "production-ownership-required" }, now: () => Date.now() })
  const router = createUiRouter({
    lifecycle: deps.lifecycle, sharedSettings: owner, owner,
    native: { runtime, windows: native.windows, tabs: native.tabs },
    services: { kind: "ready", tabs, playlists },
    firstRun: {
      async readAccess() {
        const has = (origins: string[]) => native.permissions.contains({ origins })
        return { www: await has([siteBundles.www.match]), music: await has([siteBundles.music.match]),
          browserMenu: await native.permissions.contains({ permissions: ["contextMenus"] }) }
      },
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
    rpc: { build, deadline: timerDeadline }
  })
  return {
    tabs, actions,
    dispose() {
      for (const stop of [() => router.dispose(), () => accounts.dispose(), () => actions.dispose(), () => playlists.dispose(), () => publication.dispose(),
        unbindHello, () => producer.dispose(), () => tabs.dispose(), () => browserTabs.dispose()]) {
        try { stop() } catch {}
      }
    }
  }
}
