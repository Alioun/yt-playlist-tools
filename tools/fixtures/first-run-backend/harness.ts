import catalogue from "../../../src/public/_locales/en/messages.json"
import { scriptedMessages, type MessageOverrides } from "../localization/scripted"
import { createFirstRunText } from "../../../src/ui/onboarding/text"
import { agreementHarness } from "../claim-transaction/run"
import { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import type { FirstRunCanonicalOwner } from "../../../src/background/router/first-run"
import { createUiRouter } from "../../../src/background/router/ui-playlists"
import { createTabs } from "../../../src/background/tabs/tabs"
import type { TabNativePort } from "../../../src/background/tabs/ports"
import { createPlaylists } from "../../../src/background/playlists/playlists"
import { nativeFirstRunAccess } from "../../../src/background/adapters/first-run"
import { runtimeTransport, type RuntimePort } from "../../../src/background/adapters/runtime"
import type { NativeSender } from "../../../src/background/adapters/sender-origin"
import { type Deadline } from "../../../src/shared/rpc/rpc"
import { isBuildId } from "../../../src/shared/contracts/vocabulary"
import { CONTRACT_VERSION } from "../../../src/shared/contracts/protocol"
import type { JsonObject } from "../../../src/shared/contracts/json"
import { isAccountKey, isPlaylistId } from "../../../src/shared/model/validation"
import { createBrowserBackend, createBrowserI18n, type BrowserBackendPort } from "../../../src/ui/backend/browser"
import { createFirstRunOwner, type FirstRunServices, type ServingAccount } from "../../../src/ui/backend/first-run-owner"
import type { LocalChange } from "../../../src/ui/backend/backend"
import type { AccountRemovalHost } from "../../../src/background/store/account-removal-execution"
import type { MemoryTrace } from "../../../src/shared/rpc/memory"
import { recordWireTrace } from "../ui-read-playlist-bridge/wire-observer"

export function check(value: unknown, label: string): asserts value {
  if (!value) throw Error(label)
}
export function buildId() {
  const value = "first-run-fixture"
  check(isBuildId(value), "fixture build")
  return value
}
export function accountKey() {
  const value = "AAAAAAAAAAAAAAAA"
  check(isAccountKey(value), "fixture account")
  return value
}
export function playlistId(value = "PL_chosen") {
  check(isPlaylistId(value), "fixture playlist")
  return value
}
export function gate() {
  let release = () => {}
  const waiting = new Promise<void>(resolve => {
    release = resolve
  })
  return { waiting, release }
}
export function onboardingSender(tabId = 10): NativeSender & { tab: NonNullable<NativeSender["tab"]> } {
  return {
    id: "fixture-extension",
    frameId: 0,
    url: "chrome-extension://fixture-extension/onboarding.html",
    documentId: `document-${tabId}`,
    tab: {
      id: tabId,
      windowId: 1,
      incognito: false,
      active: true,
      highlighted: true,
      index: 0,
      pinned: false,
      discarded: false,
      frozen: false,
      selected: true,
      autoDiscardable: true,
      groupId: -1,
      lastAccessed: 0
    }
  }
}
export async function turns() {
  for (let index = 0; index < 80; index++) await Promise.resolve()
}

export async function createFirstRunHarness(
  options: {
    readonly messageOverrides?: MessageOverrides
    readonly records?: JsonObject
    readonly browser?: "chrome" | "firefox"
    readonly missingDeclarations?: boolean
    readonly owner?: (real: FirstRunCanonicalOwner) => FirstRunCanonicalOwner
    readonly removal?: (store: ReturnType<typeof agreementHarness>) => AccountRemovalHost
  } = {}
) {
  const store = agreementHarness(options.records ?? {})
  store.writeError.message = "SENTINEL_WRITE_MESSAGE"
  store.writeError.stack = "SENTINEL_WRITE_STACK"
  Object.assign(store.writeError, { nested: { marker: "SENTINEL_WRITE_NESTED" } })
  store.readError.message = "SENTINEL_READ_MESSAGE"
  store.readError.stack = "SENTINEL_READ_STACK"
  Object.assign(store.readError, { nested: { marker: "SENTINEL_READ_NESTED" } })
  const removal = options.removal?.(store)
  const sessionRecords: JsonObject = {}
  const session: NonNullable<Parameters<typeof createStartingLocalFilterWriter>[0]["session"]> = {
    async get() {
      return structuredClone(sessionRecords)
    },
    async set(items) {
      Object.assign(sessionRecords, structuredClone(items))
    },
    async remove(keys) {
      for (const key of keys) delete sessionRecords[`${key.kind}:${key.acct}`]
    }
  }
  const owner = createStartingLocalFilterWriter({ ...store.deps, session: removal?.kind === "fixture" ? removal.session : session, ...(removal ? { removal } : {}) })
  await owner.ready()
  const startupBatches = structuredClone(store.batches)
  store.batches.splice(0)
  const nativeListeners = new Set<Parameters<RuntimePort["onMessage"]["addListener"]>[0]>()
  type NativeLocalListener = Parameters<BrowserBackendPort["storage"]["onChanged"]["addListener"]>[0]
  const localListeners = new Set<NativeLocalListener>()
  const uiReads: (readonly string[])[] = [],
    requests: unknown[] = [],
    requestBytes: string[] = [],
    answerBytes: string[] = [],
    order: string[] = []
  const nativeClaims: boolean[] = []
  const wireTrace: MemoryTrace[] = []
  const deadlines = new Set<() => void>(),
    lookupTimers = new Set<() => void>(),
    syncListeners = new Set<() => void>()
  const privacy = new Map<number, boolean | undefined>([[1, false]])
  let localAdds = 0,
    localRemoves = 0,
    nativeAdds = 0,
    nativeRemoves = 0,
    authenticationReads = 0,
    accessReads = 0,
    syncReads = 0
  let accountReads = 0,
    playlistReads = 0,
    chooserCalls = 0
  let permissionResult = false,
    permissionFailure = false,
    accessFailure = false,
    current = true,
    time = 0
  const grants = { www: true, music: true, browserMenu: true }
  let account: ServingAccount = { kind: "account", key: accountKey(), account: { name: "Fixture account" } }
  let choice: Awaited<ReturnType<FirstRunServices["chooser"]["choose"]>> = { kind: "chosen", destination: { kind: "quick-save" }, playlist: playlistId() }
  const deadline: Deadline = (_ms, expire) => {
    deadlines.add(expire)
    return () => {
      deadlines.delete(expire)
    }
  }
  const nativeRuntime: RuntimePort = {
    async sendMessage() {
      return undefined
    },
    onMessage: {
      addListener(fn) {
        nativeAdds++
        nativeListeners.add(fn)
      },
      removeListener(fn) {
        nativeRemoves++
        nativeListeners.delete(fn)
      }
    }
  }
  const permissions: BrowserBackendPort["permissions"] = {
    async contains(query) {
      order.push("contains")
      accessReads++
      if (accessFailure) throw Error("SENTINEL_PERMISSION_FAILURE")
      return (
        (query.origins ?? []).every(origin => (origin === "https://www.youtube.com/*" ? grants.www : origin === "https://music.youtube.com/*" && grants.music)) &&
        (query.permissions ?? []).every(permission => permission === "contextMenus" && grants.browserMenu)
      )
    },
    request(query) {
      order.push("request")
      requests.push(structuredClone(query))
      if (permissionFailure) throw Error("SENTINEL_PERMISSION_REQUEST")
      if (permissionResult) {
        if (query.origins?.includes("https://music.youtube.com/*")) grants.music = true
        if (query.permissions?.includes("contextMenus")) grants.browserMenu = true
      }
      return Promise.resolve(permissionResult)
    }
  }
  const nativeTabs: TabNativePort = {
    async query() {
      return { kind: "tabs", tabs: [] }
    },
    async get() {
      return { kind: "gone" }
    },
    async ping() {
      return { kind: "failed", failure: "transport" }
    },
    async run() {
      return { kind: "failed", failure: "transport" }
    },
    async view() {
      return { kind: "failed", failure: "transport" }
    },
    dispose() {}
  }
  const tabs = createTabs({
    native: nativeTabs,
    enabled: () => current,
    session: { read: () => owner.readSession(), change: input => owner.changeSession(input) },
    clock: { now: () => time, wallNow: () => time, after: deadline },
    registrar: {
      async ensure() {
        return { kind: "unavailable" }
      }
    },
    accounts: {
      async lastAccount() {
        const read = await owner.readLastAccount({ kind: "normal-window", windowId: 1, incognito: false })
        return read.kind === "account" ? read.acct : null
      },
      async hasSetup(acct) {
        const read = await owner.readPlaylistCache({ acct, private: true })
        return read.kind === "cache" && (read.authority.kind === "eligible" || read.authority.reason !== "no-setup")
      }
    }
  })
  const playlists = createPlaylists({ owner, tabs, now: () => time })
  const receiver = createUiRouter({
    native: {
      runtime: { id: "fixture-extension", getURL: path => `chrome-extension://fixture-extension${path}` },
      windows: {
        async get(id) {
          authenticationReads++
          const incognito = privacy.get(id)
          if (typeof incognito !== "boolean") throw Error("SENTINEL_WINDOW")
          return { id, incognito }
        }
      },
      tabs: {
        async query() {
          return []
        }
      }
    },
    owner: options.owner ? { ...owner, ...options.owner(owner) } : owner,
    services: { kind: "ready", tabs, playlists },
    firstRun: {
      readAccess: nativeFirstRunAccess(permissions),
      lookup: {
        sync: {
          async get() {
            syncReads++
            return {}
          },
          subscribe(fn) {
            syncListeners.add(fn)
            return () => {
              syncListeners.delete(fn)
            }
          }
        },
        clock: {
          now: () => time,
          after(_ms, expire) {
            lookupTimers.add(expire)
            return () => {
              lookupTimers.delete(expire)
            }
          }
        },
        isCurrent: () => current
      }
    },
    transport: runtimeTransport(nativeRuntime),
    rpc: { build: buildId(), deadline }
  })
  function emit(changes: LocalChange, area: Parameters<NativeLocalListener>[1] = "local") {
    for (const listener of [...localListeners]) listener(changes, area)
  }
  const originalSet = store.deps.local.set
  store.deps.local.set = async items => {
    const before = store.records()
    try {
      await originalSet(items)
    } finally {
      const after = store.records()
      const changes = Object.fromEntries(
        Object.keys(items)
          .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
          .map(key => [key, { newValue: after[key] }])
      )
      if (Object.keys(changes).length) emit(changes)
    }
  }
  function send(message: unknown, sender: NativeSender): Promise<unknown> {
    const text = JSON.stringify(message)
    requestBytes.push(text)
    wireTrace.push({ event: "sent", from: 0, text })
    return new Promise(resolve => {
      let open = true,
        claimed = false
      const respond = (response?: unknown) => {
        if (!open) return
        open = false
        if (response === undefined) {
          wireTrace.push({ event: "answered", to: 0, text: null })
          resolve(undefined)
          return
        }
        const text = JSON.stringify(response)
        answerBytes.push(text)
        wireTrace.push({ event: "answered", to: 0, text })
        resolve(JSON.parse(text))
      }
      for (const listener of nativeListeners) {
        const claim: unknown = Reflect.apply(listener, undefined, [JSON.parse(text), structuredClone(sender), respond])
        nativeClaims.push(claim === true)
        if (claim === true) claimed = true
      }
      if (!claimed) respond()
    })
  }
  const views: { dispose(): void }[] = []
  function openView(sender: NativeSender = onboardingSender(), windowId?: number) {
    const port: BrowserBackendPort = {
      runtime: {
        sendMessage: message => send(message, sender),
        getManifest() {
          const manifest: ReturnType<BrowserBackendPort["runtime"]["getManifest"]> = {
            manifest_version: 3,
            name: "First-run fixture",
            version: "1.0.0",
            host_permissions: options.browser === "firefox" && !options.missingDeclarations ? ["*://*.youtube.com/*"] : ["https://www.youtube.com/*"]
          }
          if (!options.missingDeclarations) {
            manifest.optional_permissions = ["contextMenus"]
            if (options.browser !== "firefox") manifest.optional_host_permissions = ["https://music.youtube.com/*"]
          }
          return manifest
        }
      },
      permissions,
      storage: {
        local: {
          async get(keys) {
            check(Array.isArray(keys) && keys.every(key => typeof key === "string"), "UI reads only named local keys")
            uiReads.push([...keys])
            return store.deps.local.get(keys)
          }
        },
        onChanged: {
          addListener(fn) {
            localAdds++
            localListeners.add(fn)
          },
          removeListener(fn) {
            localRemoves++
            localListeners.delete(fn)
          }
        }
      }
    }
    const backend = createBrowserBackend(port, { build: buildId(), deadline, browser: options.browser ?? "chrome", ...(windowId === undefined ? {} : { windowId }) })
    const services: FirstRunServices = {
      account: {
        async read() {
          accountReads++
          return account
        }
      },
      playlists: {
        async title(_acct, playlist) {
          playlistReads++
          return playlist === "WL" ? "Watch later" : "Chosen playlist"
        }
      },
      chooser: {
        async choose() {
          chooserCalls++
          return choice
        }
      },
      open() {}
    }
    const i18n = createBrowserI18n({ i18n: scriptedMessages({ overrides: options.messageOverrides }) }, catalogue)
    const text = createFirstRunText(i18n)
    const firstRun = createFirstRunOwner(backend, services, { browser: options.browser ?? "chrome", os: "linux" }, text)
    const view = {
      backend,
      firstRun,
      i18n,
      text,
      port,
      dispose() {
        firstRun.dispose()
        backend.dispose()
      }
    }
    views.push(view)
    return view
  }
  return {
    store,
    startupBatches,
    owner,
    openView,
    send,
    grants,
    privacy,
    order,
    requests,
    requestBytes,
    answerBytes,
    nativeClaims,
    uiReads,
    emit,
    receiver,
    envelope(payload: unknown, kind = "ui.change") {
      return { v: CONTRACT_VERSION, build: buildId(), id: "probe", kind, payload }
    },
    permissionResult(value: boolean) {
      permissionResult = value
    },
    permissionFailure(value: boolean) {
      permissionFailure = value
    },
    accessFailure(value: boolean) {
      accessFailure = value
    },
    choose(value: typeof choice) {
      choice = value
    },
    account(value: ServingAccount) {
      account = value
    },
    expireLookups() {
      time = 10_000
      for (const expire of [...lookupTimers]) expire()
    },
    current(value: boolean) {
      current = value
    },
    stats: () => ({
      localAdds,
      localRemoves,
      nativeAdds,
      nativeRemoves,
      authenticationReads,
      accessReads,
      syncReads,
      accountReads,
      playlistReads,
      chooserCalls,
      localListeners: localListeners.size,
      nativeListeners: nativeListeners.size,
      deadlines: deadlines.size,
      lookupTimers: lookupTimers.size,
      syncListeners: syncListeners.size
    }),
    async dispose() {
      for (const view of views) view.dispose()
      receiver.dispose()
      playlists.dispose()
      tabs.dispose()
      await owner.dispose()
      recordWireTrace(wireTrace)
    }
  }
}
