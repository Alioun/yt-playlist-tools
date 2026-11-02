import { isTabView, type DueNotice, type FeatureStatus, type TabView } from "../../../src/shared/contracts/tab-view"
import type { Job } from "../../../src/shared/contracts"
import { isVideoId } from "../../../src/shared/model/validation"
import { createFeatureHost, type SiteView } from "../../../src/site/core/feature-host"
import { linkedVideo, recogniseWwwItem } from "../../../src/site/core/items-www"
import { Scope } from "../../../src/site/core/scope"
import { cardMenuFeature, type CardMenuServices } from "../../../src/site/features/card-menu/card-menu"
import { checked, flush, harness, snapshot } from "../page-link/support"
import { syntheticViewSource } from "../site-core-lifecycle/views"
import { wireView } from "../tab-view/cases"

export const videoA = checked(isVideoId, "AAAAAAAAAAA")
export const videoB = checked(isVideoId, "BBBBBBBBBBB")
const menu = `<ytd-menu-renderer><yt-icon-button id="button"><button aria-haspopup="true" aria-label="Action menu"></button></yt-icon-button></ytd-menu-renderer>`
export const markup = `
<ytd-rich-grid-media id="card-a">
  <a id="thumbnail" href="/watch?v=${videoA}"><img id="thumb-img"></a>
  <div id="details">
    <a id="avatar-link" href="/@channel"><img id="avatar-img"></a>
    <yt-decorated-avatar-view-model id="bare-avatar"><img id="bare-avatar-img"></yt-decorated-avatar-view-model>
    <h3><a id="video-title-link" href="/watch?v=${videoA}"><span id="video-title">Title A</span></a></h3>
    <ytd-channel-name id="channel-name"><a id="channel-link" href="/@channel">Channel</a></ytd-channel-name>
    <a id="hashtag" href="/hashtag/music">#music</a>
    <span id="empty">metadata</span>
    <span id="shadow-host"></span>
    ${menu}
  </div>
</ytd-rich-grid-media>
<ytd-rich-grid-media id="card-hidden-menu">
  <a id="hidden-menu-thumb" href="/watch?v=${videoB}"></a>
  <div hidden>${menu}</div>
</ytd-rich-grid-media>
<ytd-compact-video-renderer id="card-no-menu"><a id="no-menu-thumb" href="/watch?v=${videoA}"><span id="no-menu-text">No menu</span></a></ytd-compact-video-renderer>
<ytd-compact-video-renderer id="card-outer">
  <a id="outer-thumb" href="/watch?v=${videoB}"><span id="outer-text">Outer</span></a>
  <ytd-video-renderer id="card-inner">${menu}</ytd-video-renderer>
</ytd-compact-video-renderer>
<ytd-ad-slot-renderer id="ad"><ytd-rich-grid-media><a id="ad-link" href="/watch?v=${videoA}"><span id="ad-text">Ad</span></a>${menu}</ytd-rich-grid-media></ytd-ad-slot-renderer>
<ytd-playlist-renderer id="playlist"><a id="playlist-link" href="/playlist?list=PLabc"><span id="playlist-text">Playlist</span></a>${menu}</ytd-playlist-renderer>
<ytd-radio-renderer id="mix"><a id="mix-link" href="/playlist?list=RDabc"><span id="mix-text">Mix</span></a>${menu}</ytd-radio-renderer>
<ytd-rich-grid-media id="card-unrecognised"><a href="/watch?v=${videoA}"></a><a href="/watch?v=${videoB}"></a><span id="two-videos">Two</span>${menu}</ytd-rich-grid-media>
<div id="outside">page</div>`

export function view(options: { keepLinkMenu?: boolean; signedIn?: boolean; setup?: "none"; broken?: boolean; on?: boolean } = {}): SiteView<"www"> {
  const base = wireView("www", options.signedIn ?? true)
  if (base.site !== "www") throw Error("Expected a www specimen")
  const on = options.on ?? true
  const features = on ? base.features.filter(feature => feature.id === "card-menu")
    .map(feature => feature.id === "card-menu" ? { ...feature, options: { ...feature.options, keepLinkMenu: options.keepLinkMenu ?? false } } : feature) : []
  const status: FeatureStatus = options.broken
    ? { feature: "card-menu", state: "not-working", jobs: ["openCardMenu"], anchors: [], actions: [], kinds: ["missing"] }
    : { feature: "card-menu", state: "working", jobs: [], anchors: [], actions: [], kinds: [] }
  const notices: DueNotice[] = options.broken ? [{ kind: "not-working", features: ["card-menu"] }] : []
  const result = checked(isTabView, {
    ...base, features, statuses: on ? [status] : [], notices: on ? notices : [],
    ...(options.setup === "none" && base.signedIn ? { setup: { kind: "none" } } : {})
  })
  if (result.site !== "www") throw Error("Expected a validated www view")
  return result
}

export function rightClick(init: { shiftKey?: boolean } = {}): MouseEvent {
  return new MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, button: 2, shiftKey: init.shiftKey ?? false })
}

export async function cardMenuHarness(options: {
  initial?: TabView | null
  signedIn?: boolean
  gate?: Promise<unknown>
  run?: (job: Job, context?: { target?: Element }) => Promise<unknown>
  notice?: CardMenuServices["notice"]
} = {}) {
  document.body.innerHTML = markup
  const gate = options.gate
  const page = harness({
    ...(options.signedIn === false ? { pageSnapshot: () => snapshot(null) } : {}), ...(options.run ? { run: options.run } : {}),
    ...(gate ? { link: { digest: (bytes: Uint8Array<ArrayBuffer>) => gate.then(() => crypto.subtle.digest("SHA-256", bytes)) } } : {})
  })
  if (!gate) await page.link.hello
  const source = syntheticViewSource(options.initial === undefined ? view() : options.initial)
  const scopes: Scope[] = []
  const errors: unknown[] = []
  const requests: DueNotice[] = []
  const host = createFeatureHost<"www", CardMenuServices>({
    site: "www",
    createScope() { const scope = new Scope({ document, onError: error => { errors.push(error) } }); scopes.push(scope); return scope },
    createContext: () => ({ document, items: { recognise: recogniseWwwItem, linkedVideo }, page: page.link, notice: options.notice ?? { request: due => { requests.push(due) } } }),
    onEmpty: () => {}, onError: failure => { errors.push(failure) }
  })
  const observer = new Scope({ document, onError: error => { errors.push(error) } })
  const seen: { prevented: boolean }[] = []
  observer.on(document, "contextmenu", event => { seen.push({ prevented: event.defaultPrevented }) })
  const menuCalls = () => page.calls.filter(call => call.job.kind === "openCardMenu")
  return {
    host, source, page, scopes, errors, requests, seen, menuCalls,
    start() { host.define(cardMenuFeature); host.connect(source.link) },
    byId(id: string): Element {
      const element = document.getElementById(id)
      if (!element) throw Error(`Missing fixture element ${id}`)
      return element
    },
    click(target: EventTarget, init: { shiftKey?: boolean } = {}) {
      const event = rightClick(init)
      target.dispatchEvent(event)
      return event
    },
    settle: flush,
    dispose() { host.dispose(); observer.dispose(); page.dispose(); document.body.innerHTML = "" }
  }
}
