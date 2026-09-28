import { storage } from "#imports"

/**
 * Typed storage items.
 *
 * WXT requires an area prefix on every key. `local:playlists` maps to the plain
 * `browser.storage.local` key `playlists`, which is exactly what the pre-WXT
 * versions wrote — so existing users' settings survive the upgrade untouched.
 */

export type Theme = "light" | "dark" | "system"
export type AuthMode = "server" | "manual"

/**
 * Structurally identical to YouTubePlaylist in @/lib/youtube. Declared here
 * rather than imported to avoid a cycle: youtube.ts -> utils.ts -> storage.ts.
 */
export interface CachedPlaylist {
  id: string
  title: string
}

/** Playlist IDs the video is auto-added to once the watch threshold is hit. */
export const playlists = storage.defineItem<string[]>("local:playlists", {
  fallback: []
})

/** Playlist the keyboard shortcut adds to. */
export const addToPlaylistID = storage.defineItem<string>(
  "local:addToPlaylistID",
  { fallback: "" }
)

/** Recorded shortcut, e.g. "Control+Shift+S". */
export const watchLaterShortcut = storage.defineItem<string>(
  "local:watchLaterShortcut",
  { fallback: "" }
)

export const toastEnabled = storage.defineItem<boolean>("local:toastEnabled", {
  fallback: true
})

export const preventDuplicates = storage.defineItem<boolean>(
  "local:preventDuplicates",
  { fallback: true }
)

/**
 * Injects a one-click "Add to queue" button onto video thumbnails, so the
 * native YouTube action does not need the two-click detour through the
 * overflow (⋮) menu.
 */
export const queueButtonEnabled = storage.defineItem<boolean>(
  "local:queueButtonEnabled",
  { fallback: true }
)

/** 0-100. Percentage of the video that must be watched before auto-adding. */
export const requiredWatchPercentage = storage.defineItem<number>(
  "local:requiredWatchPercentage",
  { fallback: 50 }
)

/**
 * Last known playlist list, so the popup can paint instantly instead of
 * waiting on a service-worker wake-up plus a paginated YouTube round-trip.
 * Refreshed in the background on every open.
 */
export const cachedPlaylists = storage.defineItem<CachedPlaylist[]>(
  "local:cachedPlaylists",
  { fallback: [] }
)

// ── OAuth ────────────────────────────────────────────────────────────────
export const accessToken = storage.defineItem<string>("local:accessToken", {
  fallback: ""
})

export const refreshToken = storage.defineItem<string>("local:refreshToken", {
  fallback: ""
})

export const authMode = storage.defineItem<AuthMode>("local:authMode", {
  fallback: "server"
})

/**
 * Overrides the build-time broker URL, so a user of a published build can
 * point the extension at their own server. Empty means "use the default".
 * Read through getAuthServerURL() in @/config, never directly.
 */
export const authServerURL = storage.defineItem<string>("local:authServerURL", {
  fallback: ""
})

/** Only used by the "bring your own credentials" fallback path. */
export const clientID = storage.defineItem<string>("local:clientID", {
  fallback: ""
})

export const clientSecret = storage.defineItem<string>("local:clientSecret", {
  fallback: ""
})

// ── UI ───────────────────────────────────────────────────────────────────
/**
 * Synced so popup, options and the in-page toast agree. Deliberately NOT
 * localStorage: that is per-origin, so the content script would read YouTube's.
 */
export const theme = storage.defineItem<Theme>("sync:theme", {
  fallback: "system"
})

/** Clears everything this extension owns, across both areas. */
export async function clearAll(): Promise<void> {
  await Promise.all([
    browser.storage.local.clear(),
    browser.storage.sync.clear()
  ])
}
