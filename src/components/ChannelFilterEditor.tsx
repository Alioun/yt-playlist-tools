import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  ChannelFilter,
  ChannelLabel,
  VideoChannel
} from "@/lib/storage"
import { cn } from "@/lib/utils"

/** The channel of the video in the active tab, as far as the popup knows. */
export type CurrentChannel =
  | { status: "none" }
  | { status: "loading" }
  | { status: "unknown" }
  | { status: "found"; channel: VideoChannel }

const MODE_LABEL = { allow: "Allow only", deny: "Deny" } as const

/** The row label: what the filter currently does, at a glance. */
export function filterSummary(filter: ChannelFilter | undefined): string {
  if (!filter?.enabled) return "All channels"
  return `${MODE_LABEL[filter.mode]} · ${filter.channels.length}`
}

export function ChannelName({ label }: { label?: ChannelLabel }) {
  if (!label) return <span className="text-muted-foreground">Unknown channel</span>
  return (
    <span className="truncate">
      {label.title}
      {label.handle && (
        <span className="text-muted-foreground"> · {label.handle}</span>
      )}
    </span>
  )
}

type Props = {
  filter: ChannelFilter | undefined
  labels: Record<string, ChannelLabel>
  current: CurrentChannel
  onEnabledChange: (enabled: boolean) => void
  onAdd: (channel: VideoChannel) => void
  onRemove: (channelId: string) => void
}

export function ChannelFilterEditor({
  filter,
  labels,
  current,
  onEnabledChange,
  onAdd,
  onRemove
}: Props) {
  const enabled = filter?.enabled ?? false
  const channels = filter?.channels ?? []

  return (
    <div className="space-y-2 px-2 pb-2">
      <div
        role="group"
        aria-label="Channel filter"
        className="flex rounded-md border p-0.5 text-xs"
      >
        {[
          { on: false, text: "Off" },
          { on: true, text: "Deny" }
        ].map(({ on, text }) => (
          <button
            key={text}
            type="button"
            aria-pressed={enabled === on}
            onClick={() => enabled !== on && onEnabledChange(on)}
            className={cn(
              "flex-1 rounded px-2 py-0.5",
              enabled === on
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {text}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {enabled
          ? "Listed channels are never auto-added."
          : "Every channel is auto-added."}
      </p>

      {enabled ? (
        <>
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No channels listed yet.
            </p>
          ) : (
            <ChannelTags channels={channels} labels={labels} onRemove={onRemove} />
          )}
          <AddCurrentChannel
            current={current}
            listed={channels}
            onAdd={onAdd}
          />
        </>
      ) : (
        // Off keeps the list. Shown read-only so a kept count on the row
        // has something to point at; nothing edits it until Deny is back on.
        channels.length > 0 && (
          <div className="space-y-1 opacity-60">
            <p className="text-[10px] text-muted-foreground">
              Kept for when Deny is back on:
            </p>
            <ChannelTags channels={channels} labels={labels} />
          </div>
        )
      )}
    </div>
  )
}

/** Listed channels as tags; removable only when `onRemove` is given. */
function ChannelTags({
  channels,
  labels,
  onRemove
}: {
  channels: string[]
  labels: Record<string, ChannelLabel>
  onRemove?: (channelId: string) => void
}) {
  return (
    <ul className="flex flex-wrap gap-1">
      {channels.map((channelId) => (
        <li
          key={channelId}
          className="flex max-w-full items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs"
        >
          <ChannelName label={labels[channelId]} />
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${labels[channelId]?.title ?? channelId}`}
              onClick={() => onRemove(channelId)}
            >
              <X className="size-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function AddCurrentChannel({
  current,
  listed,
  onAdd
}: {
  current: CurrentChannel
  listed: string[]
  onAdd: (channel: VideoChannel) => void
}) {
  if (current.status === "none") {
    return (
      <p className="text-[10px] text-muted-foreground">
        Open a YouTube video to add its channel.
      </p>
    )
  }

  const button = (text: string, disabled: boolean, onClick?: () => void) => (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-full text-xs"
    >
      {!disabled && <Plus />}
      <span className="truncate">{text}</span>
    </Button>
  )

  if (current.status === "loading") return button("Looking up channel…", true)
  if (current.status === "unknown") return button("Channel unknown", true)

  const { channel } = current
  if (listed.includes(channel.channelId)) {
    return button(`${channel.title} is listed`, true)
  }
  return button(`Add ${channel.title} (this video)`, false, () => onAdd(channel))
}
