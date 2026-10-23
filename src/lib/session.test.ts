import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { checkSession, findSession, isPageReply, isSnapshot, queueInPage, reconcileScripts, runSessionJob, setPageAccess, type SessionSnapshot } from "@/lib/session"
import * as store from "@/lib/storage"

const accountKey = "account0000000001"
const session: SessionSnapshot = { tabId: 1, accountKey, incognito: false, consentGeneration: "generation-1" }

beforeEach(async () => {
  await store.sessionGeneration.setValue("generation-1")
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
  vi.spyOn(fakeBrowser.scripting, "getRegisteredContentScripts").mockImplementation(async () => ([]))
  vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(async () => undefined)
})
afterEach(() => vi.useRealTimers())

async function tab(id: number, options: { active?: boolean; incognito?: boolean; lastAccessed?: number; discarded?: boolean; frozen?: boolean } = {}) {
  const created = await fakeBrowser.tabs.create({ url: "https://www.youtube.com/", active: false, windowId: 1 })
  return { ...created, id, incognito: false, windowId: 1, ...options }
}

describe("consent and serving tabs", () => {
  it("does not inject or query YouTube before consent", async () => {
    await store.sessionConsent.setValue(0)
    const injection = vi.spyOn(fakeBrowser.scripting, "executeScript")
    const query = vi.spyOn(fakeBrowser.tabs, "query")
    await expect(findSession({ incognito: false, windowId: 1 })).resolves.toEqual({ kind: "consent" })
    await reconcileScripts()
    expect(injection).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it("prefers the active caller tab and skips discarded, frozen and private tabs", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => ([
      await tab(2, { lastAccessed: 100 }), await tab(3, { active: true, incognito: true }),
      await tab(4, { discarded: true }), await tab(5, { frozen: true }), await tab(1, { active: true })
    ]))
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(async () => ([{ frameId: 0, result: { kind: "account", signedIn: true, accountKey } }]))
    await expect(findSession({ incognito: false, windowId: 1 })).resolves.toEqual({ kind: "ready", session })
    expect(inject).toHaveBeenCalledOnce()
    expect(inject.mock.calls[0]?.[0].target.tabId).toBe(1)
  })

  it("keeps an active signed-out tab signed out instead of trying another account", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => ([await tab(1, { active: true }), await tab(2)]))
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(async () => ([{ frameId: 0, result: { kind: "account", signedIn: false } }]))
    await expect(findSession({ incognito: false, windowId: 1 })).resolves.toEqual({ kind: "signedOut" })
    expect(inject).toHaveBeenCalledOnce()
  })

  it("tries at most three candidates in recency order with two-second probes", async () => {
    vi.useFakeTimers()
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => ([
      await tab(1, { lastAccessed: 1 }), await tab(2, { lastAccessed: 2 }),
      await tab(3, { lastAccessed: 3 }), await tab(4, { lastAccessed: 4 })
    ]))
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(() => new Promise(() => {}))
    const work = findSession({ incognito: false, windowId: 1 })
    await vi.advanceTimersByTimeAsync(6001)
    await expect(work).resolves.toEqual({ kind: "unavailable" })
    expect(inject.mock.calls.map(call => call[0].target.tabId)).toEqual([4, 3, 2])
  })

  it("never routes a private caller through normal tabs", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => ([await tab(1)]))
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript")
    await expect(findSession({ incognito: true, windowId: 1 })).resolves.toEqual({ kind: "noTab" })
    expect(inject).not.toHaveBeenCalled()
  })
})

describe("bound writes", () => {
  beforeEach(async () => {
    vi.spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => (await tab(1)))
  })
  it("rejects an account mismatch before dispatching an add", async () => {
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(async () => ([{ frameId: 0, result: { kind: "account", signedIn: true, accountKey: "account0000000002" } }]))
    await expect(runSessionJob(session, { kind: "add", accountKey, playlistId: "PL1", videoId: "abcdefghijk" })).rejects.toMatchObject({ code: "accountChanged" })
    expect(inject).toHaveBeenCalledOnce()
  })
  it("rejects a mismatched add reply and never switches tabs or retries", async () => {
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript")
      .mockImplementationOnce(async () => ([{ frameId: 0, result: { kind: "account", signedIn: true, accountKey } }]))
      .mockImplementationOnce(async () => ([{ frameId: 0, result: { kind: "add", accountKey: "account0000000002", alreadyIn: false } }]))
    await expect(runSessionJob(session, { kind: "add", accountKey, playlistId: "PL1", videoId: "abcdefghijk" })).rejects.toMatchObject({ code: "accountChanged" })
    expect(inject).toHaveBeenCalledTimes(2)
    expect(inject.mock.calls.every(call => call[0].target.tabId === 1)).toBe(true)
  })
  it("treats dispatch failure as unconfirmed without replay", async () => {
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript")
      .mockImplementationOnce(async () => ([{ frameId: 0, result: { kind: "account", signedIn: true, accountKey } }]))
      .mockRejectedValueOnce(new Error("document closed"))
    await expect(runSessionJob(session, { kind: "add", accountKey, playlistId: "PL1", videoId: "abcdefghijk" })).rejects.toMatchObject({ code: "unconfirmed" })
    expect(inject).toHaveBeenCalledTimes(2)
  })
  it("rejects malformed page replies rather than treating a truthy value as success", () => {
    expect(isPageReply({ kind: "add", accountKey, alreadyIn: "yes" })).toBe(false)
    expect(isPageReply({ kind: "account", signedIn: true })).toBe(false)
    expect(isPageReply({ kind: "playlists", accountKey, playlists: [{ id: {}, title: "bad" }] })).toBe(false)
  })
  it("refuses a private snapshot against a normal tab", async () => {
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript")
    await expect(runSessionJob({ ...session, incognito: true }, { kind: "playlists", accountKey })).rejects.toMatchObject({ code: "unavailable" })
    expect(inject).not.toHaveBeenCalled()
  })
})

describe("runtime registration", () => {
  it("registers idempotently and injects only after agreement", async () => {
    const target = await tab(1)
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [target])
    let installed = false
    vi.mocked(fakeBrowser.scripting.getRegisteredContentScripts).mockImplementation(async () => installed ? [{ id: "ytpt-youtube" }] : [])
    const register = vi.spyOn(fakeBrowser.scripting, "registerContentScripts").mockImplementation(async () => { installed = true })
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(async () => [])
    await reconcileScripts()
    await reconcileScripts()
    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith([expect.objectContaining({ matches: ["https://www.youtube.com/*"], persistAcrossSessions: false })])
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({ files: ["/content-scripts/youtube.js"] }))
  })
  it("marks page access revoked and unregisters future injections", async () => {
    await store.sessionConsent.setValue(-1)
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [await tab(1)])
    vi.mocked(fakeBrowser.scripting.getRegisteredContentScripts).mockImplementation(async () => [{ id: "ytpt-youtube" }])
    const unregister = vi.spyOn(fakeBrowser.scripting, "unregisterContentScripts").mockImplementation(async () => {})
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(async () => [])
    await reconcileScripts()
    expect(unregister).toHaveBeenCalledWith({ ids: ["ytpt-youtube"] })
    expect(inject).toHaveBeenCalledOnce()
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({ world: "MAIN", args: [false, "generation-1"] }))
  })
})

it("allows page replies inside the page's deadline plus injection overhead", async () => {
  vi.useFakeTimers()
  vi.spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => await tab(1))
  const inject = vi.spyOn(fakeBrowser.scripting, "executeScript")
    .mockImplementationOnce(async () => [{ frameId: 0, result: { kind: "account", signedIn: true, accountKey } }])
    .mockImplementationOnce(() => new Promise(resolve => {
      setTimeout(() => resolve([{ frameId: 0, result: { kind: "add", accountKey, alreadyIn: false } }]), 11000)
    }))
  const result = runSessionJob(session, { kind: "add", accountKey, playlistId: "WL", videoId: "abcdefghijk" })
  await vi.advanceTimersByTimeAsync(11001)
  await expect(result).resolves.toEqual({ kind: "add", accountKey, alreadyIn: false })
  expect(inject).toHaveBeenCalledTimes(2)
})

it("does no queue work after the page access flag is revoked", async () => {
  setPageAccess(false, session.consentGeneration)
  const read = vi.spyOn(document, "querySelector")
  try {
    await expect(queueInPage("abcdefghijk", session.consentGeneration, Date.now() + 10000)).resolves.toBe(false)
    expect(read).not.toHaveBeenCalled()
  } finally {
    Reflect.deleteProperty(window, "__ytptSessionAccess")
    Reflect.deleteProperty(window, "__ytptSessionGeneration")
  }
})

it("does not dispatch an add that expires while its account check is pending", async () => {
  vi.useFakeTimers()
  vi.spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => await tab(1))
  const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(() => new Promise(resolve => {
    setTimeout(() => resolve([{ frameId: 0, result: { kind: "account", signedIn: true, accountKey } }]), 1500)
  }))
  const assertion = expect(runSessionJob(session, { kind: "add", accountKey, playlistId: "WL", videoId: "abcdefghijk" }, Date.now() + 1000)).rejects.toMatchObject({ code: "unavailable" })
  await vi.advanceTimersByTimeAsync(1501)
  await assertion
  expect(inject).toHaveBeenCalledOnce()
})

describe("consent generation boundaries", () => {
  it.each([undefined, null, 1, "", " ", "token/other"])("rejects malformed snapshot generations %s", generation => {
    expect(isSnapshot({ ...session, consentGeneration: generation })).toBe(false)
  })

  it("parses a snapshot with a valid generation", () => {
    expect(isSnapshot(session)).toBe(true)
  })

  it("rejects a previously captured snapshot after revoke and regrant", async () => {
    await store.sessionConsent.setValue(-1)
    await store.sessionGeneration.setValue("generation-after-regrant")
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript")
    await expect(checkSession(session)).rejects.toMatchObject({ code: "revoked" })
    expect(inject).not.toHaveBeenCalled()
  })

  it("does not recapture a new generation after serving-tab selection is delayed", async () => {
    const target = await tab(1)
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementationOnce(async () => {
      await store.sessionGeneration.setValue("generation-after-regrant")
      return [target]
    })
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript")
    await expect(findSession({ incognito: false, windowId: 1 })).resolves.toEqual({ kind: "revoked" })
    expect(inject).not.toHaveBeenCalled()
  })

  it("passes the captured generation and original absolute deadline into MAIN", async () => {
    vi.useFakeTimers()
    const started = Date.now()
    vi.spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => await tab(1))
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript")
      .mockImplementationOnce(() => new Promise(resolve => {
        setTimeout(() => resolve([{ frameId: 0, result: { kind: "account", signedIn: true, accountKey } }]), 1500)
      }))
      .mockImplementationOnce(async () => [{ frameId: 0, result: { kind: "add", accountKey, alreadyIn: false } }])
    const job = { kind: "add", accountKey, playlistId: "WL", videoId: "abcdefghijk" } as const
    const pending = runSessionJob(session, job, started + 10000)
    await vi.advanceTimersByTimeAsync(1501)
    await expect(pending).resolves.toMatchObject({ kind: "add" })
    expect(inject).toHaveBeenLastCalledWith(expect.objectContaining({ args: [job, session.consentGeneration, started + 10000] }))
  })

  it("rejects an account probe that completes in a different generation", async () => {
    vi.spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => await tab(1))
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementationOnce(async () => {
      await store.sessionGeneration.setValue("generation-after-regrant")
      return [{ frameId: 0, result: { kind: "account", signedIn: true, accountKey } }]
    })
    await expect(runSessionJob(session, { kind: "add", accountKey, playlistId: "WL", videoId: "abcdefghijk" })).rejects.toMatchObject({ code: "revoked" })
    expect(inject).toHaveBeenCalledOnce()
  })

  it("updates an already-running content script's page generation on regrant", async () => {
    vi.mocked(fakeBrowser.scripting.getRegisteredContentScripts).mockImplementation(async () => [{ id: "ytpt-youtube" }])
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [await tab(1)])
    vi.mocked(fakeBrowser.tabs.sendMessage).mockImplementation(async () => ({ alive: true }))
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(async () => [])
    await store.sessionGeneration.setValue("generation-after-regrant")
    await reconcileScripts()
    expect(inject).toHaveBeenCalledOnce()
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({ func: setPageAccess, args: [true, "generation-after-regrant"] }))
  })

  it("rejects queue work from a previous generation even after access is enabled", async () => {
    setPageAccess(true, "generation-after-regrant")
    const read = vi.spyOn(document, "querySelector")
    try {
      await expect(queueInPage("abcdefghijk", session.consentGeneration, Date.now() + 10000)).resolves.toBe(false)
      expect(read).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(window, "__ytptSessionAccess")
      Reflect.deleteProperty(window, "__ytptSessionGeneration")
    }
  })
})
