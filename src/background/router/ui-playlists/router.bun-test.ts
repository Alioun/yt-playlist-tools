import { expect, test } from "bun:test"
import { bridgeHarness, completedList, a, created, check, popup, settle, nativeTab, signedIn } from "../../../../tools/fixtures/ui-read-playlist-bridge/harness"
import { isCreationId } from "../../../shared/contracts/ui-playlists"
import { CONTRACT_VERSION } from "../../../shared/contracts/protocol"
import { build } from "../../../../tools/fixtures/ui-read-playlist-bridge/harness"
import { deferred } from "../../../../tools/fixtures/playlists-cache/harness"
import { createBackend } from "../../../ui/backend/core"
import { objectShape } from "../../../shared/contracts/object-shape"

const operation = "00000000-0000-4000-8000-000000000001"
check(isCreationId(operation), "fixture operation identity")

test("native authentication refuses forged senders without service work", async () => {
  const h = bridgeHarness()
  try {
    expect(await h.send({ windowId: 1 }, "ui.accountInView", { ...popup(), id: "forged" })).toBeUndefined()
    expect(h.h.calls).toHaveLength(0)
  } finally { await h.dispose() }
})
test("private requester never becomes a normal cache writer", async () => {
  const h = bridgeHarness()
  try {
    h.h.seedTab(nativeTab(9, { windowId: 2, incognito: true, active: true }), signedIn())
    const result = await completedList(h.open(popup(2), 2), { acct: a, site: "www", refresh: true, windowId: 2 })
    check(result.kind === "answered" && result.result.kind === "open" && result.result.refresh?.kind === "listed", "private list answered")
    expect(result.result.refresh.cache).toEqual({ kind: "caller-owned", reason: "private" })
    expect(h.h.cacheWrites).toBe(0)
    expect(h.h.runs("playlists").every(call => call.kind === "run" && call.tabId === 9)).toBe(true)
  } finally { await h.dispose() }
})
test("confirmed creation reports uncertain cache persistence", async () => {
  const h = bridgeHarness()
  try {
    h.h.fault("unreadable")
    const result = await h.open(popup(), 1).creation({ acct: a, site: "www" }).submit({ title: "Created", privacy: "PRIVATE" })
    check(result.kind === "answered" && result.result.kind === "created", "creation is confirmed independently")
    expect(result.result.id).toBe(created)
    expect(result.result.cache.kind).toBe("unconfirmed")
  } finally { await h.dispose() }
})
test("uncertain operation never creates a second service handle", async () => {
  const h = bridgeHarness()
  try {
    h.h.script(async () => ({ ok: false, reason: "unconfirmed" }))
    const backend = h.open(popup(), 1)
    await backend.call("ui.create", { action: "open", operation, acct: a, site: "www", windowId: 1 })
    const first = await backend.call("ui.create", { action: "submit", operation, title: "First", privacy: "PRIVATE", windowId: 1 })
    const second = await backend.call("ui.create", { action: "submit", operation, title: "Second", privacy: "PUBLIC", windowId: 1 })
    expect(second).toEqual(first)
    check(first.kind === "answered" && first.result.kind === "not-created", "uncertain creation retained")
    expect(h.h.runs("create")).toHaveLength(1)
  } finally { await h.dispose() }
})
test("invalid titles can be corrected without changing the creation operation", async () => {
  const h = bridgeHarness()
  try {
    const form = h.open(popup(), 1).creation({ acct: a, site: "www" })
    for (const [title, problem] of [["   ", "required"], ["<title>", "angle-brackets"], ["x".repeat(151), "too-long"]] as const) {
      expect(await form.submit({ title, privacy: "PRIVATE" })).toEqual({ kind: "answered", result: { kind: "invalid", problem } })
    }
    expect(h.h.runs("create")).toHaveLength(0)
    const corrected = await form.submit({ title: "  Corrected  ", privacy: "UNLISTED" })
    check(corrected.kind === "answered" && corrected.result.kind === "created", "corrected title creates")
    const run = h.h.runs("create")[0]
    check(run?.kind === "run" && run.invocation.job.kind === "create", "actual create job")
    expect(run.invocation.job.title).toBe("Corrected")
    expect(run.invocation.job.privacy).toBe("UNLISTED")
    expect(h.h.runs("create")).toHaveLength(1)
    form.dispose()
  } finally { await h.dispose() }
})
test("duplicate request invokes its handler at most once", async () => {
  const h = bridgeHarness()
  try {
    const sender = h.network.connect(popup())
    const message = { v: CONTRACT_VERSION, build: build(), id: "duplicate", kind: "ui.syncedChoices", payload: { windowId: 1 } }
    const pending = Promise.all([sender.send(message), sender.send(message)])
    await settle()
    h.h.clock.advance(10_000)
    const answers = await pending
    expect(answers[0]).toEqual(answers[1])
    expect(h.counts().syncReads).toBe(1)
    expect(await sender.send(message)).toBeUndefined()
    expect(h.counts().syncReads).toBe(1)
  } finally { await h.dispose() }
})
test("operation release defeats a delayed open and removes authority", async () => {
  const h = bridgeHarness({ delivery: "queued" })
  try {
    const backend = h.open(popup(), 1)
    const open = backend.call("ui.create", { action: "open", operation, acct: a, site: "www", windowId: 1 })
    const release = backend.call("ui.create", { action: "release", operation, windowId: 1 })
    const queue = h.network.queued(), releaseRequest = queue[1], openRequest = queue[0]
    check(releaseRequest && openRequest, "open and release queued")
    releaseRequest.deliver(); await settle(); await release
    openRequest.deliver(); await settle()
    expect(await open).toEqual({ kind: "answered", result: { kind: "unavailable", reason: "operation" } })
    const submit = backend.call("ui.create", { action: "submit", operation, title: "Too late", privacy: "PRIVATE", windowId: 1 })
    await h.flush()
    expect(await submit).toEqual({ kind: "answered", result: { kind: "unavailable", reason: "operation" } })
    expect(h.h.runs("create")).toHaveLength(0)
  } finally { await h.dispose() }
})
test("another native document cannot use a creation operation", async () => {
  const h = bridgeHarness()
  try {
    const backend = h.open(popup(), 1)
    await backend.call("ui.create", { action: "open", operation, acct: a, site: "www", windowId: 1 })
    const other = h.open({ ...popup(), documentId: "replacement-popup" }, 1)
    expect(await other.call("ui.create", { action: "submit", operation, title: "Forged", privacy: "PRIVATE", windowId: 1 }))
      .toEqual({ kind: "answered", result: { kind: "unavailable", reason: "operation" } })
    expect(h.h.runs("create")).toHaveLength(0)
  } finally { await h.dispose() }
})
test("form disposal suppresses a late creation answer", async () => {
  const h = bridgeHarness(), entered = deferred<void>(), answer = deferred<unknown>()
  try {
    h.h.script(async () => { entered.resolve(); return answer.promise })
    const backend = h.open(popup(), 1), form = backend.creation({ acct: a, site: "www" })
    const pending = form.submit({ title: "Created", privacy: "PRIVATE" })
    await entered.promise
    form.dispose()
    answer.resolve({ ok: true, route: "fixture", data: { playlistId: created } })
    expect(await pending).toEqual({ kind: "failed", failure: "disposed" })
    expect(await form.status()).toEqual({ kind: "failed", failure: "disposed" })
    expect(await form.submit({ title: "Again", privacy: "PUBLIC" })).toEqual({ kind: "failed", failure: "disposed" })
    expect(h.h.runs("create")).toHaveLength(1)
    backend.dispose(); await settle(); h.router.dispose()
    expect(h.network.listening()).toBe(0)
  } finally { answer.resolve({ ok: false, reason: "failed" }); await h.dispose() }
})
test("missing collaborators expose unavailable capability", async () => {
  const h = bridgeHarness({ unavailable: true })
  try {
    expect(await h.open(popup(), 1).call("ui.accountInView", { windowId: 1 })).toEqual({ kind: "answered", result: { kind: "unavailable", reason: "collaborator" } })
    expect(h.h.calls).toHaveLength(0)
  } finally { await h.dispose() }
})
test("malformed payloads never reach services", async () => {
  const h = bridgeHarness()
  try {
    for (const [kind, payload] of [
      ["ui.accountInView", { windowId: 1, acct: a }],
      ["ui.playlists", { action: "open", operation, windowId: 1, acct: a, site: "www", refresh: false, req: { incognito: false } }],
      ["ui.create", { action: "submit", operation, title: "Title", privacy: "FRIENDS", windowId: 1 }],
      ["ui.resolveChannel", { input: 12, windowId: 1 }]
    ] as const) expect(await h.send(payload, kind)).toBeUndefined()
    expect(h.h.calls).toHaveLength(0)
  } finally { await h.dispose() }
})
test("channel serving preserves no-tab and gateway account-change outcomes", async () => {
  const h = bridgeHarness()
  try {
    const backend = h.open(popup(), 1)
    h.h.tabs.clear()
    expect(await backend.call("ui.resolveChannel", { input: "@synthetic", windowId: 1 })).toEqual({ kind: "answered", result: { kind: "no-tab", attempted: [] } })
    h.h.seedTab()
    h.h.script(async () => ({ ok: false, reason: "accountChanged" }))
    const changed = await backend.call("ui.resolveChannel", { input: "@synthetic", windowId: 1 })
    check(changed.kind === "answered" && changed.result.kind === "result", "actual gateway answer retained")
    expect(changed.result.result).toEqual({ ok: false, reason: "accountChanged" })
  } finally { await h.dispose() }
})
test("channel transport failure preserves unknown delivery", async () => {
  const h = bridgeHarness()
  try {
    h.h.script(async () => { throw Error("Synthetic tab transport") })
    const answer = await h.open(popup(), 1).call("ui.resolveChannel", { input: "@synthetic", windowId: 1 })
    check(answer.kind === "answered" && answer.result.kind === "transport", "actual Tabs transport outcome")
    expect(answer.result.delivery).toBe("unknown")
    expect(answer.result.tabId).toBe(1)
  } finally { await h.dispose() }
})
test("Backend rejects malformed cross-kind wire answers", async () => {
  const backend = createBackend({
    local: { get: async () => ({}), onChanged: { addListener() {}, removeListener() {} } },
    async send(message) {
      if (!objectShape(message, { v: v => typeof v === "number", build: v => v === build(), id: v => typeof v === "string",
        kind: v => typeof v === "string", payload: () => true })) return undefined
      return { v: message.v, build: message.build, id: message.id, kind: message.kind, result: { kind: "created", id: created } }
    },
    access: { has: async () => true, request: async () => true, requestCombined: async () => ({ music: true, browserMenu: true }), hasBrowserMenu: async () => true }
  }, { build: build(), deadline: () => () => {} })
  try { expect(await backend.call("ui.accountInView", {})).toEqual({ kind: "failed", failure: "invalid-answer" }) }
  finally { backend.dispose() }
})
