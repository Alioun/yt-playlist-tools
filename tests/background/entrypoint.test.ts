import { afterEach, expect, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import type { Background } from "../../src/background/boot"
import background from "../../src/entrypoints/background"

const running: { dispose(): Promise<void> }[] = []
afterEach(async () => { for (const handle of running.splice(0)) await handle.dispose() })
function start() {
  // WXT types main as returning void; this entrypoint returns the composition root's handle.
  const handle = background.main() as unknown as Background
  running.push(handle)
  return handle
}

type Script = { id: string; matches?: string[]; js?: string[]; world?: string; runAt?: string }

function fakeEvent<T extends (...args: never[]) => unknown>() {
  const listeners = new Set<T>()
  return { addListener: (listener: T) => { listeners.add(listener) }, removeListener: (listener: T) => { listeners.delete(listener) },
    hasListener: (listener: T) => listeners.has(listener), size: () => listeners.size }
}
// Browsers omit absent keys from storage reads; WXT's fake returns them as undefined, which reads as present.
function omitAbsentKeys() {
  for (const area of [fakeBrowser.storage.local, fakeBrowser.storage.session, fakeBrowser.storage.sync]) {
    const get = area.get.bind(area)
    Object.assign(area, { async get(keys?: unknown) {
      const found: Record<string, unknown> = await get(keys as never)
      return Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined))
    } })
  }
}
function nativeRegistration(granted: readonly string[]) {
  omitAbsentKeys()
  let scripts: Script[] = []
  Object.assign(fakeBrowser, {
    scripting: {
      async getRegisteredContentScripts() { return structuredClone(scripts) },
      async registerContentScripts(added: Script[]) { scripts = [...scripts, ...structuredClone(added)] },
      async updateContentScripts(changed: Script[]) { scripts = scripts.map(script => structuredClone(changed.find(next => next.id === script.id) ?? script)) },
      async unregisterContentScripts({ ids }: { ids: string[] }) { scripts = scripts.filter(script => !ids.includes(script.id)) },
      async executeScript() { return [] }
    },
    permissions: {
      async contains(request: { origins?: string[]; permissions?: string[] }) {
        return (request.permissions ?? []).length === 0 && (request.origins ?? []).every(origin => granted.includes(origin))
      },
      onAdded: fakeEvent(), onRemoved: fakeEvent()
    }
  })
  return { scripts: () => scripts }
}
async function eventually(check: () => boolean | Promise<boolean>) {
  for (let turn = 0; turn < 400; turn++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error("Timed out waiting for the background")
}
function agreedWith(settings: Record<string, unknown>) {
  return {
    schema: 1, device: { id: "boot-device", consent: { v: 1, at: 1 }, syncOn: false },
    "doc:settings": { v: 1, gen: "settings-boot", at: 1, by: "boot-device", data: settings },
    sync: { joined: null, pushed: {}, status: "off", editedSinceOff: false, everEdited: false }
  }
}

test("a fresh install marks the empty store current, opens first run once, and registers nothing before consent", async () => {
  const native = nativeRegistration(["https://www.youtube.com/*"])
  const opened: string[] = []
  const create = fakeBrowser.tabs.create.bind(fakeBrowser.tabs)
  fakeBrowser.tabs.create = async properties => { opened.push(properties.url ?? ""); return create(properties) }
  start()
  await fakeBrowser.runtime.onInstalled.trigger({ reason: "install" })
  await fakeBrowser.runtime.onInstalled.trigger({ reason: "update", previousVersion: "1.4.5" })
  await eventually(async () => (await fakeBrowser.storage.local.get("schema")).schema === 1)
  expect(opened).toEqual([fakeBrowser.runtime.getURL("/onboarding.html" as never)])
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(native.scripts()).toEqual([])
})

test("after consent, the queue button and card menu files are registered on youtube.com in registry order", async () => {
  await fakeBrowser.storage.local.set(agreedWith({ queueButton: { on: true, feedback: true }, cardMenu: { on: true, keepLinkMenu: false } }))
  const native = nativeRegistration(["https://www.youtube.com/*"])
  start()
  await eventually(() => native.scripts().length === 2)
  expect(native.scripts().map(({ id, matches, js, world, runAt }) => ({ id, matches, js, world, runAt }))).toEqual([
    { id: "pp-www-page", matches: ["https://www.youtube.com/*"], js: ["page-www.js"], world: "MAIN", runAt: "document_start" },
    { id: "pp-www", matches: ["https://www.youtube.com/*"], js: ["core-www.js", "kit-www.js", "feature-queue-button.js", "feature-card-menu.js"],
      world: "ISOLATED", runAt: "document_idle" }
  ])
})

test("a message that arrives before the store is ready waits for the routers instead of going unanswered", async () => {
  nativeRegistration([])
  start()
  const answer = await fakeBrowser.runtime.sendMessage({ kind: "not-a-perchling-message" })
  expect(answer).toBeUndefined()
})
