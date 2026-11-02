import type { SiteGateway } from "../gateway"
import { wwwRoutes } from "../routes/www"
import { createWwwQueue } from "./www-queue"

export const wwwGateway: SiteGateway = { id: "www", table: wwwRoutes, queue: createWwwQueue }
