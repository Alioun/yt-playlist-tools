import type { SiteGateway } from "../jobs-gateway"
import { musicRoutes } from "../routes/music"
import { createMusicLibrary } from "./music-library"
import { createMusicContext, createMusicQueue } from "./music-queue"
import { createMusicQueueEdits } from "./music-queue-edit"

export const musicGateway: SiteGateway = {
  id: "music", table: musicRoutes,
  music(options, reads) {
    const context = createMusicContext(options)
    return { ...createMusicQueue(context), ...createMusicQueueEdits(context), ...createMusicLibrary(context, reads) }
  }
}
