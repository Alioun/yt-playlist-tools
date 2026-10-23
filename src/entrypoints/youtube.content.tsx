import { browser } from "wxt/browser"
import { defineContentScript } from "wxt/utils/define-content-script"
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root"
import ReactDOM from "react-dom/client"
import { toast } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { matchesShortcut, parseShortcut } from "@/lib/shortcut"
import { CARD_EXCLUDE_SELECTORS, CARD_SELECTORS, THUMBNAIL_SELECTORS, injectQueueStyles, removeQueueStyles, shouldInjectOnPath } from "@/lib/queue"
import { enableCardMenu } from "@/lib/card-menu"
import { observe as observeQueueButtons } from "@/lib/queue-button"
import * as store from "@/lib/storage"
import { isConsentGeneration, isRecord, isSnapshot } from "@/lib/session"
import "@/assets/tailwind.css"
import "sonner/dist/styles.css"

declare global {
  var __ytptStop: (() => void) | undefined
}

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  registration: "runtime",
  runAt: "document_idle",
  cssInjectionMode: "ui",
  async main(ctx) {
    if (await store.sessionConsent.getValue() !== store.CONSENT_VERSION) return
    const consentGeneration = await store.sessionGeneration.getValue()
    if (!isConsentGeneration(consentGeneration)) return
    globalThis.__ytptStop?.()
    let stopped = false
    const cleanup: (() => void)[] = []
    const stop = () => {
      if (stopped) return
      stopped = true
      cleanup.splice(0).forEach(dispose => dispose())
      removeQueueStyles()
      if (globalThis.__ytptStop === stop) globalThis.__ytptStop = undefined
    }
    globalThis.__ytptStop = stop
    ctx.onInvalidated(stop)
    cleanup.push(store.sessionConsent.watch(value => {
      if (value !== store.CONSENT_VERSION) stop()
    }))
    cleanup.push(store.sessionGeneration.watch(value => {
      if (value !== consentGeneration) stop()
    }))
    const allowed = async () => !stopped && await store.sessionConsent.getValue() === store.CONSENT_VERSION &&
      await store.sessionGeneration.getValue() === consentGeneration && !stopped
    const [key, percentage, feedback] = await Promise.all([
      store.watchLaterShortcut.getValue(), store.requiredWatchPercentage.getValue(), store.toastEnabled.getValue()
    ])
    if (!await allowed()) return stop()
    let shortcut = parseShortcut(key)
    let requiredPercentage = percentage
    let toastEnabled = feedback
    cleanup.push(store.watchLaterShortcut.watch(value => { shortcut = parseShortcut(value ?? "") }))
    cleanup.push(store.requiredWatchPercentage.watch(value => { requiredPercentage = value ?? 50 }))
    cleanup.push(store.toastEnabled.watch(value => { toastEnabled = value ?? true }))

    const state: unknown = await browser.runtime.sendMessage({ action: "sessionForTab" }).catch(() => null)
    const accountKey = isRecord(state) && state.kind === "ready" && isSnapshot(state.session) && state.session.consentGeneration === consentGeneration
      ? state.session.accountKey : null
    if (!await allowed()) return stop()

    const currentVideoId = () => new URL(location.href).searchParams.get("v")
    async function sendAdd(action: string, videoId: string) {
      if (accountKey && await allowed()) await browser.runtime.sendMessage({ action, videoId, accountKey, consentGeneration }).catch(() => {})
    }
    const keydown = (event: KeyboardEvent) => {
      if (stopped || event.repeat || !accountKey || !matchesShortcut(event, shortcut)) return
      const active = document.activeElement
      if (active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return
      const videoId = currentVideoId()
      if (!videoId) return
      event.preventDefault()
      void sendAdd("addVideoToShortcutPlaylist", videoId)
    }
    document.addEventListener("keydown", keydown)
    cleanup.push(() => document.removeEventListener("keydown", keydown))

    let detachVideo: (() => void) | undefined
    let playerObserver: MutationObserver | undefined
    function attach() {
      detachVideo?.()
      detachVideo = undefined
      playerObserver?.disconnect()
      if (stopped || !accountKey) return
      const videoId = currentVideoId()
      if (!videoId) return
      const video = document.querySelector("video")
      if (!video) {
        playerObserver = new MutationObserver(attach)
        playerObserver.observe(document.documentElement, { childList: true, subtree: true })
        return
      }
      let fired = false
      const timeupdate = () => {
        if (stopped || fired || !video.duration || !Number.isFinite(video.duration)) return
        if (video.currentTime / video.duration * 100 < requiredPercentage) return
        fired = true
        detachVideo?.()
        void sendAdd("addVideoToPlaylists", videoId)
      }
      video.addEventListener("timeupdate", timeupdate)
      detachVideo = () => video.removeEventListener("timeupdate", timeupdate)
    }
    cleanup.push(() => { detachVideo?.(); playerObserver?.disconnect() })

    const ui = await createShadowRootUi(ctx, {
      name: "yt-playlist-tools-toaster", position: "inline", anchor: "body",
      onMount(container) {
        container.style.fontSize = "16px"
        const mount = document.createElement("div")
        container.append(mount)
        const root = ReactDOM.createRoot(mount)
        root.render(<ThemeProvider target={container}><Toaster position="top-center" /></ThemeProvider>)
        return root
      },
      onRemove: root => root?.unmount()
    })
    if (!await allowed()) { ui.remove(); return stop() }
    ui.mount()
    cleanup.push(() => ui.remove())
    const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message: unknown, sender, respond) => {
      if (stopped || sender.id !== browser.runtime.id || !isRecord(message)) return false
      if (message.action === "sessionContentAlive") respond({ alive: true })
      if (message.action === "currentVideoId") respond({ videoId: currentVideoId() })
      if (message.action === "showToast" && toastEnabled && typeof message.toastMessage === "string") toast(message.toastMessage)
      return false
    }
    browser.runtime.onMessage.addListener(onMessage)
    cleanup.push(() => browser.runtime.onMessage.removeListener(onMessage))

    let stopQueue: (() => void) | undefined
    let stopMenu: (() => void) | undefined
    let updating = Promise.resolve()
    function syncFeatures() {
      updating = updating.catch(() => {}).then(async () => {
        const [queue, menu] = await Promise.all([store.queueButtonEnabled.getValue(), store.cardContextMenu.getValue()])
        if (!await allowed()) return
        const showQueue = queue && shouldInjectOnPath(location.pathname)
        if (showQueue && !stopQueue) {
          injectQueueStyles()
          stopQueue = observeQueueButtons({
            cardSelectors: CARD_SELECTORS, excludeSelectors: CARD_EXCLUDE_SELECTORS, thumbnailSelectors: THUMBNAIL_SELECTORS,
            onQueue: async videoId => {
              if (!await allowed()) return false
              const reply: unknown = await browser.runtime.sendMessage({ action: "queueVideo", videoId, consentGeneration }).catch(() => null)
              return isRecord(reply) && reply.ok === true
            }
          })
        } else if (!showQueue) { stopQueue?.(); stopQueue = undefined; removeQueueStyles() }
        if (menu && !stopMenu) stopMenu = enableCardMenu({ cardSelectors: CARD_SELECTORS, excludeSelectors: CARD_EXCLUDE_SELECTORS })
        else if (!menu) { stopMenu?.(); stopMenu = undefined }
      })
    }
    cleanup.push(() => { stopQueue?.(); stopMenu?.() })
    cleanup.push(store.queueButtonEnabled.watch(syncFeatures), store.cardContextMenu.watch(syncFeatures))
    const navigate = () => { if (!stopped) { attach(); syncFeatures() } }
    document.addEventListener("yt-navigate-finish", navigate)
    cleanup.push(() => document.removeEventListener("yt-navigate-finish", navigate))
    navigate()
  }
})
