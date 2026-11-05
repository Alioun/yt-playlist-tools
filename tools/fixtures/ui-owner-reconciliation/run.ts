import expectedCalls from "./expected-calls.json"
import { wireCalls } from "./wire-calls"
import { deepStrictEqual, equal } from "node:assert/strict"
import { bridgeHarness, popup, a, alpha, beta, created, settle, check } from "../ui-read-playlist-bridge/harness"
import { deferred, success } from "../playlists-cache/harness"
import { isJsonValue } from "../../../src/shared/contracts/json"
import { firstRunContract } from "../../../src/shared/contracts/first-run"
import { uiContract } from "../../../src/shared/contracts/ui"
import type { MembershipAnswer } from "../../../src/shared/picker/source"
import { createFirstRunHarness } from "../first-run-backend/harness"

export async function reconciliationConsumer() {
  const transcript: unknown[] = []
  const first = await createFirstRunHarness()
  try {
    const backend = first.openView(popup(), 1).backend
    equal(uiContract["ui.change"], firstRunContract["ui.change"], "composed change keeps the actual first-run guard")
    equal(uiContract["ui.syncedChoices"], firstRunContract["ui.syncedChoices"], "lookup keeps its catalogue owner")
    const held = await backend.call("ui.accountInView", {})
    check(held.kind === "answered" && held.result.kind === "unavailable", "first-run consent holds playlist services")
    equal(first.stats().accountReads, 0)
    equal(first.stats().playlistReads, 0)
    const agreement = await backend.change({ kind: "first-run-agree", displayedVersion: 1, attempt: 1, selected: ["quick-save"], syncOn: false })
    deepStrictEqual(agreement, { kind: "agreed", attempt: 1, applications: [{ feature: "quick-save", state: "enabled" }] })
    equal(first.stats().accessReads, 3)
    deepStrictEqual(wireCalls(first.requestBytes.map(text => ({ event: "sent", from: 0, text }))), expectedCalls.firstRun, "exact first-run wire calls")
    transcript.push({ case: "first-run", held: "unavailable", agreement, accessReads: 3 })
  } finally {
    await first.dispose()
  }

  const h = bridgeHarness(),
    backend = h.open(popup(), 1)
  const entered = deferred<void>(),
    native = deferred<unknown>(),
    membership = deferred<MembershipAnswer>()
  let membershipSettled = false,
    nativeSettled = false
  void membership.promise.then(() => {
    membershipSettled = true
  })
  h.h.script(async (_tab, invocation) => {
    if (invocation.job.kind === "playlists") {
      entered.resolve()
      const result = await native.promise
      nativeSettled = true
      return result
    }
    if (invocation.job.kind === "create") return { ok: false, reason: "unconfirmed" }
    return { ok: false, reason: "unavailable" }
  })
  try {
    const setup = await backend.load({ acct: a })
    check(setup.kind === "snapshot" && setup.setup.kind === "current", "actual browser Backend reads canonical Setup")
    equal(setup.setup.value.quickSave, alpha)
    const destination = await backend.change({ kind: "setup-destination", acct: a, destination: { kind: "quick-save" }, expected: { setup: "live", playlist: alpha }, playlist: beta })
    deepStrictEqual(destination, { kind: "confirmed", playlist: beta })
    const account = await backend.call("ui.accountInView", {})
    check(account.kind === "answered" && account.result.kind === "account" && account.result.acct === a, "actual Tabs account route")
    const read = { kind: "auto-add-read", acct: a, playlist: alpha } as const
    const captured = await backend.change(read)
    check(captured.kind === "value", "canonical auto-add lifetime returned by receiver")
    deepStrictEqual(captured.fact, { kind: "absent" })
    const edit = { kind: "auto-add-choice", acct: a, playlist: alpha, lifetime: captured.lifetime, edit: { kind: "auto-add", expected: false, chosen: true } } as const
    const changed = await backend.change(edit)
    deepStrictEqual(changed, { kind: "auto-add-confirmed", acct: a, playlist: alpha, fact: { kind: "selected", takes: "videos", pct: null } })
    deepStrictEqual(await backend.change(edit), { kind: "refused", reason: "stale" })
    const after = await backend.load({ acct: a })
    check(after.kind === "snapshot" && after.setup.kind === "current", "canonical Setup remains readable")
    deepStrictEqual(after.setup.value.autoAdd, [alpha])
    equal(after.setup.value.quickSave, beta)
    const changeMessages = h.network
      .trace()
      .filter(event => event.event === "sent")
      .map(event => {
        check(event.event === "sent", "wire trace is sent")
        const message: unknown = JSON.parse(event.text)
        check(isJsonValue(message) && message !== null && typeof message === "object" && !Array.isArray(message), "finite change envelope")
        return message.kind
      })
      .filter(kind => kind === "ui.change")
    deepStrictEqual(changeMessages, ["ui.change", "ui.change", "ui.change", "ui.change"])
    transcript.push({ case: "setup-and-auto-add", destination, fact: captured.fact, changed, stale: "refused", calls: changeMessages })

    const lists = backend.playlistList({ acct: a, site: "www" })
    await entered.promise
    const opened = await lists.opened
    check(opened.kind === "answered" && opened.result.kind === "open", "cached opening is a finite answer")
    deepStrictEqual(
      opened.result.cached?.rows.map(row => row.id),
      ["WL", beta, alpha]
    )
    deepStrictEqual(opened.result.refresh, { kind: "pending", generation: 0 })
    equal(nativeSettled, false)
    equal(membershipSettled, false)
    equal(h.h.runs("playlists").length, 1)
    const refresh = lists.refresh()
    equal(lists.refresh(), refresh, "pending refresh shares one generation")
    native.resolve(success([{ id: alpha, title: "Refreshed", privacy: "PRIVATE", count: 9 }]))
    const refreshed = await refresh
    check(refreshed.kind === "answered" && refreshed.result.kind === "refreshed", "same list operation completes")
    equal(refreshed.result.operation, opened.result.operation)
    equal(refreshed.result.generation, 0)
    check(refreshed.result.refresh.kind === "listed", "native read and cache status remain separate")
    equal(refreshed.result.refresh.cache.kind, "committed")
    equal(h.h.runs("playlists").length, 1)
    transcript.push({ case: "cache-before-refresh", rows: ["WL", beta, alpha], nativePendingAtOpen: true, membershipPendingAtOpen: true, generation: 0, jobs: 1, cache: "committed" })
    lists.dispose()

    const creation = backend.creation({ acct: a, site: "www" })
    const uncertain = await creation.submit({ title: "One attempt", privacy: "PRIVATE" })
    check(uncertain.kind === "answered" && uncertain.result.kind === "not-created", "creation uncertainty is retained")
    deepStrictEqual(await creation.submit({ title: "Would duplicate", privacy: "PUBLIC" }), uncertain)
    deepStrictEqual(await creation.status(), uncertain)
    equal(h.h.runs("create").length, 1)
    transcript.push({ case: "creation-uncertainty", answer: uncertain, statusSame: true, creates: 1 })
    creation.dispose()

    const second = backend.playlistList({ acct: a, site: "www", refresh: true })
    const secondForm = backend.creation({ acct: a, site: "www" })
    const lateList = second.opened,
      lateStatus = secondForm.status()
    backend.dispose()
    deepStrictEqual(await lateList, { kind: "failed", failure: "disposed" })
    deepStrictEqual(await lateStatus, { kind: "failed", failure: "disposed" })
    deepStrictEqual(await backend.change(read), { kind: "refused", reason: "unavailable" })
    await settle()
    deepStrictEqual(wireCalls(h.network.trace(), captured.lifetime), expectedCalls.main, "exact composed wire calls and operation identities")
  } finally {
    native.resolve({ ok: false, reason: "unavailable" })
    membership.resolve({ kind: "unreadable" })
    await h.dispose()
  }
  equal(h.network.listening(), 0)
  equal(h.counts().localListeners, 0)
  equal(h.h.clock.pending, 0)
  const lostHarness = bridgeHarness({ delivery: "queued" })
  const creationEntered = deferred<void>()
  lostHarness.h.script(async (_tab, invocation) => {
    check(invocation.job.kind === "create", "lost-answer fixture runs only creation")
    creationEntered.resolve()
    return success({ playlistId: created })
  })
  try {
    const form = lostHarness.open(popup(), 1).creation({ acct: a, site: "www" })
    await lostHarness.flush()
    const submitted = form.submit({ title: "One delivered write", privacy: "PRIVATE" })
    await settle()
    const queued = lostHarness.network.queued()[0]
    check(queued, "creation submission is queued")
    queued.lose()
    const lost = await submitted
    deepStrictEqual(lost, { kind: "failed", failure: "transport" })
    await creationEntered.promise
    equal(lostHarness.h.runs("create").length, 1)
    deepStrictEqual(await form.submit({ title: "Duplicate forbidden", privacy: "PUBLIC" }), lost)
    const status = form.status()
    await lostHarness.flush()
    const known = await status
    check(known.kind === "answered" && known.result.kind === "created", "same operation recovers its actual creation fact")
    equal(lostHarness.h.runs("create").length, 1)
    transcript.push({ case: "lost-answer-status", lost, status: known, creates: 1 })
    form.dispose()
    await lostHarness.flush()
    deepStrictEqual(wireCalls(lostHarness.network.trace()), expectedCalls.lostAnswer, "lost answer sends no extra submission")
  } finally {
    await lostHarness.dispose()
  }
  equal(lostHarness.network.listening(), 0)
  equal(lostHarness.h.clock.pending, 0)
  transcript.push({ case: "eof", nativeListeners: 0, localListeners: 0, deadlines: 0 })
  check(isJsonValue(transcript), "consumer output is finite JSON")
  return JSON.stringify(transcript) + "\n"
}
if (import.meta.main) process.stdout.write(await reconciliationConsumer())
