import type { Site } from "../../shared/contracts"
import { createGateway } from "../gateway"
import { createLiveReadPort } from "../live-reads"
import type { LiveReadBindings } from "../live-reads"
import { createLiveWwwRequests } from "./live-www"
import { createLiveMusicBindings, createLiveMusicPage, createLiveMusicRequests } from "./live-music"
import { createLiveWwwQueue } from "./live-www-queue"
import { createWwwResolver } from "./www-resolver"

export function createLiveGateway(options: { site: Site; window: Window; document: Document; bindings?: LiveReadBindings }) {
  const bindings = options.site === "music" ? { ...createLiveMusicBindings(options), ...options.bindings } : options.bindings
  const page = createLiveReadPort({ ...options, ...(bindings ? { bindings } : {}) })
  const resolver = options.site === "www" ? createWwwResolver(options.window) : undefined
  const requests = resolver ? createLiveWwwRequests({ ...options, page, resolver }) : createLiveMusicRequests(options)
  const queue = resolver ? createLiveWwwQueue({ ...options, resolver }) : undefined
  const music = resolver ? undefined : createLiveMusicPage(options)
  const gateway = createGateway({ site: options.site, page, requests, ...(queue ? { queue } : {}), ...(music ? { music } : {}) })
  return { gateway, dispose() { gateway.dispose(); page.dispose() } }
}
