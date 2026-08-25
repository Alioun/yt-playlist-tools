import { useEffect, useState } from "react"

import { Button } from "~components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~components/ui/card"
import { Checkbox } from "~components/ui/checkbox"
import { Input } from "~components/ui/input"
import { Label } from "~components/ui/label"
import { Separator } from "~components/ui/separator"
import { Slider } from "~components/ui/slider"
import { Switch } from "~components/ui/switch"

import "./style.css"

interface YouTubePlaylist {
  id: string
  title: string
}

function Popup() {
  const [allPlaylists, setAllPlaylists] = useState<YouTubePlaylist[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [shortcutPlaylistId, setShortcutPlaylistId] = useState("")
  const [shortcutDisplay, setShortcutDisplay] = useState("")
  const [watchPercentage, setWatchPercentage] = useState(50)
  const [toastEnabled, setToastEnabled] = useState(true)
  const [preventDuplicates, setPreventDuplicates] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    // Load saved settings
    chrome.storage.local.get(
      [
        "playlists",
        "addToPlaylistID",
        "watchLaterShortcut",
        "toastEnabled",
        "preventDuplicates",
        "requiredWatchPercentage"
      ],
      (data) => {
        if (data.playlists?.length > 0) {
          setSelectedIds(data.playlists)
        }
        if (data.addToPlaylistID) {
          setShortcutPlaylistId(data.addToPlaylistID)
        }
        if (data.watchLaterShortcut) {
          setShortcutDisplay(data.watchLaterShortcut)
        }
        if (typeof data.toastEnabled !== "undefined") {
          setToastEnabled(data.toastEnabled)
        }
        if (typeof data.preventDuplicates !== "undefined") {
          setPreventDuplicates(data.preventDuplicates)
        }
        if (data.requiredWatchPercentage) {
          setWatchPercentage(Number(data.requiredWatchPercentage))
        }
      }
    )

    // Fetch playlists from YouTube API
    chrome.runtime.sendMessage({ action: "fetchPlaylists" }, (response) => {
      setLoading(false)
      if (chrome.runtime.lastError) {
        setError("Failed to fetch playlists")
        return
      }
      if (response?.error) {
        setError(response.error)
        return
      }
      if (response?.playlists) {
        setAllPlaylists(response.playlists)
      }
    })
  }, [])

  const togglePlaylist = (playlistId: string, checked: boolean) => {
    const updated = checked
      ? [...selectedIds, playlistId]
      : selectedIds.filter((id) => id !== playlistId)
    setSelectedIds(updated)
    chrome.storage.local.set({ playlists: updated })
  }

  const selectShortcutPlaylist = (playlistId: string) => {
    const value = shortcutPlaylistId === playlistId ? "" : playlistId
    setShortcutPlaylistId(value)
    chrome.storage.local.set({ addToPlaylistID: value })
  }

  const updateWatchPercentage = (value: number) => {
    setWatchPercentage(value)
    chrome.storage.local.set({ requiredWatchPercentage: value })
  }

  const toggleToast = (checked: boolean) => {
    setToastEnabled(checked)
    chrome.storage.local.set({ toastEnabled: checked })
  }

  const toggleDuplicates = (checked: boolean) => {
    setPreventDuplicates(checked)
    chrome.storage.local.set({ preventDuplicates: checked })
  }

  const recordShortcut = () => {
    setIsRecording(true)
    setShortcutDisplay("Press shortcut keys...")
    const keys: string[] = []

    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      keys.push(e.key)
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return

      keys[keys.length - 1] = keys[keys.length - 1].toUpperCase()
      const shortcut = keys.join("+")
      setShortcutDisplay(shortcut)
      chrome.storage.local.set({ watchLaterShortcut: shortcut })
      document.removeEventListener("keydown", handler)
      setIsRecording(false)
    }

    document.addEventListener("keydown", handler)
  }

  const refreshPlaylists = () => {
    setLoading(true)
    setError("")
    chrome.runtime.sendMessage({ action: "fetchPlaylists" }, (response) => {
      setLoading(false)
      if (response?.error) {
        setError(response.error)
        return
      }
      if (response?.playlists) {
        setAllPlaylists(response.playlists)
      }
    })
  }

  return (
    <Card className="w-[340px] border-0 shadow-none rounded-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-primary flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-primary">
            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" />
          </svg>
          Playlist Tools
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto-add Playlists */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-primary font-semibold uppercase tracking-wide">
              Auto-add playlists
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshPlaylists}
              disabled={loading}
              className="h-6 px-2 text-xs text-muted-foreground">
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>

          {error && (
            <p className="text-xs text-destructive">
              {error === "No access token"
                ? "Not authorized. Set up credentials in Options."
                : error}
            </p>
          )}

          {!loading && !error && allPlaylists.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No playlists found.
            </p>
          )}

          <div className="max-h-[160px] overflow-y-auto space-y-1">
            {allPlaylists.map((playlist) => (
              <label
                key={playlist.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={selectedIds.includes(playlist.id)}
                  onCheckedChange={(checked) =>
                    togglePlaylist(playlist.id, checked)
                  }
                />
                <span className="text-sm truncate" title={playlist.title}>
                  {playlist.title}
                </span>
              </label>
            ))}
          </div>
        </div>

        <Separator />

        {/* Shortcut Playlist */}
        <div className="space-y-2">
          <Label className="text-xs text-primary font-semibold uppercase tracking-wide">
            Shortcut playlist
          </Label>
          <p className="text-[10px] text-muted-foreground italic">
            Watch Later doesn't work due to a YouTube Data API limitation.
          </p>

          {allPlaylists.length > 0 ? (
            <div className="max-h-[120px] overflow-y-auto space-y-1">
              {allPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => selectShortcutPlaylist(playlist.id)}
                  className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    shortcutPlaylistId === playlist.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent text-foreground"
                  }`}>
                  <span
                    className={`h-3 w-3 rounded-full border-2 shrink-0 ${
                      shortcutPlaylistId === playlist.id
                        ? "border-primary bg-primary"
                        : "border-muted-foreground"
                    }`}
                  />
                  <span className="truncate" title={playlist.title}>
                    {playlist.title}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Input
              value={shortcutPlaylistId}
              onChange={(e) => {
                setShortcutPlaylistId(e.target.value)
                chrome.storage.local.set({ addToPlaylistID: e.target.value })
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
              className="h-8 text-xs">
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

        {/* Watch Percentage */}
        <div className="space-y-2">
          <Label className="text-xs text-primary font-semibold uppercase tracking-wide">
            Required watch percentage
          </Label>
          <div className="flex items-center gap-3">
            <Slider
              value={watchPercentage}
              onValueChange={updateWatchPercentage}
              min={0}
              max={100}
              className="flex-1"
            />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={watchPercentage}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (v >= 0 && v <= 100) updateWatchPercentage(v)
                }}
                className="h-8 w-14 text-xs text-center"
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
              onCheckedChange={toggleToast}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="dupe-toggle" className="text-sm">
              Prevent duplicates
            </Label>
            <Switch
              id="dupe-toggle"
              checked={preventDuplicates}
              onCheckedChange={toggleDuplicates}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default Popup
