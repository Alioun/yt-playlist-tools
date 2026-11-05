import { createBrowserStartingLocalFilterWriter, type BrowserStartingOwnerOptions } from "./starting-owner"
import { createStoreLifecycle, type FirstRunOpening, type StoreLifecycle } from "../store/store-lifecycle"
import { createSyncReset } from "../store/sync-reset"
import { createSyncMutationPace } from "../store/sync-mutation-pacing"
import type { SyncClock } from "../store/local-filter-writer"
import type { ResetNotice } from "../store/sync-reset-receive"
import type { Registrar, ScriptingPort } from "../registrar/ports"
import { ownedRegistrationIds } from "../registrar/registrar"
import type { Tabs } from "../tabs/ports"

type NativeBrowser = typeof import("wxt/browser").browser
type NamedLocal = NativeBrowser["storage"]["local"] & { getKeys?(): Promise<string[]> }
type NamedSession = NativeBrowser["storage"]["session"] & { getKeys?(): Promise<string[]> }
export type ClearAllNative = {
  readonly storage: NativeBrowser["storage"] & {
    readonly local: NamedLocal
    readonly session: NamedSession
    readonly sync: NativeBrowser["storage"]["sync"]
  }
}
export type ClearAllTeardownReceipt = { readonly kind: "confirmed"; readonly scripts: "absent"; readonly tabs: "torn-down"; readonly browserMenu: "released" }
export type ClearAllTeardown = { quiesce(): Promise<ClearAllTeardownReceipt> }

export function createClearAllTeardown(ports: {
  readonly registrar: Registrar
  readonly tabs: Pick<Tabs, "dispose">
  readonly extLinks: readonly { dispose(): void }[]
  readonly scripting: Pick<ScriptingPort, "list" | "unregister">
  drainInvokedWork(): Promise<"drained" | "unconfirmed">
  tearDownAllOpenTabs(): Promise<"torn-down" | "unconfirmed">
  releaseBrowserMenu(): Promise<"released" | "unconfirmed">
}): ClearAllTeardown {
  return {
    async quiesce() {
      ports.registrar.dispose()
      ports.tabs.dispose()
      for (const link of ports.extLinks) link.dispose()
      const drained = await ports.drainInvokedWork()
      if (drained !== "drained") throw new Error("Clear all producer drain unconfirmed")
      const scripts = await ports.scripting.list()
      const owned = scripts.filter(script => ownedRegistrationIds.some(id => id === script.id)).map(script => script.id)
      if (owned.length) {
        const ids = ownedRegistrationIds.filter(id => owned.includes(id))
        try {
          await ports.scripting.unregister(ids)
        } catch {}
      }
      const after = await ports.scripting.list()
      if (after.some(script => ownedRegistrationIds.some(id => id === script.id))) throw new Error("Clear all script teardown unconfirmed")
      const tabs = await ports.tearDownAllOpenTabs()
      const menu = await ports.releaseBrowserMenu()
      if (tabs !== "torn-down" || menu !== "released") throw new Error("Clear all tab or browser-menu teardown unconfirmed")
      return { kind: "confirmed", scripts: "absent", tabs, browserMenu: menu }
    }
  }
}

export function createBrowserStoreLifecycle(
  native: ClearAllNative,
  options: {
    readonly owner: Omit<BrowserStartingOwnerOptions, "syncMutationPace" | "resetReceive">
    readonly clock: SyncClock
    readonly generation: () => string
    readonly teardown: ClearAllTeardown
    readonly database: { delete(name: "yt-playlist-tools"): Promise<"deleted" | "unconfirmed"> }
    readonly firstRun: { open(): Promise<FirstRunOpening> }
    readonly notices: { publish(notice: ResetNotice): Promise<"published" | "already-published" | "unconfirmed"> }
  }
): StoreLifecycle {
  const pace = createSyncMutationPace(options.clock)
  const reset = createSyncReset({
    local: { get: keys => native.storage.local.get([...keys]), set: items => native.storage.local.set(items) },
    sync: { get: () => native.storage.sync.get(null), set: items => native.storage.sync.set(items), remove: keys => native.storage.sync.remove([...keys]) },
    pace,
    clock: options.clock,
    generation: options.generation
  })
  return createStoreLifecycle({
    startOwner: () =>
      createBrowserStartingLocalFilterWriter(native, {
        ...options.owner,
        syncClock: options.clock,
        generation: options.generation,
        syncMutationPace: pace,
        resetReceive: {
          kind: "available",
          removeLocal: names => native.storage.local.remove([...names]),
          session: {
            get: () => native.storage.session.get(null),
            set: items => native.storage.session.set(items),
            remove: keys => native.storage.session.remove(keys.map(key => `${key.kind}:${key.acct}`))
          },
          publishNotice: notice => options.notices.publish(notice)
        }
      }),
    local: {
      get: keys => native.storage.local.get([...keys]),
      set: items => native.storage.local.set(items),
      remove: keys => native.storage.local.remove([...keys]),
      async names() {
        return native.storage.local.getKeys ? native.storage.local.getKeys() : Object.keys(await native.storage.local.get(null))
      }
    },
    consentDevice: { get: keys => native.storage.local.get([...keys]), set: items => native.storage.local.set(items) },
    session: {
      clear: () => native.storage.session.clear(),
      async names() {
        return native.storage.session.getKeys ? native.storage.session.getKeys() : Object.keys(await native.storage.session.get(null))
      }
    },
    syncedReset: reset,
    producers: {
      async quiesce() {
        const receipt = await options.teardown.quiesce()
        if (receipt.kind !== "confirmed" || receipt.scripts !== "absent" || receipt.tabs !== "torn-down" || receipt.browserMenu !== "released") throw new Error("Clear all teardown receipt invalid")
      }
    },
    async deleteDatabase(name) {
      if ((await options.database.delete(name)) !== "deleted") throw new Error("Retired database deletion unconfirmed")
    },
    openFirstRun: () => options.firstRun.open()
  })
}
