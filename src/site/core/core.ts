import type { BuildId, DiagnosticVocabulary, JobOf, Site } from "../../shared/contracts"
import { isTabView, type DueNotice, type TabView } from "../../shared/contracts/tab-view"
import { noticeText, siteFeedbackText } from "../../shared/copy"
import type { I18n } from "../../shared/i18n"
import type { PageChannel } from "../../shared/rpc/page-channel"
import type { Deadline } from "../../shared/rpc/rpc"
import { createBackgroundLink, type BackgroundLink } from "./background"
import { createExtLink, type ExtLink, type ExtLinkRuntime } from "./extlink"
import { createFeatureHost, type FeatureDefinition, type SiteFeatureId } from "./feature-host"
import type { MusicItems, MusicItemsOptions } from "./items-music"
import type { WwwItems, WwwItemsOptions } from "./items-www"
import { Keys, type KeyBlockers } from "./keys"
import { createNoticeOwner, type NoticePresenter } from "./notice"
import { plainNoticePresenter } from "./notice/plain"
import { createPageLink, type PageLink } from "./page-link"
import { createSiteHealth, type SiteHealth } from "./health"
import { Pointer } from "./pointer"
import { Scope, type ScopeMountPort } from "./scope"
import { createThisVideoChannel, type ThisVideoChannel } from "./this-video"

export type SiteItems = { readonly www: WwwItems; readonly music: MusicItems }
type ItemsOptions = WwwItemsOptions & MusicItemsOptions

/** What every feature on a site is handed beside its scope and view (06 §6.4.2). */
export type CoreServices<S extends Site> = {
  readonly document: Document
  readonly page: PageLink
  readonly items: SiteItems[S]
  readonly keys: Keys
  readonly i18n: I18n
  /** User actions through the background: adds, removals, Undo, the playlist list and the popovers (06 §6.8.2). */
  readonly actions: TabActions
  readonly notice: { request(due: DueNotice): void }
  readonly notices: { wouldAct(feature: SiteFeatureId<S>): void }
  /** Breakage a feature sees itself, for the Monitor (HEALTH-01). */
  readonly health: SiteHealth
  /** Auto-add's view of the playing video, which the watch-page button and the popup show (YT-AA-38). */
  readonly thisVideo: ThisVideoChannel
}
export type SiteCore<S extends Site> = CoreServices<S> & {
  readonly site: S
  readonly build: BuildId
  readonly root: Scope
  readonly pointer: Pointer
  readonly link: ExtLink<TabView>
  readonly disposed: boolean
  define(definition: FeatureDefinition<S, CoreServices<S>>): void
  /** The kit lends Svelte mounting to feature scopes and takes over the not-working notice (ARC-MOD-32). */
  attachKit(kit: { readonly mount: ScopeMountPort; readonly notices: NoticePresenter; readonly asks?: TabAsks }): void
  dispose(): void
}
export type AnySiteCore = SiteCore<"www"> | SiteCore<"music">
export type SiteCoreOptions<S extends Site, Sender> = {
  readonly site: S
  readonly build: BuildId
  readonly document: Document
  readonly channel: PageChannel
  readonly runtime: ExtLinkRuntime<Sender>
  readonly i18n: I18n
  /** The page half's vocabulary, which PageLink checks probes and signals against. */
  readonly vocabulary: DiagnosticVocabulary
  /** Each site's core bundles only its own item recognition. */
  readonly items: (options: ItemsOptions) => SiteItems[S]
  readonly deadline?: Deadline
}

const timerDeadline: Deadline = (ms, expire) => {
  const timer = setTimeout(expire, ms)
  return () => clearTimeout(timer)
}
const ignore = () => {}

function blockers(document: Document): KeyBlockers {
  return {
    menuOpen: () => document.querySelector("tp-yt-iron-dropdown:not([aria-hidden='true']) [role='menu'], ytmusic-menu-popup-renderer[role='menu']") !== null,
    dialogOpen: () => document.querySelector("dialog[open], tp-yt-paper-dialog[opened]") !== null,
    extensionPopoverOpen: () => pageGlobal().popovers?.isOpen() === true
  }
}

/** The site core (06 §6.4.2): PageLink, ExtLink, FeatureHost, Items, Pointer, Keys and the kit-free notice. */
export function startSiteCore<S extends Site, Sender>(options: SiteCoreOptions<S, Sender>): SiteCore<S> {
  const { site, build, document, i18n } = options
  const onError = ignore
  const root = new Scope({ document, onError })
  const link_ = createPageLink({ site, build, vocabulary: options.vocabulary }, options.channel)
  // The batch goes out on a later turn, by which time the background client below exists.
  const health = createSiteHealth({ site, page: link_, send: reports => actions.health(reports), now: () => Date.now(),
    online: () => typeof navigator === "undefined" || navigator.onLine !== false, later: (run, ms) => root.timeout(run, ms) })
  // Every job answered here, the background's included, can clear its earlier signals in this tab (HEALTH-12).
  const page: PageLink = Object.create(link_, { run: { value: async (...args: Parameters<PageLink["run"]>) => {
    const answer = await link_.run(...args)
    if (answer.ok) health.succeeded(args[0].job.kind)
    return answer
  } } })
  const link = createExtLink<TabView, Sender>({
    build, site, page, runtime: options.runtime, deadline: options.deadline ?? timerDeadline,
    hiddenAtStart: document.visibilityState === "hidden", isView: isTabView
  })
  const background = createBackgroundLink({ build, deadline: options.deadline ?? timerDeadline, transport: options.runtime.transport, link })
  const pointer = new Pointer({ document, onError })
  const report = { itemUnrecognised: ignore, pageSettled: health.settled }
  const items = options.items({ document, onError, pointer, page, report })
  const keys = new Keys({ document, blockers: blockers(document), onError })
  const labels = siteFeedbackText(i18n)
  const notices = createNoticeOwner({ scope: root, onError,
    initial: plainNoticePresenter({ owner: root, document, site, onError, onCosmetic: ignore }) })
  let mount: ScopeMountPort | undefined
  const lentMount: ScopeMountPort = { mount(component, props, where) {
    if (!mount) throw new Error("Mounting needs the kit")
    return mount.mount(component, props, where)
  } }

  function request(due: DueNotice) {
    notices.update({ due, generation: {}, text: noticeText({ due, site, unavailableActionNames: [] }, i18n),
      detailsLabel: labels.details, dismissLabel: labels.dismiss, details: () => notices.update(null), dismiss: ignore, presented: ignore })
  }
  const thisVideo = createThisVideoChannel()
  // The popup's This video names the channel, for its Allow and Deny, so the channel is read only when asked (YT-CF-15).
  async function query(): Promise<TabAskMessages["bg.query"]["result"]> {
    const view = thisVideo.read()
    if (!view) return null
    const answer = await page.run<JobOf<"channelOf">>({ job: { kind: "channelOf", videoId: view.video } })
    const found = answer.ok && answer.data.channelId !== null ? answer.data : null
    return { ...view, channel: found?.channelId ? { id: found.channelId, title: found.title ?? "", handle: found.handle ?? null } : null }
  }
  const services: CoreServices<S> = {
    document, page, items, keys, i18n, actions, health, thisVideo,
    notice: { request },
    notices: { wouldAct(feature) {
      const due = link.view?.notices.find(notice => notice.features.some(id => id === feature))
      if (due) request(due)
    } }
  }
  const host = createFeatureHost<S, CoreServices<S>>({
    site,
    createScope: () => new Scope({ document, onError, mount: lentMount }),
    createContext: () => services,
    onEmpty: ignore,
    onError: ignore
  })
  host.connect(link)
  // The background's asks of a tab it acted in arrive here; the kit answers them, so without it they fail (YT-ANY-06).
  let asks: TabAsks | undefined
  const askRpc = createRpc<TabAskMessages, Sender>(options.runtime.transport, { build, deadline: options.deadline ?? timerDeadline, contract: tabAskContract })
  const stopAsks = askRpc.handle({
    authenticate({ sender }) {
      const id = options.runtime.identity()
      return id !== undefined && options.runtime.senderId(sender) === id ? { kind: "accepted", context: null } : { kind: "rejected" }
    },
    handlers: {
      "bg.toast"(payload) { asks?.toast(payload); return null },
      "bg.gatherToast"(payload) { asks?.gatherToast(payload); return null },
      async "bg.picker"(payload) { return { kind: asks ? await asks.picker(payload) : "failed" } },
      async "bg.music"(payload) { return asks?.music ? asks.music(payload) : { kind: "failed", text: null } },
      "bg.query": () => query()
    }
  })
  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
    for (const stop of [() => host.dispose(), () => health.dispose(), () => items.dispose(), () => pointer.dispose(), () => keys.dispose(), stopAsks, () => askRpc.dispose(), () => actions.dispose(), () => link.dispose(), () => root.dispose()]) {
      try { stop() } catch {}
    }
  }
  root.add(link.onView(view => { if (view === null && link.state.kind === "disposed") dispose() }))
  return {
    ...services, site, build, root, pointer, link,
    get disposed() { return disposed },
    define: definition => host.define(definition),
    attachKit(kit) {
      mount = kit.mount
      asks = kit.asks
      notices.transfer(kit.notices)
    },
    dispose
  }
}
