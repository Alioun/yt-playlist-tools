import { createAddFlow } from "../../../src/background/add-flow/add-flow"
import { createTabViewProducer, tabViewFacts, type StatusProducer, type NoticeProducer } from "../../../src/background/tab-view/producer"
import type { TabContext } from "../../../src/background/tabs/ports"
import type { Site } from "../../../src/shared/contracts/vocabulary"
import type { AccountKey } from "../../../src/shared/model/validation"
import { projectionSeed, projectionWorld, a } from "../tab-projection/harness"
import { build } from "../page-link/support"

export function tabContext(site: Site = "www", privateWindow = false, signedIn = true, acct: AccountKey = a): TabContext {
  return { tab: { tabId: 7, windowId: 3, site, incognito: privateWindow, active: true, discarded: false, frozen: false, lastAccessed: 5 },
    info: signedIn ? { signedIn: true, acct, site, build } : { signedIn: false, acct: null, site, build } }
}
export function syntheticHealth(): { readonly synthetic: true; readonly statuses: StatusProducer; readonly notices: NoticeProducer } {
  return {
    synthetic: true,
    statuses: { async read(context, enabled) {
      return { kind: "statuses", facts: tabViewFacts(context), current: () => true, statuses: enabled.map(feature => ({
        feature: feature.id, state: "working", jobs: [], anchors: [], actions: [], kinds: []
      })) }
    } },
    notices: { async read(context) { return { kind: "notices", facts: tabViewFacts(context), current: () => true, notices: [] } } }
  }
}
export function viewWorld(seed = projectionSeed(), health = syntheticHealth()) {
  const world = projectionWorld(seed)
  let ended = false
  const flow = createAddFlow({
    session: { read: () => world.owner.readSession(), change: change => world.owner.changeSession(change) },
    owner: {
      writable: () => !ended,
      shared() { throw Error("Unexpected synthetic feature write") },
      account() { throw Error("Unexpected synthetic destination read") },
      mark() { throw Error("Unexpected synthetic playlist mark") },
      recentAdds() { throw Error("Unexpected synthetic Recent adds read") },
      titles() { throw Error("Unexpected synthetic Recent adds read") }
    },
    async execution() { throw Error("Unexpected synthetic job execution") },
    now: () => 1_000_000,
    generation: () => "synthetic-tab-view-engine",
    async wait() { throw Error("Unexpected synthetic AddFlow wait") }
  })
  const producer = createTabViewProducer({ owner: world.owner, addFlow: flow, statuses: health.statuses, notices: health.notices, build })
  return { ...world, flow, producer, health,
    async dispose() { ended = true; producer.dispose(); await flow.quiesce(); await world.owner.dispose() }
  }
}
