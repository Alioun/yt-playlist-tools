import { expect, test } from "bun:test"
import { createTabs } from "../../../src/background/tabs/tabs"
import { createViewPublication } from "../../../src/background/tab-view/publication"
import { createTabViewProducer, tabViewFacts } from "../../../src/background/tab-view/producer"
import { isTabView, type TabView } from "../../../src/shared/contracts/tab-view"
import { tabsFixture, nativeTab, signedIn, build, settle } from "../tabs/harness"
import { world, initial, ui, B, C, object } from "./harness"

test("publication retains removed-account cores before registry cleanup and sends only complete views", async () => {
  const h = world(), base = tabsFixture(initial())
  const tabs = createTabs({ ...base.ports, session: { read: () => h.owner.readSession(), change: change => h.owner.changeSession(change) } })
  const producer = createTabViewProducer({ owner: h.owner, build,
    addFlow: { async readPrivateSkips() { return { kind: "unavailable", reason: "held" } } },
    statuses: { async read(context, enabled) { return { kind: "statuses", facts: tabViewFacts(context),
      statuses: enabled.map(feature => ({ feature: feature.id, state: "working", jobs: [], anchors: [], actions: [], kinds: [] })), current: () => true } } },
    notices: { async read(context) { return { kind: "notices", facts: tabViewFacts(context), notices: [], current: () => true } } }
  })
  const sent: { readonly tabId: number; readonly view: TabView }[] = []
  const original = base.ports.native.view
  base.ports.native.view = async (tabId, value, validate, milliseconds, signal) => {
    if (!isTabView(value) || !validate(value)) throw Error("Complete native TabView required")
    sent.push({ tabId, view: structuredClone(value) }); return original(tabId, value, validate, milliseconds, signal)
  }
  const publisher = createViewPublication({ owner: h.owner, tabs, producer, clock: base.clock,
    monitor: { subscribeView() { return () => {} } }, privateSkips: { subscribePrivateSkips() { return () => {} } } })
  try {
    base.seedTab(nativeTab(1), signedIn(B)); base.seedTab(nativeTab(2), signedIn(C))
    expect((await tabs.seen(1, { ...signedIn(B), hidden: false, fresh: false }, producer)).kind).toBe("seen")
    expect((await tabs.seen(2, { ...signedIn(C), hidden: false, fresh: false }, producer)).kind).toBe("seen")
    await publisher.ready
    sent.length = 0
    const prepared = await h.prepare()
    expect((await h.owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })).kind).toBe("committed")
    expect(Object.values(object(h.h.state().session.tabs)).some(row => row !== null && typeof row === "object" && "acct" in row && row.acct === B)).toBe(false)
    await settle(); base.clock.advance(250); await settle()
    expect(sent.map(row => row.tabId).sort()).toEqual([1, 2])
    expect(sent.find(row => row.tabId === 1)?.view).toMatchObject({ signedIn: true, acct: B, setup: { kind: "none" } })
    expect(sent.find(row => row.tabId === 2)?.view).toMatchObject({ signedIn: true, acct: C, setup: { kind: "live" } })
  } finally { publisher.dispose(); producer.dispose(); tabs.dispose(); await base.dispose(); await h.dispose() }
})
