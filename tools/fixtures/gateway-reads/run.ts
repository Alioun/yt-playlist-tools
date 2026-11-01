import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createGateway } from "../../../src/page/gateway"
import { readRoutes, readVocabulary, readWatches } from "../../../src/page/read-port"
import { rawMusicPlayer, rawSong, scriptedPage, syntheticIdentity, syntheticVideo } from "../../../src/page/gateway.specimens"
import { servePage } from "../../../src/page/channel"
import { isBuildId, isPageType } from "../../../src/shared/contracts"
import type { Site, Stream, StreamData } from "../../../src/shared/contracts"
import type { PageHelloSnapshot } from "../../../src/shared/contracts/page"
import { createDirectPageChannel, createDomPageChannel } from "../../../src/shared/rpc/page-channel"
import type { PageChannel } from "../../../src/shared/rpc/page-channel"
import { createPageLink } from "../../../src/site/core/page-link"
import type { PageLinkClock } from "../../../src/site/core/page-link"

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function equal(actual: unknown, expected: unknown, message: string): void {
  check(JSON.stringify(actual) === JSON.stringify(expected), message)
}
function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  check(guard(value), "Invalid synthetic consumer input")
  return value
}
class Clock implements PageLinkClock {
  private serial = 0
  private pending = new Map<number, () => void>()
  now() { return 0 }
  after(_ms: number, callback: () => void) {
    const id = ++this.serial
    this.pending.set(id, callback)
    return () => { this.pending.delete(id) }
  }
  get count() { return this.pending.size }
}

export async function runGatewayReadConsumer(dom: boolean): Promise<string> {
  const build = checked(isBuildId, "gateway-read-synthetic"), pageType = checked(isPageType, "WATCH")
  const acct = "TfkIStY8bVGtNWk5"
  const records: { site: Site; step: string; answer: unknown }[] = []
  for (const site of ["www", "music"] as const) {
    const rawTarget = site === "www" ? { videoId: syntheticVideo, title: { simpleText: "Target" } } : rawSong()
    const p = scriptedPage({ targetData: rawTarget, targetContext: site === "music" ? { inAutomix: false } : undefined, ...(site === "music" ? {
      watchPlayer: rawMusicPlayer(), mediaMetadata: { title: "Song", artist: "Artist", artwork: [] }, musicQueue: [rawSong()], musicState: { castStatus: false }, castPlayer: false
    } : {}) })
    p.setQueueChanges(site === "music")
    const gateway = createGateway({ site, page: p.port, now: () => 10 })
    const pageAccount = await gateway.run({ kind: "account" })
    equal(pageAccount, { ok: true, data: { signedIn: true, datasyncId: syntheticIdentity }, route: readRoutes.account }, "Raw account boundary changed")
    const snapshot: PageHelloSnapshot = { signedIn: true, datasyncId: syntheticIdentity, pageType, startedHidden: false, navType: "navigate" }
    const inner = dom ? createDomPageChannel(document) : createDirectPageChannel()
    const releases = new Set<() => void>()
    let lastTarget: Element | undefined
    const channel: PageChannel = {
      send(wire, text, target) { if (target) lastTarget = target; inner.send(wire, text, target) },
      listen(wire, changed) {
        const stop = inner.listen(wire, changed)
        const release = () => { if (releases.delete(release)) stop() }
        releases.add(release)
        return release
      }
    }
    const endpoint = servePage(gateway, { site, build, vocabulary: readVocabulary, snapshot: () => snapshot, signals: sink => gateway.onSignal(sink) }, channel)
    const clock = new Clock(), link = createPageLink({ site, build, vocabulary: readVocabulary, clock }, channel)
    const target = document.createElement("article")
    document.body.append(target)
    try {
      const hello = await link.hello
      const expectedHello = { ok: true, snapshot: { signedIn: true, acct, pageType, startedHidden: false, navType: "navigate" } }
      equal(hello, expectedHello, "Projected hello differs")
      records.push({ site, step: "hello", answer: hello })
      const account = await link.run({ job: { kind: "account" } })
      equal(account, { ok: true, data: { signedIn: true, acct }, route: readRoutes.account }, "PageLink account projection differs")
      records.push({ site, step: "account", answer: account })
      const item = site === "www" ? await link.run({ job: { kind: "videoInfo" } }, { target }) : await link.run({ job: { kind: "itemInfo" } }, { target })
      const expectedItem = site === "www" ? { videoId: syntheticVideo, title: "Target", length: null, kind: "video" } : {
        kind: "song", type: { kind: "music-video", musicVideoType: "MUSIC_VIDEO_TYPE_ATV" }, title: "Synthetic song",
        selected: false, autoplay: false, hasOwnLike: true, likeState: "not-liked",
        endpoints: {
          end: { queueAddEndpoint: { queueTarget: { videoId: syntheticVideo }, queueInsertPosition: "INSERT_AT_END" } },
          save: { addToPlaylistEndpoint: { videoId: syntheticVideo } },
          next: { queueAddEndpoint: { queueTarget: { videoId: syntheticVideo }, queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO" } }
        }, videoId: syntheticVideo, queueItemId: 7
      }
      equal(item, { ok: true, data: expectedItem, route: site === "www" ? readRoutes.videoInfo : readRoutes.itemInfo }, "Target result differs")
      check(lastTarget === target && p.reads.some(read => read.what === "targetData" && read.target === target), "Target element was lost")
      records.push({ site, step: "target", answer: { result: item, actualTarget: lastTarget === target } })
      const probe = await link.probe()
      const expectedPresent = new Set([readWatches.identity, readWatches.navigation, readWatches.location, readWatches.watchPlayer, readWatches.targetData,
        ...(site === "music" ? [readWatches.targetContext, readWatches.mediaMetadata, readWatches.musicQueue, readWatches.musicState, readWatches.castPlayer, readWatches.queueChanges] : [])])
      equal(probe, { ok: true, report: { site, entries: readVocabulary.watchIds.map(id => ({ id, present: expectedPresent.has(id) })) } }, "Probe differs from owned vocabulary")
      records.push({ site, step: "probe", answer: probe })
      const stream: Stream = site === "www" ? "player" : "queue", values: StreamData<Stream>[] = []
      const stop = link.watch(stream, value => values.push(value))
      p.emit(site === "www" ? "player" : "queue")
      const expectedStream = site === "www" ? [{
        ad: false, at: 10, player: "watch", videoId: syntheticVideo, pos: 15, len: 120, listedLength: 120, rate: 1.25,
        playing: true, seeking: false, content: "video", isPostLiveDvr: false, isLive: false, isUpcoming: false, isLiveContent: false
      }] : [{ ids: [7] }]
      equal(values, expectedStream, "Serialized stream differs")
      records.push({ site, step: "stream", answer: values })
      endpoint.dispose(); endpoint.dispose()
      check(p.active() === 0 && p.callbacks.every(callback => callback.stops === 1), "Endpoint leaked event ownership")
      p.stale(site === "www" ? "player" : "queue")
      equal(values, expectedStream, "Stale callback published")
      stop(); link.dispose(); gateway.dispose()
      equal([p.active(), releases.size, clock.count], [0, 0, 0], "Disposal leaked owned resources")
      records.push({ site, step: "disposed", answer: { pageListeners: p.active(), channelListeners: releases.size, deadlines: clock.count } })
    } finally { target.remove(); link.dispose(); endpoint.dispose(); gateway.dispose() }
  }
  const output = records.map(record => JSON.stringify(record)).join("\n") + "\n"
  check(!output.includes(syntheticIdentity) && !output.includes("datasyncId"), "Raw identity escaped public consumer output")
  return output
}

if (import.meta.main) {
  const adapter = process.argv[2]
  check(adapter === "direct" || adapter === "dom", "Expected direct or dom")
  GlobalRegistrator.register({ url: `https://www.youtube.com/watch?v=${syntheticVideo}` })
  try { process.stdout.write(await runGatewayReadConsumer(adapter === "dom")) }
  finally { await GlobalRegistrator.unregister() }
}
