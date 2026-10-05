import {
  anyFilterOn,
  isFilteredOut,
  resolveVideoChannel
} from "@/lib/channel-filters"
import * as store from "@/lib/storage"
import { cacheVideo, isVideoCached } from "@/lib/video-cache"
import { addVideoToPlaylist, fetchUserPlaylists } from "@/lib/youtube"

/**
 * NOTE: every runtime statement must live inside main(). WXT imports this file
 * in Node during the build, so top-level extension API calls would throw.
 * main() itself must stay synchronous.
 */
export default defineBackground(() => {
  async function notify(tabId: number, toastMessage: string) {
    try {
      await browser.tabs.sendMessage(tabId, {
        action: "showToast",
        toastMessage
      })
    } catch {
      // Content script not present on this tab -- nothing to do.
    }
  }

  async function addToPlaylist(
    tabId: number,
    playlistId: string,
    videoId: string,
    accessToken: string
  ) {
    const added = await addVideoToPlaylist(playlistId, videoId, accessToken)
    if (added) {
      await cacheVideo(playlistId, videoId)
      await notify(tabId, `Added ${videoId} to playlist`)
    } else {
      await notify(tabId, "Failed to add video to playlist")
    }
  }

  /**
   * Checks what every add needs before touching the API. Toasts and returns
   * undefined when the add can't go ahead.
   */
  async function prepareAdd(
    tabId: number,
    playlistIds: string[],
    videoId: string
  ) {
    if (!videoId) {
      console.error("[YT Playlist Tools]: message had no videoId")
      return
    }

    const [accessToken, checkDupes] = await Promise.all([
      store.accessToken.getValue(),
      store.preventDuplicates.getValue()
    ])

    if (!accessToken) {
      await notify(tabId, "No access token found")
      console.error("[YT Playlist Tools]: No access token found")
      return
    }

    const targets = playlistIds.filter(Boolean)
    if (targets.length === 0) {
      // Otherwise the watch threshold passes and absolutely nothing happens --
      // no toast, no log -- which reads as a broken extension.
      await notify(tabId, "No auto-add playlists selected")
      return
    }

    return { accessToken, checkDupes, targets }
  }

  /** Drops playlists that already hold the video, toasting for each one. */
  async function withoutDuplicates(
    tabId: number,
    playlistIds: string[],
    videoId: string,
    checkDupes: boolean
  ) {
    if (!checkDupes) return playlistIds

    const remaining: string[] = []
    for (const playlistId of playlistIds) {
      if (await isVideoCached(playlistId, videoId)) {
        await notify(tabId, "Video already in playlist.")
      } else {
        remaining.push(playlistId)
      }
    }
    return remaining
  }

  /** The shared add step. Callers have already removed duplicates. */
  async function addToPlaylists(
    tabId: number,
    playlistIds: string[],
    videoId: string,
    accessToken: string
  ) {
    for (const playlistId of playlistIds) {
      await addToPlaylist(tabId, playlistId, videoId, accessToken)
    }
  }

  async function addToShortcutPlaylist(
    tabId: number,
    playlistId: string,
    videoId: string
  ) {
    const ready = await prepareAdd(tabId, [playlistId], videoId)
    if (!ready) return

    const { accessToken, checkDupes, targets } = ready
    const remaining = await withoutDuplicates(tabId, targets, videoId, checkDupes)
    await addToPlaylists(tabId, remaining, videoId, accessToken)
  }

  /**
   * Drops playlists whose channel filter keeps this video out, with one toast
   * naming every one of them. The channel is only looked up when a remaining
   * playlist has a filter switched on, so unfiltered users spend no quota.
   */
  async function withoutFilteredOut(
    tabId: number,
    playlistIds: string[],
    videoId: string
  ) {
    const filters = await store.channelFilters.getValue()
    if (!anyFilterOn(filters, playlistIds)) return playlistIds

    const channel = await resolveVideoChannel(videoId)
    const channelId = channel?.channelId ?? null
    const blocked = playlistIds.filter((id) => isFilteredOut(filters[id], channelId))
    if (blocked.length === 0 || !channel) return playlistIds

    const cached = await store.cachedPlaylists.getValue()
    const titles = blocked.map(
      (id) => cached.find((playlist) => playlist.id === id)?.title ?? id
    )
    const message = `${channel.title} filtered out of ${titles.join(", ")}`
    // The toast is dropped by the content script when toasts are off, so this
    // log is then the only record of the decision.
    console.info(`[YT Playlist Tools]: filtered ${message}`)
    await notify(tabId, message)

    return playlistIds.filter((id) => !blocked.includes(id))
  }

  /**
   * The auto-add path, kept apart from the shortcut so anything that should
   * only apply to auto-add (such as channel filters) has one place to go.
   */
  async function autoAdd(tabId: number, playlistIds: string[], videoId: string) {
    const ready = await prepareAdd(tabId, playlistIds, videoId)
    if (!ready) return

    const { accessToken, checkDupes, targets } = ready
    const remaining = await withoutDuplicates(tabId, targets, videoId, checkDupes)
    const passing = await withoutFilteredOut(tabId, remaining, videoId)
    await addToPlaylists(tabId, passing, videoId, accessToken)
  }

  /** The popup's channel lookup, through the same resolver as auto-add. */
  async function getChannelForTab(videoId: unknown) {
    if (typeof videoId !== "string" || !videoId) return { channel: null }
    try {
      return { channel: await resolveVideoChannel(videoId) }
    } catch (error) {
      // Must never reject, for the same reason as getPlaylists.
      console.error("[YT Playlist Tools]:", error)
      return { channel: null }
    }
  }

  async function getPlaylists() {
    try {
      const accessToken = await store.accessToken.getValue()
      if (!accessToken) return { error: "No access token", playlists: [] }

      const playlists = await fetchUserPlaylists(accessToken)
      // Cached so the next popup open paints immediately.
      await store.cachedPlaylists.setValue(playlists)
      return { playlists }
    } catch (error) {
      // Must never reject: the listener has already returned true, so a
      // rejection here would leave sendResponse uncalled and the popup stuck
      // on "Loading..." forever.
      return { error: String(error), playlists: [] }
    }
  }

  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    // Chrome does NOT support returning a Promise from an onMessage listener
    // (crbug 1185241), and WXT ships no webextension-polyfill -- on Chrome
    // `browser` IS `chrome`. Returning `true` and calling sendResponse later is
    // the only pattern that works on both browsers.
    if (message?.action === "fetchPlaylists") {
      getPlaylists().then(sendResponse)
      return true
    }

    // Sent by the popup, which has no sender tab. `tabId` is the tab whose
    // video it is, for lookups that need to ask the page.
    if (message?.action === "getChannelForTab") {
      getChannelForTab(message.videoId).then(sendResponse)
      return true
    }

    const tabId = sender.tab?.id
    if (!tabId) return false

    if (message?.action === "addVideoToPlaylists") {
      store.playlists
        .getValue()
        .then((selected) => autoAdd(tabId, selected, message.videoId))
        .catch((error) => console.error("[YT Playlist Tools]:", error))
      return false
    }

    if (message?.action === "addVideoToShortcutPlaylist") {
      store.addToPlaylistID
        .getValue()
        .then(async (playlistId) => {
          if (!playlistId) {
            await notify(tabId, "No shortcut playlist selected")
            return
          }
          await addToShortcutPlaylist(tabId, playlistId, message.videoId)
        })
        .catch((error) => console.error("[YT Playlist Tools]:", error))
      return false
    }

    return false
  })
})
