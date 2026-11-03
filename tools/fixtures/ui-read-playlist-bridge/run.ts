import { completedList } from "./harness"
import { deepStrictEqual } from "node:assert/strict"
import { bridgeHarness, a, created, video, nativeTab, signedIn, success, check, popup, settings, settle } from "./harness"
import { isJsonValue } from "../../../src/shared/contracts/json"
import { isUiCreationAnswer } from "../../../src/shared/contracts/ui-playlists"
import { isCreationId } from "../../../src/shared/contracts/ui-playlists"
import { CONTRACT_VERSION } from "../../../src/shared/contracts/protocol"
import { build } from "./harness"
import { signedOut } from "../tabs/harness"
import { isAccountKey } from "../../../src/shared/model/validation"
import { createFirstRunHarness } from "../first-run-backend/harness"
import { deferred } from "../playlists-cache/harness"

export async function runUiBridgeConsumer() {
  const transcript: unknown[] = []
  let h = bridgeHarness()
  try {
    const backend = h.open(popup(), 1)
    const snapshot = await backend.load()
    const pendingLookup = backend.call("ui.syncedChoices", {})
    await settle()
    h.h.clock.advance(10_000)
    const lookup = await pendingLookup
    check(snapshot.kind === "snapshot" && lookup.kind === "answered" && lookup.result.kind === "not-found", "first-run reads through composed catalogue")
    transcript.push({ case: "first-run-reads", snapshot, lookup, reads: h.counts().localReads, syncReads: h.counts().syncReads })
    const account = await backend.call("ui.accountInView", {})
    check(account.kind === "answered" && account.result.kind === "account" && account.result.acct === a && account.result.source === "active", "actual Tabs selects active account")
    transcript.push({ case: "account", answer: account })
    const list = await completedList(backend, { acct: a, site: "www", refresh: false, windowId: 1 })
    check(list.kind === "answered" && list.result.kind === "open" && list.result.freshness === "stale" && list.result.refresh?.kind === "listed", "actual stale list refresh")
    check(list.result.refresh.cache.kind === "committed", "actual confirmed cache persistence")
    check(isJsonValue(list.result), "finite list wire JSON")
    transcript.push({ case: "normal-list", answer: list, writes: h.h.cacheWrites })
    const channel = await backend.call("ui.resolveChannel", { input: " @synthetic ", windowId: 1 })
    check(channel.kind === "answered" && channel.result.kind === "result" && channel.result.result.ok, "actual serving-tab channel route")
    transcript.push({ case: "channel", answer: channel })
    const form = backend.creation({ acct: a, site: "www" })
    const creation = await form.submit({ title: "  Created  ", privacy: "PRIVATE", videoId: video })
    check(creation.kind === "answered" && creation.result.kind === "created" && creation.result.id === created, "actual operation creates once")
    deepStrictEqual(await form.submit({ title: "Edited after sending", privacy: "PUBLIC" }), creation, "same form retains submitted creation")
    check(h.h.runs("create").length === 1, "form operation sends one create")
    transcript.push({ case: "creation", answer: creation, writes: h.h.cacheWrites, creates: h.h.runs("create").length })
    form.dispose()
    h.h.pings.set(1, signedOut())
    const signed = await backend.call("ui.accountInView", { windowId: 1 })
    check(signed.kind === "answered" && signed.result.kind === "account" && "signedIn" in signed.result && !signed.result.signedIn, "active signed-out fact wins over fallback")
    transcript.push({ case: "signed-out", answer: signed })
    h.h.seedTab()
    h.h.seedTab(nativeTab(9, { windowId: 2, incognito: true, active: true }), signedIn())
    const privateView = h.open(popup(2), 2),
      writes = h.h.cacheWrites
    const privateList = await completedList(privateView, { acct: a, site: "www", refresh: true, windowId: 2 })
    check(
      privateList.kind === "answered" &&
        privateList.result.kind === "open" &&
        privateList.result.refresh?.kind === "listed" &&
        privateList.result.refresh.cache.kind === "caller-owned" &&
        privateList.result.refresh.cache.reason === "private",
      "private requester remains private"
    )
    check(h.h.cacheWrites === writes, "private list never writes cache")
    transcript.push({ case: "private-list", answer: privateList, additionalWrites: h.h.cacheWrites - writes })
    const noSetup = "CCCCCCCCCCCCCCCC"
    check(isAccountKey(noSetup), "no-Setup account brand")
    h.h.seedTab(nativeTab(3, { active: false }), signedIn(noSetup))
    const noSetupList = await completedList(backend, { acct: noSetup, site: "music", refresh: false, windowId: 1 })
    check(
      noSetupList.kind === "answered" &&
        noSetupList.result.kind === "open" &&
        noSetupList.result.cached === null &&
        noSetupList.result.refresh?.kind === "listed" &&
        noSetupList.result.refresh.cache.kind === "caller-owned" &&
        noSetupList.result.refresh.cache.reason === "no-setup",
      "no-Setup list is caller-owned"
    )
    transcript.push({ case: "no-setup", answer: noSetupList })
    const before = h.h.calls.length
    check((await h.send({ windowId: 99 })) === undefined, "missing window refused")
    check((await h.send({ windowId: 1 }, "ui.accountInView", { ...popup(), id: "forged-extension" })) === undefined, "forged sender refused")
    check((await h.send({ windowId: 1 }, "ui.accountInView", settings())) === undefined, "tab page cannot claim popup window")
    check(h.h.calls.length === before, "rejected native identity calls no service")
    transcript.push({ case: "forged-window", serviceCalls: h.h.calls.length - before })
    h.h.pings.set(1, signedIn(noSetup))
    h.h.tabs.delete(3)
    h.h.tabs.delete(9)
    const changed = await completedList(backend, { acct: a, site: "www", refresh: true, windowId: 1 })
    check(changed.kind === "answered" && changed.result.kind === "open" && changed.result.refresh?.kind === "not-listed", "account change cannot run another account's list")
    transcript.push({ case: "account-change", answer: changed })
    h.h.tabs.clear()
    const fallback = await backend.call("ui.accountInView", { windowId: 1 })
    check(fallback.kind === "answered" && fallback.result.kind === "account" && fallback.result.source === "last-account", "actual last-account fallback")
    transcript.push({ case: "fallback", answer: fallback })
  } finally {
    await h.dispose()
  }
  check(h.network.listening() === 0 && h.counts().localListeners === 0 && h.h.clock.pending === 0, "consumer tears down all listeners and deadlines")

  const firstRun = await createFirstRunHarness()
  try {
    const backend = firstRun.openView(popup(), 1).backend
    const held = await backend.call("ui.accountInView", { windowId: 1 })
    check(held.kind === "answered" && held.result.kind === "unavailable", "held consent is unavailable")
    check(firstRun.stats().accountReads === 0 && firstRun.stats().playlistReads === 0, "held consent calls no Tabs or Playlists")
    const agreement = await backend.change({ kind: "first-run-agree", displayedVersion: 1, attempt: 1, selected: ["quick-save"], syncOn: false })
    check(agreement.kind === "agreed", "first-run agreement survives composed router")
    transcript.push({ case: "held-and-agree", held, agreement, accessReads: firstRun.stats().accessReads })
  } finally {
    await firstRun.dispose()
  }

  h = bridgeHarness()
  try {
    h.h.fault("unreadable")
    const form = h.open(popup(), 1).creation({ acct: a, site: "www" })
    const answer = await form.submit({ title: "Created", privacy: "UNLISTED" })
    check(answer.kind === "answered" && answer.result.kind === "created" && answer.result.cache.kind === "unconfirmed", "confirmed creation preserves failed readback")
    deepStrictEqual(await form.status(), answer, "status retains confirmed creation after owner stops")
    transcript.push({ case: "failed-readback", answer, creates: h.h.runs("create").length })
    form.dispose()
  } finally {
    await h.dispose()
  }

  h = bridgeHarness({ delivery: "queued" })
  const creationEntered = deferred<void>()
  h.h.script(async (_tab, invocation) => {
    check(invocation.job.kind === "create", "lost-answer fixture runs only creation")
    creationEntered.resolve()
    return success({ playlistId: created })
  })
  try {
    const form = h.open(popup(), 1).creation({ acct: a, site: "www" })
    await h.flush()
    const answer = form.submit({ title: "Created", privacy: "PRIVATE" })
    await settle()
    const sent = h.network.queued()[0]
    check(sent, "submitted creation queued")
    sent.lose()
    const lost = await answer
    check(lost.kind === "failed", "lost creation answer is uncertain")
    await creationEntered.promise
    const before = h.h.runs("create").length
    deepStrictEqual(await form.submit({ title: "Retry would duplicate", privacy: "PUBLIC" }), lost, "lost answer does not resend")
    const status = form.status()
    await h.flush()
    const known = await status
    check(known.kind === "answered" && known.result.kind === "created", "status recovers actual operation result")
    check(h.h.runs("create").length === before && before === 1, "lost operation never retries write")
    transcript.push({ case: "lost-creation-answer", lost, status: known, creates: before })
    form.dispose()
    await h.flush()
  } finally {
    await h.dispose()
  }

  h = bridgeHarness()
  try {
    const raw = h.network.connect(popup())
    const envelope = { v: CONTRACT_VERSION, build: build(), id: "one-lookup", kind: "ui.syncedChoices", payload: { windowId: 1 } }
    const pending = Promise.all([raw.send(envelope), raw.send(envelope)])
    await settle()
    h.h.clock.advance(10_000)
    const [first, duplicate] = await pending
    deepStrictEqual(first, duplicate, "pending duplicate shares one answer")
    check(h.counts().syncReads === 1, "duplicate request handled once")
    await raw.send(envelope)
    check(h.counts().syncReads === 1, "completed duplicate never reexecutes")
    transcript.push({ case: "duplicate-request", first, duplicate, syncReads: h.counts().syncReads })
    const operation = "00000000-0000-4000-8000-000000000001"
    check(isCreationId(operation), "fixture operation identity")
    const backend = h.open(popup(), 1)
    await backend.call("ui.create", { action: "open", operation, acct: a, site: "www", windowId: 1 })
    const firstCreate = await backend.call("ui.create", { action: "submit", operation, title: "Created", privacy: "PRIVATE", windowId: 1 })
    const repeated = await backend.call("ui.create", { action: "submit", operation, title: "Different", privacy: "PUBLIC", windowId: 1 })
    deepStrictEqual(firstCreate, repeated, "repeated submission retains actual service handle")
    check(h.h.runs("create").length === 1, "repeated operation does not create again")
    check(firstCreate.kind === "answered" && isUiCreationAnswer(firstCreate.result), "valid creation wire answer")
    transcript.push({ case: "persistent-operation", answer: firstCreate, creates: h.h.runs("create").length })
  } finally {
    await h.dispose()
  }
  transcript.push({ case: "eof", nativeListeners: h.network.listening(), localListeners: h.counts().localListeners, deadlines: h.h.clock.pending })
  check(isJsonValue(transcript), "full consumer transcript is finite JSON")
  return transcript
}
export async function uiBridgeJson() {
  return `${JSON.stringify(await runUiBridgeConsumer(), null, 2)}\n`
}
if (import.meta.main) process.stdout.write(await uiBridgeJson())
