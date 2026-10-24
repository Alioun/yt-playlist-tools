import { browser } from "@wxt-dev/browser"
import { fixturePlan, type Selection } from "../../registration"

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
  plan: fixturePlan,
  async register(selection: Selection = "consumers") {
    const current = await browser.scripting.getRegisteredContentScripts()
    if (current.length) await browser.scripting.unregisterContentScripts({ ids: current.map((entry) => entry.id) })
    const { expected } = fixturePlan(selection)
    if (expected.length) await browser.scripting.registerContentScripts(expected)
    return browser.scripting.getRegisteredContentScripts()
  },
  async unregister() { await browser.scripting.unregisterContentScripts() },
  async tab(url: string) {
    const tabs = await browser.tabs.query({ url })
    const id = tabs[0]?.id
    if (id === undefined) throw Error(`Missing fixture tab ${url}`)
    return id
  },
  async probe(tabId: number) {
    return browser.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: () => ({ trace: globalThis.__pp?.core?.trace ?? [], kit: !!globalThis.__pp?.kit, host: !!document.querySelector("#fixture-host") }) })
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
