/**
 * MAIN-world bridge that performs YouTube's native "Add to queue", and reads
 * the player's channel for the free channel lookup (`@/lib/page-channel`).
 *
 * Why a separate script: the action is a Polymer command, dispatched through
 * `element.resolveCommand(...)`. That method lives on the page's prototypes and
 * is invisible from a content script's isolated world.
 *
 * Why injectScript rather than `world: "MAIN"`: Firefox only gained MAIN-world
 * content script support in 128, and this extension's manifest declares
 * strict_min_version 125. Injecting a web-accessible script keeps those users
 * working. (If the floor is ever raised to 128, this file can become a normal
 * content script with `world: "MAIN"` and the bridge messaging can go away.)
 *
 * Communication is a pair of CustomEvents carrying only strings, so there is
 * nothing expensive or unsafe to clone across the world boundary.
 */

export const QUEUE_REQUEST = "ytpt:add-to-queue"
export const QUEUE_RESPONSE = "ytpt:add-to-queue:done"
export const PLAYER_REQUEST = "ytpt:read-player"
export const PLAYER_RESPONSE = "ytpt:read-player:done"

export default defineUnlistedScript(() => {
  /**
   * Builds the command YouTube's own menu item fires.
   *
   * The conditional matters: `openMiniplayer` + `onCreateListCommand` ask
   * YouTube to CREATE a queue. Sending them when a queue already exists
   * replaces it instead of appending, so they are only included when the
   * miniplayer is not already active.
   */
  function queueCommand(videoId: string) {
    const command: Record<string, unknown> = {
      videoIds: [videoId],
      listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE"
    }

    const miniplayer = document.querySelector("ytd-miniplayer") as
      | (Element & { active?: boolean })
      | null

    if (!miniplayer?.active) {
      command.openMiniplayer = true
      command.onCreateListCommand = {
        createPlaylistServiceEndpoint: {
          videoIds: [videoId],
          params: "CAQ%3D"
        }
      }
    }

    return {
      signalServiceEndpoint: {
        signal: "CLIENT_SIGNAL",
        actions: [{ addToPlaylistCommand: command }]
      }
    }
  }

  type Resolver = Element & { resolveCommand?: (command: unknown) => unknown }

  /**
   * Any Polymer element can resolve a command. A thumbnail belonging to the
   * video is the closest analogue to what YouTube's own menu item uses;
   * ytd-app is the always-present fallback.
   */
  function resolverFor(videoId: string): Resolver[] {
    let own: Resolver | null = null
    try {
      // CSS.escape: videoId reaches here from a page href, and an unexpected
      // character would otherwise make this selector throw.
      own = document
        .querySelector(`a[href*="watch?v=${CSS.escape(videoId)}"]`)
        ?.closest("ytd-thumbnail, yt-thumbnail-view-model") as Resolver | null
    } catch {
      // Fall back to ytd-app.
    }

    return [own, document.querySelector("ytd-app") as Resolver | null].filter(
      (el): el is Resolver => typeof el?.resolveCommand === "function"
    )
  }

  /** True when YouTube currently has a queue open. */
  function queueIsOpen(): boolean {
    const miniplayer = document.querySelector("ytd-miniplayer") as
      | (Element & { active?: boolean })
      | null
    return Boolean(miniplayer?.active)
  }

  document.addEventListener(QUEUE_REQUEST, (event) => {
    const detail = (event as CustomEvent).detail as {
      videoId?: string
      token?: string
    }
    const { videoId, token } = detail ?? {}

    const reply = (ok: boolean) =>
      document.dispatchEvent(
        new CustomEvent(QUEUE_RESPONSE, { detail: { token, ok } })
      )

    let dispatched = false
    let hadQueue = false
    try {
      if (videoId) {
        hadQueue = queueIsOpen()
        for (const element of resolverFor(videoId)) {
          try {
            element.resolveCommand!(queueCommand(videoId))
            dispatched = true
            break
          } catch {
            // Try the next host.
          }
        }
      }
    } catch (error) {
      // Anything unexpected must still produce a reply, or the caller sits on
      // its timeout with a spinning button.
      console.error("[YT Playlist Tools]: queue command failed", error)
      reply(false)
      return
    }

    if (!dispatched) {
      reply(false)
      return
    }

    if (hadQueue) {
      // A queue was already open, so an append leaves nothing observable to
      // check. Report the dispatch as success.
      reply(true)
      return
    }

    // The command is fire-and-forget: resolveCommand returns regardless of
    // whether YouTube acted on it. When no queue existed beforehand, one
    // appearing is the confirmation -- without this the button flashed green
    // even when nothing was queued (signed out, or an unsupported surface).
    let waited = 0
    const poll = () => {
      if (queueIsOpen()) return reply(true)
      waited += 50
      if (waited >= 600) return reply(false)
      setTimeout(poll, 50)
    }
    setTimeout(poll, 50)
  })

  type Player = Element & { getPlayerResponse?: () => any }

  /**
   * Reports the channel of the video the player holds, for the free channel
   * lookup. `getPlayerResponse()` is current from `yt-player-updated` on,
   * unlike `ytInitialPlayerResponse`, which stays on the first video of an
   * in-app session. The caller checks the videoId, since the player can still
   * hold the previous video for a moment after navigating.
   */
  document.addEventListener(PLAYER_REQUEST, (event) => {
    const { token } = ((event as CustomEvent).detail ?? {}) as { token?: string }

    const read = (): Record<string, string> => {
      try {
        const player = document.querySelector("#movie_player") as Player | null
        const response = player?.getPlayerResponse?.()
        const details = response?.videoDetails
        const microformat = response?.microformat?.playerMicroformatRenderer
        const text = (value: unknown) => (typeof value === "string" ? value : "")
        return {
          videoId: text(details?.videoId),
          channelId: text(details?.channelId),
          author: text(details?.author),
          ownerProfileUrl: text(microformat?.ownerProfileUrl)
        }
      } catch {
        // No player, or YouTube changed it: the caller falls back to the API.
        return {}
      }
    }

    document.dispatchEvent(
      new CustomEvent(PLAYER_RESPONSE, { detail: { token, ...read() } })
    )
  })
})
