import { expect, test } from "bun:test"
import { reconciliationConsumer } from "./run"
import expected from "./expected.json"
import { uiContract } from "../../../src/shared/contracts/ui"
import { firstRunContract } from "../../../src/shared/contracts/first-run"
import { createFirstRunHarness, accountKey, playlistId } from "../first-run-backend/harness"
import { seed } from "../auto-add-choice/harness"

test("reconciled canonical owner consumer matches through one LF and EOF", async () => {
  const first = await reconciliationConsumer(),
    second = await reconciliationConsumer()
  expect(first).toBe(second)
  expect(first.endsWith("\n") && !first.endsWith("\n\n")).toBe(true)
  expect(first).not.toMatch(/SENTINEL|agreement-review|SessionRevision|playlist-cache-capture|lifetime/)
  const records: unknown = JSON.parse(first)
  expect(records).toEqual(expected)
  expect(Array.isArray(records)).toBe(true)
  if (Array.isArray(records)) expect(records.at(-1)).toEqual({ case: "eof", nativeListeners: 0, localListeners: 0, deadlines: 0 })
})

test("composed catalogue retains exact auto-add receiver guards and rejects body authority", () => {
  expect(uiContract["ui.change"]).toBe(firstRunContract["ui.change"])
  const change = { kind: "auto-add-read", acct: accountKey(), playlist: playlistId() }
  expect(uiContract["ui.change"].payload({ change })).toBe(true)
  for (const extra of [{ sender: {} }, { origin: { kind: "ui", incognito: false } }, { incognito: false }, { account: {} }]) {
    expect(uiContract["ui.change"].payload({ change: { ...change, ...extra } })).toBe(false)
    expect(uiContract["ui.change"].payload({ change, ...extra })).toBe(false)
  }
})

test("actual first-run fixture retains one listener and supports both Backend catalogues", async () => {
  const h = await createFirstRunHarness({ records: seed() })
  try {
    const backend = h.openView().backend
    expect(h.stats().nativeListeners).toBe(1)
    expect(await backend.access.has("www")).toBe(true)
    const choice = await backend.change({ kind: "auto-add-read", acct: accountKey(), playlist: playlistId() })
    expect(choice.kind).toBe("value")
    const account = await backend.call("ui.accountInView", {})
    expect(account).toEqual({ kind: "answered", result: { kind: "none" } })
    const operation = backend.playlistList({ acct: accountKey(), site: "www" })
    const opened = await operation.opened
    expect(opened).toMatchObject({ kind: "answered", result: { kind: "open", cached: null, freshness: "absent", refresh: { kind: "pending", generation: 0 } } })
    expect(await operation.refresh()).toMatchObject({ kind: "answered", result: { kind: "refreshed", refresh: { kind: "not-listed", outcome: { kind: "no-tab", attempted: [] } } } })
    const form = backend.creation({ acct: accountKey(), site: "www" })
    const created = await form.submit({ title: "No synthetic native tab", privacy: "PRIVATE" })
    expect(created).toEqual({ kind: "answered", result: { kind: "not-created", outcome: { kind: "no-tab", attempted: [] } } })
    expect(await form.status()).toEqual(created)
    operation.dispose()
    form.dispose()
  } finally {
    await h.dispose()
  }
  expect(h.stats()).toMatchObject({ nativeListeners: 0, localListeners: 0, deadlines: 0 })
})
