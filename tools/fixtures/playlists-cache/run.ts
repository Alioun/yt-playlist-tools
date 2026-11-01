import { deepStrictEqual } from "node:assert/strict"
import expected from "./expected.json"
import type { JsonObject } from "../../../src/shared/contracts/json"
import { world, a, alpha, beta, created, video, oldCache, normalRequest, origin, deferred, success } from "./harness"

function consumerSeed() {
  const local: JsonObject = {
    schema: 1, device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, lastAccount: a },
    sync: { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true },
    "doc:settings": { v: 1, gen: "settings", at: 1, by: "fixture", data: {} },
    [`doc:setup:${a}`]: { v: 1, gen: "setup", at: 1, by: "fixture", data: { quickSave: alpha, marks: { [alpha]: "missing" } } },
    [`cache:${a}`]: structuredClone(oldCache), preserved: { keep: true }
  }
  return { local, session: { unknown: { keep: true } }, sync: {} }
}
export async function runSession() {
  const h = world(consumerSeed()), transcript: unknown[] = []
  const entered = deferred<void>(), list = deferred<unknown>(), lateEntered = deferred<void>(), late = deferred<unknown>()
  let delayed = false
  try {
    h.seedTab()
    h.script(async (_tab, invocation) => {
      switch (invocation.job.kind) {
        case "playlists": if (delayed) { lateEntered.resolve(); return late.promise } else { entered.resolve(); return list.promise }
        case "membership": return success([{ id: alpha, title: "Member alpha", privacy: "PRIVATE", count: 777, contains: true }, { id: beta, title: "Member beta", contains: false }])
        case "create": return success({ playlistId: created })
        default: throw Error("Unexpected consumer job")
      }
    })
    const first = await h.playlists.list(a, normalRequest)
    if (first.kind !== "open" || !first.refresh) throw Error("Expected pending first open")
    let settled = false
    void first.refresh.then(() => { settled = true })
    transcript.push({ step: "cached-first", cached: first.cached, freshness: first.freshness, pending: !settled })
    await entered.promise
    const second = await h.playlists.list(a, { ...normalRequest, refresh: true })
    if (second.kind !== "open" || !second.refresh) throw Error("Expected joined open")
    transcript.push({ step: "coalesced", cached: second.cached, requests: h.runs("playlists").length })
    list.resolve(success([{ id: alpha, title: "Refreshed alpha", count: 2 }]))
    transcript.push({ step: "refreshed", first: await first.refresh, second: await second.refresh })
    const capture = await h.playlists.capture(a, normalRequest)
    if (capture.kind !== "eligible") throw Error("Expected membership capture")
    const membership = await h.engine.runIn(1, { job: { kind: "membership", videoId: video }, acct: a },
      { site: "www", req: normalRequest.req, account: { kind: "account", acct: a, signedIn: true } })
    if (membership.kind !== "result" || !membership.result.ok) throw Error("Expected actual membership result")
    const absorbed = await h.playlists.absorb(capture, { kind: "membership", rows: membership.result.data })
    transcript.push({ step: "membership", outcome: membership, receipt: absorbed, stored: h.stored()[`cache:${a}`], setup: h.stored()[`doc:setup:${a}`] })
    const creation = h.playlists.create(a, normalRequest)
    transcript.push({ step: "created", answer: await creation.submit({ title: "  Created  ", privacy: "PRIVATE", videoId: video }), requests: h.runs("create").length })
    h.tabs.clear(); h.pings.clear()
    const noTab = await h.playlists.list(a, { ...normalRequest, refresh: true })
    if (noTab.kind !== "open" || !noTab.refresh) throw Error("Expected no-tab refresh answer")
    transcript.push({ step: "no-tab", answer: await noTab.refresh })
    h.seedTab(); delayed = true
    const pending = await h.playlists.list(a, { ...normalRequest, refresh: true })
    if (pending.kind !== "open" || !pending.refresh) throw Error("Expected delayed refresh")
    await lateEntered.promise
    const removal = await h.owner.prepareAccountRemoval(origin, a)
    if (removal.kind !== "confirmation-required") throw Error("Expected actual removal confirmation")
    const removed = await h.owner.removeAccountSetup(origin, removal.confirmation)
    late.resolve(success([{ id: alpha, title: "Late alpha" }]))
    transcript.push({ step: "removed-during-read", removal: removed, late: await pending.refresh, finalState: h.removal.state() })
    transcript.push({ step: "eof", runs: { playlists: h.runs("playlists").length, membership: h.runs("membership").length, create: h.runs("create").length },
      cacheWrites: h.cacheWrites, clockPending: h.clock.pending })
    deepStrictEqual(transcript, expected, "complete owner, Playlists and Tabs session through EOF")
    return transcript
  } finally {
    list.resolve({ ok: false, reason: "failed" }); late.resolve({ ok: false, reason: "failed" }); await h.dispose()
  }
}
if (import.meta.main) process.stdout.write(`${JSON.stringify(await runSession(), null, 2)}\n`)
