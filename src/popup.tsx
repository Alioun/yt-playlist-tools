import { useEffect, useState } from "react"

import { Button } from "~components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~components/ui/card"
import { Input } from "~components/ui/input"
import { Label } from "~components/ui/label"
import { Separator } from "~components/ui/separator"
import { Slider } from "~components/ui/slider"
import { Switch } from "~components/ui/switch"

import "./style.css"

function Popup() {
  const [playlists, setPlaylists] = useState<string[]>([])
  const [shortcutPlaylistId, setShortcutPlaylistId] = useState("")
  const [shortcutDisplay, setShortcutDisplay] = useState("")
  const [watchPercentage, setWatchPercentage] = useState(50)
  const [toastEnabled, setToastEnabled] = useState(true)
  const [preventDuplicates, setPreventDuplicates] = useState(true)
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
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
          setPlaylists(data.playlists)
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
  }, [])

  const savePlaylists = (updated: string[]) => {
    setPlaylists(updated)
    chrome.storage.local.set({
      playlists: updated.filter((p) => p.trim())
    })
  }

  const addPlaylist = () => {
    savePlaylists([...playlists, ""])
  }

  const removePlaylist = (index: number) => {
    const updated = playlists.filter((_, i) => i !== index)
    savePlaylists(updated)
  }

  const updatePlaylist = (index: number, value: string) => {
    const updated = [...playlists]
    updated[index] = value
    savePlaylists(updated)
  }

  const updateShortcutPlaylist = (value: string) => {
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
        {/* Playlists */}
        <div className="space-y-2">
          <Label className="text-xs text-primary font-semibold uppercase tracking-wide">
            Auto-add playlists
          </Label>
          <div className="space-y-2">
            {playlists.map((playlist, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={playlist}
                  onChange={(e) => updatePlaylist(index, e.target.value)}
                  placeholder="Playlist ID"
                  className="h-8 text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePlaylist(index)}
                  className="h-8 px-2 text-muted-foreground hover:text-destructive">
                  &times;
                </Button>
              </div>
            ))}
          </div>
          <Button
            onClick={addPlaylist}
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs">
            + Add Playlist
          </Button>
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
          <Input
            value={shortcutPlaylistId}
            onChange={(e) => updateShortcutPlaylist(e.target.value)}
            placeholder="Playlist ID"
            className="h-8 text-xs"
          />
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
