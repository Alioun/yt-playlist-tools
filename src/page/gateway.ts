import type { BreakageSignal } from "../shared/contracts"
import { composeGateway, type Gateway } from "./compose"
import type { GatewayRequestPort } from "./gateway/port"
import type { GatewayClock } from "./gateway/lanes"
import type { WwwQueuePort } from "./gateway/www-queue"
import type { MusicPagePort } from "./gateway/music-queue"
import { createJobsGateway, type SiteGateway } from "./jobs-gateway"
import type { PageReadPort } from "./read-port"
import { createReadGateway } from "./read-gateway"

export type { Gateway } from "./compose"
export type { SiteGateway } from "./jobs-gateway"

/**
 * The whole gateway in one place, its jobs half made at once. The page itself loads the jobs half later, in its own
 * file (`startPage`); fixtures and tests that drive both halves together use this.
 */
export function createGateway(options: {
  site: SiteGateway; page: PageReadPort; requests?: GatewayRequestPort; queue?: WwwQueuePort; music?: MusicPagePort; clock?: GatewayClock;
  signals?: (signal: BreakageSignal) => void; now?: () => number
}): Gateway {
  const reads = createReadGateway({ site: options.site.id, page: options.page, ...options.signals && { signals: options.signals }, ...options.now && { now: options.now } })
  const jobs = createJobsGateway({ ...options, reads })
  return composeGateway(reads, jobs)
}
