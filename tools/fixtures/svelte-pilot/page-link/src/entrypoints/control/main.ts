import { browser } from "@wxt-dev/browser"

const registrations = [
  { id: "pp-www-page", matches: ["https://www.youtube.com/*"], js: ["page-www.js"], world: "MAIN", runAt: "document_start" },
  { id: "pp-www", matches: ["https://www.youtube.com/*"], js: ["core-www.js", "kit-www.js", "consumer-www.js"], world: "ISOLATED", runAt: "document_idle" },
  { id: "pp-music-page", matches: ["https://music.youtube.com/*"], js: ["page-music.js"], world: "MAIN", runAt: "document_start" },
  { id: "pp-music", matches: ["https://music.youtube.com/*"], js: ["core-music.js", "kit-music.js", "consumer-music.js"], world: "ISOLATED", runAt: "document_idle" }
] satisfies Parameters<typeof browser.scripting.registerContentScripts>[0]

let lazyTarget: number | undefined
let lazyLoad: Promise<unknown> | undefined
const lazyButton = document.querySelector("button")
if (!lazyButton) throw Error("Missing fixture lazy button")
lazyButton.addEventListener("click", () => {
  if (lazyTarget === undefined) throw Error("Select a synthetic fixture tab before opening lazy UI")
  lazyLoad = browser.scripting.executeScript({ target: { tabId: lazyTarget }, world: "ISOLATED", files: ["popovers.js"] })
})

const control = {
  targetLazy(tabId: number) { lazyTarget = tabId; lazyLoad = undefined },
  lazyLoaded() {
    if (!lazyLoad) throw Error("Click the fixture lazy button first")
    return lazyLoad
  },
  async register() {
    const current = await browser.scripting.getRegisteredContentScripts()
    if (current.length) await browser.scripting.unregisterContentScripts({ ids: current.map((entry) => entry.id) })
    await browser.scripting.registerContentScripts(registrations)
    return browser.scripting.getRegisteredContentScripts()
  },
  async unregister() { await browser.scripting.unregisterContentScripts() },
  async tab(url: string) {
    const tabs = await browser.tabs.query({ url })
    const id = tabs[0]?.id
    if (id === undefined) throw Error(`Missing fixture tab ${url}`)
    return id
  },
  async inspect(tabId: number) {
    return browser.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: () => ({
      trace: globalThis.__pp.core.trace,
      marker: globalThis.__pp.core.marker,
      mainAtCore: globalThis.__pp.core.mainAtCore,
      readyStateAtCore: globalThis.__pp.core.readyStateAtCore,
      root: Object.keys(globalThis.__pp.svelte.root).sort(),
      client: Object.keys(globalThis.__pp.svelte.client).sort(),
      mounted: globalThis.__pp.kit.mounted,
      events: globalThis.__pp.kit.events,
      popovers: !!globalThis.__pp.popovers,
      disclosed: [...window.__svelte?.v ?? []]
    }) })
  },
  async files(tabId: number, files: string[]) { return browser.scripting.executeScript({ target: { tabId }, world: "ISOLATED", files }) },
  async removeExport(tabId: number) {
    return browser.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: () => { Reflect.deleteProperty(globalThis.__pp.svelte.client, "if") } })
  }
}
Object.assign(window, { fixture: control })
