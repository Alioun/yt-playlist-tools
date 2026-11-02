import { createGateway } from "../gateway"
import { musicGateway } from "../gateway/music"
import { createLiveReadPort, type LiveReadBindings } from "../live-reads"
import { createLiveMusicBindings, createLiveMusicPage, createLiveMusicRequests } from "./live-music"

export function createLiveMusicGateway(options: { window: Window; document: Document; bindings?: LiveReadBindings }) {
  const page = createLiveReadPort({ ...options, site: "music", bindings: { ...createLiveMusicBindings(options), ...options.bindings } })
  const gateway = createGateway({
    site: musicGateway, page, requests: createLiveMusicRequests(options), music: createLiveMusicPage(options)
  })
  return { gateway, dispose() { gateway.dispose(); page.dispose() } }
}
