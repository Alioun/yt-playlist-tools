import * as store from "@/lib/storage"
import type {
  ChannelFilter,
  ChannelLabel,
  VideoChannel
} from "@/lib/storage"
import { fetchVideoChannel } from "@/lib/youtube"

export type FilterState = {
  filters: Record<string, ChannelFilter>
  labels: Record<string, ChannelLabel>
}

/**
 * True when the playlist's filter keeps this video out of it. `channelId` is
 * null for an unknown channel, which a denylist lets through.
 */
export function isFilteredOut(
  filter: ChannelFilter | undefined,
  channelId: string | null
): boolean {
  if (!filter?.enabled || filter.mode !== "deny") return false
  return channelId !== null && filter.channels.includes(channelId)
}

/** Whether any of these playlists has a filter that is switched on. */
export function anyFilterOn(
  filters: Record<string, ChannelFilter>,
  playlistIds: string[]
): boolean {
  return playlistIds.some((id) => filters[id]?.enabled)
}

/**
 * The one channel lookup shared by auto-add and the popup: the session cache,
 * then `videos.list`. Null means the channel is unknown. There are no retries
 * beyond the token refresh inside the API client.
 */
export async function resolveVideoChannel(
  videoId: string
): Promise<VideoChannel | null> {
  const cache = await store.channelCache.getValue()
  const cached = cache[videoId]
  if (cached) return cached

  const accessToken = await store.accessToken.getValue()
  if (!accessToken) return null

  const found = await fetchVideoChannel(videoId, accessToken)
  if (!found) return null

  const channel: VideoChannel = { channelId: found.channelId, title: found.title }
  // Re-read: another lookup may have written while this one was waiting on
  // the network.
  const latest = await store.channelCache.getValue()
  await store.channelCache.setValue({ ...latest, [videoId]: channel })
  return channel
}

/** Drops every label whose channel no filter lists, orphans included. */
export function pruneLabels(
  filters: Record<string, ChannelFilter>,
  labels: Record<string, ChannelLabel>
): Record<string, ChannelLabel> {
  const listed = new Set(Object.values(filters).flatMap((f) => f.channels))
  return Object.fromEntries(
    Object.entries(labels).filter(([channelId]) => listed.has(channelId))
  )
}

export async function loadFilterState(): Promise<FilterState> {
  const [filters, labels] = await Promise.all([
    store.channelFilters.getValue(),
    store.channelLabels.getValue()
  ])
  return { filters, labels }
}

/**
 * Applies one change to a playlist's filter, optionally records a label, and
 * removes labels nothing lists any more. Returns the state as saved.
 */
async function updateFilter(
  playlistId: string,
  change: (current: ChannelFilter | undefined) => ChannelFilter,
  label?: VideoChannel
): Promise<FilterState> {
  const state = await loadFilterState()
  const filters = { ...state.filters, [playlistId]: change(state.filters[playlistId]) }
  const withNew = label
    ? {
        ...state.labels,
        [label.channelId]: {
          title: label.title,
          ...(label.handle ? { handle: label.handle } : {})
        }
      }
    : state.labels
  const labels = pruneLabels(filters, withNew)

  await Promise.all([
    store.channelFilters.setValue(filters),
    store.channelLabels.setValue(labels)
  ])
  return { filters, labels }
}

/**
 * Switches a playlist's denylist on or off. Off keeps the list, so turning it
 * back on restores it unchanged.
 */
export function setDenylistEnabled(playlistId: string, enabled: boolean) {
  return updateFilter(playlistId, (current) => ({
    mode: "deny",
    enabled,
    channels: current?.mode === "deny" ? current.channels : []
  }))
}

export function addListedChannel(playlistId: string, channel: VideoChannel) {
  return updateFilter(
    playlistId,
    (current) => {
      const filter = current ?? { mode: "deny", enabled: true, channels: [] }
      if (filter.channels.includes(channel.channelId)) return filter
      return { ...filter, channels: [...filter.channels, channel.channelId] }
    },
    channel
  )
}

export function removeListedChannel(playlistId: string, channelId: string) {
  return updateFilter(playlistId, (current) => ({
    mode: current?.mode ?? "deny",
    enabled: current?.enabled ?? false,
    channels: (current?.channels ?? []).filter((id) => id !== channelId)
  }))
}
