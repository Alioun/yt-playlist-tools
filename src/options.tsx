import { useEffect, useState } from "react"

import { Button } from "~components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~components/ui/card"
import { Input } from "~components/ui/input"
import { Label } from "~components/ui/label"

import "./style.css"

function Options() {
  const [clientID, setClientID] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [redirectURI, setRedirectURI] = useState("")
  const [toast, setToast] = useState("")

  useEffect(() => {
    const uri = `https://${chrome.runtime.id}.chromiumapp.org/`
    setRedirectURI(uri)

    chrome.storage.local.get(
      ["clientID", "clientSecret", "refreshToken"],
      (data) => {
        if (data.clientID) setClientID(data.clientID)
        if (data.clientSecret) setClientSecret(data.clientSecret)
        if (data.refreshToken) setIsAuthorized(true)
      }
    )
  }, [])

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(""), 3000)
  }

  const updateClientID = (value: string) => {
    setClientID(value)
    chrome.storage.local.set({ clientID: value })
  }

  const updateClientSecret = (value: string) => {
    setClientSecret(value)
    chrome.storage.local.set({ clientSecret: value })
  }

  const clearStorage = () => {
    chrome.storage.local.clear(() => {
      setClientID("")
      setClientSecret("")
      setIsAuthorized(false)
      showToast("Storage cleared!")
    })
  }

  const authorize = async () => {
    if (!clientID || !clientSecret) {
      showToast("Client ID and/or Secret missing")
      return
    }

    const scopes = "https://www.googleapis.com/auth/youtube.force-ssl"
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectURI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline`

    try {
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        interactive: true,
        url: authUrl
      })

      if (!responseUrl) return

      const code = new URL(responseUrl).searchParams.get("code")
      const tokenUrl = "https://oauth2.googleapis.com/token"

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code: code!,
          client_id: clientID,
          client_secret: clientSecret,
          redirect_uri: redirectURI,
          grant_type: "authorization_code"
        })
      })

      const data = await response.json()
      const { access_token, refresh_token } = data

      if (access_token && refresh_token) {
        await chrome.storage.local.set({
          accessToken: access_token,
          refreshToken: refresh_token
        })
        setIsAuthorized(true)
        showToast("Authorization successful!")
      } else {
        console.error("Authorization failed")
        showToast("Authorization failed")
      }
    } catch (error) {
      console.error("Error during authorization", error)
      showToast("Error during authorization")
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-primary">
                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" />
              </svg>
              YouTube Playlist Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-primary font-semibold uppercase tracking-wide">
                Redirect URI
              </Label>
              <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded-md select-all break-all">
                {redirectURI}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientID" className="text-xs text-primary font-semibold uppercase tracking-wide">
                Client ID
              </Label>
              <Input
                id="clientID"
                value={clientID}
                onChange={(e) => updateClientID(e.target.value)}
                placeholder="Client ID"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientSecret" className="text-xs text-primary font-semibold uppercase tracking-wide">
                Client Secret
              </Label>
              <Input
                id="clientSecret"
                value={clientSecret}
                onChange={(e) => updateClientSecret(e.target.value)}
                placeholder="Client Secret"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={authorize}
                disabled={isAuthorized}
                className={isAuthorized ? "bg-green-600 hover:bg-green-600 cursor-not-allowed flex-1" : "flex-1"}>
                {isAuthorized ? "Authorized" : "Authorize"}
              </Button>
              <Button variant="outline" onClick={clearStorage}>
                Clear Storage
              </Button>
            </div>
          </CardContent>
        </Card>

        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-md text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

export default Options
