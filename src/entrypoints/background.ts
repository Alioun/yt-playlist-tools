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
    accessToken: string,
    checkDupes: boolean
  ) {
    if (checkDupes && (await isVideoCached(playlistId, videoId))) {
      await notify(tabId, "Video already in playlist.")
      return
    }

    const added = await addVideoToPlaylist(playlistId, videoId, accessToken)
    if (added) {
      await cacheVideo(playlistId, videoId)
      await notify(tabId, `Added ${videoId} to playlist`)
    } else {
      await notify(tabId, "Failed to add video to playlist")
    }
  }

  async function addToPlaylists(
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

    for (const playlistId of targets) {
      await addToPlaylist(tabId, playlistId, videoId, accessToken, checkDupes)
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

    const tabId = sender.tab?.id
    if (!tabId) return false

    if (message?.action === "addVideoToPlaylists") {
      store.playlists
        .getValue()
        .then((selected) => addToPlaylists(tabId, selected, message.videoId))
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
          await addToPlaylists(tabId, [playlistId], message.videoId)
        })
        .catch((error) => console.error("[YT Playlist Tools]:", error))
      return false
    }

    return false
  })
})
