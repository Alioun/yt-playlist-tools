import { expect, test } from "bun:test"
import { createMemoryNetwork } from "../../../shared/rpc/memory"
import { createRpcCaller } from "../../../shared/rpc/rpc"
import { tabPingMessages, type TabPingMessages } from "../../../shared/contracts/tabs"
import { createNativeExtLink, nativeExtLinkRuntime, type ExtLinkNativeSender } from "./extlink-runtime"
import { build, extensionId, isFixtureView, settle } from "../../../../tools/fixtures/extlink/harness"
import { callbackRuntime } from "../../../../tools/fixtures/extlink/native"
import { harness as pageHarness, snapshot } from "../../../../tools/fixtures/page-link/support"

test("the native site adapter captures visibility once and reads identity and sender ID from its runtime port", async () => {
  const page = pageHarness({ pageSnapshot: () => snapshot(null) })
  const network = createMemoryNetwork<ExtLinkNativeSender>({ delivery: "immediate" })
  const site = callbackRuntime(network.connect({ id: extensionId }), extensionId)
  const background = network.connect({ id: extensionId })
  let reads = 0
  const ext = createNativeExtLink({ build, site: "www", page: page.link, deadline: page.clock.after.bind(page.clock), isView: isFixtureView },
    site.runtime, { get visibilityState(): DocumentVisibilityState { reads++; return "hidden" } })
  const caller = createRpcCaller<TabPingMessages>(background, { build, deadline: page.clock.after.bind(page.clock), contract: tabPingMessages() })
  try {
    await page.link.hello
    await settle()
    expect(await caller.call("bg.ping", {})).toEqual({ kind: "answered", result: { signedIn: false, acct: null, site: "www", build } })
    expect(reads).toBe(1)
    expect(site.claims).toEqual([true])
    const foreign = createRpcCaller<TabPingMessages>(network.connect({ id: "foreign-extension" }), { build,
      deadline: page.clock.after.bind(page.clock), contract: tabPingMessages() })
    expect(await foreign.call("bg.ping", {})).toEqual({ kind: "failed", failure: "invalid-answer" })
    foreign.dispose()
    expect(site.claims).toEqual([true, true])
    expect(nativeExtLinkRuntime(site.runtime).senderId({ id: extensionId })).toBe(extensionId)
    expect(nativeExtLinkRuntime(site.runtime).senderId({})).toBeUndefined()
    Object.defineProperty(site.runtime, "id", { get: () => undefined })
    expect(await caller.call("bg.ping", {})).toEqual({ kind: "failed", failure: "invalid-answer" })
    expect(ext.state).toEqual({ kind: "disposed", reason: "orphaned" })
    expect(site.listening).toBe(0)
  } finally { caller.dispose(); ext.dispose(); page.dispose() }
  expect(site.listening).toBe(0)
  expect(page.clock.count).toBe(0)
})

test("a missing or throwing native runtime ID disposes PageLink before attaching a receiver", async () => {
  for (const mode of ["missing", "throwing"] as const) {
    const page = pageHarness(), network = createMemoryNetwork<ExtLinkNativeSender>({ delivery: "immediate" })
    const site = callbackRuntime(network.connect({ id: extensionId }), extensionId)
    Object.defineProperty(site.runtime, "id", { get() { if (mode === "throwing") throw Error("Synthetic orphan"); return undefined } })
    const ext = createNativeExtLink({ build, site: "www", page: page.link, deadline: page.clock.after.bind(page.clock), isView: isFixtureView }, site.runtime, { visibilityState: "visible" })
    try {
      expect(ext.state).toEqual({ kind: "disposed", reason: "orphaned" })
      expect(page.link.state).toEqual({ kind: "disposed" })
      expect(site.listening).toBe(0)
      expect(page.clock.count).toBe(0)
    } finally { ext.dispose(); page.dispose() }
  }
})
