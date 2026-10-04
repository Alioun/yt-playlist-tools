import ReactDOM from "react-dom/client"
import { toast } from "sonner"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import {
  matchesShortcut,
  parseShortcut,
  type ParsedShortcut
} from "@/lib/shortcut"
import {
  CARD_EXCLUDE_SELECTORS,
  CARD_SELECTORS,
  THUMBNAIL_SELECTORS,
  addToQueue,
  injectQueueStyles,
  removeQueueStyles,
  shouldInjectOnPath
} from "@/lib/queue"
import { enableCardMenu } from "@/lib/card-menu"
import { observe as observeQueueButtons } from "@/lib/queue-button"
import * as store from "@/lib/storage"
import "@/assets/tailwind.css"
// Sonner normally injects its stylesheet into document.head at runtime. Inside a
// shadow root that is useless -- host-document styles do not cross the shadow
// boundary, so the toast would render completely unstyled. Importing the
// stylesheet explicitly gets it bundled into the content script's CSS, which
// WXT injects INTO the shadow root (cssInjectionMode: "ui").
import "sonner/dist/styles.css"

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  excludeMatches: ["*://*.music.youtube.com/*"],
  runAt: "document_idle",
  // Required so the stylesheet is available to inject into the shadow root
  // rather than being added to the host page.
  cssInjectionMode: "ui",

  async main(ctx) {
    // ── Settings cache ───────────────────────────────────────────────────
    // Read up front and kept fresh via watch(). The keydown handler MUST be
    // able to decide synchronously: awaiting storage first would let the
    // browser perform the default action before preventDefault() ran, making
    // it a no-op.
    let shortcut: ParsedShortcut | null = parseShortcut(
      await store.watchLaterShortcut.getValue()
    )
    let requiredPercentage = await store.requiredWatchPercentage.getValue()
    let toastEnabled = await store.toastEnabled.getValue()

    ctx.onInvalidated(
      store.watchLaterShortcut.watch((value) => {
        shortcut = parseShortcut(value ?? "")
      })
    )
    ctx.onInvalidated(
      store.requiredWatchPercentage.watch((value) => {
        requiredPercentage = value ?? 0
      })
    )
    ctx.onInvalidated(
      store.toastEnabled.watch((value) => {
        toastEnabled = value ?? true
      })
    )

    // ── Keyboard shortcut ────────────────────────────────────────────────
    function isSearchBarFocused(): boolean {
      const active = document.activeElement
      return (
        active?.tagName.toLowerCase() === "input" &&
        (active as HTMLInputElement).id === "search"
      )
    }

    function currentVideoId(): string | null {
      return new URL(location.href).searchParams.get("v")
    }

    ctx.addEventListener(document, "keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent
      // Ignore auto-repeat so holding the key does not spam the API.
      if (keyboardEvent.repeat) return
      if (!matchesShortcut(keyboardEvent, shortcut)) return
      if (isSearchBarFocused()) return

      const videoId = currentVideoId()
      if (!videoId) return

      // Synchronous: nothing has been awaited on this path.
      keyboardEvent.preventDefault()
      void browser.runtime.sendMessage({
        action: "addVideoToShortcutPlaylist",
        videoId
      })
    })

    // ── Watch-percentage trigger ─────────────────────────────────────────
    // YouTube is a SPA and reuses the same <video> element across
    // navigations, so a listener registered per navigation would stack up and
    // later fire with a stale videoId. Exactly one listener is kept alive.
    let detachWatcher: (() => void) | null = null

    function attachWatcher() {
      detachWatcher?.()
      detachWatcher = null

      const videoId = currentVideoId()
      const video = document.querySelector("video")
      if (!videoId || !video) return

      let fired = false
      const onTimeUpdate = () => {
        // Guard set before anything else so two timeupdate events (they fire
        // ~4x/sec) cannot both pass and double-add.
        if (fired) return

        const { currentTime, duration } = video
        // NaN before metadata loads; Infinity on live streams, where a
        // percentage is meaningless.
        if (!duration || !Number.isFinite(duration)) return

        if ((currentTime / duration) * 100 < requiredPercentage) return

        fired = true
        detachWatcher?.()
        void browser.runtime.sendMessage({
          action: "addVideoToPlaylists",
          videoId
        })
      }

      video.addEventListener("timeupdate", onTimeUpdate)
      detachWatcher = () => {
        video.removeEventListener("timeupdate", onTimeUpdate)
        detachWatcher = null
      }
    }

    /**
     * The player element often does not exist yet at document_idle on a cold
     * load straight to a watch URL, and yt-navigate-finish for that page has
     * already fired -- so a single querySelector would silently never arm.
     */
    function attachWatcherWhenReady() {
      attachWatcher()
      if (detachWatcher || !currentVideoId()) return

      const observer = new MutationObserver(() => {
        if (!document.querySelector("video")) return
        observer.disconnect()
        attachWatcher()
      })
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      })
      ctx.onInvalidated(() => observer.disconnect())
    }

    // ── Toasts ───────────────────────────────────────────────────────────
    const ui = await createShadowRootUi(ctx, {
      name: "yt-playlist-tools-toaster",
      position: "inline",
      anchor: "body",
      onMount: (container) => {
        // WXT resets inherited styles with `all: initial`, but `rem` still
        // resolves against the HOST page's <html> font-size. shadcn sizing is
        // rem-heavy, so without pinning this the toast would change size from
        // site to site. YouTube uses 10px on <html>, which would shrink
        // everything to ~62%.
        container.style.fontSize = "16px"

        const mountPoint = document.createElement("div")
        container.append(mountPoint)

        const root = ReactDOM.createRoot(mountPoint)
        root.render(
          <ThemeProvider target={container}>
            <Toaster position="top-center" />
          </ThemeProvider>
        )
        return root
      },
      onRemove: (root) => root?.unmount()
    })

    ui.mount()

    browser.runtime.onMessage.addListener((message: any) => {
      if (message?.action !== "showToast") return
      if (!toastEnabled) return
      toast(message.toastMessage)
    })

    // YouTube is a SPA: this fires on every in-app navigation.
    // Registered BEFORE the queue-button setup below so that a failure in that
    // optional feature cannot take the watch-percentage trigger down with it.
    ctx.addEventListener(document, "yt-navigate-finish" as any, () => {
      attachWatcherWhenReady()
    })

    attachWatcherWhenReady()

    // ── One-click "Add to queue" ─────────────────────────────────────────
    // Where YouTube offers the action only behind the overflow (⋮) menu,
    // queueing costs two clicks and a menu round-trip; this puts it on the
    // thumbnail. Surfaces that already have YouTube's own thumbnail control are
    // skipped by shouldInjectOnPath -- see EXCLUDED_PATHS in @/lib/queue.
    let stopQueueButtons: (() => void) | null = null

    async function applyQueueButtons() {
      const enabled =
        (await store.queueButtonEnabled.getValue()) &&
        shouldInjectOnPath(location.pathname)

      if (enabled && !stopQueueButtons) {
        injectQueueStyles()
        stopQueueButtons = observeQueueButtons({
          cardSelectors: CARD_SELECTORS,
          excludeSelectors: CARD_EXCLUDE_SELECTORS,
          thumbnailSelectors: THUMBNAIL_SELECTORS,
          onQueue: addToQueue
        })
      } else if (!enabled && stopQueueButtons) {
        stopQueueButtons()
        stopQueueButtons = null
        removeQueueStyles()
      }
    }

    // Serialised: watch() can fire again before the previous run has passed its
    // await, and two runs both seeing stopQueueButtons === null would each
    // start an observer, leaking one for the lifetime of the tab.
    let queueSync: Promise<void> = Promise.resolve()
    function syncQueueButtons(): Promise<void> {
      queueSync = queueSync
        .then(applyQueueButtons)
        .catch((error) =>
          console.error("[YT Playlist Tools]: queue button setup failed", error)
        )
      return queueSync
    }

    ctx.onInvalidated(
      store.queueButtonEnabled.watch(() => {
        void syncQueueButtons()
      })
    )

    // YouTube is a SPA: location.pathname changes with no reload, so the path
    // gate above has to be re-run per navigation. Otherwise buttons injected on
    // the home feed would survive onto /feed/subscriptions, and vice versa.
    ctx.addEventListener(document, "yt-navigate-finish" as any, () => {
      void syncQueueButtons()
    })
    ctx.onInvalidated(() => {
      stopQueueButtons?.()
      removeQueueStyles()
    })

    // ── Right-click opens YouTube's ⋮ menu ───────────────────────────────
    // Independent of the queue bridge: it only clicks YouTube's own button.
    let stopCardMenu: (() => void) | null = null
    async function applyCardMenu() {
      const enabled = await store.cardContextMenu.getValue()
      if (enabled && !stopCardMenu) {
        stopCardMenu = enableCardMenu({
          cardSelectors: CARD_SELECTORS,
          excludeSelectors: CARD_EXCLUDE_SELECTORS
        })
      } else if (!enabled && stopCardMenu) {
        stopCardMenu()
        stopCardMenu = null
      }
    }
    ctx.onInvalidated(store.cardContextMenu.watch(() => void applyCardMenu()))
    ctx.onInvalidated(() => stopCardMenu?.())
    void applyCardMenu()

    try {
      // The bridge does the actual queueing; it must live in the page's world
      // because resolveCommand is a Polymer method.
      await injectScript("/yt-queue-bridge.js", { keepInDom: true })
      await syncQueueButtons()
    } catch (error) {
      // An unavailable web-accessible resource or a CSP change must not stop
      // the rest of the content script from working.
      console.error("[YT Playlist Tools]: queue bridge unavailable", error)
    }
  }
})
