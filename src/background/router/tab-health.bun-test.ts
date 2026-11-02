import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { createTabHealthRouter } from "./tab-health"
import { runtimeTransport } from "../adapters/runtime"
import { CONTRACT_VERSION } from "../../shared/contracts/protocol"
import { build, manualClock, settle } from "../../../tools/fixtures/tabs/harness"

beforeEach(() => fakeBrowser.reset())
afterEach(() => mock.restore())
const acct = "AAAAAAAAAAAAAAAA"
const signal = { site: "www", feature: null, job: "add", route: "service.add", kind: "missing", watchId: "W", shape: null, clientVersion: null, pageType: "watch", count: 1, firstSeen: 1, lastSeen: 1 }

async function world(registered: string | null = acct) {
  const window = await fakeBrowser.windows.create({ incognito: false })
  const created = await fakeBrowser.tabs.create({ windowId: window?.id, url: "https://www.youtube.com/watch?v=ccccccccccc" })
  const raw = { ...created, incognito: false, active: true, windowId: window?.id }
  spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => raw as never)
  const calls: unknown[] = []
  const monitor = {
    async signal(_context: unknown, value: unknown, evidence: unknown) { calls.push(["signal", (value as { kind: string }).kind, evidence]); return { kind: "accepted", scope: "normal" } as const },
    async observeAnchor(_context: unknown, input: unknown) { calls.push(["anchor", input]); return { kind: "accepted", scope: "normal" } as const },
    async succeeded(_context: unknown, job: unknown) { calls.push(["success", job]); return { kind: "accepted", scope: "normal" } as const },
    async measured() { calls.push(["measured"]); return { kind: "accepted", scope: "normal" } as const }
  }
  const router = createTabHealthRouter({ transport: runtimeTransport(fakeBrowser.runtime), senders: fakeBrowser, build, deadline: manualClock().after, monitor: monitor as never,
    async context(_sender, claimed) { return claimed === registered ? { tab: { tabId: raw.id }, info: {} } as never : null } })
  const sender = { id: fakeBrowser.runtime.id, frameId: 0, url: raw.url, tab: raw } as never
  async function send(payload: unknown) {
    const replies: unknown[] = []
    await Promise.all(await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: "m-1", kind: "tab.health", payload }, sender, value => replies.push(value)))
    await settle()
    return replies[0]
  }
  return { send, calls, dispose: () => router.dispose() }
}

test("a tab's batch reaches the Monitor as that tab: job signals with their evidence, anchors, successes and a measured playback", async () => {
  const w = await world()
  await w.send({ acct, request: { reports: [
    { kind: "signal", signal, evidence: "job", online: true, answered: false },
    { kind: "signal", signal: { ...signal, kind: "cannot-measure", job: null, route: null, watchId: null, feature: "auto-add" }, evidence: "playback" },
    { kind: "anchor", anchor: "www-cards", signal: { ...signal, kind: "anchor-missing", job: null, route: null, watchId: null },
      observation: { relevant: true, visible: true, settledMs: 3000, distinctMainLinks: 8, recognised: 1 } },
    { kind: "success", job: "add" }, { kind: "measured" }] } })
  expect(w.calls).toEqual([
    ["signal", "missing", { kind: "job", online: true, otherRequestsAnswer: false }],
    ["signal", "cannot-measure", { kind: "playback" }],
    ["anchor", { anchor: "www-cards", signal: expect.objectContaining({ kind: "anchor-missing" }),
      observation: { kind: "content", relevant: true, visible: true, navigationAt: 0, observedAt: 3000, distinctMainLinks: 8, recognised: 1 } }],
    ["success", "add"], ["measured"]])
  w.dispose()
})

test("a batch from a tab the registry holds for another account reaches nothing (ARC-ACC-49)", async () => {
  const w = await world("BBBBBBBBBBBBBBBB")
  await w.send({ acct, request: { reports: [{ kind: "success", job: "add" }] } })
  expect(w.calls).toEqual([])
  w.dispose()
})
