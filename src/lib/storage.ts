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

export async function saveAccountSetup(context: AccountContext, setup: AccountSetup): Promise<void> {
  if (context.incognito) throw new Error("Account choices cannot be saved in private windows")
  if (await sessionConsent.getValue() !== CONSENT_VERSION) throw new Error("Access revoked")
  await accountItem(context.accountKey).setValue(setup)
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

export async function claimLegacySetup(context: AccountContext, owned: CachedPlaylist[]): Promise<AccountSetup> {
  if (context.incognito) throw new Error("Claim your old setup in a normal window")
  if (!await hasUnclaimedSetup()) return getAccountSetup(context)
  const [selected, shortcut, filters, labels, existing] = await Promise.all([
    playlists.getValue(), addToPlaylistID.getValue(), channelFilters.getValue(),
    channelLabels.getValue(), getAccountSetup(context)
  ])
  const ids = new Set(owned.map(playlist => playlist.id))
  const verifiedFilters = Object.fromEntries(Object.entries(filters).filter(([id]) => ids.has(id)))
  const listed = new Set(Object.values(verifiedFilters).flatMap(filter => filter.channels))
  const verifiedLabels = Object.fromEntries(Object.entries(labels).filter(([id]) => listed.has(id)))
  const setup: AccountSetup = {
    playlists: [...new Set([...existing.playlists, ...selected.filter(id => ids.has(id))])],
    shortcutPlaylistId: existing.shortcutPlaylistId || (ids.has(shortcut) ? shortcut : ""),
    filters: { ...verifiedFilters, ...existing.filters },
    labels: { ...verifiedLabels, ...existing.labels },
    cachedPlaylists: owned,
    cachedAt: Date.now()
  }
  await saveAccountSetup(context, setup)
  const remaining = selected.filter(id => !ids.has(id))
  const remainingFilters = Object.fromEntries(Object.entries(filters).filter(([id]) => !ids.has(id)))
  const remainingShortcut = ids.has(shortcut) ? "" : shortcut
  await Promise.all([
    playlists.setValue(remaining), addToPlaylistID.setValue(remainingShortcut), channelFilters.setValue(remainingFilters)
  ])
  await legacyClaimed.setValue(!remaining.length && !remainingShortcut && !Object.keys(remainingFilters).length)
  return setup
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
  await Promise.all([
    browser.storage.local.clear(),
    browser.storage.sync.clear(),
    browser.storage.session.clear()
  ])
}
