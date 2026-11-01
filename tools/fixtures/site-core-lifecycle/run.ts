import { createFeatureHost } from "../../../src/site/core/feature-host"
import { Scope } from "../../../src/site/core/scope"
import { lifecycleHarness, settle } from "./harness"
import { wwwView } from "./views"

export async function runLifecycleConsumer() {
  const h = lifecycleHarness()
  const button = document.createElement("button")
  const events: string[] = []
  const errors: unknown[] = []
  const scopes: Scope[] = []
  let starts = 0
  let empty = 0
  const host = createFeatureHost<"www", { record(value: string): void }>({
    site: "www",
    createScope() { const scope = new Scope({ document, onError: error => { errors.push(error) } }); scopes.push(scope); return scope },
    createContext: () => ({ record: value => { events.push(value) } }),
    onEmpty() { empty++ },
    onError(error) { errors.push(error) }
  })
  try {
    host.define({ id: "card-menu", start(context) {
      const number = ++starts
      context.record(`start:${number}`)
      context.scope.add(() => { context.record(`stop:${number}`) })
      context.scope.on(button, "click", () => {
        const view = context.view.read()
        const menu = view?.features.find(feature => feature.id === "card-menu")
        const label = view?.setup?.kind === "live" ? view.setup.setup.label?.name : null
        context.record(`click:${number}:${menu?.options.keepLinkMenu}:${label}`)
      })
    } })
    host.connect(h.ext)
    await h.page.link.hello
    await settle()
    if (h.ext.view === null) throw Error("Consumer never received a validated complete view")
    button.click()
    await h.push(wwwView(["card-menu"], false, "Second"))
    button.click()
    host.define({ id: "card-menu", start() { events.push("duplicate") } })
    await h.push(wwwView(["queue-button"]))
    button.click()
    const waitingDidNotEndCore = empty === 0
    await h.push(wwwView([]))
    await h.push(wwwView())
    button.click()
    h.orphan()
    button.click()
    host.dispose()
    h.dispose()
    return { fixture: "site-core-lifecycle", source: "real-ExtLink-memory-RPC-direct-PageLink-gateway",
      events, starts, empty, waitingDidNotEndCore, owned: scopes.map(scope => scope.resourceCount),
      rpcDeadlines: h.page.clock.count, pageListeners: h.page.tracked.listenerCount, errors: errors.length,
      synthetic: ["complete-view-fixtures", "runtime-identity", "memory-transport", "direct-page-channel", "gateway-operations", "clock", "context-record-service"] }
  } finally { host.dispose(); h.dispose() }
}
if (import.meta.main) process.stdout.write(JSON.stringify(await runLifecycleConsumer()) + "\n")
