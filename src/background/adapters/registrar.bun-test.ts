import { describe, expect, test } from "bun:test"
import { browserRegistrarPorts, type RegistrarBrowser } from "./registrar"
import type { RegisteredScript } from "../../shared/features/registration"
import { fixtureBuild, scriptedRegistrar } from "../../../tools/fixtures/registrar/scripted"

type NativeTab = Awaited<ReturnType<RegistrarBrowser["tabs"]["get"]>>
type NativeScript = Awaited<ReturnType<RegistrarBrowser["scripting"]["getRegisteredContentScripts"]>>[number]
const main: RegisteredScript = { id: "pp-www-page", js: ["page-www.js"], matches: ["https://www.youtube.com/*"], world: "MAIN", runAt: "document_start", allFrames: false, persistAcrossSessions: true }

function event() {
  const listeners = new Set<() => void>()
  return {
    addListener(listener: () => void) { listeners.add(listener) },
    removeListener(listener: () => void) { listeners.delete(listener) },
    emit() { for (const listener of [...listeners]) listener() },
    get count() { return listeners.size }
  }
}
function nativeTab(id: number, url = "https://www.youtube.com/watch?v=fixture"): NativeTab {
  const tab = { id, url, index: 0, windowId: 10, active: true, highlighted: true, pinned: false, incognito: false,
    discarded: false, frozen: false, selected: true, autoDiscardable: true, groupId: -1, lastAccessed: 42, audible: false }
  return tab
}
function fixture() {
  const fake = scriptedRegistrar()
  const added = event()
  const removed = event()
  const startup = event()
  const calls: { operation: string; details: unknown }[] = []
  let tab = nativeTab(1)
  let scripts: NativeScript[] = []
  let results: { frameId: number; documentId?: string }[] = [{ frameId: 0, documentId: "document-1" }]
  let closed = false
  let reject = false
  const browser: RegistrarBrowser = {
    scripting: {
      async getRegisteredContentScripts() { calls.push({ operation: "list", details: null }); return scripts },
      async registerContentScripts(input) { calls.push({ operation: "register", details: input }); if (reject) throw Error("Native fixture rejected") },
      async updateContentScripts(input) { calls.push({ operation: "update", details: input }); if (reject) throw Error("Native fixture rejected") },
      async unregisterContentScripts(input) { calls.push({ operation: "unregister", details: input }); if (reject) throw Error("Native fixture rejected") },
      async executeScript(input) { calls.push({ operation: "execute", details: input }); if (reject) throw Error("Native fixture rejected"); return results }
    },
    permissions: {
      async contains(details) { calls.push({ operation: "contains", details }); return true },
      onAdded: added, onRemoved: removed
    },
    tabs: {
      async query(details) { calls.push({ operation: "query", details }); return [tab] },
      async get(id) { calls.push({ operation: "get", details: id }); if (closed) throw Error("Tab closed"); return tab }
    },
    windows: {
      async getLastFocused() { return { id: 10, focused: true, incognito: false, alwaysOnTop: false, type: "normal", state: "normal", left: 0, top: 0, width: 800, height: 600 } }
    },
    runtime: { onStartup: startup }
  }
  const bindings = { browser, owner: fake.ports.owner, probe: fake.ports.probe, registry: fake.ports.registry, build: fixtureBuild, backgroundError: fake.ports.backgroundError }
  return {
    browser, bindings, ports: browserRegistrarPorts(bindings), calls, added, removed, startup,
    tab(value: NativeTab) { tab = value },
    scripts(value: NativeScript[]) { scripts = value },
    results(value: typeof results) { results = value },
    close() { closed = true },
    reject() { reject = true }
  }
}

describe("browser Registrar adapter", () => {
  test("register, update and unregister preserve planner fields and clear owned extras", async () => {
    const f = fixture()
    await f.ports.scripting.register([main])
    await f.ports.scripting.update([main])
    await f.ports.scripting.unregister(["pp-www-page"])
    expect(f.calls).toEqual([
      { operation: "register", details: [{ ...main, css: [], excludeMatches: [], matchOriginAsFallback: false }] },
      { operation: "update", details: [{ ...main, css: [], excludeMatches: [], matchOriginAsFallback: false }] },
      { operation: "unregister", details: { ids: ["pp-www-page"] } }
    ])
    f.scripts([{ id: "unrelated", js: ["unrelated.js"], matches: ["https://www.youtube.com/*"] }])
    expect(await f.ports.scripting.list()).toEqual([{
      id: "unrelated", js: ["unrelated.js"], matches: ["https://www.youtube.com/*"], css: [], excludeMatches: [],
      world: "ISOLATED", runAt: "document_idle", allFrames: false, persistAcrossSessions: true, matchOriginAsFallback: false
    }])
  })

  test("native execute targets only frame zero and never invents a probe", async () => {
    const f = fixture()
    expect(f.ports.probe).toBe(f.bindings.probe)
    expect(f.ports.owner).toBe(f.bindings.owner)
    const injection = { tabId: 1, site: "www", build: fixtureBuild, documentId: "document-1", world: "MAIN", file: "page-www.js" } as const
    await f.ports.scripting.executeScript(injection)
    expect(f.calls).toEqual([{ operation: "execute", details: { target: { tabId: 1, frameIds: [0] }, world: "MAIN", files: ["page-www.js"] } }])
    f.results([])
    await expect(f.ports.scripting.executeScript(injection)).rejects.toThrow("unconfirmed")
    f.results([{ frameId: 0, documentId: "other-document" }])
    await expect(f.ports.scripting.executeScript(injection)).rejects.toThrow("unconfirmed")
    f.reject()
    await expect(f.ports.scripting.executeScript(injection)).rejects.toThrow("rejected")
  })

  test("permissions and startup own removable subscriptions without onInstalled", async () => {
    const f = fixture()
    let accesses = 0
    let starts = 0
    const stopAccess = f.ports.access.subscribe(() => { accesses += 1 })
    const stopStartup = f.ports.startup.subscribe(() => { starts += 1 })
    f.added.emit(); f.removed.emit(); f.startup.emit()
    expect([accesses, starts]).toEqual([2, 1])
    expect(await f.ports.access.contains("music")).toBe(true)
    expect(f.calls).toContainEqual({ operation: "contains", details: { origins: ["https://music.youtube.com/*"] } })
    expect(await f.ports.access.offer(1, "www")).toBe("unsupported")
    stopAccess(); stopStartup()
    expect([f.added.count, f.removed.count, f.startup.count]).toEqual([0, 0, 0])
    f.added.emit(); f.removed.emit(); f.startup.emit()
    expect([accesses, starts]).toEqual([2, 1])
  })

  test("optional native access requests use the exact site pattern and propagate failures", async () => {
    const f = fixture()
    f.browser.permissions.addHostAccessRequest = async details => { f.calls.push({ operation: "host-request", details }) }
    expect(await f.ports.access.offer(1, "www")).toBe("offered")
    expect(f.calls).toEqual([{ operation: "host-request", details: { tabId: 1, pattern: "https://www.youtube.com/*" } }])
    f.browser.permissions.addHostAccessRequest = async () => { throw Error("Request refused") }
    await expect(f.ports.access.offer(1, "www")).rejects.toThrow("refused")
  })

  test("tabs are read without activation and unsupported or closed tabs are excluded", async () => {
    const f = fixture()
    expect(await f.ports.tabs.list()).toEqual([{
      id: 1, site: "www", url: "https://www.youtube.com/watch?v=fixture", active: true, focusedWindow: true,
      audible: false, lastAccessed: 42, discarded: false, frozen: false
    }])
    expect(f.calls[0]).toEqual({ operation: "query", details: { url: ["https://www.youtube.com/*", "https://music.youtube.com/*"] } })
    for (const url of ["http://www.youtube.com/", "https://www.youtube.com.evil/", "about:blank", "https://user:pass@www.youtube.com/"]) {
      f.tab(nativeTab(1, url))
      expect(await f.ports.tabs.list()).toEqual([])
      expect(await f.ports.tabs.get(1)).toEqual({ kind: "unavailable" })
    }
    f.close()
    expect(await f.ports.tabs.get(1)).toEqual({ kind: "unavailable" })
  })
})
