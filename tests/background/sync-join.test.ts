import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen, within } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { boot, type Background } from "../../src/background/boot"
import type { NativeBrowser } from "../../src/background/adapters/browser"
import { timerDeadline } from "../../src/background/adapters/runtime"
import { createBackend } from "../../src/ui/backend/core"
import { createI18n } from "../../src/shared/i18n"
import { platform } from "../../src/shared/platform"
import catalogue from "../../src/public/_locales/en/messages.json"
import Settings from "../../src/ui/settings/Settings.svelte"
import { englishI18n, scriptedMessages } from "../../tools/fixtures/localization/scripted"

const build = platform.build
const extension = "perchling-sync-e2e"
const here = "AAAAAAAAAAAAAAAA", elsewhere = "BBBBBBBBBBBBBBBB"
type Listener = (message: unknown, sender: unknown, respond: (answer?: unknown) => void) => boolean | undefined

function event<T extends (...args: never[]) => unknown>() {
  const listeners = new Set<T>()
  return { listeners, addListener: (fn: T) => { listeners.add(fn) }, removeListener: (fn: T) => { listeners.delete(fn) }, hasListener: (fn: T) => listeners.has(fn) }
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
const stamped = (gen: string, by: string, data: Record<string, unknown>) => ({ v: 1, gen, at: 5, by, data })

// This browser has edited settings of its own; another browser already started the synced copy.
async function seed() {
  await fakeBrowser.storage.local.set({
    schema: 1, device: { id: "this-browser", consent: { v: 1, at: 1 }, syncOn: false },
    "doc:settings": stamped("settings-here", "this-browser", { theme: "light" }),
    [`doc:setup:${here}`]: stamped("setup-here", "this-browser", { label: { name: "Here" } }),
    sync: { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true }
  })
  await fakeBrowser.storage.sync.set({
    "s:meta": { v: 1, id: "other-history", created: 2 },
    "s:settings": stamped("settings-elsewhere", "other-browser", { theme: "dark" }),
    [`s:setup:${elsewhere}`]: stamped("setup-elsewhere", "other-browser", { label: { name: "Elsewhere" } })
  })
}

function worker() {
  omitAbsentKeys()
  const onMessage = event<Listener>()
  const getURL = (path: string) => `chrome-extension://${extension}${path.startsWith("/") ? path : `/${path}`}`
  const native = {
    ...fakeBrowser,
    runtime: { id: extension, getURL, getManifest: () => ({ version: "2.0.0", manifest_version: 3 }), onMessage, onInstalled: event(), onStartup: event(),
      async sendMessage() { return undefined } },
    tabs: { onRemoved: event(), async query() { return [] }, async get(id: number) { throw new Error(`No tab with id: ${id}.`) },
      async sendMessage() { throw new Error("Could not establish connection. Receiving end does not exist.") } },
    windows: { async get(id: number) { return { id, incognito: false } }, async getLastFocused() { return { id: 1, incognito: false } } },
    i18n: { ...scriptedMessages(), async detectLanguage() { return { isReliable: false, languages: [] } } },
    permissions: { async contains() { return true }, onAdded: event(), onRemoved: event() },
    scripting: { async getRegisteredContentScripts() { return [] }, async registerContentScripts() {}, async updateContentScripts() {},
      async unregisterContentScripts() {}, async executeScript() { return [] } },
    commands: { onCommand: event() },
    contextMenus: { onClicked: event(), async removeAll() {}, create() {} },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setTitle() {} }
  } as unknown as NativeBrowser
  const background = boot(native, platform)
  // The Settings tab: its messages reach the background's own listener, as the browser delivers them.
  const send = (message: unknown) => new Promise<unknown>(resolve => {
    let claimed = false
    const sender = { id: extension, url: getURL("/options.html"), frameId: 0, documentId: "settings-document", tab: { id: 50, windowId: 1, incognito: false } }
    for (const listener of [...onMessage.listeners]) if (listener(message, sender, resolve) === true) claimed = true
    if (!claimed) resolve(undefined)
  })
  const backend = createBackend({
    local: { get: keys => fakeBrowser.storage.local.get([...keys]), all: () => fakeBrowser.storage.local.get(null), onChanged: fakeBrowser.storage.onChanged },
    send,
    access: { has: async () => true, request: async () => true, requestCombined: async () => ({ music: true, browserMenu: false }), hasBrowserMenu: async () => false }
  }, { build, deadline: timerDeadline })
  return { background, backend }
}

function openSettings(backend: ReturnType<typeof worker>["backend"]) {
  location.hash = "#everywhere"
  const page = {
    backend, i18n: englishI18n(), platform: { browser: "chrome", os: "linux" } as const, private: false, version: "2.0.0", beta: false,
    open: () => {}, openSettings: () => {}, openFirstRun: () => {}, applyTheme: () => {},
    commands: { read: async () => ({ kind: "unavailable" }) as const, named: async () => null }, canonical: async () => createI18n(scriptedMessages(), catalogue)
  }
  render(Settings, { page: page as never, markSrc: "mark.svg" })
}

async function eventually(check: () => boolean | Promise<boolean>, what: string, turns = 1200) {
  for (let turn = 0; turn < turns; turn++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting: ${what}`)
}
const record = (value: unknown) => value as Record<string, unknown>
const running: Background[] = []
afterEach(async () => {
  cleanup(); location.hash = ""
  for (const background of running.splice(0)) await background.dispose().catch(() => {})
})

test("turning Settings sync on in Settings asks which settings to keep, takes the synced ones, adds this browser's own account to the synced copy, and switching off deletes nothing", async () => {
  await seed()
  const w = worker()
  running.push(w.background)
  await w.background.ready
  openSettings(w.backend)

  const toggle = await screen.findByRole("switch", { name: "Settings sync" }, { timeout: 5000 })
  expect(screen.getByText("Off in this browser.")).toBeTruthy()
  await userEvent.click(toggle)
  const dialog = await screen.findByRole("dialog", { name: "Choose which settings to keep" }, { timeout: 15_000 })
  expect(record((await fakeBrowser.storage.local.get("device")).device).syncOn, "nothing is saved while the question waits").toBe(false)
  await userEvent.click(within(dialog).getByRole("button", { name: /^Use synced settings/ }))

  await eventually(async () => record((await fakeBrowser.storage.local.get("device")).device).syncOn === true, "the join applied")
  const local = await fakeBrowser.storage.local.get(null)
  expect(local["doc:settings"], "the synced shared settings replace this browser's").toEqual(stamped("settings-elsewhere", "other-browser", { theme: "dark" }))
  expect(local[`doc:setup:${elsewhere}`], "the other browser's account arrives here").toEqual(stamped("setup-elsewhere", "other-browser", { label: { name: "Elsewhere" } }))
  expect(local[`doc:setup:${here}`], "this browser's own account keeps its setup").toEqual(stamped("setup-here", "this-browser", { label: { name: "Here" } }))
  await eventually(async () => (await fakeBrowser.storage.sync.get(`s:setup:${here}`))[`s:setup:${here}`] !== undefined, "this browser's account pushed to the synced copy")
  await eventually(async () => record((await fakeBrowser.storage.local.get("sync")).sync).status === "ok" && !Object.hasOwn(await fakeBrowser.storage.local.get(null), "pending:sync-join"),
    "the push confirmed and the join retired")
  await eventually(() => screen.queryByText("Synced.") !== null, "Settings says synced")
  expect(screen.getByRole("switch", { name: "Settings sync" })).toHaveAttribute("aria-checked", "true")

  const synced = await fakeBrowser.storage.sync.get(null)
  await userEvent.click(screen.getByRole("switch", { name: "Settings sync" }))
  await eventually(async () => record((await fakeBrowser.storage.local.get("device")).device).syncOn === false, "sync switched off")
  await eventually(() => screen.queryByText("Off in this browser.") !== null, "Settings says off")
  const after = await fakeBrowser.storage.local.get(null)
  expect(after["doc:settings"], "switching off keeps this browser's settings").toEqual(local["doc:settings"])
  expect(after[`doc:setup:${elsewhere}`]).toEqual(local[`doc:setup:${elsewhere}`])
  expect(await fakeBrowser.storage.sync.get(null), "switching off leaves the synced copy for the other browsers").toEqual(synced)
}, 30_000)
