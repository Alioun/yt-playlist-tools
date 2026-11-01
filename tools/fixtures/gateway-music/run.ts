import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { servePage } from "../../../src/page/channel"
import { syntheticIdentity, syntheticVideo } from "../../../src/page/gateway.specimens"
import { albumId, insertEndpoint, musicWorld, settle } from "../../../src/page/music-gateway.specimens"
import { isBuildId, isJobInvocation, isPageType } from "../../../src/shared/contracts"
import type { PageHelloSnapshot } from "../../../src/shared/contracts/page"
import { createDirectPageChannel, createDomPageChannel } from "../../../src/shared/rpc/page-channel"
import type { PageChannel } from "../../../src/shared/rpc/page-channel"
import { createPageLink } from "../../../src/site/core/page-link"
import { Clock, check, checked } from "../gateway-playlists/specimens"

const build = checked(isBuildId, "gateway-music-synthetic")
const pageType = checked(isPageType, "MUSIC_PAGE_TYPE_ALBUM")

export async function runGatewayMusicConsumer(dom: boolean): Promise<string> {
  const records: { step: string; answer: unknown }[] = []
  const w = musicWorld(undefined, 1)
  const inner = dom ? createDomPageChannel(document) : createDirectPageChannel(), releases = new Set<() => void>()
  const channel: PageChannel = {
    send: (...args) => inner.send(...args),
    listen(wire, listener) {
      const stop = inner.listen(wire, listener)
      const release = () => { if (releases.delete(release)) stop() }
      releases.add(release); return release
    }
  }
  const snapshot: PageHelloSnapshot = { signedIn: true, datasyncId: syntheticIdentity, pageType, startedHidden: false, navType: "navigate" }
  const endpoint = servePage(w.gateway, { site: "music", build, vocabulary: w.gateway.vocabulary, snapshot: () => snapshot, signals: sink => w.gateway.onSignal(sink) }, channel)
  const linkClock = new Clock(), link = createPageLink({ site: "music", build, vocabulary: w.gateway.vocabulary, clock: linkClock }, channel)
  let acct: unknown
  const step = async (name: string, job: unknown, account = false) => {
    const answer = link.run(checked(isJobInvocation, { job, ...(account ? { acct } : {}) }))
    await settle()
    records.push({ step: name, answer: await answer })
  }
  try {
    const hello = await link.hello
    if (hello.ok && hello.snapshot.signedIn) acct = hello.snapshot.acct
    records.push({ step: "hello", answer: hello })
    await step("play-next", { kind: "queueInsert", endpoint: insertEndpoint("next"), position: "next" })
    await step("album-to-end", { kind: "queueInsert", endpoint: insertEndpoint("end", { playlistId: albumId }), position: "end" })
    await step("undo-album", { kind: "queueRemoveIds", ids: [5, 6, 7] })
    await step("move-to-next", { kind: "queueMove", id: 3, to: "next" })
    await step("undo-move", { kind: "queueMove", id: 3, to: 4 })
    await step("remove", { kind: "queueRemove", id: 2 })
    await step("undo-remove", { kind: "queueReinsert", videoId: "queued00003", index: 3 })
    await step("like", { kind: "like", endpoint: { likeEndpoint: { status: "LIKE", target: { videoId: syntheticVideo } } } }, true)
    await step("save-album-to-library", { kind: "library", endpoint: { likeEndpoint: { status: "LIKE", target: { playlistId: albumId } } } }, true)
    await step("go-to-album", { kind: "navigate", endpoint: { browseEndpoint: { browseId: "MPREb_synthetic" } } })
    w.page.values.musicState = { castStatus: true }
    await step("insert-while-casting", { kind: "queueInsert", endpoint: insertEndpoint("end"), position: "end" })
    records.push({ step: "queue", answer: w.videos() })
    records.push({ step: "handler-calls", answer: w.calls.map(call => call.kind) })
    records.push({ step: "signals", answer: w.signals.map(signal => `${signal.kind} ${signal.route}`) })
    endpoint.dispose(); link.dispose(); w.gateway.dispose()
    const disposal = { pageListeners: w.page.active(), channelListeners: releases.size, deadlines: w.clock.count + linkClock.count }
    records.push({ step: "disposed", answer: disposal })
  } finally { endpoint.dispose(); link.dispose(); w.gateway.dispose() }
  const output = records.map(record => JSON.stringify(record)).join("\n") + "\n"
  check(!output.includes(syntheticIdentity) && !output.includes("datasyncId"), "Consumer output includes private page material")
  return output
}

if (import.meta.main) {
  const adapter = process.argv[2]
  check(adapter === "direct" || adapter === "dom", "Expected direct or dom")
  GlobalRegistrator.register({ url: "https://music.youtube.com" })
  try { process.stdout.write(await runGatewayMusicConsumer(adapter === "dom")) }
  finally { await GlobalRegistrator.unregister() }
}
