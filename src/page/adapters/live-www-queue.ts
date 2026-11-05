import type { WwwQueuePort } from "../gateway/www-queue"
import { field } from "../read-parsers"
import { cardMenuButtons } from "../../shared/youtube/card-menu-buttons"
import type { WwwResolver } from "./www-resolver"

const youtube = "https://www.youtube.com"

export function createLiveWwwQueue(options: { window: Window; document: Document; resolver: WwwResolver }): WwwQueuePort {
  const { window: win, document: doc, resolver } = options
  return {
    has: () => win.location.origin === youtube && resolver.find() !== undefined,
    resolve(endpoint, context) {
      if (win.location.origin !== youtube) return { kind: "not-sent", cause: "missing" }
      return resolver.command(endpoint, context)
    },
    panel() {
      const panels = [...doc.querySelectorAll("ytd-playlist-panel-renderer")]
      if (panels.length === 0) return undefined
      return panels.flatMap(panel => [field(panel, "data"), field(panel, "polymerController", "data"), field(panel, "inst", "data")])
    },
    miniplayer() {
      const player = doc.querySelector("ytd-miniplayer")
      return player ? field(player, "active") : undefined
    },
    connected: target => target.isConnected && target.ownerDocument === doc,
    onAction(seen) {
      const listener = (event: Event) => {
        seen("detail" in event ? event.detail : undefined)
      }
      doc.addEventListener("yt-action", listener, true)
      return () => doc.removeEventListener("yt-action", listener, true)
    },
    openMenu(target) {
      for (const selector of cardMenuButtons) {
        const button = target.querySelector(selector)
        if (button instanceof HTMLElement && button.isConnected) {
          button.click()
          return "clicked"
        }
      }
      return "missing"
    }
  }
}
