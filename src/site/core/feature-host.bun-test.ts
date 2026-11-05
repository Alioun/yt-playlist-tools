import { afterEach, expect, spyOn, test } from "bun:test"
import { isTabView, type TabView } from "../../shared/contracts/tab-view"
import { createFeatureHost, type FeatureContext, type FeatureHostOptions } from "./feature-host"
import { Scope } from "./scope"
import { deferred } from "../../../tools/fixtures/page-link/support"
import { wireView } from "../../../tools/fixtures/tab-view/cases"
import { syntheticViewSource, wwwView } from "../../../tools/fixtures/site-core-lifecycle/views"
import { lifecycleHarness, settle } from "../../../tools/fixtures/site-core-lifecycle/harness"
import { runLifecycleConsumer } from "../../../tools/fixtures/site-core-lifecycle/run"
import { readFile } from "node:fs/promises"

const cleanup: (() => void)[] = []
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose() })
function fixture(initial: TabView | null = null, overrides: Partial<FeatureHostOptions<"www", { report(value: string): void }>> = {}) {
  const source = syntheticViewSource(initial)
  const scopes: Scope[] = []
  const errors: unknown[] = []
  const empty: TabView[] = []
  const reports: string[] = []
  const host = createFeatureHost<"www", { report(value: string): void }>({
    site: "www",
    createScope() { const scope = new Scope({ document, onError: error => { errors.push(error) } }); scopes.push(scope); return scope },
    createContext: () => ({ report: value => { reports.push(value) } }),
    onEmpty: view => { empty.push(view) }, onError: error => { errors.push(error) }, ...overrides
  })
  cleanup.push(() => host.dispose())
  return { host, source, scopes, errors, empty, reports }
}

test("unused host subscribes to nothing and creates no scope or DOM", () => {
  const listen = spyOn(document, "addEventListener")
  const timer = spyOn(window, "setTimeout")
  const observer = spyOn(window, "MutationObserver")
  const before = document.body.innerHTML
  try {
    const f = fixture(wwwView())
    f.host.define({ id: "card-menu", start() { throw Error("No connection") } })
    expect(f.source.count).toBe(0)
    expect(f.scopes).toHaveLength(0)
    expect(listen).not.toHaveBeenCalled()
    expect(timer).not.toHaveBeenCalled()
    expect(observer).not.toHaveBeenCalled()
    expect(document.body.innerHTML).toBe(before)
  } finally { listen.mockRestore(); timer.mockRestore(); observer.mockRestore() }
})

for (const order of ["definition first", "view first"] as const) {
  test(`${order} starts exactly once and duplicate definitions preserve behavior`, () => {
    const f = fixture(wwwView())
    let first = 0, duplicate = 0
    const define = () => f.host.define({ id: "card-menu", start(context) { first++; context.report("original") } })
    if (order === "definition first") define()
    f.host.connect(f.source.link)
    if (order === "view first") define()
    f.host.connect(f.source.link)
    define()
    f.host.define({ id: "card-menu", start() { duplicate++ } })
    f.source.publish(wwwView())
    expect(first).toBe(1)
    expect(duplicate).toBe(0)
    expect(f.reports).toEqual(["original"])
    expect(f.source.count).toBe(1)
  })
}

test("switch-off releases the real listener and switch-on owns a fresh scope", () => {
  const f = fixture(wwwView())
  const button = document.createElement("button")
  let calls = 0
  f.host.define({ id: "card-menu", start({ scope }) { scope.on(button, "click", () => { calls++ }) } })
  f.host.connect(f.source.link)
  button.click()
  f.source.publish(wwwView([]))
  button.click()
  expect(calls).toBe(1)
  expect(f.scopes[0]?.disposed).toBe(true)
  expect(f.scopes[0]?.resourceCount).toBe(0)
  f.source.publish(wwwView())
  button.click()
  expect(calls).toBe(2)
  expect(f.scopes).toHaveLength(2)
  expect(f.scopes[0]).not.toBe(f.scopes[1])
  f.host.dispose()
  button.click()
  expect(calls).toBe(2)
})

test("current options and setup are readable and subscribed without a restart", () => {
  const f = fixture(wwwView())
  const seen: string[] = []
  let saved: FeatureContext<"www", { report(value: string): void }> | undefined
  let starts = 0
  f.host.define({ id: "card-menu", start(context) {
    starts++; saved = context
    context.view.subscribe(view => {
      const feature = view.features.find(feature => feature.id === "card-menu")
      const label = view.setup?.kind === "live" ? view.setup.setup.label?.name : null
      seen.push(`${feature?.options.keepLinkMenu}:${label}`)
    })
  } })
  f.host.connect(f.source.link)
  const latest = wwwView(["card-menu"], false, "Second")
  f.source.publish(latest)
  expect(saved?.view.read()).toBe(latest)
  expect(seen).toEqual(["true:First", "false:Second"])
  expect(starts).toBe(1)
  f.source.publish(null)
  expect(saved?.view.read()).toBeNull()
  f.source.publish(latest)
  expect(starts).toBe(2)
  expect(seen).toEqual(["true:First", "false:Second", "false:Second"])
})

test("null-view revokes every feature, ignores a failing teardown and blocks delayed callbacks after stop", () => {
  const f = fixture(wwwView(["card-menu", "queue-button"]))
  const button = document.createElement("button")
  const seen: string[] = []
  f.host.define({ id: "card-menu", start({ scope }) {
    scope.add(() => { throw Error("teardown") })
    scope.on(button, "click", () => { seen.push("menu") })
  } })
  f.host.define({ id: "queue-button", start({ scope }) { scope.on(button, "click", () => { seen.push("queue") }) } })
  f.host.connect(f.source.link)
  button.click()
  f.source.publish(null)
  button.click()
  expect(seen).toEqual(["menu", "queue"])
  expect(f.scopes.map(scope => scope.resourceCount)).toEqual([0, 0])
  expect(f.errors).toHaveLength(1)
  f.host.dispose(); f.host.dispose()
  expect(f.source.count).toBe(0)
  f.source.delayed(wwwView())
  f.host.define({ id: "watch-button", start() { seen.push("late") } })
  expect(seen).toEqual(["menu", "queue"])
  expect(f.scopes).toHaveLength(2)
})

test("waiting definitions prevent last-off while an actual nonempty-to-empty view signals the owner", () => {
  const f = fixture(wwwView(["card-menu", "queue-button"]))
  f.host.define({ id: "card-menu", start() {} })
  f.host.connect(f.source.link)
  f.source.publish(wwwView(["queue-button"]))
  expect(f.scopes[0]?.disposed).toBe(true)
  expect(f.empty).toEqual([])
  f.source.publish(wwwView([]))
  expect(f.empty).toHaveLength(1)
  f.source.publish(wwwView([]))
  f.source.publish(null)
  expect(f.empty).toHaveLength(1)
})

test("complete validated views reject features unavailable on their site", () => {
  const music = wireView("music")
  const menu = wwwView().features[0]
  expect(isTabView({ ...music, features: [menu], statuses: [{ feature: "card-menu", state: "working", jobs: [], anchors: [], actions: [], kinds: [] }] })).toBe(false)
  const f = fixture(wwwView())
  let calls = 0
  f.host.define({ id: "card-menu", start() { calls++ } })
  f.host.connect(f.source.link)
  f.source.publish(music)
  expect(f.scopes[0]?.disposed).toBe(true)
  expect(calls).toBe(1)
})

test("definitions and view changes during start reconcile against the latest view", () => {
  const f = fixture(wwwView(["card-menu", "queue-button"]))
  const seen: string[] = []
  f.host.define({ id: "card-menu", start({ scope }) {
    scope.add(() => { seen.push("menu stopped") })
    f.host.define({ id: "queue-button", start() { seen.push("queue started") } })
    f.source.publish(wwwView(["queue-button"]))
    scope.add(() => { seen.push("late cleanup") })
  } })
  f.host.connect(f.source.link)
  expect(seen).toEqual(["menu stopped", "late cleanup", "queue started"])
  expect(f.scopes[0]?.resourceCount).toBe(0)
  expect(f.empty).toEqual([])
})

test("reentrant stop during connection releases its just-acquired source subscription", () => {
  const f = fixture(wwwView())
  const seen: string[] = []
  f.host.define({ id: "card-menu", start({ scope }) {
    f.host.dispose()
    scope.add(() => { seen.push("late") })
  } })
  f.host.connect(f.source.link)
  expect(f.source.count).toBe(0)
  expect(f.scopes[0]?.disposed).toBe(true)
  expect(seen).toEqual(["late"])
  f.source.delayed(wwwView())
  expect(f.scopes).toHaveLength(1)
})

test("failed startup cleans its scope, permits unrelated features and retries only after off/on", () => {
  const f = fixture(wwwView(["card-menu", "queue-button"]))
  const button = document.createElement("button")
  let attempts = 0, leaked = 0, queue = 0
  f.host.define({ id: "card-menu", start({ scope }) {
    attempts++
    scope.on(button, "click", () => { leaked++ })
    throw Error("startup")
  } })
  f.host.define({ id: "queue-button", start({ scope }) { scope.on(button, "click", () => { queue++ }) } })
  f.host.connect(f.source.link)
  f.source.publish(wwwView(["card-menu", "queue-button"], false))
  button.click()
  expect(leaked).toBe(0)
  expect(queue).toBe(1)
  expect(attempts).toBe(1)
  expect(f.errors).toHaveLength(1)
  f.source.publish(wwwView(["queue-button"]))
  f.source.publish(wwwView(["card-menu", "queue-button"]))
  expect(attempts).toBe(2)
  f.host.dispose()
  button.click()
  expect(queue).toBe(1)
})

test("async work that completes after switch-off cannot acquire a live resource", async () => {
  const f = fixture(wwwView())
  const ready = deferred<void>()
  const button = document.createElement("button")
  let calls = 0, releases = 0
  f.host.define({ id: "card-menu", async start({ scope }) {
    await ready.promise
    scope.on(button, "click", () => { calls++ })
    scope.add(() => { releases++ })
  } })
  f.host.connect(f.source.link)
  f.source.publish(wwwView([]))
  ready.resolve()
  await settle()
  button.click()
  expect(calls).toBe(0)
  expect(releases).toBe(1)
  expect(f.scopes[0]?.resourceCount).toBe(0)
})

for (const reason of ["account change", "orphan", "ExtLink disposal"] as const) {
  test(`actual ExtLink ${reason} revokes real host listeners over complete TabView`, async () => {
    const h = lifecycleHarness(reason === "account change")
    const f = fixture()
    const button = document.createElement("button")
    let calls = 0
    try {
      f.host.define({ id: "card-menu", start({ scope }) { scope.on(button, "click", () => { calls++ }) } })
      f.host.connect(h.ext)
      await h.page.link.hello
      await settle()
      expect(h.ext.view?.site).toBe("www")
      button.click()
      expect(calls).toBe(1)
      if (reason === "account change") await h.page.link.run({ job: { kind: "account" } })
      else if (reason === "orphan") h.orphan()
      else h.ext.dispose()
      expect(h.ext.view).toBeNull()
      button.click()
      expect(calls).toBe(1)
      expect(f.scopes[0]?.resourceCount).toBe(0)
    } finally { f.host.dispose(); h.dispose() }
    expect(h.page.clock.count).toBe(0)
    expect(h.page.tracked.listenerCount).toBe(0)
  })
}

test("deterministic lifecycle consumer matches the complete authored expected output", async () => {
  const expected = await readFile(new URL("../../../tools/fixtures/site-core-lifecycle/expected.jsonl", import.meta.url), "utf8")
  expect(JSON.stringify(await runLifecycleConsumer()) + "\n").toBe(expected)
})

test("context factory failure disposes its owned subscriptions before unrelated startup", () => {
  const f = fixture(wwwView(["card-menu", "queue-button"]), {
    createContext(lifecycle) {
      lifecycle.view.subscribe(() => {})
      throw Error("context factory")
    }
  })
  let starts = 0
  f.host.define({ id: "card-menu", start() { starts++ } })
  f.host.define({ id: "queue-button", start() { starts++ } })
  f.host.connect(f.source.link)
  expect(starts).toBe(0)
  expect(f.scopes.map(scope => scope.resourceCount)).toEqual([0, 0])
  expect(f.scopes.map(scope => scope.disposed)).toEqual([true, true])
  expect(f.errors).toHaveLength(2)
})

test("a rejected async start is cleaned once without retrying on later view updates", async () => {
  const f = fixture(wwwView())
  const result = deferred<void>()
  let starts = 0
  let stops = 0
  f.host.define({ id: "card-menu", start({ scope }) {
    starts++
    scope.add(() => { stops++ })
    return result.promise
  } })
  f.host.connect(f.source.link)
  result.reject(Error("asynchronous startup"))
  await settle()
  f.source.publish(wwwView(["card-menu"], false))
  expect(starts).toBe(1)
  expect(stops).toBe(1)
  expect(f.errors).toHaveLength(1)
  expect(f.scopes[0]?.resourceCount).toBe(0)
})

test("teardown reentry can re-enable a feature without a stale empty notification", () => {
  const f = fixture(wwwView())
  let starts = 0
  f.host.define({ id: "card-menu", start({ scope }) {
    starts++
    if (starts === 1) scope.add(() => f.source.publish(wwwView()))
  } })
  f.host.connect(f.source.link)
  f.source.publish(wwwView([]))
  expect(starts).toBe(2)
  expect(f.scopes[0]?.disposed).toBe(true)
  expect(f.scopes[1]?.disposed).toBe(false)
  expect(f.empty).toEqual([])
})

test("view revocation from the context factory prevents start and cleans late services", () => {
  const source = syntheticViewSource(wwwView())
  const scopes: Scope[] = []
  const seen: string[] = []
  const host = createFeatureHost({
    site: "www",
    createScope() { const scope = new Scope({ document, onError() {} }); scopes.push(scope); return scope },
    createContext(lifecycle) {
      source.publish(null)
      lifecycle.scope.add(() => { seen.push("late service cleanup") })
      return { record() {} }
    },
    onEmpty() {}, onError() {}
  })
  try {
    host.define({ id: "card-menu", start() { seen.push("started") } })
    host.connect(source.link)
    expect(seen).toEqual(["late service cleanup"])
    expect(scopes[0]?.resourceCount).toBe(0)
    expect(scopes[0]?.disposed).toBe(true)
  } finally { host.dispose() }
})

test("an old async rejection cannot stop a newly enabled run", async () => {
  const f = fixture(wwwView())
  const result = deferred<void>()
  const button = document.createElement("button")
  let starts = 0, calls = 0
  f.host.define({ id: "card-menu", start({ scope }) {
    starts++
    scope.on(button, "click", () => { calls++ })
    return starts === 1 ? result.promise : undefined
  } })
  f.host.connect(f.source.link)
  f.source.publish(wwwView([]))
  f.source.publish(wwwView())
  result.reject(Error("obsolete asynchronous startup"))
  await settle()
  button.click()
  expect(calls).toBe(1)
  expect(starts).toBe(2)
  expect(f.scopes[1]?.disposed).toBe(false)
  expect(f.errors).toEqual([])
})

test("scoped view subscriptions release individually and never notify after revocation", () => {
  const f = fixture(wwwView())
  const seen: string[] = []
  let release: () => void = () => {}
  f.host.define({ id: "card-menu", start({ view }) {
    release = view.subscribe(current => { seen.push(String(current.paused)) })
  } })
  f.host.connect(f.source.link)
  expect(seen).toEqual(["false"])
  expect(f.scopes[0]?.resourceCount).toBe(1)
  release(); release()
  f.source.publish({ ...wwwView(), paused: true })
  expect(seen).toEqual(["false"])
  expect(f.scopes[0]?.resourceCount).toBe(0)
  f.host.dispose()
  f.source.delayed(wwwView())
  expect(seen).toEqual(["false"])
})

test("last-off can dispose its owning host during notification", () => {
  const source = syntheticViewSource(wwwView())
  const owner = new Scope({ document, onError() {} })
  let calls = 0
  const host = createFeatureHost({
    site: "www", createScope: () => owner, createContext: () => ({}),
    onEmpty() { calls++; host.dispose() }, onError() {}
  })
  host.define({ id: "card-menu", start({ scope }) { scope.add(() => {}) } })
  host.connect(source.link)
  source.publish(wwwView([]))
  expect(calls).toBe(1)
  expect(source.count).toBe(0)
  expect(owner.disposed).toBe(true)
  expect(owner.resourceCount).toBe(0)
  source.delayed(wwwView())
  expect(calls).toBe(1)
})
