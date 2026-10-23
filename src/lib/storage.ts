import { storage } from "#imports"

/**
 * Typed storage items.
 *
 * WXT requires an area prefix on every key. `local:playlists` maps to the plain
 * `browser.storage.local` key `playlists`, which is exactly what the pre-WXT
 * versions wrote, so existing users' settings survive the upgrade untouched.
 */

export type Theme = "light" | "dark" | "system"

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

/**
 * Right-clicking a video card opens YouTube's own ⋮ menu instead of the
 * browser's context menu. Shift+right-click still gives the browser's. Off by
 * default: hijacking right-click is surprising unless asked for.
 */
export const cardContextMenu = storage.defineItem<boolean>(
  "local:cardContextMenu",
  { fallback: false }
)

/** 0-100. Percentage of the video that must be watched before auto-adding. */
export const requiredWatchPercentage = storage.defineItem<number>(
  "local:requiredWatchPercentage",
  { fallback: 50 }
)

export const legacyCachedPlaylists = storage.defineItem<CachedPlaylist[]>(
  "local:cachedPlaylists",
  { fallback: [] }
)

// ── Channel filters ──────────────────────────────────────────────────────
export type ChannelFilterMode = "allow" | "deny"

/**
 * An auto-add playlist's rule about which channels may be auto-added to it.
 * Switching it off keeps the mode and the list. `channels` holds `UC…` IDs.
 */
export interface ChannelFilter {
  mode: ChannelFilterMode
  enabled: boolean
  channels: string[]
}

/** Display text for a listed channel. Never used for matching. */
export interface ChannelLabel {
  title: string
  handle?: string
}

/** What the resolver learned about a video's channel. */
export interface VideoChannel extends ChannelLabel {
  channelId: string
}

/**
 * Keyed by playlist ID. Kept when a playlist is unchecked or disappears, and
 * never pruned automatically.
 */
export const channelFilters = storage.defineItem<Record<string, ChannelFilter>>(
  "local:channelFilters",
  { fallback: {} }
)

/**
 * One label per listed channel, shared by every filter and keyed by channel
 * ID. A record goes once no filter (orphans included) lists its channel.
 */
export const channelLabels = storage.defineItem<Record<string, ChannelLabel>>(
  "local:channelLabels",
  { fallback: {} }
)

export const sessionGeneration = storage.defineItem<string>("local:sessionGeneration", { fallback: "" })

export const CONSENT_VERSION = 1
export const sessionConsent = storage.defineItem<number>("local:sessionConsent", { fallback: 0 })
export const legacyClaimed = storage.defineItem<boolean>("local:legacyClaimed", { fallback: false })

export interface AccountContext {
  accountKey: string
  incognito: boolean
}

export interface AccountSetup {
  playlists: string[]
  shortcutPlaylistId: string
  filters: Record<string, ChannelFilter>
  labels: Record<string, ChannelLabel>
  cachedPlaylists: CachedPlaylist[]
  cachedAt: number | null
}

export function emptySetup(): AccountSetup {
  return { playlists: [], shortcutPlaylistId: "", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null }
}

function accountItem(accountKey: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(accountKey)) throw new Error("Invalid account key")
  return storage.defineItem<AccountSetup>(`local:account:${accountKey}`, { fallback: emptySetup() })
}

export function getAccountSetup(context: AccountContext): Promise<AccountSetup> {
  return accountItem(context.accountKey).getValue()
}

const savedAccountKeys = storage.defineItem<string[]>("local:savedAccountKeys", { fallback: [] })
let saveLane: Promise<unknown> = Promise.resolve()

export function saveAccountSetup(context: AccountContext, setup: AccountSetup): Promise<void> {
  const work = saveLane.catch(() => {}).then(async () => {
    if (context.incognito) throw new Error("Account choices cannot be saved in private windows")
    if (await sessionConsent.getValue() !== CONSENT_VERSION) throw new Error("Access revoked")
    await accountItem(context.accountKey).setValue(setup)
    const keys = await savedAccountKeys.getValue()
    if (!keys.includes(context.accountKey)) await savedAccountKeys.setValue([...keys, context.accountKey])
  })
  saveLane = work
  return work
}

export async function cacheAccountPlaylists(context: AccountContext, list: CachedPlaylist[]): Promise<void> {
  if (context.incognito) return
  const setup = await getAccountSetup(context)
  if (!setup.playlists.length && !setup.shortcutPlaylistId && !Object.keys(setup.filters).length) return
  await saveAccountSetup(context, { ...setup, cachedPlaylists: list, cachedAt: Date.now() })
}

export async function hasUnclaimedSetup(): Promise<boolean> {
  if (await legacyClaimed.getValue()) return false
  const [selected, shortcut, filters] = await Promise.all([
    playlists.getValue(), addToPlaylistID.getValue(), channelFilters.getValue()
  ])
  return selected.length > 0 || !!shortcut || Object.keys(filters).length > 0
}

/** Removes credential keys without reading any credential value. */
export async function removeLegacyCredentials(): Promise<void> {
  await browser.storage.local.remove([
    "accessToken", "refreshToken", "clientID", "clientSecret", "authMode", "authServerURL"
  ])
}

// ── UI ───────────────────────────────────────────────────────────────────
/**
 * Synced so popup, options and the in-page toast agree. Deliberately NOT
 * localStorage: that is per-origin, so the content script would read YouTube's.
 */
export const theme = storage.defineItem<Theme>("sync:theme", {
  fallback: "system"
})

/** Clears everything this extension owns, across every area. */
export async function clearAll(): Promise<void> {
  await sessionGeneration.setValue(crypto.randomUUID())
  await sessionConsent.setValue(-1)
  const work = saveLane.catch(() => {}).then(async () => {
    await Promise.all([
      retireLegacyVideoCache(), browser.storage.local.clear(),
      browser.storage.sync.clear(), browser.storage.session.clear()
    ])
  })
  saveLane = work
  return work
}

export function retireLegacyVideoCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("yt-playlist-tools")
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("Close other extension pages and try clearing data again."))
  })
}

export interface SavedAccount {
  accountKey: string
  setup: AccountSetup
}

export async function getSavedAccounts(incognito: boolean): Promise<SavedAccount[]> {
  if (incognito || await sessionConsent.getValue() !== CONSENT_VERSION) return []
  const keys = await savedAccountKeys.getValue()
  return Promise.all(keys.map(async accountKey => ({ accountKey, setup: await accountItem(accountKey).getValue() })))
}
