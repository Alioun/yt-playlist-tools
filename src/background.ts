import { refreshAccessToken } from "~utils"

function getCachedVideos(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem("cachedVideos") || "{}")
  } catch {
    return {}
  }
}

function cacheVideo(playlistId: string, videoId: string) {
  const cachedVideos = getCachedVideos()
  if (!cachedVideos[playlistId]) {
    cachedVideos[playlistId] = []
  }
  if (!cachedVideos[playlistId].includes(videoId)) {
    cachedVideos[playlistId].push(videoId)
    localStorage.setItem("cachedVideos", JSON.stringify(cachedVideos))
  }
}

function isVideoCached(playlistId: string, videoId: string): boolean {
  const cachedVideos = getCachedVideos()
  if (cachedVideos?.[playlistId]) {
    return cachedVideos[playlistId].includes(videoId)
  }
  return false
}

async function addToPlaylist(
  tabId: number,
  playlistId: string,
  videoId: string,
  accessToken: string,
  checkDupes: boolean
) {
  if (checkDupes && isVideoCached(playlistId, videoId)) {
    chrome.tabs.sendMessage(tabId, {
      action: "showToast",
      toastMessage: "Video already in playlist."
    })
    return
  }

  const url = "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet"
  const body = {
    snippet: {
      playlistId,
      resourceId: {
        kind: "youtube#video",
        videoId
      }
    }
  }

  let response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  })

  if (response.status === 200) {
    cacheVideo(playlistId, videoId)
    chrome.tabs.sendMessage(tabId, {
      action: "showToast",
      toastMessage: `Added ${videoId} to playlist`
    })
  } else if (response.status === 401) {
    const newAccessToken = await refreshAccessToken()
    if (newAccessToken) {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      })
      if (response.status === 200) {
        cacheVideo(playlistId, videoId)
      }
    } else {
      console.error("Failed to refresh access token")
    }
  }

  if (!response.ok) {
    console.error("Failed to add video to playlist:", response.statusText)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id
  if (!tabId) return

  if (message.action === "addVideoToPlaylists") {
    const { videoId } = message

    chrome.storage.local.get(
      ["playlists", "accessToken", "preventDuplicates"],
      async (result) => {
        const playlists: string[] = result.playlists || []
        const accessToken: string = result.accessToken
        const checkDupes: boolean = result.preventDuplicates === true

        if (!accessToken) {
          chrome.tabs.sendMessage(tabId, {
            action: "showToast",
            toastMessage: "No access token found"
          })
          console.error("[Youtube Playlist Tools]: No access token found")
          return
        }

        for (const playlistId of playlists) {
          await addToPlaylist(tabId, playlistId, videoId, accessToken, checkDupes)
        }
      }
    )
  } else if (message.action === "addVideoToShortcutPlaylist") {
    const { videoId } = message

    chrome.storage.local.get(
      ["addToPlaylistID", "accessToken", "preventDuplicates"],
      async (result) => {
        const playlistId: string = result.addToPlaylistID
        const accessToken: string = result.accessToken
        const checkDupes: boolean = result.preventDuplicates === true

        if (!accessToken) {
          chrome.tabs.sendMessage(tabId, {
            action: "showToast",
            toastMessage: "No access token found"
          })
          console.error("[Youtube Playlist Tools]: No access token found")
          return
        }

        await addToPlaylist(tabId, playlistId, videoId, accessToken, checkDupes)
      }
    )
  }
})
