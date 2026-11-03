import { wwwGateway } from "../gateway/www"
import { createJobsGateway } from "../jobs-gateway"
import type { Jobs, JobsHost } from "../jobs-port"
import { createLiveWwwRequests } from "./live-www"
import { createLiveWwwQueue } from "./live-www-queue"
import { createWwwResolver } from "./www-resolver"

export function createLiveWwwJobs({ window, document, reads }: JobsHost): Jobs {
  const resolver = createWwwResolver(window)
  return createJobsGateway({
    site: wwwGateway,
    reads,
    requests: createLiveWwwRequests({ window, document, page: reads.page, resolver }),
    queue: createLiveWwwQueue({ window, document, resolver })
  })
}
