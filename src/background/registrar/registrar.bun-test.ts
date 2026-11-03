import { describe, expect, test } from "bun:test"
import { createRegistrar } from "./registrar"
import { RegistrarError, type FailureFact, type Registrar } from "./ports"
import type { RegisteredScript } from "../../shared/features/registration"
import { buildId, fixtureBuild, observedScript, scriptedRegistrar, settings, tabFact, type ScriptedRegistrar } from "../../../tools/fixtures/registrar/scripted"

const main: RegisteredScript = { id: "pp-www-page", js: ["page-www.js"], matches: ["https://www.youtube.com/*"], world: "MAIN", runAt: "document_start", allFrames: false, persistAcrossSessions: true }
const isolated: RegisteredScript = { id: "pp-www", js: ["core-www.js", "kit-www.js", "feature-auto-add.js"], matches: ["https://www.youtube.com/*"], world: "ISOLATED", runAt: "document_idle", allFrames: false, persistAcrossSessions: true }

async function failure(work: Promise<void>): Promise<FailureFact> {
  try { await work } catch (error) {
    if (error instanceof RegistrarError) return error.fact
    throw error
  }
  throw Error("Expected Registrar refusal")
}
async function started(fake: ScriptedRegistrar): Promise<Registrar> {
  const registrar = createRegistrar(fake.ports)
  await registrar.reconcile()
  return registrar
}
function executed(fake: ScriptedRegistrar) {
  return fake.executions().map(call => [call.tabId, call.world, call.file])
}

describe("Registrar public behavior", () => {
  test("startup waits for readiness and keeps the planner's complete ordered registrations", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    const ready = fake.pauseNext("ready")
    const registrar = createRegistrar(fake.ports)
    const startup = registrar.reconcile()
    await ready.entered
    expect(fake.mutations()).toEqual([])
    ready.release()
    await startup
    expect([...fake.scripts.values()]).toEqual([observedScript(main), observedScript(isolated)])
    expect(fake.listenerCounts).toEqual([1, 1, 1])
    const before = fake.mutations().length
    await registrar.reconcile()
    expect(fake.mutations()).toHaveLength(before)
    registrar.dispose()
  })

  test("a held owner cannot register or inject", async () => {
    const fake = scriptedRegistrar({ held: true, settings: settings("autoAdd") })
    const registrar = createRegistrar(fake.ports)
    expect(await failure(registrar.reconcile())).toEqual({ kind: "refused", reason: "owner-not-ready" })
    expect(await failure(registrar.ensure(1, { core: true }))).toEqual({ kind: "refused", reason: "owner-not-ready" })
    expect(fake.mutations()).toEqual([])
    registrar.dispose()
  })

  test("consent and supported schema gate ensure even when every feature is off", async () => {
    for (const field of ["consent", "schemaOk"] as const) {
      const fake = scriptedRegistrar({ [field]: false })
      fake.open(tabFact(1))
      const registrar = await started(fake)
      expect(await failure(registrar.ensure(1, { core: true }))).toEqual({ kind: "refused", reason: field === "consent" ? "consent" : "schema" })
      expect(fake.mutations()).toEqual([])
      expect(fake.calls.some(call => call.operation === "probe")).toBe(false)
      registrar.dispose()
    }
  })

  test("a feature change updates one isolated registration and preserves unrelated IDs", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    const unrelated = { ...observedScript(main), id: "other-extension-owned-id" }
    fake.scripts.set(unrelated.id, unrelated)
    const registrar = await started(fake)
    fake.changeOwner({ settings: settings("autoAdd", "cardMenu") })
    await registrar.reconcile()
    expect(fake.calls.flatMap(call => call.operation === "update" ? [call.scripts] : [])).toEqual([
      [{ ...isolated, js: ["core-www.js", "kit-www.js", "feature-auto-add.js", "feature-card-menu.js"] }]
    ])
    fake.changeOwner({ consent: false })
    await registrar.reconcile()
    expect([...fake.scripts.values()]).toEqual([unrelated])
    expect(fake.calls.flatMap(call => call.operation === "unregister" ? [call.ids] : [])).toEqual([["pp-www-page", "pp-www"]])
    registrar.dispose()
  })

  test("an owner change arriving during register is drained and never injects the superseded feature", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.open(tabFact(1))
    const blocked = fake.pauseNext("register")
    const registrar = createRegistrar(fake.ports)
    const work = registrar.reconcile()
    await blocked.entered
    fake.changeOwner({ settings: settings("cardMenu") })
    blocked.release()
    await work
    expect(fake.scripts.get("pp-www")?.js).toEqual(["core-www.js", "feature-card-menu.js"])
    expect(executed(fake)).toEqual([[1, "MAIN", "page-www.js"], [1, "ISOLATED", "core-www.js"], [1, "ISOLATED", "feature-card-menu.js"]])
    expect(fake.maxMutationsActive).toBe(1)
    registrar.dispose()
  })

  test("consent revoked during a registration read prevents the next register", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    const blocked = fake.pauseNext("list")
    const registrar = createRegistrar(fake.ports)
    const work = registrar.reconcile()
    await blocked.entered
    fake.changeOwner({ consent: false })
    blocked.release()
    await work
    expect(fake.mutations()).toEqual([])
    registrar.dispose()
  })

  test("revoked access is checked after an awaited probe before executeScript", async () => {
    const fake = scriptedRegistrar()
    fake.open(tabFact(1))
    const registrar = await started(fake)
    const blocked = fake.pauseNext("probe")
    const work = registrar.ensure(1, { core: true, kit: true })
    const result = failure(work)
    await blocked.entered
    fake.changeAccess("www", false)
    blocked.release()
    expect(await result).toEqual({ kind: "refused", reason: "superseded" })
    await registrar.reconcile()
    expect(executed(fake)).toEqual([])
    registrar.dispose()
  })

  test("revocation during an in-flight execute stops the rest of the injection chain", async () => {
    for (const revoke of ["consent", "access", "schema"] as const) {
      const fake = scriptedRegistrar()
      fake.open(tabFact(1))
      const registrar = await started(fake)
      const blocked = fake.pauseNext("execute")
      const result = failure(registrar.ensure(1, { core: true, kit: true }))
      await blocked.entered
      if (revoke === "access") fake.changeAccess("www", false)
      else fake.changeOwner(revoke === "consent" ? { consent: false } : { schemaOk: false })
      blocked.release()
      const fact = await result
      expect(fact.kind).toBe("injection")
      if (fact.kind === "injection") expect(fact.after).toEqual({ kind: "unavailable", reason: "not-observed" })
      await registrar.reconcile()
      expect(executed(fake)).toEqual([[1, "MAIN", "page-www.js"]])
      registrar.dispose()
    }
  })

  test("partial rejected registration reports observed effects and does not retry itself", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.scriptNext("register", { outcome: { kind: "reject", apply: "first" } })
    const registrar = createRegistrar(fake.ports)
    const fact = await failure(registrar.reconcile())
    expect(fact).toEqual({ kind: "registration", operation: "register", call: "rejected", after: { kind: "observed", scripts: [observedScript(main)] } })
    expect(fake.calls.filter(call => call.operation === "register")).toHaveLength(1)
    expect(executed(fake)).toEqual([])
    await registrar.reconcile()
    expect([...fake.scripts.values()]).toEqual([observedScript(main), observedScript(isolated)])
    expect(fake.calls.filter(call => call.operation === "register")).toHaveLength(2)
    registrar.dispose()
  })

  test("a resolved partial registration and an unavailable readback are never success", async () => {
    for (const unavailable of [false, true]) {
      const fake = scriptedRegistrar({ settings: settings("autoAdd") })
      fake.scriptNext("register", {
        outcome: { kind: "resolve", apply: "first" },
        before: unavailable ? () => fake.scriptNext("list", { outcome: { kind: "reject", apply: "none" } }) : undefined
      })
      const registrar = createRegistrar(fake.ports)
      const fact = await failure(registrar.reconcile())
      expect(fact.kind).toBe("registration")
      if (fact.kind === "registration") {
        expect(fact.call).toBe("resolved")
        expect(fact.after.kind).toBe(unavailable ? "unavailable" : "observed")
      }
      expect(fake.calls.filter(call => call.operation === "register")).toHaveLength(1)
      registrar.dispose()
    }
  })

  test("update and unregister failures retain browser observations without mutation retries", async () => {
    for (const operation of ["update", "unregister"] as const) {
      const fake = scriptedRegistrar({ settings: settings("autoAdd") })
      const registrar = await started(fake)
      fake.scriptNext(operation, { outcome: { kind: "reject", apply: "none" } })
      fake.changeOwner(operation === "update" ? { settings: settings("cardMenu") } : { consent: false }, false)
      const fact = await failure(registrar.reconcile())
      expect(fact.kind).toBe("registration")
      if (fact.kind === "registration") {
        expect(fact.operation).toBe(operation)
        expect(fact.call).toBe("rejected")
        expect(fact.after).toEqual({ kind: "observed", scripts: [observedScript(main), observedScript(isolated)] })
      }
      expect(fake.calls.filter(call => call.operation === operation)).toHaveLength(1)
      registrar.dispose()
    }
  })

  test("a rejected injection can have a real effect and its readback remains explicit", async () => {
    const fake = scriptedRegistrar()
    fake.open(tabFact(1))
    const registrar = await started(fake)
    fake.scriptNext("execute", { outcome: { kind: "reject", apply: "all" } })
    const fact = await failure(registrar.ensure(1, { core: true }))
    expect(fact.kind).toBe("injection")
    if (fact.kind === "injection") {
      expect(fact.call).toBe("rejected")
      expect(fact.after).toEqual({ kind: "observed", documentId: "document-1", loaded: [{ file: "page-www.js", build: fixtureBuild }] })
    }
    expect(executed(fake)).toEqual([[1, "MAIN", "page-www.js"]])
    await registrar.ensure(1, { core: true })
    expect(executed(fake)).toEqual([[1, "MAIN", "page-www.js"], [1, "ISOLATED", "core-www.js"]])
    registrar.dispose()
  })

  test("a resolved execute without current-build evidence is unconfirmed", async () => {
    const fake = scriptedRegistrar()
    fake.open(tabFact(1))
    const registrar = await started(fake)
    fake.scriptNext("execute", { outcome: { kind: "resolve", apply: "none" } })
    const fact = await failure(registrar.ensure(1, { core: true }))
    expect(fact.kind).toBe("injection")
    if (fact.kind === "injection") {
      expect(fact.call).toBe("resolved")
      expect(fact.after).toEqual({ kind: "observed", documentId: "document-1", loaded: [] })
    }
    expect(executed(fake)).toEqual([[1, "MAIN", "page-www.js"]])
    registrar.dispose()
  })

  test("open tabs run page, core, kit and feature one tab at a time in priority order", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.open(tabFact(1, { lastAccessed: 90 }))
    fake.open(tabFact(2, { active: true, focusedWindow: true, lastAccessed: 1 }))
    fake.open(tabFact(3, { audible: true, lastAccessed: 2 }))
    fake.open(tabFact(4, { lastAccessed: 100 }))
    fake.open(tabFact(5, { discarded: true, lastAccessed: 999 }))
    fake.open(tabFact(6, { frozen: true, lastAccessed: 999 }))
    const registrar = await started(fake)
    expect(executed(fake)).toEqual([2, 3, 4, 1].flatMap(tabId => [
      [tabId, "MAIN", "page-www.js"], [tabId, "ISOLATED", "core-www.js"],
      [tabId, "ISOLATED", "kit-www.js"], [tabId, "ISOLATED", "feature-auto-add.js"]
    ]))
    expect(fake.maxMutationsActive).toBe(1)
    registrar.dispose()
  })

  test("closed candidates are skipped and an inaccessible ensure never executes", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.open(tabFact(1))
    fake.scriptNext("tabs-get", { before: () => fake.close(1) })
    const registrar = await started(fake)
    expect(executed(fake)).toEqual([])
    fake.open(tabFact(2))
    fake.changeAccess("www", false, false)
    expect(await failure(registrar.ensure(2, { core: true }))).toEqual({ kind: "refused", reason: "access" })
    expect(executed(fake)).toEqual([])
    registrar.dispose()
  })

  test("only missing current-build code executes", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.open(tabFact(1), [
      ...["page-www.js", "core-www.js", "kit-www.js"].map(file => ({ file, build: fixtureBuild })),
      { file: "feature-auto-add.js", build: buildId("old-build") }
    ])
    const registrar = await started(fake)
    expect(executed(fake)).toEqual([[1, "ISOLATED", "feature-auto-add.js"]])
    await registrar.reconcile()
    expect(executed(fake)).toHaveLength(1)
    registrar.dispose()
  })

  test("Gather-only changes narrow registrations and add no injection to open tabs", async () => {
    const gather = settings("gather")
    gather.gather.auto.background = true
    const fake = scriptedRegistrar({ settings: gather })
    fake.open(tabFact(1))
    const registrar = await started(fake)
    expect(fake.scripts.get("pp-www-page")?.matches).toEqual(["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"])
    expect(fake.scripts.get("pp-www")?.js).toEqual(["core-www.js"])
    expect(executed(fake)).toEqual([])
    expect(fake.calls.some(call => call.operation === "tabs-list")).toBe(false)
    gather.gather.auto.count = true
    fake.changeOwner({ settings: gather })
    await registrar.reconcile()
    expect(executed(fake)).toEqual([])
    fake.changeOwner({ settings: settings() })
    await registrar.reconcile()
    expect(fake.scripts.size).toBe(0)
    registrar.dispose()
  })

  test("a page's first job loads its site's jobs file into the page's world once, and only behind its page half and core", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd", "musicActions") })
    fake.open(tabFact(1))
    fake.open(tabFact(2, { site: "music", url: "https://music.youtube.com/watch?v=fixture" }))
    const registrar = await started(fake)
    const eager = executed(fake)
    expect(eager.some(([, , file]) => String(file).startsWith("page-jobs"))).toBe(false)
    expect([...fake.scripts.values()].flatMap(script => script.js).some(file => file.startsWith("page-jobs"))).toBe(false)
    await registrar.ensure(1, { jobs: true })
    await registrar.ensure(1, { jobs: true })
    await registrar.ensure(2, { jobs: true })
    expect(executed(fake).slice(eager.length)).toEqual([[1, "MAIN", "page-jobs-www.js"], [2, "MAIN", "page-jobs-music.js"]])
    fake.open(tabFact(3))
    expect(await failure(registrar.ensure(3, { jobs: true }))).toEqual({ kind: "refused", reason: "prerequisite-missing" })
    expect(executed(fake).length).toBe(eager.length + 2)
    registrar.dispose()
  })

  test("after a worker restart a new Registrar finds the jobs file a tab has, and loads it again where the tab lost it", async () => {
    const fake = scriptedRegistrar()
    const halves = [{ file: "page-www.js", build: fixtureBuild }, { file: "core-www.js", build: fixtureBuild }]
    fake.open(tabFact(1), halves)
    fake.open(tabFact(2), [...halves, { file: "page-jobs-www.js", build: buildId("registrar-fixture-older") }])
    const before = await started(fake)
    await before.ensure(1, { jobs: true })
    before.dispose()
    const after = await started(fake)
    await after.ensure(1, { jobs: true })
    expect(executed(fake)).toEqual([[1, "MAIN", "page-jobs-www.js"]])
    fake.open(tabFact(1), halves, "document-1-reloaded")
    await after.ensure(1, { jobs: true })
    await after.ensure(2, { jobs: true })
    expect(executed(fake)).toEqual([[1, "MAIN", "page-jobs-www.js"], [1, "MAIN", "page-jobs-www.js"], [2, "MAIN", "page-jobs-www.js"]])
    after.dispose()
  })

  test("once Clear all has disposed the Registrar, a page asking for its jobs file loads nothing", async () => {
    const fake = scriptedRegistrar()
    fake.open(tabFact(1), [{ file: "page-www.js", build: fixtureBuild }, { file: "core-www.js", build: fixtureBuild }])
    const registrar = await started(fake)
    registrar.dispose()
    expect(await failure(registrar.ensure(1, { jobs: true }))).toEqual({ kind: "refused", reason: "disposed" })
    expect(executed(fake)).toEqual([])
  })

  test("repeated ensure leaves settings unchanged and loads popovers only on use", async () => {
    const fake = scriptedRegistrar()
    fake.open(tabFact(1))
    const registrar = await started(fake)
    const ownerBefore = fake.ports.owner.current()
    await registrar.ensure(1, {})
    await registrar.ensure(1, { core: false, kit: false, popovers: false })
    expect(executed(fake)).toEqual([])
    expect(await failure(registrar.ensure(1, { popovers: true }))).toEqual({ kind: "refused", reason: "prerequisite-missing" })
    await registrar.ensure(1, { core: true })
    await registrar.ensure(1, { core: true })
    expect(executed(fake)).toEqual([[1, "MAIN", "page-www.js"], [1, "ISOLATED", "core-www.js"]])
    await registrar.ensure(1, { core: true, kit: true })
    await registrar.ensure(1, { popovers: true })
    await registrar.ensure(1, { popovers: true })
    expect(executed(fake)).toEqual([[1, "MAIN", "page-www.js"], [1, "ISOLATED", "core-www.js"], [1, "ISOLATED", "kit-www.js"], [1, "ISOLATED", "popovers.js"]])
    expect(fake.scripts.size).toBe(0)
    expect(fake.ports.owner.current()).toEqual(ownerBefore)
    registrar.dispose()
  })

  test("ensure and reconcile share pacing even while an execute is pending", async () => {
    const fake = scriptedRegistrar()
    fake.open(tabFact(1))
    const registrar = await started(fake)
    const blocked = fake.pauseNext("execute")
    const first = failure(registrar.ensure(1, { core: true }))
    await blocked.entered
    fake.changeOwner({ settings: settings("autoAdd") })
    const latest = registrar.reconcile()
    const second = registrar.ensure(1, { core: true, kit: true })
    expect(fake.maxMutationsActive).toBe(1)
    blocked.release()
    expect((await first).kind).toBe("injection")
    await latest
    await second
    expect(fake.maxMutationsActive).toBe(1)
    expect(executed(fake).map(call => call[2])).toEqual(["page-www.js", "core-www.js", "kit-www.js", "feature-auto-add.js"])
    registrar.dispose()
  })

  test("a replacement build reinjects current files and startup events use the same reconcile", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.open(tabFact(1))
    const first = await started(fake)
    first.dispose()
    const build = buildId("replacement-build")
    const second = createRegistrar({ ...fake.ports, build })
    await second.reconcile()
    expect(fake.executions().slice(4).map(call => [call.file, call.build])).toEqual([
      ["page-www.js", build], ["core-www.js", build], ["kit-www.js", build], ["feature-auto-add.js", build]
    ])
    fake.startup()
    await second.reconcile()
    expect(fake.executions()).toHaveLength(8)
    second.dispose()
  })

  test("no receiver is an unavailable probe, never proof that a tab is missing code", async () => {
    const fake = scriptedRegistrar()
    fake.open(tabFact(1))
    const registrar = await started(fake)
    fake.scriptNext("probe", { probe: { kind: "unavailable", reason: "no-receiver" } })
    expect(await failure(registrar.ensure(1, { core: true }))).toEqual({ kind: "probe-unavailable", after: { kind: "unavailable", reason: "no-receiver" } })
    expect(executed(fake)).toEqual([])
    registrar.dispose()
  })

  test("document replacement never continues an old document's injection chain", async () => {
    const fake = scriptedRegistrar()
    fake.open(tabFact(1))
    const registrar = await started(fake)
    fake.scriptNext("execute", { before: () => fake.open(tabFact(1), [], "new-document") })
    const fact = await failure(registrar.ensure(1, { core: true, kit: true }))
    expect(fact.kind).toBe("injection")
    expect(executed(fake)).toEqual([[1, "MAIN", "page-www.js"]])
    registrar.dispose()
  })

  test("dispose removes all subscriptions and prevents effects after pending readiness", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    const blocked = fake.pauseNext("ready")
    const registrar = createRegistrar(fake.ports)
    const work = failure(registrar.reconcile())
    await blocked.entered
    registrar.dispose()
    registrar.dispose()
    expect(fake.listenerCounts).toEqual([0, 0, 0])
    const calls = fake.calls.length
    fake.changeOwner({ consent: true })
    fake.changeAccess("www", true)
    fake.startup()
    blocked.release()
    expect(await work).toEqual({ kind: "refused", reason: "disposed" })
    expect(fake.calls).toHaveLength(calls)
    expect(await failure(registrar.ensure(1, { core: true }))).toEqual({ kind: "refused", reason: "disposed" })
    expect(await failure(registrar.reconcile())).toEqual({ kind: "refused", reason: "disposed" })
    expect(fake.mutations()).toEqual([])
  })
  test("owned drift is corrected while preserving the planner's flags and file order", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.scripts.set(main.id, observedScript(main))
    fake.scripts.set(isolated.id, {
      ...observedScript(isolated), js: ["kit-www.js", "core-www.js", "feature-auto-add.js"], runAt: "document_start",
      allFrames: true, persistAcrossSessions: false, matchOriginAsFallback: true, css: ["unexpected.css"], excludeMatches: ["https://www.youtube.com/watch*"]
    })
    const registrar = await started(fake)
    expect(fake.scripts.get(isolated.id)).toEqual(observedScript(isolated))
    expect(fake.calls.flatMap(call => call.operation === "update" ? [call.scripts] : [])).toEqual([[isolated]])
    expect(fake.calls.filter(call => call.operation === "register")).toHaveLength(0)
    registrar.dispose()
  })

  test("site access changes request access once per transition and reconcile on grant", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.open(tabFact(1))
    fake.changeAccess("www", false, false)
    const registrar = await started(fake)
    expect(fake.calls.filter(call => call.operation === "offer")).toHaveLength(1)
    expect(fake.scripts.size).toBe(0)
    expect(executed(fake)).toEqual([])
    await registrar.reconcile()
    expect(fake.calls.filter(call => call.operation === "offer")).toHaveLength(1)
    fake.changeAccess("www", true)
    await registrar.reconcile()
    expect(fake.scripts.size).toBe(2)
    expect(executed(fake).map(call => call[2])).toEqual(["page-www.js", "core-www.js", "kit-www.js", "feature-auto-add.js"])
    fake.changeAccess("www", false)
    await registrar.reconcile()
    expect(fake.scripts.size).toBe(0)
    expect(fake.calls.filter(call => call.operation === "offer")).toHaveLength(2)
    registrar.dispose()
  })

  test("a tab frozen while a probe is pending is excluded before the next injection", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.open(tabFact(1))
    const blocked = fake.pauseNext("probe")
    const registrar = createRegistrar(fake.ports)
    const work = registrar.reconcile()
    await blocked.entered
    fake.tabs.set(1, tabFact(1, { frozen: true }))
    blocked.release()
    await work
    expect(executed(fake)).toEqual([])
    registrar.dispose()
  })

  test("known inaccessible probes skip a candidate and continue with the next tab", async () => {
    const fake = scriptedRegistrar({ settings: settings("autoAdd") })
    fake.open(tabFact(1, { active: true, focusedWindow: true }))
    fake.open(tabFact(2))
    fake.scriptNext("probe", { probe: { kind: "unavailable", reason: "inaccessible" } })
    const registrar = await started(fake)
    expect(executed(fake).map(call => call[0])).toEqual([2, 2, 2, 2])
    registrar.dispose()
  })

  test("partial subscription setup removes already acquired subscriptions", () => {
    const fake = scriptedRegistrar()
    expect(() => createRegistrar({ ...fake.ports, access: { ...fake.ports.access, subscribe() { throw Error("Subscription refused") } } })).toThrow(RegistrarError)
    expect(fake.listenerCounts).toEqual([0, 0, 0])
    expect(fake.calls).toEqual([])
  })

})
