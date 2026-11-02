import { createGateway } from "../gateway"
import { wwwGateway } from "../gateway/www"
import { createLiveReadPort, type LiveReadBindings } from "../live-reads"
import { createLiveWwwRequests } from "./live-www"
import { createLiveWwwQueue } from "./live-www-queue"
import { createWwwResolver } from "./www-resolver"

export function createLiveWwwGateway(options: { window: Window; document: Document; bindings?: LiveReadBindings }) {
  const page = createLiveReadPort({ ...options, site: "www" })
  const resolver = createWwwResolver(options.window)
  const gateway = createGateway({
    site: wwwGateway, page,
    requests: createLiveWwwRequests({ ...options, page, resolver }), queue: createLiveWwwQueue({ ...options, resolver })
  })
  return { gateway, dispose() { gateway.dispose(); page.dispose() } }
}
