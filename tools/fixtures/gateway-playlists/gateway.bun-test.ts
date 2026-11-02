import { test } from "bun:test"
import { isBreakageSignal } from "../../../src/shared/contracts"
import { createGateway } from "../../../src/page/gateway"
import { wwwGateway } from "../../../src/page/gateway/www"
import { createLanes } from "../../../src/page/gateway/lanes"
import { syntheticIdentity } from "../../../src/page/gateway.specimens"
import { field } from "../../../src/page/read-parsers"
import { added, channel, check, Clock, deferred, drain, emptyMembership, entry, held, identity, membership, playlist,
  recorded, response, same, secondEntry, secondVideo, unconfirmed, unavailable, video } from "./specimens"

test("www routes preserve command service signed order and exact edit fields", async () => {
  const p = recorded()
  p.scripts.push(() => ({ kind: "not-sent", cause: "missing" }), () => ({ kind: "not-sent", cause: "preflight" }), response(added()))
  const result = await p.gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  same(p.calls.map(call => call.via), ["command", "service", "signed"], "Route order changed")
  same(p.calls[2]?.spec.body, { playlistId: playlist, actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: video }], params: "IAE%3D" }, "Exact add fields changed")
  check(result.ok && result.data.setVideoId === entry, "Confirmed occurrence was lost")
  p.gateway.dispose(); check(p.clock.count === 0, "Deadline leaked")
})

test("both sites share membership save removal and create parsing", async () => {
  for (const site of ["www", "music"] as const) {
    const p = recorded(site)
    p.scripts.push(response(membership()), response(added()), response({ ...identity(), status: "STATUS_SUCCEEDED" }), response({ ...identity(), playlistId: playlist }))
    const rows = await p.gateway.run({ kind: "membership", videoId: video })
    check(rows.ok && rows.data[0]?.contains === false && rows.data[0]?.count === 3 && rows.data[0]?.privacy === "PRIVATE", "Membership metadata changed")
    same(p.calls[0]?.spec.body, { videoIds: [video], excludeWatchLater: false }, "Membership request fields changed")
    const saved = await p.gateway.run(site === "www" ? { kind: "add", playlistId: playlist, videoId: video } : { kind: "save", playlistId: playlist, videoId: video })
    check(saved.ok && saved.data.setVideoId === entry, "Site save parser differs")
    const removed = await p.gateway.run(site === "www" ? { kind: "remove", playlistId: playlist, setVideoId: entry } : { kind: "unsave", playlistId: playlist, setVideoId: entry })
    check(removed.ok && removed.data === null, "Site removal parser differs")
    const created = await p.gateway.run({ kind: "create", title: "  Created list  ", privacy: "UNLISTED", videoId: video })
    check(created.ok && created.data.playlistId === playlist, "Create lost validated ID")
    const createCall = p.calls[3]
    check(createCall?.via === (site === "www" ? "service" : "music"), "Create used a command or foreign route")
    same(createCall.spec.body, { title: "Created list", privacyStatus: "UNLISTED", videoIds: [video] }, "Create was split or changed")
    p.gateway.dispose()
  }
})

test("uncertain writes never fall back after throws rejections or lost answers", async () => {
  for (const mode of ["sync", "prepare-rejection", "answer-rejection", "timeout"] as const) {
    const p = recorded(), waiting = held()
    p.scripts.push(mode === "sync" ? () => { throw new Error("Unclassified hook error") } :
      mode === "prepare-rejection" ? () => Promise.reject(new Error("Unclassified async error")) :
      mode === "answer-rejection" ? () => ({ kind: "pending", answer: Promise.reject(new Error("Answer lost")), cancel() {} }) : waiting.script,
      response(added()))
    const result = p.gateway.run({ kind: "add", playlistId: playlist, videoId: video })
    await drain()
    if (mode === "timeout") p.clock.advance(3400)
    same(await result, unconfirmed, "Uncertain write was confirmed or retried")
    check(p.calls.length === 1, "Uncertain write was retried")
    p.gateway.dispose(); check(p.clock.count === 0, "Uncertain write leaked deadlines")
  }
})

test("HTTP and application rejections stop fallback including HTTP 200 failure", async () => {
  for (const [http, status] of [[200, "STATUS_FAILED"], [403, "STATUS_FAILED"], [429, "STATUS_FAILED"], [200, "STATUS_FEATURE_NOT_ENABLED"]] as const) {
    const p = recorded()
    p.scripts.push(response({ ...identity(), status }, http), response(added()))
    const result = await p.gateway.run({ kind: "add", playlistId: playlist, videoId: video })
    check(!result.ok && result.reason === "failed" && result.http === http && result.status === status, "Answered rejection became success")
    check(p.calls.length === 1, "Answered rejection fell back")
    p.gateway.dispose()
  }
})

test("read timeout falls back and late identity mismatch stays latched", async () => {
  const p = recorded(), waiting = held()
  p.scripts.push(waiting.script, response(membership()))
  const reading = p.gateway.run({ kind: "membership", videoId: video })
  await drain(); p.clock.advance(5100); await drain()
  check((await reading).ok && p.calls.length === 2, "Read timeout did not fall back")
  waiting.answer.resolve({ http: 403, body: { ...identity("synthetic-other-account"), status: "STATUS_FAILED" } })
  await drain()
  const result = await p.gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  check(!result.ok && result.reason === "accountChanged" && p.calls.length === 2, "Late mismatch did not latch")
  p.gateway.dispose()
})

test("playlist lane is FIFO and queued expiry prevents a second dispatch", async () => {
  const p = recorded(), waiting = held()
  p.scripts.push(waiting.script, response(added()))
  const first = p.gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  const second = p.gateway.run({ kind: "add", playlistId: playlist, videoId: secondVideo })
  await drain(); check(p.calls.length === 1, "Playlist jobs overlapped")
  p.clock.advance(10_001); await drain()
  check(!(await first).ok && !(await second).ok && p.calls.length === 1, "Expired queued work started")
  waiting.answer.resolve({ http: 200, body: added() }); await drain()
  check(p.calls.length === 1, "Late answer reopened an expired job")
  p.gateway.dispose()
})

test("direct reads bypass the request lane and reusable app-state lane is independent", async () => {
  const p = recorded(), waiting = held()
  p.scripts.push(waiting.script)
  const pending = p.gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  await drain()
  let readFinished = false
  const direct = p.gateway.run({ kind: "videoInfo" }).then(result => { readFinished = result.ok })
  await drain()
  check(readFinished, "Request lane blocked a direct read")
  p.clock.advance(10_001); await pending; await direct; p.gateway.dispose()
  const clock = new Clock(), lanes = createLanes(clock), blocker = deferred<string>(), order: string[] = []
  const app = lanes.run("app-state", async () => { order.push("app"); return blocker.promise })
  const playlistWork = lanes.run("playlist", async () => { order.push("playlist"); return "done" })
  same(await playlistWork, "done", "Playlist waited behind app state")
  same(order, ["app", "playlist"], "Lane start order changed")
  blocker.resolve("done"); await app; lanes.dispose(); check(clock.count === 0, "Lane disposal leaked timers")
})

test("missing signed-out and mismatched identities refuse account jobs without dispatch", async () => {
  for (const mode of ["missing", "signed-out", "mismatched"] as const) {
    const p = recorded()
    p.gateway.dispose()
    p.page.config.LOGGED_IN = mode === "signed-out" ? false : true
    p.page.config.DATASYNC_ID = mode === "missing" ? undefined : syntheticIdentity
    const gateway = createGateway({ site: wwwGateway, page: p.page.port, requests: p.port, clock: p.clock })
    if (mode === "mismatched") p.page.config.DATASYNC_ID = "changed-synthetic-account"
    const result = await gateway.run({ kind: "add", playlistId: playlist, videoId: video })
    check(!result.ok && result.reason === (mode === "missing" ? "unavailable" : mode === "signed-out" ? "signedOut" : "accountChanged"), "Account preflight changed")
    check(p.calls.length === 0, "Account preflight sent a request")
    gateway.dispose()
  }
})

test("response identity precedes error status and missing www identity is unavailable", async () => {
  const p = recorded()
  p.scripts.push(response({ ...identity("different-synthetic-account"), status: "STATUS_FAILED" }, 500))
  const result = await p.gateway.run({ kind: "membership", videoId: video })
  check(!result.ok && result.reason === "accountChanged", "Error status hid changed identity")
  const later = await p.gateway.run({ kind: "membership", videoId: video })
  check(!later.ok && later.reason === "accountChanged" && p.calls.length === 1, "Mismatch did not remain sticky")
  p.gateway.dispose()
  const missing = recorded()
  missing.scripts.push(response({ status: "STATUS_SUCCEEDED" }))
  same(await missing.gateway.run({ kind: "membership", videoId: video }), unavailable, "Missing response identity was trusted")
  missing.gateway.dispose()
  const music = recorded("music")
  music.scripts.push(response({ contents: [{ playlistAddToPlaylistRenderer: { contents: [] } }] }))
  check((await music.gateway.run({ kind: "membership", videoId: video })).ok, "Provisional Music missing-response-identity rule changed")
  music.gateway.dispose()
})

test("configuration is rechecked after asynchronous route preflight", async () => {
  const p = recorded(), admission = deferred<void>()
  let writes = 0
  p.scripts.push(async call => {
    await admission.promise
    const failure = call.context.check()
    if (failure) return { kind: "blocked", failure }
    writes++; return { kind: "pending", answer: Promise.resolve({ http: 200, body: added() }), cancel() {} }
  })
  const result = p.gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  await drain(); p.page.config.DATASYNC_ID = "preflight-changed-synthetic-account"; admission.resolve(); await drain()
  const answer = await result
  check(!answer.ok && answer.reason === "accountChanged" && writes === 0, "Async preflight wrote for a changed account")
  p.gateway.dispose()
})

test("view models resolve entity references and preserve Save-dialog order", async () => {
  const p = recorded()
  p.scripts.push(response({ ...identity(), contents: [{ playlistAddToPlaylistViewModel: { items: [
    { playlistAddToOptionViewModel: { playlistEntityKey: "list-entity", title: { content: "Entity title" } } },
    { playlistAddToOptionRenderer: { playlistId: "WL", title: { simpleText: "Watch Later" }, containsSelectedVideos: "NONE" } }
  ] } }], frameworkUpdates: { entityBatchUpdate: { mutations: [{ entityKey: "list-entity", payload: { playlistEntity: {
    playlistId: playlist, selected: true, privacy: "UNLISTED", videoCount: 7
  } } }] } } }))
  const result = await p.gateway.run({ kind: "membership", videoId: video })
  check(result.ok, "Entity membership was not parsed")
  same(result.data.map(row => ({ id: row.id, contains: row.contains })), [{ id: playlist, contains: true }, { id: "WL", contains: false }], "Save order or entity state changed")
  check(result.data[0]?.privacy === "UNLISTED" && result.data[0]?.count === 7, "Entity metadata was dropped")
  p.gateway.dispose()
})

test("playlist pagination deduplicates Watch Later and preserves optional metadata", async () => {
  const p = recorded()
  p.scripts.push(response(membership()), response({ ...identity(), contents: [{ gridRenderer: { items: [
    { gridPlaylistRenderer: { playlistId: playlist, title: { simpleText: "First" }, videoCount: 3, thumbnail: { thumbnails: [{ url: "https://example.invalid/thumb" }] } } },
    { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "synthetic-next-page" } } } }
  ] } }] }), response({ ...identity(), onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [
    { gridPlaylistRenderer: { playlistId: "WL", title: { simpleText: "Watch Later" } } },
    { gridPlaylistRenderer: { playlistId: playlist, title: { simpleText: "Duplicate" } } }
  ] } }] }))
  await p.gateway.run({ kind: "membership", videoId: video })
  const result = await p.gateway.run({ kind: "playlists" })
  check(result.ok && result.data.length === 2 && result.data.filter(row => row.id === "WL").length === 1, "Playlist order or WL deduplication changed")
  check(result.data[0]?.privacy === "PRIVATE" && result.data[0]?.count === 3 && result.data[0]?.thumb !== undefined, "Optional listing metadata was dropped")
  same(p.calls[1]?.spec.body, { browseId: "FEplaylist_aggregation" }, "Wrong playlist browse request")
  same(p.calls[2]?.spec.body, { continuation: "synthetic-next-page" }, "Wrong continuation request")
  p.gateway.dispose()
})

test("unknown shapes repeated continuations and continuation account changes fail", async () => {
  for (const mode of ["unknown", "repeated", "account"] as const) {
    const p = recorded()
    const page = { ...emptyMembership(), continuations: [{ nextContinuationData: { continuation: "repeat-token" } }] }
    p.scripts.push(response(mode === "unknown" ? { ...identity(), contents: [] } : page))
    if (mode !== "unknown") p.scripts.push(response(mode === "repeated" ? page : { ...page, ...identity("continuation-other-account") }, mode === "account" ? 403 : 200))
    const result = await p.gateway.run({ kind: "membership", videoId: video })
    check(!result.ok && result.reason === (mode === "account" ? "accountChanged" : "unavailable"), "Invalid paging became an empty success")
    check(p.calls.length <= 2, "Continuation loop was not bounded")
    p.gateway.dispose()
  }
})

test("confirmed missing occurrence uses video fallback and uncertainty never does", async () => {
  const p = recorded()
  p.scripts.push(response(added(null)), response({ ...identity(), status: "STATUS_SUCCEEDED" }))
  const result = await p.gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  check(result.ok && result.data.setVideoId === null, "Confirmed missing ID did not normalize to null")
  check((await p.gateway.run({ kind: "remove", playlistId: playlist, videoId: video })).ok, "Missing-ID fallback removal failed")
  same(field(p.calls[1]?.spec.body, "actions"), [{ action: "ACTION_REMOVE_VIDEO", removedVideoId: video }], "Video fallback was not explicit")
  p.gateway.dispose()
})

test("batch outcomes are correlated in input order and preserve partial refusal facts", async () => {
  const p = recorded()
  p.scripts.push(response({ ...identity(), status: "STATUS_FAILED", playlistEditResults: [
    { playlistEditVideoResultData: { videoId: secondVideo, status: "STATUS_VIDEO_ALREADY_IN_PLAYLIST" } },
    { playlistEditVideoAddedResultData: { videoId: video, setVideoId: entry } }
  ] }))
  const result = await p.gateway.run({ kind: "addBatch", playlistId: playlist, videoIds: [video, secondVideo] })
  check(result.ok, "Partial batch facts were dropped")
  same(result.data.results, [{ videoId: video, setVideoId: entry }, { videoId: secondVideo, failure: { ok: false, reason: "failed", status: "STATUS_VIDEO_ALREADY_IN_PLAYLIST" } }], "Batch correlations or refusal facts changed")
    const actions = p.calls[0]?.spec.body.actions
    check(p.calls.length === 1 && Array.isArray(actions) && actions.length === 2, "Batch was split")
  p.gateway.dispose()
})

test("aggregate batch success never confirms individual additions", async () => {
  const p = recorded()
  p.scripts.push(response({ ...identity(), status: "STATUS_SUCCEEDED" }))
  same(await p.gateway.run({ kind: "addBatch", playlistId: playlist, videoIds: [video, secondVideo] }), unconfirmed, "Aggregate batch success manufactured confirmed entries")
  check(p.calls.length === 1, "Uncorrelated batch was retried")
  p.gateway.dispose()
})

test("removeBatch uses exact entry IDs and confirms each removal", async () => {
  const p = recorded()
  p.scripts.push(response({ ...identity(), status: "STATUS_SUCCEEDED", playlistEditResults: [
    { playlistEditVideoRemovedResultData: { setVideoId: entry, status: "STATUS_SUCCEEDED" } },
    { playlistEditVideoRemovedResultData: { setVideoId: secondEntry, status: "STATUS_VIDEO_NOT_FOUND" } }
  ] }))
  const result = await p.gateway.run({ kind: "removeBatch", playlistId: playlist, setVideoIds: [entry, secondEntry] })
  check(result.ok && result.data.removed === 2, "Exact batch removals were not confirmed")
  same(p.calls[0]?.spec.body.actions, [{ action: "ACTION_REMOVE_VIDEO", setVideoId: entry }, { action: "ACTION_REMOVE_VIDEO", setVideoId: secondEntry }], "Batch remove IDs changed")
  p.gateway.dispose()
})

test("create validates the provisional title limit without sending invalid input", async () => {
  for (const title of [" ", "x".repeat(151), "bad<title>"]) {
    const p = recorded()
    const result = await p.gateway.run({ kind: "create", title, privacy: "PRIVATE" })
    check(!result.ok && p.calls.length === 0, "Invalid create title was sent")
    p.gateway.dispose()
  }
  const p = recorded()
  p.scripts.push(response({ ...identity(), playlistId: playlist }))
  check((await p.gateway.run({ kind: "create", title: "x".repeat(150), privacy: "PUBLIC" })).ok, "150-character title was refused")
  p.gateway.dispose()
})

test("plain channel fallback and bounded channel resolution use the playlist lane", async () => {
  const p = recorded()
  p.page.values.watchPlayer = undefined; p.page.values.navigation = undefined
  p.scripts.push(response({ contents: [{ videoOwnerRenderer: { title: { simpleText: "Channel" }, navigationEndpoint: { browseEndpoint: { browseId: channel } } } }] }),
    response({ endpoint: { urlEndpoint: { url: "/@synthetic" } } }),
    response({ endpoint: { commandMetadata: { webCommandMetadata: { webPageType: "WEB_PAGE_TYPE_CHANNEL" } }, browseEndpoint: { browseId: channel } } }),
    response({ metadata: { channelMetadataRenderer: { title: "Channel", externalId: channel, vanityChannelUrl: "https://www.youtube.com/@synthetic" } } }))
  const owner = await p.gateway.run({ kind: "channelOf", videoId: video })
  check(owner.ok && owner.data.channelId === channel && p.calls[0]?.via === "plain" && p.calls[0]?.spec.path === "next", "Channel request fallback failed")
  const resolved = await p.gateway.run({ kind: "resolveChannel", input: "@start" })
  check(resolved.ok && resolved.data.channelId === channel && resolved.data.handle === "@synthetic", "Channel URL resolution failed")
  check(p.calls.length === 4, "Channel resolve request count changed")
  p.gateway.dispose()
})

test("signals exclude raw secret-like values identities and response text", async () => {
  const p = recorded(), marker = ["dummy", "private", "material"].join("-")
  p.scripts.push(response({ ...identity(), debug: marker, status: marker, headers: { Authorization: marker } }))
  await p.gateway.run({ kind: "membership", videoId: video })
  check(p.signals.length > 0, "Unrecognised shape did not produce structural diagnostics")
  const serialized = JSON.stringify(p.signals)
  check(!serialized.includes(marker) && !serialized.includes(syntheticIdentity) && !serialized.includes("Authorization"), "Raw secret reached a signal")
  check(p.signals.every(signal => isBreakageSignal(signal, p.gateway.vocabulary)), "Signal violated the shared structural contract")
  p.gateway.dispose()
})

test("missing Music internals remain unavailable and never call www routes", async () => {
  const p = recorded("music")
  p.available.clear()
  same(await p.gateway.run({ kind: "save", playlistId: playlist, videoId: video }), unavailable, "Missing Music machinery became a successful stub")
  check(p.calls.length === 0, "Music crossed into www fallback")
  check(!(await p.gateway.run({ kind: "queueRemove", id: checkedQueueId() })).ok, "Deferred queue job became available")
  p.gateway.dispose()
})

test("malformed empty containers do not invent empty successful lists", async () => {
  for (const [job, body] of [
    [{ kind: "membership", videoId: video }, { playlistAddToPlaylistRenderer: { unknown: [] } }],
    [{ kind: "membership", videoId: video }, { playlistAddToPlaylistRenderer: { contents: [{ unknown: true }] } }],
    [{ kind: "playlists" }, { contents: [{ gridRenderer: { unknown: [] } }] }],
    [{ kind: "playlists" }, { contents: [{ gridRenderer: { items: [{ unknown: true }] } }] }]
  ] as const) {
    const p = recorded()
    p.scripts.push(response({ ...identity(), ...body }))
    check(!(await p.gateway.run(job)).ok, "Malformed empty container became success")
    p.gateway.dispose()
  }
})

test("synthetic toggleable view-model shape resolves saveToPlaylistListEntity selection", async () => {
  const p = recorded()
  p.scripts.push(response({ ...identity(), contents: [{ toggleableListItemViewModel: {
    title: { content: "Referenced list" }, toggleStateKey: "fixture-state", defaultServiceEndpoint: { playlistEditEndpoint: { playlistId: playlist } }
  } }], frameworkUpdates: { entityBatchUpdate: { mutations: [{ entityKey: "fixture-state", payload: {
    saveToPlaylistListEntity: { isSelected: true }
  } }] } } }))
  const result = await p.gateway.run({ kind: "membership", videoId: video })
  check(result.ok && result.data[0]?.id === playlist && result.data[0]?.contains === true && result.data[0]?.title === "Referenced list", "Referenced selection was not parsed")
  p.gateway.dispose()
})

test("50-action batch stays one request and 51 inputs send nothing", async () => {
  const p = recorded()
  const videos = Array.from({ length: 50 }, () => video)
  p.scripts.push(response({ ...identity(), status: "STATUS_SUCCEEDED", playlistEditResults: videos.map((videoId, actionIndex) => ({
    actionIndex, playlistEditVideoAddedResultData: { videoId, setVideoId: `fixture-entry-${actionIndex}` }
  })) }))
  const result = await p.gateway.run({ kind: "addBatch", playlistId: playlist, videoIds: videos })
  check(result.ok && result.data.results.length === 50 && result.data.results.every(row => row.setVideoId !== undefined), "50-action correlated batch failed")
  const actions = p.calls[0]?.spec.body.actions
  check(Array.isArray(actions) && actions.length === 50, "Batch actions were split or dropped")
  const over = await p.gateway.run({ kind: "addBatch", playlistId: playlist, videoIds: [...videos, video] })
  check(!over.ok && p.calls.length === 1, "Over-limit batch was dispatched")
  p.gateway.dispose()
})

test("ambiguous duplicate-video batch answers never invent occurrence correlation", async () => {
  const p = recorded()
  p.scripts.push(response({ ...identity(), status: "STATUS_SUCCEEDED", playlistEditResults: [
    { playlistEditVideoAddedResultData: { videoId: video, setVideoId: entry } },
    { playlistEditVideoAddedResultData: { videoId: video, setVideoId: secondEntry } }
  ] }))
  const result = await p.gateway.run({ kind: "addBatch", playlistId: playlist, videoIds: [video, video] })
  check(result.ok && result.data.results.every(row => row.failure?.reason === "unconfirmed"), "Ambiguous occurrence correlation became confirmed")
  p.gateway.dispose()
})

test("unavailable account labels use the explicit local label fallback", async () => {
  for (const site of ["www", "music"] as const) {
    const p = recorded(site)
    p.available.clear()
    const result = await p.gateway.run({ kind: "accountLabel" })
    check(result.ok && result.data.name === "Unnamed account" && result.route === "page-read.account-label-default" && p.calls.length === 0, "Local label fallback changed")
    p.gateway.dispose()
  }
})

import { isQueueItemId } from "../../../src/shared/contracts"
function checkedQueueId() { const id = 1; check(isQueueItemId(id), "Invalid queue specimen"); return id }
