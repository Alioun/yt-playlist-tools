import { createLiveReadPort, type LiveReadBindings } from "../live-reads"
import { createReadGateway } from "../read-gateway"

export function createLiveWwwReads(options: { window: Window; document: Document; bindings?: LiveReadBindings }) {
  const page = createLiveReadPort({ ...options, site: "www" })
  const gateway = createReadGateway({ site: "www", page })
  return {
    gateway,
    dispose() {
      gateway.dispose()
      page.dispose()
    }
  }
}
