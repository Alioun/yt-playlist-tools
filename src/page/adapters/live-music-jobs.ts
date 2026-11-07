import { musicGateway } from "../gateway/music"
import { createJobsGateway } from "../jobs-gateway"
import type { Jobs, JobsHost } from "../jobs-port"
import { createLiveMusicPage, createLiveMusicRequests } from "./live-music"
import { readLiveAccountMenu } from "./live-account-menu"

export function createLiveMusicJobs({ window, document, reads }: JobsHost): Jobs {
  return createJobsGateway({
    site: musicGateway,
    reads,
    accountMenu: () => readLiveAccountMenu(document),
    requests: createLiveMusicRequests({ window, document }),
    music: createLiveMusicPage({ window, document })
  })
}
