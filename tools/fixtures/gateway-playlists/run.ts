import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { servePage } from "../../../src/page/channel"
import { syntheticIdentity } from "../../../src/page/gateway.specimens"
import { isBuildId, isPageType } from "../../../src/shared/contracts"
import type { Site } from "../../../src/shared/contracts"
import type { PageHelloSnapshot } from "../../../src/shared/contracts/page"
import { isAccountKey } from "../../../src/shared/model/validation"
import { createDirectPageChannel, createDomPageChannel } from "../../../src/shared/rpc/page-channel"
import type { PageChannel } from "../../../src/shared/rpc/page-channel"
import { createPageLink } from "../../../src/site/core/page-link"
import { added, check, checked, Clock, entry, identity, membership, playlist, recorded, response, same, video } from "./specimens"

const acct = checked(isAccountKey, "TfkIStY8bVGtNWk5")
const build = checked(isBuildId, "gateway-playlists-synthetic")
const pageType = checked(isPageType, "WATCH")

export function expectedPlaylistRecords(): { site: Site; step: string; answer: unknown }[] {
  return (["www", "music"] as const).flatMap(site => [
    { site, step: "hello", answer: { ok: true, snapshot: { signedIn: true, acct, pageType, startedHidden: false, navType: "navigate" } } },
    { site, step: "account", answer: { ok: true, data: { signedIn: true, acct }, route: "page-read.account" } },
    { site, step: "membership", answer: { ok: true, data: [{ id: playlist, title: "Synthetic list", privacy: "PRIVATE", count: 3, contains: false }], route: site === "www" ? "service.membership" : "music.membership" } },
    { site, step: "write", answer: { ok: true, data: { setVideoId: entry }, route: site === "www" ? "command.add" : "music.save" } },
    { site, step: "remove", answer: { ok: true, data: null, route: site === "www" ? "command.remove" : "music.unsave" } },
    { site, step: "create", answer: { ok: true, data: { playlistId: playlist }, route: site === "www" ? "service.create" : "music.create" } },
    { site, step: "label", answer: { ok: true, data: { name: "Fixture account", handle: "@fixture" }, route: site === "www" ? "service.accountLabel" : "music.accountLabel" } },
    { site, step: "disposed", answer: { pageListeners: 0, channelListeners: 0, deadlines: 0 } }
  ])
}
export function expectedPlaylistOutput(): string { return expectedPlaylistRecords().map(record => JSON.stringify(record)).join("\n") + "\n" }

export async function runGatewayPlaylistConsumer(dom: boolean): Promise<string> {
  const records: { site: Site; step: string; answer: unknown }[] = []
  for (const site of ["www", "music"] as const) {
    const p = recorded(site)
    p.scripts.push(response(membership()), response(added()), response({ ...identity(), status: "STATUS_SUCCEEDED" }),
      response({ ...identity(), playlistId: playlist }), response({ ...identity(), actions: [{ accountHeaderRenderer: {
        accountName: { simpleText: "Fixture account" }, channelHandle: { simpleText: "@fixture" }
      } }] }))
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
    const endpoint = servePage(p.gateway, { site, build, vocabulary: () => p.gateway.vocabulary, snapshot: () => snapshot, signals: sink => p.gateway.onSignal(sink) }, channel)
    const linkClock = new Clock(), link = createPageLink({ site, build, vocabulary: p.gateway.vocabulary, clock: linkClock }, channel)
    try {
      records.push({ site, step: "hello", answer: await link.hello })
      records.push({ site, step: "account", answer: await link.run({ job: { kind: "account" } }) })
      records.push({ site, step: "membership", answer: await link.run({ job: { kind: "membership", videoId: video }, acct }) })
      records.push({ site, step: "write", answer: site === "www" ? await link.run({ job: { kind: "add", playlistId: playlist, videoId: video }, acct }) :
        await link.run({ job: { kind: "save", playlistId: playlist, videoId: video }, acct }) })
      records.push({ site, step: "remove", answer: site === "www" ? await link.run({ job: { kind: "remove", playlistId: playlist, setVideoId: entry }, acct }) :
        await link.run({ job: { kind: "unsave", playlistId: playlist, setVideoId: entry }, acct }) })
      records.push({ site, step: "create", answer: await link.run({ job: { kind: "create", title: "Fixture list", privacy: "PRIVATE", videoId: video }, acct }) })
      records.push({ site, step: "label", answer: await link.run({ job: { kind: "accountLabel" }, acct }) })
      check(p.calls.length === 5 && p.scripts.length === 0, "Consumer did not execute exactly its scripted requests")
      endpoint.dispose(); link.dispose(); p.gateway.dispose()
      const disposal = { pageListeners: p.page.active(), channelListeners: releases.size, deadlines: p.clock.count + linkClock.count }
      same(disposal, { pageListeners: 0, channelListeners: 0, deadlines: 0 }, "Consumer leaked owned resources")
      records.push({ site, step: "disposed", answer: disposal })
    } finally { endpoint.dispose(); link.dispose(); p.gateway.dispose() }
  }
  same(records, expectedPlaylistRecords(), "Consumer differs from fixed EOF records")
  const output = records.map(record => JSON.stringify(record)).join("\n") + "\n"
  check(!output.includes(syntheticIdentity) && !output.includes("datasyncId") && !output.includes("Authorization"), "Consumer output includes private page material")
  return output
}

if (import.meta.main) {
  const adapter = process.argv[2]
  check(adapter === "direct" || adapter === "dom", "Expected direct or dom")
  GlobalRegistrator.register({ url: "https://www.youtube.com" })
  try { process.stdout.write(await runGatewayPlaylistConsumer(adapter === "dom")) }
  finally { await GlobalRegistrator.unregister() }
}
