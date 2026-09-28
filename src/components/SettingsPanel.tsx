import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Toaster } from "@/components/ui/sonner"
import { AUTH_SERVER_URL } from "@/config"
import {
  getRedirectURI,
  isAuthorized as checkAuthorized,
  signInWithBroker,
  signInWithOwnCredentials,
  signOut
} from "@/lib/auth"
import * as store from "@/lib/storage"
import { clearCache } from "@/lib/video-cache"

/**
 * Account + appearance settings.
 *
 * Shared by the options page and the popup's settings view so the two can never
 * drift. The component is layout-neutral: the caller supplies width and padding.
 */
export function SettingsPanel() {
  const [authorized, setAuthorized] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [clientID, setClientID] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [serverURL, setServerURL] = useState("")
  const [redirectURI, setRedirectURI] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setRedirectURI(getRedirectURI())
    Promise.all([
      store.clientID.getValue(),
      store.clientSecret.getValue(),
      store.authServerURL.getValue(),
      checkAuthorized()
    ]).then(([id, secret, server, isAuth]) => {
      setClientID(id)
      setClientSecret(secret)
      setServerURL(server)
      setAuthorized(isAuth)
    })
  }, [])

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      setAuthorized(await checkAuthorized())
      toast.success(label)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const handleClearData = () =>
    run("All extension data cleared", async () => {
      await store.clearAll()
      await clearCache()
      setClientID("")
      setClientSecret("")
      setServerURL("")
    })

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-4">
          {authorized ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
                <span className="h-2 w-2 rounded-full bg-current" />
                Signed in
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => run("Signed out", signOut)}
                >
                  Sign Out
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={handleClearData}
                >
                  Clear All Data
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => run("Signed in successfully", signInWithBroker)}
              >
                Sign in with Google
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                One click, no API credentials needed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {!authorized && (
        <Card>
          <CardContent className="space-y-4 pt-4">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((open) => !open)}
              className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Advanced: self-hosted server, or your own credentials
            </Button>

            {showAdvanced && (
              <div className="space-y-4 pt-2">
                <Separator />

                <div className="space-y-2">
                  <Label
                    htmlFor="serverURL"
                    className="text-xs font-semibold tracking-wide text-primary uppercase"
                  >
                    Token server
                  </Label>
                  <Input
                    id="serverURL"
                    value={serverURL}
                    onChange={(event) => {
                      setServerURL(event.target.value)
                      void store.authServerURL.setValue(event.target.value)
                    }}
                    placeholder={AUTH_SERVER_URL}
                  />
                  <p className="text-xs text-muted-foreground">
                    Points &ldquo;Sign in with Google&rdquo; at your own broker.
                    Run <code className="font-mono">server/</code> from the
                    repository. Blank uses{" "}
                    <span className="font-mono break-all">
                      {AUTH_SERVER_URL}
                    </span>
                    .
                  </p>
                </div>

                <Separator />

                <p className="text-xs text-muted-foreground">
                  Or skip the server entirely. Create an OAuth client of type{" "}
                  <strong>Web application</strong>{" "}
                  in the Google Cloud Console, then add the redirect URI below to
                  it verbatim.
                </p>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold tracking-wide text-primary uppercase">
                    Redirect URI
                  </Label>
                  <p className="rounded-md bg-muted p-2 font-mono text-xs break-all select-all">
                    {redirectURI}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="clientID"
                    className="text-xs font-semibold tracking-wide text-primary uppercase"
                  >
                    Client ID
                  </Label>
                  <Input
                    id="clientID"
                    value={clientID}
                    onChange={(event) => {
                      setClientID(event.target.value)
                      void store.clientID.setValue(event.target.value)
                    }}
                    placeholder="Client ID"
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="clientSecret"
                    className="text-xs font-semibold tracking-wide text-primary uppercase"
                  >
                    Client Secret
                  </Label>
                  <Input
                    id="clientSecret"
                    type="password"
                    value={clientSecret}
                    onChange={(event) => {
                      setClientSecret(event.target.value)
                      void store.clientSecret.setValue(event.target.value)
                    }}
                    placeholder="Client Secret"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() =>
                    run("Authorization successful", () =>
                      signInWithOwnCredentials(clientID, clientSecret)
                    )
                  }
                >
                  Authorize with Own Credentials
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex items-center justify-between pt-4">
          <Label className="text-sm">Theme</Label>
          <ModeToggle />
        </CardContent>
      </Card>

      {/* Owned here so neither host has to pull sonner onto its critical path. */}
      <Toaster position="bottom-center" />
    </div>
  )
}
