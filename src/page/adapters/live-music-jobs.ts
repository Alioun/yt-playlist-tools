import { musicGateway } from "../gateway/music"
import { createJobsGateway } from "../jobs-gateway"
import type { Jobs, JobsHost } from "../jobs-port"
import { createLiveMusicPage, createLiveMusicRequests } from "./live-music"

export function createLiveMusicJobs({ window, document, reads }: JobsHost): Jobs {
  return createJobsGateway({
    site: musicGateway, reads, requests: createLiveMusicRequests({ window, document }), music: createLiveMusicPage({ window, document })
  })
}
