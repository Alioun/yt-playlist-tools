import { createFirstRunHarness } from "../first-run-backend/harness"
import { manualClock, nativeTab, signedIn, a, build } from "../tabs/harness"
import { alpha, beta, success } from "../playlists-cache/harness"
import { createTabs } from "../../../src/background/tabs/tabs"
import type { TabNativePort } from "../../../src/background/tabs/ports"
import { createPlaylists } from "../../../src/background/playlists/playlists"
import { isJobResultFor } from "../../../src/shared/contracts/jobs"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import type { NativeSender } from "../../../src/background/adapters/sender-origin"
import { createUiRouter } from "../../../src/background/router/ui-playlists"
import { createBrowserBackend, type BrowserBackendPort } from "../../../src/ui/backend/browser"
import { popup } from "../ui-read-playlist-bridge/harness"

export async function startingBridge() {
  const first = await createFirstRunHarness(),
    clock = manualClock(),
    tab = nativeTab(1)
  const native: TabNativePort = {
    async query(site) {
      return { kind: "tabs", tabs: site === "all" || site === tab.site ? [tab] : [] }
    },
    async get(id) {
      return id === tab.tabId ? { kind: "tab", tab } : { kind: "gone" }
    },
    async ping() {
      return { kind: "answered", result: signedIn() }
    },
    async run(_id, invocation) {
      const answer = success([
        { id: alpha, title: "Alpha" },
        { id: beta, title: "Beta" }
      ])
      return isJobResultFor(invocation.job, answer) ? { kind: "answered", result: answer } : { kind: "failed", failure: "invalid-answer" }
    },
    async view() {
      return { kind: "answered", result: null }
    },
    dispose() {}
  }
  const tabs = createTabs({
    native,
    clock,
    enabled: () => true,
    session: { read: () => first.owner.readSession(), change: v => first.owner.changeSession(v) },
    registrar: {
      async ensure() {
        return { kind: "ready" }
      }
    },
    accounts: {
      async lastAccount() {
        return a
      },
      async hasSetup(acct) {
        const read = await first.owner.readSetup(acct)
        return read.kind === "value"
      }
    }
  })
  const playlists = createPlaylists({ owner: first.owner, tabs, now: clock.wallNow })
  const network = createMemoryNetwork<NativeSender>({ delivery: "immediate" })
  const router = createUiRouter({
    owner: first.owner,
    services: { kind: "ready", tabs, playlists },
    native: {
      runtime: { id: "fixture-extension", getURL: path => `chrome-extension://fixture-extension${path}` },
      windows: {
        async get(id) {
          return { id, incognito: id === 2 }
        }
      },
      tabs: {
        async query(query) {
          return query.windowId === 1 ? [{ id: 1, windowId: 1, incognito: false, active: true }] : []
        }
      }
    },
    firstRun: {
      async readAccess() {
        return { www: true, music: true, browserMenu: true }
      },
      lookup: {
        sync: {
          async get() {
            return {}
          },
          subscribe() {
            return () => {}
          }
        },
        clock: { now: clock.now, after: clock.after },
        isCurrent: () => true
      }
    },
    transport: network.connect({ id: "fixture-extension" }),
    rpc: { build, deadline: clock.after }
  })
  const listeners = new Set<Parameters<BrowserBackendPort["storage"]["onChanged"]["addListener"]>[0]>()
  const views: ReturnType<typeof createBrowserBackend>[] = []
  function open(sender = popup(), windowId?: number) {
    const port: BrowserBackendPort = {
      runtime: {
        sendMessage: network.connect(sender).send,
        getManifest: () => ({
          manifest_version: 3,
          name: "Synthetic starting bridge",
          version: "1.0.0",
          host_permissions: ["https://www.youtube.com/*"],
          optional_host_permissions: ["https://music.youtube.com/*"],
          optional_permissions: ["contextMenus"]
        })
      },
      storage: {
        local: {
          async get(keys) {
            if (!Array.isArray(keys) || !keys.every(key => typeof key === "string")) throw Error("Synthetic named local keys")
            return first.store.deps.local.get(keys)
          }
        },
        onChanged: {
          addListener(fn) {
            listeners.add(fn)
          },
          removeListener(fn) {
            listeners.delete(fn)
          }
        }
      },
      permissions: { contains: async () => true, request: async () => true }
    }
    const backend = createBrowserBackend(port, { build, deadline: clock.after, ...(windowId === undefined ? {} : { windowId }) })
    views.push(backend)
    return backend
  }
  return {
    owner: first.owner,
    store: first.store,
    network,
    clock,
    open,
    async dispose() {
      for (const view of views) view.dispose()
      router.dispose()
      playlists.dispose()
      tabs.dispose()
      await first.dispose()
    },
    stats: () => ({ nativeListeners: network.listening(), localListeners: listeners.size, deadlines: clock.pending })
  }
}
