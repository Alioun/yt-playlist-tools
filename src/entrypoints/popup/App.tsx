import { Suspense, lazy, useEffect, useRef, useState } from "react"

import { ChannelCard } from "@/components/ChannelCard"
import {
  ChannelFilterEditor,
  filterSummary,
  type CurrentChannel
} from "@/components/ChannelFilterEditor"
import { YouTubeIcon } from "@/components/YouTubeIcon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, ChevronDown, Settings } from "lucide-react"

import type { FilterState } from "@/lib/channel-filters"
import { formatShortcut } from "@/lib/shortcut"
import { cn } from "@/lib/utils"
import * as store from "@/lib/storage"
import type { ChannelQuery } from "@/lib/channel-input"
import type { ChannelLookup, YouTubePlaylist } from "@/lib/youtube"

import { SessionAccess, isSetup, sendSessionMessage, type ReadyView } from "@/components/SessionAccess"
import { isRecord, type SessionSnapshot } from "@/lib/session"
export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  return (
    <Card className="w-[340px] rounded-none border-0 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-primary">
          <YouTubeIcon className="h-5 w-5 fill-primary" />Playlist Tools
          <Button variant="ghost" size="sm" aria-label={showSettings ? "Back to playlists" : "Settings"}
            onClick={() => setShowSettings(open => !open)} className="ml-auto h-7 w-7 p-0 text-muted-foreground">
            {showSettings ? <ArrowLeft className="size-4" /> : <Settings className="size-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showSettings ? <Suspense fallback={<p>Loading settings...</p>}><SettingsPanel /></Suspense> :
          <SessionAccess>{view => <PlaylistControls key={`${view.session.accountKey}:${view.session.tabId}`} view={view} />}</SessionAccess>}
      </CardContent>
    </Card>
  )
}

function PlaylistControls({ view }: { view: ReadyView }) {
  const allPlaylists = view.playlists
  const [selectedIds, setSelectedIds] = useState(view.setup.playlists)
  const [shortcutPlaylistId, setShortcutPlaylistId] = useState(view.setup.shortcutPlaylistId)
  const [filterState, setFilterState] = useState<FilterState>({ filters: view.setup.filters, labels: view.setup.labels })
  const [unclaimed, setUnclaimed] = useState(view.unclaimed)
  const [shortcutDisplay, setShortcutDisplay] = useState("")
  const [watchPercentage, setWatchPercentage] = useState(50)
  const [toastEnabled, setToastEnabled] = useState(true)
  const [queueButton, setQueueButton] = useState(true)
  const [cardMenu, setCardMenu] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [currentChannel, setCurrentChannel] = useState<CurrentChannel>({ status: "none" })
  const live = useRef(true)
  const stopRecording = useRef<(() => void) | undefined>(undefined)
  useEffect(() => {
    live.current = true
    void Promise.all([
      store.watchLaterShortcut.getValue(), store.toastEnabled.getValue(), store.requiredWatchPercentage.getValue(),
      store.queueButtonEnabled.getValue(), store.cardContextMenu.getValue()
    ]).then(([shortcut, feedback, percentage, queue, menu]) => {
      if (!live.current) return
      setShortcutDisplay(shortcut); setToastEnabled(feedback); setWatchPercentage(percentage); setQueueButton(queue); setCardMenu(menu)
    })
    void lookUpCurrentChannel(view.session, current => { if (live.current) setCurrentChannel(current) })
    return () => { live.current = false; stopRecording.current?.() }
  }, [view.session])

  const applySetup = (setup: store.AccountSetup) => {
    setSelectedIds(setup.playlists); setShortcutPlaylistId(setup.shortcutPlaylistId)
    setFilterState({ filters: setup.filters, labels: setup.labels })
  }
  const changeSetup = (change: Record<string, unknown>) => {
    if (view.session.incognito || !live.current || error) return
    void sendSessionMessage({ action: "changeSetup", session: view.session, change }).then(reply => {
      if (!live.current) return
      if (isRecord(reply) && isSetup(reply.setup)) applySetup(reply.setup)
      else setError(isRecord(reply) && typeof reply.error === "string" ? reply.error : "Couldn't save choices. Check again.")
    }).catch(() => { if (live.current) setError("Couldn't save choices. Check again.") })
  }
  const claimLegacy = () => {
    void sendSessionMessage({ action: "claimLegacy", session: view.session }).then(reply => {
      if (!live.current) return
      if (isRecord(reply) && isSetup(reply.setup)) { applySetup(reply.setup); setUnclaimed(false) }
      else setError("Couldn't verify the old setup. Check again.")
    }).catch(() => { if (live.current) setError("Couldn't verify the old setup. Check again.") })
  }
  const togglePlaylist = (playlistId: string, checked: boolean) => changeSetup({ kind: "auto", playlistId, checked })
  const selectShortcutPlaylist = (playlistId: string) => changeSetup({ kind: "shortcut", playlistId })
  const updateWatchPercentage = (value: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(value)))
    setWatchPercentage(clamped); void store.requiredWatchPercentage.setValue(clamped)
  }
  const recordShortcut = () => {
    setIsRecording(true); setShortcutDisplay("Press shortcut keys...")
    const handler = (event: KeyboardEvent) => {
      event.preventDefault()
      const shortcut = formatShortcut(event)
      if (!shortcut) return
      setShortcutDisplay(shortcut); void store.watchLaterShortcut.setValue(shortcut)
      stopRecording.current?.(); setIsRecording(false)
    }
    document.addEventListener("keydown", handler)
    stopRecording.current = () => document.removeEventListener("keydown", handler)
  }
  return (
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {view.session.incognito && <p className="text-sm text-muted-foreground">Private window. You can use this account's existing setup; change playlist choices in a normal window.</p>}
        {unclaimed && !view.session.incognito && <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm">Your old setup is unclaimed. Only playlists verified in this account's list will be copied. Other choices remain saved and inactive.</p>
          <Button size="sm" variant="outline" onClick={claimLegacy}>Claim old setup for this account</Button>
        </div>}
        <fieldset disabled={view.session.incognito || !!error} className="space-y-4">
        {/* Auto-add playlists */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold tracking-wide text-primary uppercase">
              Auto-add playlists
            </Label>

          </div>

          <ChannelCard
            current={currentChannel}
            playlists={allPlaylists.filter((playlist) =>
              selectedIds.includes(playlist.id)
            )}
            filters={filterState.filters}
            onList={(playlistId, mode, channel) =>
              changeSetup({ kind: "channel", playlistId, mode, channel })
            }
            onRemove={(playlistId, channelId) =>
              changeSetup({ kind: "remove", playlistId, channelId })
            }
          />

          {allPlaylists.length === 0 && <p className="text-sm text-muted-foreground">No playlists found.</p>}

          <div className="max-h-[220px] space-y-1 overflow-y-auto">
            {allPlaylists.map((playlist) => {
              const selected = selectedIds.includes(playlist.id)
              const filter = filterState.filters[playlist.id]
              const open = selected && editing === playlist.id
              const summary = filterSummary(filter)
              return (
                <div
                  key={playlist.id}
                  className={cn("rounded-md", open && "bg-accent/50")}
                >
                  <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <Label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 font-normal">
                      <Checkbox
                        disabled={view.session.incognito || !!error}
                        checked={selected}
                        onCheckedChange={(checked) =>
                          togglePlaylist(playlist.id, checked)
                        }
                      />
                      <span className="truncate text-sm" title={playlist.title}>
                        {playlist.title}
                      </span>
                    </Label>
                    {selected && (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={`Channel filter for ${playlist.title}: ${summary}`}
                        onClick={() => setEditing(open ? null : playlist.id)}
                        className={cn(
                          "flex shrink-0 items-center gap-0.5 rounded-full border px-2 text-[10px]",
                          filter?.enabled
                            ? "border-primary text-primary"
                            : "text-muted-foreground"
                        )}
                      >
                        {summary}
                        <ChevronDown className="size-3" />
                      </button>
                    )}
                  </div>
                  {open && (
                    <ChannelFilterEditor
                      key={`${view.session.accountKey}:${playlist.id}`}
                      filter={filter}
                      labels={filterState.labels}
                      current={currentChannel}
                      onSettingChange={(setting) =>
                        changeSetup({ kind: "setting", playlistId: playlist.id, setting })
                      }
                      onAdd={(channel) =>
                        changeSetup({ kind: "channel", playlistId: playlist.id, channel })
                      }
                      onRemove={(channelId) =>
                        changeSetup({ kind: "remove", playlistId: playlist.id, channelId })
                      }
                      onLookUp={(query) => lookUpTypedChannel(view.session, query)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <Separator />

        {/* Shortcut playlist */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold tracking-wide text-primary uppercase">
            Shortcut playlist
          </Label>
          <p className="text-[10px] text-muted-foreground italic">
            Adds use the account shown above and check membership on YouTube.
          </p>

          {allPlaylists.length > 0 && (
            <div className="max-h-[120px] space-y-1 overflow-y-auto">
              {allPlaylists.map((playlist) => {
                const active = shortcutPlaylistId === playlist.id
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectShortcutPlaylist(playlist.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    <span
                      className={cn(
                        "h-3 w-3 shrink-0 rounded-full border-2",
                        active
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      )}
                    />
                    <span className="truncate" title={playlist.title}>
                      {playlist.title}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              onClick={recordShortcut}
              disabled={isRecording}
              variant="secondary"
              size="sm"
              className="h-8 text-xs"
            >
              {isRecording ? "Recording..." : "Record Shortcut"}
            </Button>
            {shortcutDisplay && (
              <span className="text-xs text-muted-foreground">
                {shortcutDisplay}
              </span>
            )}
          </div>
        </div>

        <Separator />

        </fieldset>
        {/* Watch percentage */}
        <div className="space-y-2">
          <Label
            htmlFor="watch-percentage"
            className="text-xs font-semibold tracking-wide text-primary uppercase"
          >
            Required watch percentage
          </Label>
          <div className="flex items-center gap-3">
            <Slider
              aria-label="Required watch percentage"
              value={watchPercentage}
              onValueChange={(value) =>
                updateWatchPercentage(
                  Array.isArray(value) ? (value[0] ?? 0) : value
                )
              }
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <div className="flex items-center gap-1">
              <Input
                id="watch-percentage"
                type="number"
                value={watchPercentage}
                onChange={(event) =>
                  updateWatchPercentage(Number(event.target.value))
                }
                className="h-8 w-14 text-center text-xs"
                min={0}
                max={100}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="toast-toggle" className="text-sm">
              Toast notifications
            </Label>
            <Switch
              id="toast-toggle"
              checked={toastEnabled}
              onCheckedChange={(checked) => {
                setToastEnabled(checked)
                void store.toastEnabled.setValue(checked)
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="queue-toggle" className="text-sm">
              One-click queue button
            </Label>
            <Switch
              id="queue-toggle"
              checked={queueButton}
              onCheckedChange={(checked) => {
                setQueueButton(checked)
                void store.queueButtonEnabled.setValue(checked)
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label
              htmlFor="card-menu-toggle"
              className="text-sm"
              title="Shift+right-click still opens the browser's menu"
            >
              Right-click opens video menu
            </Label>
            <Switch
              id="card-menu-toggle"
              checked={cardMenu}
              onCheckedChange={(checked) => {
                setCardMenu(checked)
                void store.cardContextMenu.setValue(checked)
              }}
            />
          </div>
        </div>
      </div>
  )
}

async function lookUpCurrentChannel(
  session: SessionSnapshot,
  report: (current: CurrentChannel) => void
): Promise<void> {
  let videoId: string | undefined
  let tabId: number | undefined
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    tabId = tab?.id
    if (!tabId || tabId !== session.tabId) return
    const reply = await browser.tabs.sendMessage(tabId, {
      action: "currentVideoId"
    })
    videoId = reply?.videoId
  } catch {
    return
  }
  if (!videoId) return

  report({ status: "loading" })
  try {
    const response = await sendSessionMessage({
      action: "getChannelForTab",
      session,
      tabId,
      videoId
    })
    report(
      isRecord(response) && isRecord(response.channel) && typeof response.channel.channelId === "string" && typeof response.channel.title === "string"
        ? { status: "found", channel: { channelId: response.channel.channelId, title: response.channel.title } }
        : { status: "unknown" }
    )
  } catch {
    report({ status: "unknown" })
  }
}

/** Asks the background to look up a channel the user typed into a filter. */
async function lookUpTypedChannel(session: SessionSnapshot, query: ChannelQuery): Promise<ChannelLookup> {
  const response = await sendSessionMessage({ action: "lookUpChannel", session, query })
  if (isRecord(response) && response.status === "found" && isRecord(response.channel) && typeof response.channel.channelId === "string" && typeof response.channel.title === "string") {
    return { status: "found", channel: { channelId: response.channel.channelId, title: response.channel.title,
      ...(typeof response.channel.handle === "string" ? { handle: response.channel.handle } : {}) } }
  }
  return isRecord(response) && response.status === "not-found" ? { status: "not-found" } : { status: "failed" }
}

const SettingsPanel = lazy(() => import("@/components/SettingsPanel").then(module => ({ default: module.SettingsPanel })))
