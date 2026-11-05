import { clearFixture, agreedSeed, accountSeed, sharedSync, check } from "./harness"
import type { ClearAllAnswer } from "../../../src/shared/contracts/clear-all"

const route = process.argv[2]
check(route === "direct" || route === "wire" || route === "receive", "route must be direct, wire or receive")
function write(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}
if (route === "direct" || route === "wire") {
  for (const alsoSynced of [false, true]) {
    const h = clearFixture(agreedSeed()),
      wire = route === "wire" ? await h.wire() : undefined
    try {
      let finished = false
      for (let event = 0; event < 20; event++) {
        let answer: ClearAllAnswer | undefined
        if (wire) answer = await h.confirm(wire.backend, alsoSynced)
        const result = wire ? undefined : await h.clear({ alsoSynced })
        if ((answer?.kind === "clear-result" && answer.erasure === "confirmed") || result?.kind === "cleared") {
          finished = true
          break
        }
        check(
          alsoSynced && ((answer?.kind === "clear-result" && answer.outcome === "deferred") || (result?.kind === "reset-held" && result.result.kind === "deferred")),
          "only external deferred opportunities continue"
        )
        h.advance(5000)
      }
      check(finished, "finite consumer completed")
      write({
        case: alsoSynced ? "synced" : "unticked",
        local: h.records(),
        session: h.session(),
        remote: h.shared.records(),
        firstRun: h.counts().openings,
        database: h.counts().databases,
        syncMutations: h.calls.filter(call => call.operation === "sync.set" || call.operation === "sync.remove")
      })
    } finally {
      wire?.dispose()
      await h.dispose()
    }
  }
} else {
  const shared = sharedSync(),
    sender = clearFixture(agreedSeed(), shared),
    receiver = clearFixture(accountSeed(true), shared)
  receiver.seedSession({ paused: true })
  try {
    await receiver.lifecycle().ready()
    const owner = receiver.lifecycle().owner()
    check(owner, "receiving native owner")
    await owner.ready()
    let finished = false
    for (let event = 0; event < 20; event++) {
      const result = await sender.clear({ alsoSynced: true })
      if (result.kind === "cleared") {
        finished = true
        break
      }
      check(result.kind === "reset-held" && result.result.kind === "deferred", "deferred reset")
      sender.advance(5000)
    }
    check(finished, "sender reset completed")
    const events: unknown[] = []
    owner.subscribeView(event => events.push(event))
    await owner.startSync()
    write({ case: "received-reset", local: receiver.records(), session: receiver.session(), remote: shared.records(), notices: [...receiver.notices.values()], events })
  } finally {
    await sender.dispose()
    await receiver.dispose()
  }
}
