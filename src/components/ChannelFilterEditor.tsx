import { Plus, X } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  clearsList,
  filterSetting,
  type FilterSetting
} from "@/lib/channel-filters"
import type {
  ChannelFilter,
  ChannelFilterMode,
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

export const MODE_LABEL = { allow: "Allow only", deny: "Deny" } as const
const LISTED = { allow: "allowed", deny: "denied" } as const

/** "3 denied channels", for confirmations that clear a list. */
export function listedCount(filter: ChannelFilter): string {
  const count = filter.channels.length
  return `${count} ${LISTED[filter.mode]} ${count === 1 ? "channel" : "channels"}`
}

const SETTINGS: { setting: FilterSetting; text: string }[] = [
  { setting: "off", text: "Off" },
  { setting: "allow", text: MODE_LABEL.allow },
  { setting: "deny", text: MODE_LABEL.deny }
]

const HINT: Record<FilterSetting, string> = {
  off: "Every channel is auto-added.",
  allow: "Only listed channels are auto-added.",
  deny: "Listed channels are never auto-added."
}

/** The row label: what the filter currently does, at a glance. */
export function filterSummary(filter: ChannelFilter | undefined): string {
  if (!filter) return "All channels"
  const count = filter.channels.length
  if (filter.enabled) return `${MODE_LABEL[filter.mode]} · ${count}`
  if (count === 0) return "All channels"
  return `All channels · ${count} ${LISTED[filter.mode]} kept`
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
  onSettingChange: (setting: FilterSetting) => void
  onAdd: (channel: VideoChannel) => void
  onRemove: (channelId: string) => void
}

export function ChannelFilterEditor({
  filter,
  labels,
  current,
  onSettingChange,
  onAdd,
  onRemove
}: Props) {
  const setting = filterSetting(filter)
  const channels = filter?.channels ?? []
  // A switch into the other mode that is waiting for the user to confirm
  // clearing the list.
  const [pending, setPending] = useState<ChannelFilterMode | null>(null)

  const choose = (next: FilterSetting) => {
    if (next === setting) {
      setPending(null)
      return
    }
    if (next !== "off" && clearsList(filter, next)) {
      setPending(next)
      return
    }
    setPending(null)
    onSettingChange(next)
  }

  return (
    <div role="group" aria-label="Edit channel filter" className="space-y-2 px-2 pb-2">
      <div
        role="group"
        aria-label="Channel filter"
        className="flex rounded-md border p-0.5 text-xs"
      >
        {SETTINGS.map(({ setting: option, text }) => (
          <button
            key={option}
            type="button"
            aria-pressed={setting === option}
            onClick={() => choose(option)}
            className={cn(
              "flex-1 rounded px-2 py-0.5",
              setting === option
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {text}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">{HINT[setting]}</p>

      {pending && filter && (
        <ConfirmClear
          question={`${setting === "off" ? "Turn on" : "Switch to"} ${MODE_LABEL[pending]}?`}
          detail={`This clears the ${listedCount(filter)}.`}
          onConfirm={() => {
            setPending(null)
            onSettingChange(pending)
          }}
          onCancel={() => setPending(null)}
        />
      )}

      {setting !== "off" ? (
        <>
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              {setting === "allow"
                ? "No channels listed yet, so nothing is auto-added here."
                : "No channels listed yet."}
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
        // has something to point at; nothing edits it until its mode is back on.
        filter &&
        channels.length > 0 && (
          <div className="space-y-1 opacity-60">
            <p className="text-[10px] text-muted-foreground">
              Kept for when {MODE_LABEL[filter.mode]} is back on:
            </p>
            <ChannelTags channels={channels} labels={labels} />
          </div>
        )
      )}
    </div>
  )
}

/** Asks before a mode switch throws away a list. */
export function ConfirmClear({
  question,
  detail,
  onConfirm,
  onCancel
}: {
  question: string
  detail: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const detailId = useId()
  return (
    <div
      role="alertdialog"
      aria-label={question}
      aria-describedby={detailId}
      className="space-y-1.5 rounded-md border border-destructive/50 p-2"
    >
      <p className="text-xs">
        {question} <span id={detailId}>{detail}</span>
      </p>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="destructive"
          autoFocus
          onClick={onConfirm}
          className="h-6 flex-1 text-xs"
        >
          Clear and switch
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          className="h-6 flex-1 text-xs"
        >
          Cancel
        </Button>
      </div>
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
