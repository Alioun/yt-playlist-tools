import { useState } from "react"
import { ModeToggle } from "@/components/mode-toggle"
import { SessionAccess, sendSessionMessage } from "@/components/SessionAccess"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { isRecord } from "@/lib/session"

export function SettingsPanel() {
  const [error, setError] = useState("")
  async function clearData() {
    setError("")
    try {
      const response = await sendSessionMessage({ action: "clearAllData" })
      if (!isRecord(response) || response.ok !== true) throw new Error("Clear failed")
    } catch {
      setError("Couldn't clear extension data. Try again.")
    }
  }

  return (
    <div className="space-y-4">
      <SessionAccess />
      <div className="flex items-center justify-between border-t pt-4">
        <Label className="text-sm">Theme</Label>
        <ModeToggle />
      </div>
      <Button variant="outline" onClick={() => void clearData()}>Clear All Data</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
