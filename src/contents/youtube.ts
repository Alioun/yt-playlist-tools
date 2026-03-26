import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*"],
  exclude_matches: ["*://*.music.youtube.com/*"],
  run_at: "document_idle"
}

let toastCount = 0

function showToast(message: string) {
  chrome.storage.local.get("toastEnabled", (data) => {
    if (!data.toastEnabled) return

    const toast = document.createElement("div")
    toast.textContent = message
    toast.className = "yt-playlist-tools-toast"
    toast.style.position = "fixed"
    toast.style.top = "20px"
    toast.style.left = "50%"
    toast.style.transform = "translateX(-50%)"
    toast.style.backgroundColor = "#333"
    toast.style.color = "#fff"
    toast.style.padding = "10px 20px"
    toast.style.borderRadius = "5px"
    toast.style.zIndex = "10000"
    toast.style.fontSize = "16px"
    toast.style.opacity = "0"
    toast.style.transition = "opacity 0.3s ease, top 0.3s ease"

    document.body.insertBefore(toast, document.body.firstChild)
    toastCount++

    const existingToasts = document.querySelectorAll(".yt-playlist-tools-toast")
    existingToasts.forEach((t, index) => {
      ;(t as HTMLElement).style.top = `${20 + index * 50}px`
    })

    setTimeout(() => {
      toast.style.opacity = "1"
    }, 10)

    setTimeout(() => {
      toast.style.opacity = "0"
      setTimeout(() => {
        toast.remove()
        toastCount--
        const remainingToasts = document.querySelectorAll(
          ".yt-playlist-tools-toast"
        )
        remainingToasts.forEach((t, index) => {
          ;(t as HTMLElement).style.top = `${20 + index * 50}px`
        })
      }, 300)
    }, 3000)
  })
}

function isSearchBarFocused(): boolean {
  const activeElement = document.activeElement
  return (
    activeElement?.tagName.toLowerCase() === "input" &&
    (activeElement as HTMLInputElement).id === "search"
  )
}

async function handleShortcut(event: KeyboardEvent) {
  const videoId = new URL(location.href).searchParams.get("v")
  if (!videoId) return

  try {
    const data = await chrome.storage.local.get("watchLaterShortcut")
    const watchLaterShortcut: string | undefined = data.watchLaterShortcut
    if (!watchLaterShortcut) return

    const [key, ...modifiers] = watchLaterShortcut.split("+").reverse()
    const allModifiersMatch = modifiers.every(
      (mod) => event[`${mod.toLowerCase()}Key` as keyof KeyboardEvent]
    )

    if (
      event.key.toLowerCase() === key.toLowerCase() &&
      allModifiersMatch &&
      !isSearchBarFocused()
    ) {
      chrome.runtime.sendMessage({
        action: "addVideoToShortcutPlaylist",
        videoId
      })
    }
  } catch (error) {
    console.error("Error fetching watchLaterShortcut:", error)
  }
}

function addWatchListener() {
  const videoId = new URL(location.href).searchParams.get("v")
  const videoElement = document.querySelector("video")

  if (videoId && videoElement) {
    videoElement.addEventListener("timeupdate", function handler() {
      const watchedPercentage =
        (videoElement.currentTime / videoElement.duration) * 100

      chrome.storage.local.get("requiredWatchPercentage", (result) => {
        const requiredPercentage = Number(result.requiredWatchPercentage) || 0
        if (watchedPercentage >= requiredPercentage) {
          chrome.runtime.sendMessage({
            action: "addVideoToPlaylists",
            videoId
          })
          videoElement.removeEventListener("timeupdate", handler)
        }
      })
    })
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "showToast") {
    showToast(message.toastMessage)
  }
})

document.addEventListener("keydown", (event) => {
  handleShortcut(event)
})

document.addEventListener("yt-navigate-finish", () => {
  addWatchListener()
})
