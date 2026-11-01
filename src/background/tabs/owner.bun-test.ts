import { expect, test } from "bun:test"
import { a, b, build, fixtureView, nativeTab, signedIn, tabsFixture } from "../../../tools/fixtures/tabs/harness"

test("account removal rejects only captured edits for that account", async () => {
  const h = tabsFixture()
  try {
    const capture = await h.owner.readSession()
    if (capture.kind !== "memory") throw Error("Missing owner memory")
    const prepared = await h.owner.prepareAccountRemoval({ kind: "ui", windowId: 1, incognito: false }, a)
    if (prepared.kind !== "confirmation-required") throw Error("Missing removal confirmation")
    expect((await h.owner.removeAccountSetup({ kind: "ui", windowId: 1, incognito: false }, prepared.confirmation)).kind).toBe("committed")
    expect(await h.owner.changeSession({ revision: capture.revision, now: 1, edits: [{ kind: "tab-seen", tabId: 1, info: { site: "www", acct: a, signedIn: true } }] })).toEqual({ kind: "unavailable", reason: "revision" })
    expect((await h.owner.changeSession({ revision: capture.revision, now: 1, edits: [{ kind: "tab-seen", tabId: 2, info: { site: "www", acct: b, signedIn: true } }] })).kind).toBe("committed")
    expect(h.stored()).toEqual({ unknown: { keep: true }, tabs: { "2": { site: "www", acct: b, signedIn: true } } })
  } finally { await h.dispose() }
})

test("tab writes retain clean rejection, applied rejection and unconfirmed distinctions", async () => {
  for (const outcome of ["unchanged-rejection", "applied-rejection", "ignored", "read-failed"] as const) {
    const h = tabsFixture(), error = Error(`Synthetic ${outcome}`)
    try {
      h.seedTab(nativeTab(1), signedIn())
      const host = h.removal.deps.removal
      if (host.kind !== "fixture") throw Error("Missing fixture session")
      const original = host.session.set
      host.session.set = async items => {
        if (outcome === "applied-rejection" || outcome === "read-failed") await original(items)
        if (outcome === "read-failed") host.session.get = async () => { throw error }
        if (outcome === "unchanged-rejection" || outcome === "applied-rejection") throw error
      }
      const result = await h.engine.seen(1, { ...signedIn(), build, hidden: false, fresh: false }, fixtureView)
      expect(result.kind).toBe("session")
      if (result.kind !== "session") throw Error("Expected a session outcome")
      expect(result.result).toEqual(outcome === "unchanged-rejection" ? { kind: "failed", applied: false, error }
        : outcome === "applied-rejection" ? { kind: "failed", applied: true, error }
        : outcome === "ignored" ? { kind: "unconfirmed", cause: { kind: "readback" } }
        : { kind: "unconfirmed", cause: { kind: "read-failed", error } })
      if (outcome === "unchanged-rejection") {
        expect((await h.owner.readSession()).kind).toBe("memory")
        host.session.set = original
        expect((await h.engine.seen(1, { ...signedIn(), hidden: false, fresh: false }, fixtureView)).kind).toBe("seen")
      } else expect(await h.owner.readSession()).toEqual({ kind: "unavailable", reason: "stale" })
      expect(h.calls.filter(call => call.kind === "run")).toEqual([])
    } finally { await h.dispose() }
  }
})
