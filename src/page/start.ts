import { isPageType, parseJsonText, type BreakageSignal, type BuildId, type DiagnosticPageType, type PageType, type Site } from "../shared/contracts"
import { isPageRetireMessage, type PageHelloSnapshot, type PageNavigationType } from "../shared/contracts/page"
import { createDomPageChannel, pagePresenceEvent, type PageChannel } from "../shared/rpc/page-channel"
import { createLiveGateway } from "./adapters/live-gateway"
import { servePage, type PageEndpoint } from "./channel"
import type { ReadGateway } from "./gateway"
import { vocabularyFor } from "./gateway/port"
import { musicRoutes } from "./routes/music"
import { wwwRoutes } from "./routes/www"

type LiveGateway = { readonly gateway: ReadGateway; dispose(): void }
export type PageStartOptions = {
  readonly site: Site
  readonly build: BuildId
  readonly window: Window
  readonly document: Document
  readonly channel?: PageChannel
  readonly createGateway?: (options: { site: Site; window: Window; document: Document }) => LiveGateway
}

const navigationTypes: readonly PageNavigationType[] = ["navigate", "reload", "back_forward", "prerender"]

function navigationType(win: Window): PageNavigationType | null {
  try {
    const entry = win.performance.getEntriesByType("navigation")[0]
    const type: unknown = entry && "type" in entry ? entry.type : undefined
    return navigationTypes.find(known => known === type) ?? null
  } catch { return null }
}

function pageType(site: Site, location: Location): PageType {
  const path = location.pathname
  const type: DiagnosticPageType = path === "/watch" ? "watch" : path.startsWith("/shorts/") ? "shorts"
    : site === "music" ? "music-browse" : path === "/" ? "home" : path === "/results" ? "search" : "other"
  if (!isPageType(type)) throw new Error("Invalid page type")
  return type
}

/**
 * The page half (06 §6.5, ARC-MAN-10). It reads how the page started at document_start and then only
 * listens. The gateway is made on the core's first frame, because YouTube's config, which pins the
 * account, doesn't exist yet at document_start.
 */
export function startPage(options: PageStartOptions): PageEndpoint {
  const { site, build, window: win, document: doc } = options
  const startedHidden = doc.visibilityState === "hidden"
  const navType = navigationType(win)
  const channel = options.channel ?? createDomPageChannel(doc)
  const sinks = new Set<(signal: BreakageSignal) => void>()
  let live: LiveGateway | undefined
  let retired = false

  function gateway(): ReadGateway {
    if (!live) {
      live = (options.createGateway ?? createLiveGateway)({ site, window: win, document: doc })
      live.gateway.onSignal(signal => { for (const sink of [...sinks]) sink(signal) })
    }
    return live.gateway
  }
  function snapshot(): PageHelloSnapshot | undefined {
    const account = gateway().account
    return account ? { ...account, pageType: pageType(site, win.location), startedHidden, navType } : undefined
  }

  const endpoint = servePage({
    run: (job, context) => gateway().run(job, context),
    watch: (stream, onData) => gateway().watch(stream, onData),
    probe: () => gateway().probe()
  }, {
    site, build, snapshot,
    vocabulary: vocabularyFor(site === "www" ? wwwRoutes : musicRoutes),
    signals(sink) {
      sinks.add(sink)
      return () => { sinks.delete(sink) }
    }
  }, channel)
  const present = (event: Event) => {
    if (event instanceof CustomEvent && event.detail === build) event.preventDefault()
  }
  doc.addEventListener(pagePresenceEvent, present)
  function dispose() {
    if (retired) return
    retired = true
    stopRetire()
    doc.removeEventListener(pagePresenceEvent, present)
    try { endpoint.dispose() } finally { live?.dispose() }
  }
  const stopRetire = channel.listen("retire", detail => {
    const parsed = parseJsonText(detail)
    if (parsed.ok && isPageRetireMessage(parsed.value) && parsed.value.build !== build) dispose()
  })
  return { get disposed() { return endpoint.disposed }, dispose }
}
