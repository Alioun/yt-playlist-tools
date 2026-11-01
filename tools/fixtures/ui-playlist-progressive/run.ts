import { deepStrictEqual, equal } from "node:assert/strict"
import { flushSync } from "svelte"
import { PickerModel } from "../../../src/shared/picker/model.svelte"
import { pendingLists, pickerFixture, popup, a, alpha, beta, settle } from "./harness"

export async function progressiveConsumer() {
  const h = pendingLists(), operation = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
  const fixture = pickerFixture(operation, h.h.clock.wallNow)
  const picker = new PickerModel({ source: fixture.source, site: "www", mode: "save" })
  const transcript: unknown[] = []
  try {
    await h.entered; await settle(); flushSync()
    equal(h.resolved, false)
    deepStrictEqual(picker.rows.map(row => row.id), ["WL", beta, alpha], "actual PickerModel receives cached rows before native refresh")
    deepStrictEqual(picker.membership, { kind: "checking" })
    deepStrictEqual(await picker.tick(beta), { kind: "already-in" })
    equal(fixture.added, 1)
    transcript.push({ case: "cached-before-native-and-membership", rows: picker.rows.map(row => row.id), at: picker.list.at,
      membership: picker.membership, nativePending: !h.resolved, fixtureAdds: fixture.added })
    const refreshed = operation.freshList()
    h.resolve()
    const answer = await refreshed
    await settle(); flushSync()
    deepStrictEqual(picker.rows.map(row => row.title), ["Watch later", "Alpha refreshed"])
    equal(h.h.runs("playlists").length, 1)
    transcript.push({ case: "same-operation-refresh", answer, rows: picker.rows.map(row => row.title), jobs: h.h.runs("playlists").length })
  } finally { picker.close(); operation.dispose(); fixture.membership.resolve({ kind: "unreadable" }); await h.dispose() }
  equal(h.network.listening(), 0); equal(h.counts().localListeners, 0); equal(h.h.clock.pending, 0)
  transcript.push({ case: "eof", nativeListeners: h.network.listening(), localListeners: h.counts().localListeners, deadlines: h.h.clock.pending })
  return JSON.stringify(transcript) + "\n"
}
if (import.meta.main) process.stdout.write(await progressiveConsumer())
