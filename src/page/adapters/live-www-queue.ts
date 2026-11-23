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
      const manager = doc.querySelector("yt-playlist-manager")
      const read = field(manager, "getPlaylistData")
      return [
        ...[...doc.querySelectorAll("ytd-playlist-panel-renderer")].flatMap(panel => [field(panel, "data"), field(panel, "polymerController", "data"), field(panel, "inst", "data")]),
        // Off the watch page only YouTube's playlist manager holds the queue.
        typeof read === "function" ? Reflect.apply(read, manager, []) : undefined
      ]
    },
    connected: target => target.isConnected && target.ownerDocument === doc,
    onAction(seen) {
      const listener = (event: Event) => {
        seen("detail" in event ? event.detail : undefined)
      }
      doc.addEventListener("yt-action", listener, true)
      return () => doc.removeEventListener("yt-action", listener, true)
    },
    onMenu(target, at, opened) {
      // YouTube marks a dropdown opened before it places it, so moving its anchor here draws it once, at the pointer.
      const listener = (event: Event) => {
        const dropdown = event.target
        if (!(dropdown instanceof Element) || dropdown.localName !== "tp-yt-iron-dropdown" || field(event, "detail", "value") !== true) return
        const anchoredAt = field(dropdown, "positionTarget")
        if (!(anchoredAt instanceof Node) || !target.contains(anchoredAt)) return
        stop()
        const anchor = doc.createElement("div")
        anchor.style.cssText = `position:fixed;left:${at.x}px;top:${at.y}px;width:0;height:0;pointer-events:none`
        doc.body.append(anchor)
        Reflect.set(dropdown, "positionTarget", anchor)
        const closed = (change: Event) => {
          if (change.target !== dropdown || field(change, "detail", "value") !== false) return
          dropdown.removeEventListener("opened-changed", closed)
          if (field(dropdown, "positionTarget") === anchor) Reflect.set(dropdown, "positionTarget", anchoredAt)
          anchor.remove()
        }
        dropdown.addEventListener("opened-changed", closed)
        opened()
      }
      const stop = () => doc.removeEventListener("opened-changed", listener, true)
      doc.addEventListener("opened-changed", listener, true)
      return stop
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
