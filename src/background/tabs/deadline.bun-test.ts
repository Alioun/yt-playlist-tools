import { expect, test } from "bun:test"
import type { JobInvocation } from "../../shared/contracts/jobs"
import type { RoutingNeed } from "./ports"
import { a, accountA, deferred, nativeTab, normal, settle, signedIn, tabsFixture } from "../../../tools/fixtures/tabs/harness"

const need: RoutingNeed = { site: "www", req: normal, account: accountA }
const mutation = { job: { kind: "create", title: "Synthetic deadline", privacy: "PRIVATE" }, acct: a } satisfies JobInvocation

for (const route of ["serve", "runIn"] satisfies readonly ("serve" | "runIn")[]) {
  test(`${route} reports a stalled mutation at ten seconds, sends once and ignores its late answer`, async () => {
    const h = tabsFixture(),
      late = deferred<unknown>()
    try {
      h.seedTab(nativeTab(1), signedIn())
      h.seedTab(nativeTab(2), signedIn())
      let remoteMutations = 0,
        done = false
      h.hooks.run = () => {
        remoteMutations++
        return late.promise
      }
      const pending = (route === "serve" ? h.engine.serve(mutation, need) : h.engine.runIn(1, mutation, need)).then(result => {
        done = true
        return result
      })
      await settle()
      expect(remoteMutations).toBe(1)
      expect(done).toBe(false)
      expect(h.calls.filter(call => call.kind === "run")).toEqual([{ kind: "run", tabId: 1, invocation: mutation, milliseconds: 10_000 }])
      h.clock.advance(9_999)
      await settle()
      expect(done).toBe(false)
      h.clock.advance(1)
      await settle()
      expect(done).toBe(true)
      const report = await pending
      expect(report).toEqual({ kind: "transport", tabId: 1, failure: "timeout", delivery: "unknown" })
      expect(h.clock.pending).toBe(0)
      late.resolve({ ok: false, reason: "unavailable" })
      await settle()
      h.clock.advance(30_000)
      await settle()
      expect(await pending).toEqual(report)
      expect(remoteMutations).toBe(1)
      expect(h.calls.filter(call => call.kind === "run")).toEqual([{ kind: "run", tabId: 1, invocation: mutation, milliseconds: 10_000 }])
      expect(h.clock.pending).toBe(0)
    } finally {
      await h.dispose()
    }
  })
}
