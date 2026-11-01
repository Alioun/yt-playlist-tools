import { createRegistrar } from "../../../src/background/registrar/registrar"
import { fixtureBuild, observedScript, scriptedRegistrar, settings, tabFact } from "./scripted"

export async function registrarConsumer() {
  const fake = scriptedRegistrar({ settings: settings("autoAdd", "musicActions") })
  fake.scripts.set("unrelated", { ...observedScript({
    id: "pp-www-page", js: ["unrelated.js"], matches: ["https://www.youtube.com/*"],
    world: "MAIN", runAt: "document_start", allFrames: false, persistAcrossSessions: true
  }), id: "unrelated" })
  fake.open(tabFact(1, { active: true, focusedWindow: true }))
  fake.open(tabFact(2, { site: "music", url: "https://music.youtube.com/", audible: true }))
  fake.open(tabFact(3, { discarded: true }))
  const registrar = createRegistrar(fake.ports)
  try {
    await registrar.reconcile()
    const startupIds = [...fake.scripts.keys()].filter(id => id !== "unrelated")
    await registrar.ensure(1, { popovers: true })
    await registrar.ensure(1, { popovers: true })
    fake.open(tabFact(4))
    await registrar.ensure(4, { core: true })
    const gather = settings("gather")
    gather.gather.auto.count = true
    fake.changeOwner({ settings: gather })
    await registrar.reconcile()
    const gatherState = [...fake.scripts.values()].filter(script => script.id !== "unrelated").map(script => ({ id: script.id, matches: script.matches, js: script.js }))
    fake.changeOwner({ consent: false })
    await registrar.reconcile()
    return {
      kind: "scripted-registrar-consumer",
      build: fixtureBuild,
      startupIds,
      executions: fake.executions().map(call => ({ tabId: call.tabId, world: call.world, file: call.file })),
      gatherState,
      finalIds: [...fake.scripts.keys()],
      maxConcurrentMutations: fake.maxMutationsActive,
      backgroundFailures: fake.errors.map(error => error.fact.kind)
    }
  } finally { registrar.dispose() }
}

if (import.meta.main) console.log(JSON.stringify(await registrarConsumer()))
