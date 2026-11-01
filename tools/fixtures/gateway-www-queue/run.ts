import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { servePage } from "../../../src/page/channel"
import { isBuildId, isPageType } from "../../../src/shared/contracts"
import type { PageHelloSnapshot } from "../../../src/shared/contracts/page"
import { createDirectPageChannel, createDomPageChannel } from "../../../src/shared/rpc/page-channel"
import type { PageChannel } from "../../../src/shared/rpc/page-channel"
import { createPageLink } from "../../../src/site/core/page-link"
import { checked } from "../gateway-playlists/specimens"
import { added, answer, Clock, check, listA, menuAction, pending, queueWorld, same, settle, syntheticIdentity, videoA, videoB } from "./specimens"

const build = checked(isBuildId, "gateway-www-queue-synthetic")
const pageType = checked(isPageType, "WATCH")
type QueueRecord = { step: string; answer: unknown }

export function expectedQueueRecords(): QueueRecord[] {
  const edit = (action: Record<string, unknown>) => ({
    commandMetadata: { webCommandMetadata: { apiUrl: "/youtubei/v1/browse/edit_playlist", sendPost: true } },
    playlistEditEndpoint: { playlistId: listA, actions: [action], params: "IAE%3D" }
  })
  return [
    { step: "hello", answer: { ok: true, snapshot: { signedIn: false, acct: null, pageType, startedHidden: false, navType: "navigate" } } },
    { step: "account", answer: { ok: true, data: { signedIn: false, acct: null }, route: "page-read.account" } },
    { step: "first-add", answer: { ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-1" } }, route: "command.queueAdd" } },
    { step: "duplicate-add", answer: { ok: true, data: { confirmed: true, quiet: true, undo: { listId: listA, setVideoId: "entry-2" } }, route: "command.queueAdd" } },
    { step: "undo", answer: { ok: true, data: null, route: "command.queueUndo" } },
    { step: "add-list", answer: { ok: true, data: { confirmed: false, count: 2 }, route: "command.queueAddList" } },
    { step: "card-menu", answer: { result: { ok: true, data: null, route: "page-ui.openCardMenu" }, actualTarget: true } },
    { step: "sends", answer: [
      { commandMetadata: { webCommandMetadata: { sendPost: true } }, signalServiceEndpoint: { signal: "CLIENT_SIGNAL", actions: [{ addToPlaylistCommand: {
        openMiniplayer: true, videoId: videoA, listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE",
        onCreateListCommand: { createPlaylistServiceEndpoint: { videoIds: [videoA], params: "CAQ%3D" } }, videoIds: [videoA]
      } }] } },
      edit({ action: "ACTION_ADD_VIDEO", addedVideoId: videoA }),
      edit({ action: "ACTION_REMOVE_VIDEO", setVideoId: "entry-2" }),
      { refreshPlaylistCommand: { listId: listA } },
      { signalServiceEndpoint: { signal: "CLIENT_SIGNAL", actions: [{ addToPlaylistCommand: { videoIds: [videoB, videoA, videoB], listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE" } }] } }
    ] },
    { step: "queue", answer: [{ videoId: videoA, setVideoId: "entry-1" }, { videoId: videoB, setVideoId: "entry-3" }, { videoId: videoA, setVideoId: "entry-4" }] },
    { step: "signals", answer: ["timeout"] },
    { step: "disposed", answer: { pageListeners: 0, channelListeners: 0, actionListeners: 0, deadlines: 0 } }
  ]
}
export function expectedQueueOutput(): string { return expectedQueueRecords().map(record => JSON.stringify(record)).join("\n") + "\n" }

export async function runGatewayQueueConsumer(dom: boolean): Promise<string> {
  const records: QueueRecord[] = []
  const w = queueWorld({ signedIn: false })
  w.scripts.push(
    pending(world => { world.add(videoA, listA) }),
    pending(world => answer(added(world.add(videoA)))),
    pending(world => { world.remove("entry-2"); return answer({ status: "STATUS_SUCCEEDED" }) }),
    pending(() => answer({})),
    pending(world => { world.add(videoB); world.add(videoA) })
  )
  const inner = dom ? createDomPageChannel(document) : createDirectPageChannel(), releases = new Set<() => void>()
  const channel: PageChannel = {
    send: (...args) => inner.send(...args),
    listen(wire, listener) {
      const stop = inner.listen(wire, listener)
      const release = () => { if (releases.delete(release)) stop() }
      releases.add(release); return release
    }
  }
  const snapshot: PageHelloSnapshot = { signedIn: false, datasyncId: null, pageType, startedHidden: false, navType: "navigate" }
  const endpoint = servePage(w.gateway, { site: "www", build, vocabulary: w.gateway.vocabulary, snapshot: () => snapshot, signals: sink => w.gateway.onSignal(sink) }, channel)
  const linkClock = new Clock(), link = createPageLink({ site: "www", build, vocabulary: w.gateway.vocabulary, clock: linkClock }, channel)
  const element = document.createElement("ytd-rich-item-renderer")
  document.body.append(element)
  const step = async (name: string, run: Promise<unknown>, ms: number) => { await settle(w, ms); records.push({ step: name, answer: await run }) }
  try {
    records.push({ step: "hello", answer: await link.hello })
    records.push({ step: "account", answer: await link.run({ job: { kind: "account" } }) })
    await step("first-add", link.run({ job: { kind: "queueAdd" } }, { target: element }), 0)
    await step("duplicate-add", link.run({ job: { kind: "queueAdd" } }, { target: element }), 0)
    await step("undo", link.run({ job: { kind: "queueUndo", listId: listA, setVideoId: "entry-2" } } as never, undefined), 100)
    await step("add-list", link.run({ job: { kind: "queueAddList", videoIds: [videoB, videoA, videoB] } } as never, undefined), 10_000)
    const menu = link.run({ job: { kind: "openCardMenu" } }, { target: element })
    await settle(w, 0)
    w.emit(menuAction)
    records.push({ step: "card-menu", answer: { result: await menu, actualTarget: w.menuTargets.length === 1 && w.menuTargets[0] === element } })
    records.push({ step: "sends", answer: w.calls.map(call => call.endpoint) })
    records.push({ step: "queue", answer: w.state.entries })
    records.push({ step: "signals", answer: w.signals.map(signal => signal.kind) })
    check(w.scripts.length === 0, "Consumer did not execute exactly its scripted sends")
    endpoint.dispose(); link.dispose(); w.gateway.dispose()
    const disposal = { pageListeners: w.page.active(), channelListeners: releases.size, actionListeners: w.listeners, deadlines: w.timers + linkClock.count }
    same(disposal, { pageListeners: 0, channelListeners: 0, actionListeners: 0, deadlines: 0 }, "Consumer leaked owned resources")
    records.push({ step: "disposed", answer: disposal })
  } finally { endpoint.dispose(); link.dispose(); w.gateway.dispose(); element.remove() }
  same(records, expectedQueueRecords(), "Consumer differs from fixed EOF records")
  const output = records.map(record => JSON.stringify(record)).join("\n") + "\n"
  check(!output.includes(syntheticIdentity) && !output.includes("datasyncId"), "Consumer output includes private page material")
  return output
}

if (import.meta.main) {
  const adapter = process.argv[2]
  check(adapter === "direct" || adapter === "dom", "Expected direct or dom")
  GlobalRegistrator.register({ url: "https://www.youtube.com" })
  try { process.stdout.write(await runGatewayQueueConsumer(adapter === "dom")) }
  finally { await GlobalRegistrator.unregister() }
}
