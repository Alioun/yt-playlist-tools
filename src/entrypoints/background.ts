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
   * The auto-add path, kept apart from the shortcut so anything that should
   * only apply to auto-add (such as channel filters) has one place to go.
   */
  async function autoAdd(tabId: number, playlistIds: string[], videoId: string) {
    const ready = await prepareAdd(tabId, playlistIds, videoId)
    if (!ready) return

    const { accessToken, checkDupes, targets } = ready
    const remaining = await withoutDuplicates(tabId, targets, videoId, checkDupes)
    await addToPlaylists(tabId, remaining, videoId, accessToken)
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
