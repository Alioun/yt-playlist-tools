import { createLiveReadPort, type LiveReadBindings } from "../live-reads"
import { createReadGateway } from "../read-gateway"
import { createLiveMusicBindings } from "./live-music"

export function createLiveMusicReads(options: { window: Window; document: Document; bindings?: LiveReadBindings }) {
  const page = createLiveReadPort({ ...options, site: "music", bindings: { ...createLiveMusicBindings(options), ...options.bindings } })
  const gateway = createReadGateway({ site: "music", page })
  return { gateway, dispose() { gateway.dispose(); page.dispose() } }
}
