import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { WwwResolution } from "../../../src/site/core/items-www"
import { rawNavigation } from "../../../src/page/gateway.specimens"
import { flush, itemsFixture } from "./harness"
import { card, firstVideo, secondVideo, shortVideo, playlist, unknownCard } from "./specimens"

function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message)
}
function videoId(answer: WwwResolution): string {
  check(answer.kind === "pointed-item" || answer.kind === "current-video", "Expected a resolved video")
  return answer.video.videoId
}

export async function runItemsConsumer(dom: boolean): Promise<string> {
  const h = await itemsFixture(dom)
  const records: Readonly<Record<string, unknown>>[] = []
  try {
    records.push({ step: "inactive", kind: (await h.items.resolve()).kind })
    const release = h.items.track(h.owner())
    const first = card(),
      modern = card("yt-lockup-view-model", secondVideo),
      short = card("ytm-shorts-lockup-view-model", shortVideo)
    h.point(first.button)
    let answer = await h.items.resolve()
    records.push({ step: "legacy", kind: answer.kind, videoId: videoId(answer), target: h.reads.at(-1)?.target === first.element })
    h.point(modern.button)
    answer = await h.items.resolve()
    records.push({ step: "modern", kind: answer.kind, videoId: videoId(answer), target: h.reads.at(-1)?.target === modern.element })
    h.point(short.button)
    answer = await h.items.resolve()
    check(answer.kind === "pointed-item", "Shorts target did not resolve")
    records.push({ step: "shorts", kind: answer.kind, videoId: answer.video.videoId, mediaKind: answer.video.kind })
    const list = playlist()
    h.point(list.anchor)
    let before = h.reads.length
    answer = await h.items.resolve()
    check(answer.kind === "unsupported-item", "Unsupported playlist fell back")
    records.push({ step: "playlist", kind: answer.kind, reason: answer.reason, reads: h.reads.length - before })
    const unknown = unknownCard()
    h.point(unknown.button)
    before = h.reads.length
    answer = await h.items.resolve()
    records.push({ step: "unrecognised", kind: answer.kind, reports: h.failures.length, reads: h.reads.length - before })
    h.point(first.button)
    h.stack.set([modern.button])
    answer = await h.items.resolve()
    records.push({ step: "stationary", kind: answer.kind, videoId: videoId(answer) })
    const preview = document.createElement("ytd-video-preview")
    document.body.append(preview)
    h.point(preview, [first.button])
    answer = await h.items.resolve()
    records.push({ step: "preview", kind: answer.kind, videoId: videoId(answer) })
    const player = h.player()
    h.navigate(rawNavigation(), `/watch?v=${firstVideo}`)
    const endTile = card("ytd-video-renderer", secondVideo, player.root)
    h.point(endTile.anchor)
    answer = await h.items.resolve()
    records.push({ step: "player", kind: answer.kind, videoId: videoId(answer) })
    h.point(first.button)
    h.delayAnswers()
    const pending = h.items.resolve()
    await flush()
    check(h.heldAnswers === 1, "Serialized answer was not delayed")
    first.anchor.href = `/watch?v=${secondVideo}`
    h.releaseAnswers()
    answer = await pending
    check(answer.kind === "stale-target", "Recycled card accepted old details")
    records.push({ step: "recycled", kind: answer.kind, reason: answer.reason })
    document.body.replaceChildren()
    const main = document.createElement("main")
    document.body.append(main)
    for (let n = 0; n < 6; n++) {
      const id = `vid${String(n).padStart(8, "0")}`
      if (n < 2) card("ytd-video-renderer", id, main)
      else unknownCard(id, main)
    }
    h.navigate()
    h.timers.advance(2999)
    records.push({ step: "settle-2999", observations: h.observations.length })
    h.timers.advance(1)
    const observation = h.observations.at(-1)
    check(observation, "Settle observation missing")
    records.push({ step: "settle-3000", links: observation.distinctMainLinks, recognised: observation.recognised, anchorMissing: observation.anchorMissing })
    release()
    records.push({ step: "last-release", kind: (await h.items.resolve()).kind, timers: h.timers.count })
    h.items.track(h.owner())
    const again = card("yt-lockup-view-model", secondVideo)
    h.point(again.button)
    answer = await h.items.resolve()
    records.push({ step: "reacquired", kind: answer.kind, videoId: videoId(answer) })
    h.items.dispose()
    h.link.dispose()
    records.push({ step: "disposed", owners: h.owners.reduce((count, owner) => count + owner.resourceCount, 0), timers: h.timers.count, linkDeadlines: h.clock.count })
    check(h.errors.length === 0, "Scope reported a cleanup error")
    return records.map(record => JSON.stringify(record)).join("\n") + "\n"
  } finally {
    h.dispose()
  }
}

if (import.meta.main) {
  const adapter = process.argv[2]
  check(adapter === "direct" || adapter === "dom", "Expected direct or dom")
  GlobalRegistrator.register({ url: "https://www.youtube.com/" })
  try {
    process.stdout.write(await runItemsConsumer(adapter === "dom"))
  } finally {
    await GlobalRegistrator.unregister()
  }
}
