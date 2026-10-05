import { useState } from "react"

import {
  ChannelName,
  ConfirmClear,
  MODE_LABEL,
  listedCount,
  type CurrentChannel
} from "@/components/ChannelFilterEditor"
import { clearsList } from "@/lib/channel-filters"
import type {
  ChannelFilter,
  ChannelFilterMode,
  VideoChannel
} from "@/lib/storage"
import { cn } from "@/lib/utils"

const MODES: { mode: ChannelFilterMode; text: string }[] = [
  { mode: "allow", text: "Allow" },
  { mode: "deny", text: "Deny" }
]

type Props = {
  current: CurrentChannel
  /** The checked auto-add playlists. */
  playlists: { id: string; title: string }[]
  filters: Record<string, ChannelFilter>
  onList: (playlistId: string, mode: ChannelFilterMode, channel: VideoChannel) => void
  onRemove: (playlistId: string, channelId: string) => void
}

/**
 * This video's channel, with Allow and Deny per checked auto-add playlist.
 * Hidden wherever there is no video, which is exactly where auto-add can't
 * fire.
 */
export function ChannelCard({
  current,
  playlists,
  filters,
  onList,
  onRemove
}: Props) {
  // A switch into the other mode waiting for the user to confirm clearing
  // that playlist's kept list.
  const [pending, setPending] = useState<{
    playlistId: string
    mode: ChannelFilterMode
  } | null>(null)

  if (current.status === "none") return null
  const channel = current.status === "found" ? current.channel : null

  const choose = (playlistId: string, mode: ChannelFilterMode) => {
    if (!channel) return
    const filter = filters[playlistId]
    if (filter?.enabled) {
      if (filter.channels.includes(channel.channelId)) {
        onRemove(playlistId, channel.channelId)
      } else {
        onList(playlistId, mode, channel)
      }
      return
    }
    if (clearsList(filter, mode)) {
      setPending({ playlistId, mode })
      return
    }
    onList(playlistId, mode, channel)
  }

  return (
    <section
      aria-label="This video's channel"
      className="space-y-2 rounded-lg border p-2"
    >
      <div className="text-[10px] text-muted-foreground uppercase">
        This video's channel
      </div>
      <div className="text-sm font-medium">
        {current.status === "loading" && (
          <span className="text-muted-foreground">Looking up channel…</span>
        )}
        {current.status === "unknown" && (
          <span className="text-muted-foreground">Channel unknown</span>
        )}
        {channel && <ChannelName label={channel} />}
      </div>

      {playlists.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Check an auto-add playlist below to filter this channel.
        </p>
      )}

      {playlists.map((playlist) => {
        const filter = filters[playlist.id]
        const on = filter?.enabled ?? false
        const listed = !!channel && !!filter?.channels.includes(channel.channelId)
        const confirming = pending?.playlistId === playlist.id ? pending : null
        return (
          <div key={playlist.id} className="space-y-1">
            <div
              role="group"
              aria-label={playlist.title}
              className="flex items-center gap-2 text-xs"
            >
              <span className="flex-1 truncate" title={playlist.title}>
                {playlist.title}
              </span>
              {MODES.map(({ mode, text }) => {
                const locked = on && filter?.mode !== mode
                const pressed = on && filter?.mode === mode && listed
                return (
                  // The tooltip sits on a wrapper because some browsers show
                  // none for a disabled button.
                  <span
                    key={mode}
                    title={
                      locked && filter
                        ? `${playlist.title} is set to ${MODE_LABEL[filter.mode]}`
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      aria-pressed={pressed}
                      disabled={!channel || locked}
                      onClick={() => choose(playlist.id, mode)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 disabled:opacity-30",
                        pressed
                          ? "border-primary bg-primary text-primary-foreground"
                          : "enabled:hover:bg-accent"
                      )}
                    >
                      {text}
                    </button>
                  </span>
                )
              })}
            </div>
            {confirming && filter && channel && (
              <ConfirmClear
                question={`Turn on ${MODE_LABEL[confirming.mode]} for ${playlist.title}?`}
                detail={`This clears its ${listedCount(filter)}.`}
                onConfirm={() => {
                  setPending(null)
                  onList(playlist.id, confirming.mode, channel)
                }}
                onCancel={() => setPending(null)}
              />
            )}
          </div>
        )
      })}
    </section>
  )
}
