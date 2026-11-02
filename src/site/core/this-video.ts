import type { ThisVideo } from "../../shared/contracts/this-video"

/**
 * Auto-add's view of this tab's playback, shared in the page: auto-add publishes it, the watch-page button and its
 * menu draw it, and the background reads it for the popup's This video (YT-AA-38, `bg.query`). Null is no playback.
 */
export type ThisVideoChannel = {
  publish(view: ThisVideo | null): void
  read(): ThisVideo | null
  subscribe(listener: (view: ThisVideo | null) => void): () => void
}

export function createThisVideoChannel(): ThisVideoChannel {
  let current: ThisVideo | null = null
  const listeners = new Set<(view: ThisVideo | null) => void>()
  return {
    publish(view) {
      if (JSON.stringify(view) === JSON.stringify(current)) return
      current = view
      for (const listener of [...listeners]) { try { listener(view) } catch {} }
    },
    read: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
  }
}
