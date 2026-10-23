import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { formatShortcut } from "@/lib/shortcut"
import * as store from "@/lib/storage"

export function SharedSettings() {
  const [shortcutDisplay, setShortcutDisplay] = useState("")
  const [watchPercentage, setWatchPercentage] = useState(50)
  const [toastEnabled, setToastEnabled] = useState(true)
  const [queueButton, setQueueButton] = useState(true)
  const [cardMenu, setCardMenu] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const stopRecording = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    let live = true
    void Promise.all([
      store.watchLaterShortcut.getValue(), store.toastEnabled.getValue(), store.requiredWatchPercentage.getValue(),
      store.queueButtonEnabled.getValue(), store.cardContextMenu.getValue()
    ]).then(([shortcut, feedback, percentage, queue, menu]) => {
      if (!live) return
      setShortcutDisplay(shortcut); setToastEnabled(feedback); setWatchPercentage(percentage); setQueueButton(queue); setCardMenu(menu)
    })
    return () => { live = false; stopRecording.current?.() }
  }, [])

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
      <Separator />
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
