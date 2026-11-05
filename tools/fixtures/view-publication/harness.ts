import { createViewPublication, type PublicationPorts } from "../../../src/background/tab-view/publication"
import { isTabView, type TabView } from "../../../src/shared/contracts/tab-view"
import type { TabContext } from "../../../src/background/tabs/ports"
import { monitorWorld, compactSeed, context, syntheticHealthFacts } from "../monitor/harness"
import { a, b, build, type NativeCall } from "../tabs/harness"
import { alpha, document } from "../tab-projection/harness"
import type { RemovalFixtureState } from "../account-removal-execution/run"
import { harness as actionHarness, lists } from "../add-flow/harness"
import { createTabViewProducer } from "../../../src/background/tab-view/producer"

export async function drain() {
  for (let n = 0; n < 4000; n++) await Promise.resolve()
}

export function publicationSeed(): RemovalFixtureState {
  const seed = compactSeed()
  delete seed.local[`doc:filter:${b}:PL_bad`]
  delete seed.local[`doc:filter:${b}:PL_new`]
  seed.session = { unknown: { keep: true }, paused: false }
  return seed
}
export const contexts = [context("www", false, 1, a), context("www", false, 2, a), context("www", false, 3, b), context("www", true, 9, a), context("www", true, 10, b)]

export async function publicationWorld(seed = publicationSeed(), decorate: (ports: PublicationPorts) => PublicationPorts = ports => ports, runActions = false) {
  const base = monitorWorld(seed)
  const actions = runActions ? actionHarness({ session: base.session, clock: base.clock.wallNow() }) : null
  if (actions) {
    for (const input of contexts) actions.tab(input.tab.tabId, input.info.acct)
    actions.setup(a, { kind: "auto-add" }, [{ playlist: lists.music }])
  }
  const producer = actions ? createTabViewProducer({ owner: base.owner, addFlow: actions.flow, statuses: base.monitor.statusProducer, notices: base.monitor.noticeProducer, build }) : base.producer
  const world = {
    ...base,
    flow: actions?.flow ?? base.flow,
    producer,
    async dispose() {
      if (actions) {
        producer.dispose()
        await actions.flow.quiesce()
      }
      await base.dispose()
    }
  }
  const sent: { tabId: number; at: number; view: TabView }[] = []
  const nativeView = world.ports.native.view.bind(world.ports.native)
  world.ports.native.view = (tabId, value, validate, milliseconds, signal) => {
    if (!isTabView(value) || !validate(value)) throw Error("Native publication requires a complete validated view")
    sent.push({ tabId, at: world.clock.now(), view: structuredClone(value) })
    return nativeView(tabId, value, validate, milliseconds, signal)
  }
  const subscriptions = { owner: 0, monitor: 0, tabs: 0, privateSkips: 0 }
  function tracked(kind: keyof typeof subscriptions, subscribe: () => () => void) {
    subscriptions[kind]++
    const stop = subscribe()
    let active = true
    return () => {
      if (!active) return
      active = false
      subscriptions[kind]--
      stop()
    }
  }
  const publisher = createViewPublication(
    decorate({
      owner: {
        subscribeView(changed, revoked) {
          return tracked("owner", () => world.owner.subscribeView(changed, revoked))
        }
      },
      tabs: {
        ...world.engine,
        subscribeLifetime(revoked) {
          return tracked("tabs", () => world.engine.subscribeLifetime(revoked))
        }
      },
      monitor: {
        subscribeView(changed, revoked) {
          return tracked("monitor", () => world.monitor.subscribeView(changed, revoked))
        }
      },
      privateSkips: {
        subscribePrivateSkips(changed, revoked) {
          return tracked("privateSkips", () => world.flow.subscribePrivateSkips(changed, revoked))
        }
      },
      producer: world.producer,
      clock: world.clock
    })
  )
  await publisher.ready
  for (const input of contexts) {
    world.seedContext(input, { visible: true, fullscreen: false }, syntheticHealthFacts(input.tab.site))
    const result = await world.engine.seen(input.tab.tabId, { ...input.info, hidden: false, fresh: false }, world.producer)
    if (result.kind !== "seen") throw Error(`Complete initial view unavailable for ${input.tab.tabId}`)
  }
  await drain()
  return {
    ...world,
    actions,
    publisher,
    sent,
    subscriptions,
    async advance(ms: number) {
      world.clock.advance(ms)
      await drain()
    },
    async filter(on: boolean) {
      return world.owner.change({ kind: "ui", windowId: 1, incognito: false }, { acct: a, playlist: alpha, desired: { mode: "allow", on }, clearListedChannels: "not-confirmed" })
    },
    async sessionChange(edits: Parameters<typeof world.owner.changeSession>[0]["edits"]) {
      const read = await world.owner.readSession()
      if (read.kind !== "memory") throw Error("Missing real owner session")
      return world.owner.changeSession({ revision: read.revision, now: world.clock.wallNow(), edits })
    },
    async complete(input: TabContext) {
      const result = await world.producer.produce(input)
      if (result.kind !== "view") throw Error("Missing full expected view")
      return result.view
    },
    nativeTargets() {
      return world.calls.filter((call): call is Extract<NativeCall, { kind: "view" }> => call.kind === "view").map(call => call.tabId)
    },
    async dispose() {
      publisher.dispose()
      await world.dispose()
    }
  }
}

export function withFilter(on: boolean, gen: string, at: number) {
  return { ...document({ mode: "allow", on, channels: [] }), gen, at, by: "synthetic-sync" }
}
