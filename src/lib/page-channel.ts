/**
 * The free channel lookup: reading the watch page's own player response
 * through the MAIN-world bridge, instead of spending quota on `videos.list`.
 *
 * The content script half (`readPlayerChannel`) asks the bridge and passes on
 * what it said. The background half (`channelFromPage`) decides whether to
 * believe it.
 */
import type { VideoChannel } from "@/lib/storage"

export const PLAYER_REQUEST = "ytpt:read-player"
export const PLAYER_RESPONSE = "ytpt:read-player:done"

/** The bridge answers at once, so this only trips when it isn't there. */
const TIMEOUT_MS = 1000

/** What the bridge read from `#movie_player.getPlayerResponse()`, all strings. */
export interface PlayerChannel {
  videoId: string
  channelId: string
  author: string
  ownerProfileUrl: string
}

/** See `toPageDetail` in `@/lib/queue`. */
declare const cloneInto: (<T>(value: T, scope: Window) => T) | undefined

function toPageDetail<T>(detail: T): T {
  return typeof cloneInto === "function" ? cloneInto(detail, window) : detail
}

let counter = 0

/**
 * Asks the bridge which video and channel the player holds. Resolves null when
 * there is no player or the bridge doesn't answer in time; never throws.
 */
export function readPlayerChannel(): Promise<PlayerChannel | null> {
  const token = `${Date.now()}-${counter++}`

  return new Promise((resolve) => {
    let settled = false

    const finish = (result: PlayerChannel | null) => {
      if (settled) return
      settled = true
      document.removeEventListener(PLAYER_RESPONSE, onDone)
      clearTimeout(timer)
      resolve(result)
    }

    const onDone = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.token !== token) return
      // Copied field by field: on Firefox the detail is a page object, and
      // only plain strings should cross into the extension.
      const fields = ["videoId", "channelId", "author", "ownerProfileUrl"] as const
      const page = {} as PlayerChannel
      for (const field of fields) {
        const value = detail[field]
        page[field] = typeof value === "string" ? value : ""
      }
      finish(page.videoId ? page : null)
    }

    const timer = setTimeout(() => finish(null), TIMEOUT_MS)
    document.addEventListener(PLAYER_RESPONSE, onDone)

    document.dispatchEvent(
      new CustomEvent(PLAYER_REQUEST, { detail: toPageDetail({ token }) })
    )
  })
}

/**
 * The handle in a player's `ownerProfileUrl`, such as
 * `http://www.youtube.com/@LofiGirl` → `@LofiGirl`. Undefined when the URL has
 * no handle (older channels can have a `/channel/UC…` URL instead).
 */
export function handleFromProfileUrl(url: string): string | undefined {
  try {
    const segment = new URL(url).pathname.split("/")[1] ?? ""
    const handle = decodeURIComponent(segment)
    return /^@[^\s/]+$/.test(handle) ? handle : undefined
  } catch {
    return undefined
  }
}

/**
 * The channel a page read reports for `videoId`, or null when the read is
 * missing, malformed or about another video. The videoId check catches a
 * player that still holds the previous video after in-app navigation; it
 * can't catch a page that lies, which only affects the user's own auto-add.
 */
export function channelFromPage(
  videoId: string,
  page: unknown
): VideoChannel | null {
  if (!page || typeof page !== "object") return null
  const { videoId: pageVideoId, channelId, author, ownerProfileUrl } =
    page as Partial<Record<keyof PlayerChannel, unknown>>

  if (pageVideoId !== videoId) return null
  if (typeof channelId !== "string" || !channelId.startsWith("UC")) return null

  const handle =
    typeof ownerProfileUrl === "string"
      ? handleFromProfileUrl(ownerProfileUrl)
      : undefined
  return {
    channelId,
    title: typeof author === "string" ? author : "",
    ...(handle ? { handle } : {})
  }
}
