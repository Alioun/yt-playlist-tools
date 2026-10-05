import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"

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

import {
  addListedChannel,
  loadFilterState,
  removeListedChannel,
  setFilterSetting,
  type FilterState
} from "@/lib/channel-filters"
import { formatShortcut } from "@/lib/shortcut"
import { cn } from "@/lib/utils"
import * as store from "@/lib/storage"
import type { YouTubePlaylist } from "@/lib/youtube"

export default function App() {
  const [allPlaylists, setAllPlaylists] = useState<YouTubePlaylist[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [shortcutPlaylistId, setShortcutPlaylistId] = useState("")
  const [shortcutDisplay, setShortcutDisplay] = useState("")
  const [watchPercentage, setWatchPercentage] = useState(50)
  const [toastEnabled, setToastEnabled] = useState(true)
  const [preventDuplicates, setPreventDuplicates] = useState(true)
  const [queueButton, setQueueButton] = useState(true)
  const [cardMenu, setCardMenu] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  // True until the cached list has been read, so an empty account is not
  // announced before we actually know anything.
  const [hydrating, setHydrating] = useState(true)
  // Settings render inside the popup rather than opening the options page --
  // one click, and the popup stays open.
  const [showSettings, setShowSettings] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>({
    filters: {},
    labels: {}
  })
  // The playlist whose channel filter editor is open under its row.
  const [editing, setEditing] = useState<string | null>(null)
  const [currentChannel, setCurrentChannel] = useState<CurrentChannel>({
    status: "none"
  })

  // Set once the background has answered, so the cached list (read in parallel)
  // cannot land afterwards and overwrite fresher data.
  const haveFresh = useRef(false)

  const loadPlaylists = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await browser.runtime.sendMessage({
        action: "fetchPlaylists"
      })
      if (response?.error) {
        setError(response.error)
      } else {
        haveFresh.current = true
        setAllPlaylists(response?.playlists ?? [])
      }
    } catch {
      setError("Failed to fetch playlists")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Local storage reads are fast; the playlist list comes from cache so the
    // popup paints its real contents without waiting on the service worker to
    // wake up and page through the YouTube API.
    Promise.all([
      store.playlists.getValue(),
      store.addToPlaylistID.getValue(),
      store.watchLaterShortcut.getValue(),
      store.toastEnabled.getValue(),
      store.preventDuplicates.getValue(),
      store.requiredWatchPercentage.getValue(),
      store.cachedPlaylists.getValue(),
      store.queueButtonEnabled.getValue(),
      store.cardContextMenu.getValue()
    ]).then(([saved, shortcutId, shortcut, toast, dupes, percentage, cached, queueBtn, menu]) => {
      setSelectedIds(saved)
      setShortcutPlaylistId(shortcutId)
      setShortcutDisplay(shortcut)
      setToastEnabled(toast)
      setPreventDuplicates(dupes)
      setWatchPercentage(percentage)
      setQueueButton(queueBtn)
      setCardMenu(menu)
      if (cached.length > 0 && !haveFresh.current) setAllPlaylists(cached)
      setHydrating(false)
    })

    void loadFilterState().then(setFilterState)

    // Refresh behind the cached list; the UI stays interactive throughout.
    void loadPlaylists()
    void lookUpCurrentChannel(setCurrentChannel)
  }, [loadPlaylists])

  const togglePlaylist = (playlistId: string, checked: boolean) => {
    const updated = checked
      ? [...selectedIds, playlistId]
      : selectedIds.filter((id) => id !== playlistId)
    setSelectedIds(updated)
    void store.playlists.setValue(updated)
  }

  const changeFilter = (saving: Promise<FilterState>) => {
    void saving.then(setFilterState)
  }

  const selectShortcutPlaylist = (playlistId: string) => {
    const value = shortcutPlaylistId === playlistId ? "" : playlistId
    setShortcutPlaylistId(value)
    void store.addToPlaylistID.setValue(value)
  }

  const updateWatchPercentage = (value: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(value)))
    setWatchPercentage(clamped)
    void store.requiredWatchPercentage.setValue(clamped)
  }

  const recordShortcut = () => {
    setIsRecording(true)
    setShortcutDisplay("Press shortcut keys...")

    const handler = (event: KeyboardEvent) => {
      event.preventDefault()

      // Encoding lives in @/lib/shortcut so the content script's matcher can
      // never drift from what is recorded here.
      const shortcut = formatShortcut(event)
      if (!shortcut) return

      setShortcutDisplay(shortcut)
      void store.watchLaterShortcut.setValue(shortcut)
      document.removeEventListener("keydown", handler)
      setIsRecording(false)
    }

    document.addEventListener("keydown", handler)
  }

  return (
    <Card className="w-[340px] rounded-none border-0 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-primary">
          <YouTubeIcon className="h-5 w-5 fill-primary" />
          Playlist Tools
          <Button
            variant="ghost"
            size="sm"
            aria-label={showSettings ? "Back to playlists" : "Settings"}
            title={showSettings ? "Back to playlists" : "Settings"}
            aria-expanded={showSettings}
            onClick={() => setShowSettings((open) => !open)}
            className="ml-auto h-7 w-7 p-0 text-muted-foreground"
          >
            {showSettings ? (
              <ArrowLeft className="size-4" />
            ) : (
              <Settings className="size-4" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>

      {showSettings ? (
        <CardContent className="max-h-[520px] space-y-4 overflow-y-auto">
          <Suspense
            fallback={
              <p className="py-6 text-center text-xs text-muted-foreground">
                Loading settings...
              </p>
            }
          >
            <SettingsPanel />
          </Suspense>
        </CardContent>
      ) : (
      <CardContent className="space-y-4">
        {/* Auto-add playlists */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold tracking-wide text-primary uppercase">
              Auto-add playlists
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadPlaylists}
              disabled={loading}
              className="h-6 px-2 text-xs text-muted-foreground"
            >
              {!loading
                ? "Refresh"
                : allPlaylists.length > 0
                  ? "Refreshing..."
                  : "Loading..."}
            </Button>
          </div>

          {error && (
            <p className="text-xs text-destructive">
              {error === "No access token"
                ? "Not authorized. Sign in from Options."
                : error}
            </p>
          )}

          {!loading && !hydrating && !error && allPlaylists.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No playlists found.
            </p>
          )}

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
                      filter={filter}
                      labels={filterState.labels}
                      current={currentChannel}
                      onSettingChange={(setting) =>
                        changeFilter(setFilterSetting(playlist.id, setting))
                      }
                      onAdd={(channel) =>
                        changeFilter(addListedChannel(playlist.id, channel))
                      }
                      onRemove={(channelId) =>
                        changeFilter(removeListedChannel(playlist.id, channelId))
                      }
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
            Watch Later is not supported due to a YouTube Data API limitation.
          </p>

          {allPlaylists.length > 0 ? (
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
          ) : (
            <Input
              value={shortcutPlaylistId}
              onChange={(event) => {
                setShortcutPlaylistId(event.target.value)
                void store.addToPlaylistID.setValue(event.target.value)
              }}
              placeholder="Playlist ID"
              className="h-8 text-xs"
            />
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
            <Label htmlFor="dupe-toggle" className="text-sm">
              Prevent duplicates
            </Label>
            <Switch
              id="dupe-toggle"
              checked={preventDuplicates}
              onCheckedChange={(checked) => {
                setPreventDuplicates(checked)
                void store.preventDuplicates.setValue(checked)
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
      </CardContent>
      )}
    </Card>
  )
}

/**
 * Asks the active tab for its video, then the background for that video's
 * channel. A tab without the content script (not YouTube) or without a video
 * (home, search, Shorts) has no channel to filter.
 */
async function lookUpCurrentChannel(
  report: (current: CurrentChannel) => void
): Promise<void> {
  let videoId: string | undefined
  let tabId: number | undefined
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    tabId = tab?.id
    if (!tabId) return
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
    const response = await browser.runtime.sendMessage({
      action: "getChannelForTab",
      tabId,
      videoId
    })
    report(
      response?.channel
        ? { status: "found", channel: response.channel }
        : { status: "unknown" }
    )
  } catch {
    report({ status: "unknown" })
  }
}
