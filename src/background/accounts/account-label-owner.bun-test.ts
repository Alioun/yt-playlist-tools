import { expect, test } from "bun:test"
import { PlaylistCacheCapture } from "../store/playlist-cache"
import { ACCOUNT_LABEL_MS, type AccountLabelSeen } from "../store/account-label"
import { a, b, epoch, seed, world, object } from "../../../tools/fixtures/accounts-label/harness"

function lookup(value: AccountLabelSeen): Extract<AccountLabelSeen, { kind: "lookup" }> {
  if (value.kind !== "lookup") throw Error("Expected real owner label reservation")
  return value
}
test("the direct owner refuses private bookkeeping before any read or write", async () => {
  const h = world()
  try {
    const result: unknown = await Reflect.apply(h.owner.seeAccountLabel, h.owner, [{ acct: a, private: true, at: epoch }])
    expect(result).toEqual({ kind: "refused", reason: "private" })
    expect(h.reads).toBe(0)
    expect(h.writes).toBe(0)
  } finally { await h.dispose() }
})
test("forged, wrong-account and reused captures cannot update a Setup", async () => {
  const h = world()
  try {
    expect(await h.owner.completeAccountLabel(new PlaylistCacheCapture(a), { acct: a, label: { name: "Forged" } })).toEqual({ kind: "stale" })
    const captured = lookup(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    expect(await h.owner.completeAccountLabel(captured.capture, { acct: b, label: { name: "Wrong account" } })).toEqual({ kind: "stale" })
    expect((await h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Actual" } })).kind).toBe("committed")
    expect(await h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Repeated" } })).toEqual({ kind: "stale" })
    expect(h.label()).toEqual({ name: "Actual" })
    expect(h.label(b)).toEqual({ name: "Other" })
  } finally { await h.dispose() }
})
test("independent queued account labels retain both complete records", async () => {
  const h = world()
  try {
    const first = lookup(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    const second = lookup(await h.owner.seeAccountLabel({ acct: b, private: false, at: epoch }))
    const results = await Promise.all([
      h.owner.completeAccountLabel(first.capture, { acct: a, label: { name: "First" } }),
      h.owner.completeAccountLabel(second.capture, { acct: b, label: { name: "Second" } })
    ])
    expect(results.map(result => result.kind)).toEqual(["committed", "committed"])
    expect(h.label()).toEqual({ name: "First" })
    expect(h.label(b)).toEqual({ name: "Second" })
    expect(h.stored().lastAccount).toBe(b)
  } finally { await h.dispose() }
})
test("a newer label or newer reserved check refuses an old completion without mutation", async () => {
  for (const change of ["label", "check"] as const) {
    const h = world()
    try {
      const first = lookup(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
      if (change === "label") h.removal.foreign(state => { object(object(state.local[`doc:setup:${a}`]).data).label = { name: "Already newer" } })
      else await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch + ACCOUNT_LABEL_MS })
      const before = h.stored()
      expect(await h.owner.completeAccountLabel(first.capture, { acct: a, label: { name: "Late" } })).toEqual({ kind: "stale" })
      expect(h.stored()).toEqual(before)
    } finally { await h.dispose() }
  }
})
test("unknown label extensions neither cause redundant generations nor disappear on a real change", async () => {
  const initial = seed()
  object(object(initial.local[`doc:setup:${a}`]).data).label = { name: "Original", extension: { keep: true } }
  const h = world(initial)
  try {
    const first = lookup(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    expect((await h.owner.completeAccountLabel(first.capture, { acct: a, label: { name: "Original" } })).kind).toBe("current")
    expect(h.removal.counts().generations).toBe(0)
    const next = lookup(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch + ACCOUNT_LABEL_MS }))
    expect((await h.owner.completeAccountLabel(next.capture, { acct: a, label: { name: "Changed" } })).kind).toBe("committed")
    expect(h.label()).toEqual({ name: "Changed", extension: { keep: true } })
  } finally { await h.dispose() }
})

function syncedSeed(reason: "sync-full" | "update-needed") {
  const initial = seed()
  object(initial.local.device).syncOn = true
  initial.local.sync = { joined: "history", pushed: { "doc:settings": "original", [`doc:setup:${a}`]: "original", [`doc:setup:${b}`]: "original" }, status: "ok", editedSinceOff: false, everEdited: true }
  initial.sync = { "s:meta": { v: 1, id: "history", created: 0 }, "s:settings": structuredClone(initial.local["doc:settings"]!),
    [`s:setup:${a}`]: structuredClone(initial.local[`doc:setup:${a}`]!), [`s:setup:${b}`]: structuredClone(initial.local[`doc:setup:${b}`]!) }
  if (reason === "sync-full") for (let index = 0; index < 600; index++) initial.sync[`retained:${index}`] = "keep"
  else object(initial.sync[`s:setup:${a}`]).v = 2
  return initial
}

test("the real Setup admission returns update-needed without applying the label", async () => {
  const initial = syncedSeed("update-needed"), h = world(initial)
  try {
    const captured = lookup(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    expect(await h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Refused" } })).toEqual({ kind: "setup", result: { kind: "result", result: { refused: "update-needed" } } })
    expect(h.stored()[`doc:setup:${a}`]).toEqual(initial.local[`doc:setup:${a}`])
    expect(h.removal.state().sync).toEqual(initial.sync)
  } finally { await h.dispose() }
})

test("past the browsers' sync limit the label is saved here and waits for room, with the synced copy untouched (SYNC-16)", async () => {
  const initial = syncedSeed("sync-full"), h = world(initial)
  try {
    const captured = lookup(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    expect(await h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Kept" } })).toMatchObject({ kind: "committed", label: { name: "Kept" } })
    const setup = object(h.stored()[`doc:setup:${a}`])
    expect(object(setup.data).label).toMatchObject({ name: "Kept" })
    expect(object(h.stored().sync).deferred).toEqual({ [`doc:setup:${a}`]: setup.gen as string })
    expect(h.removal.state().sync).toEqual(initial.sync)
  } finally { await h.dispose() }
})

test("unreadable device authority and owner disposal refuse pending labels", async () => {
  for (const change of ["authority", "dispose"] as const) {
    const h = world()
    try {
      const captured = lookup(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
      if (change === "authority") h.removal.foreign(state => { object(state.local.device).consent = null })
      else await h.owner.dispose()
      const before = h.stored()
      expect((await h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Denied" } })).kind).toBe("setup")
      expect(h.stored()).toEqual(before)
    } finally { await h.dispose() }
  }
})
