import { useState } from "react"
import { ModeToggle } from "@/components/mode-toggle"
import { SessionAccess } from "@/components/SessionAccess"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import * as store from "@/lib/storage"

export function SettingsPanel() {
  const [error, setError] = useState("")
  return (
    <div className="space-y-4">
      <SessionAccess />
      <div className="flex items-center justify-between border-t pt-4">
        <Label className="text-sm">Theme</Label>
        <ModeToggle />
      </div>
      <Button variant="outline" onClick={() => {
        void store.clearAll().catch(() => setError("Couldn't clear extension data. Try again."))
      }}>Clear All Data</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
