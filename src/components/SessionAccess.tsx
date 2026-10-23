import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import * as store from "@/lib/storage"
import { isRecord, isSnapshot, sessionMessage, type SessionSnapshot } from "@/lib/session"

export interface ReadyView {
  kind: "ready"
  session: SessionSnapshot
  playlists: store.CachedPlaylist[]
  setup: store.AccountSetup
  unclaimed: boolean
}

type View = ReadyView | { kind: "checking" | "consent" | "revoked" | "signedOut" | "noTab" | "accountChanged" | "unavailable" }

export async function sendSessionMessage(message: Record<string, unknown>): Promise<unknown> {
  const window = await browser.windows.getCurrent()
  return browser.runtime.sendMessage({ ...message, windowId: window.id })
}

export function isSetup(value: unknown): value is store.AccountSetup {
  if (!isRecord(value) || !Array.isArray(value.playlists) || !value.playlists.every(id => typeof id === "string") ||
    typeof value.shortcutPlaylistId !== "string" || (value.cachedAt !== null && typeof value.cachedAt !== "number") || !isRecord(value.filters) || !isRecord(value.labels) || !isPlaylistList(value.cachedPlaylists)) return false
  return Object.values(value.filters).every(filter => isRecord(filter) && (filter.mode === "allow" || filter.mode === "deny") &&
    typeof filter.enabled === "boolean" && Array.isArray(filter.channels) && filter.channels.every(id => typeof id === "string")) &&
    Object.values(value.labels).every(label => isRecord(label) && typeof label.title === "string" && (label.handle === undefined || typeof label.handle === "string"))
}

function isPlaylistList(value: unknown): value is store.CachedPlaylist[] {
  return Array.isArray(value) && value.every(row => isRecord(row) && typeof row.id === "string" && typeof row.title === "string")
}

function parseView(value: unknown): View {
  if (!isRecord(value)) return { kind: "unavailable" }
  if (value.kind === "ready" && isSnapshot(value.session) && isPlaylistList(value.playlists) && isSetup(value.setup) && typeof value.unclaimed === "boolean") {
    return { kind: "ready", session: value.session, playlists: value.playlists, setup: value.setup, unclaimed: value.unclaimed }
  }
  switch (value.kind) {
    case "consent": case "revoked": case "signedOut": case "noTab": case "accountChanged": return { kind: value.kind }
    default: return { kind: "unavailable" }
  }
}

export function SessionAccess({ children }: { children?: (view: ReadyView) => ReactNode }) {
  const [view, setView] = useState<View>({ kind: "checking" })
  const generation = useRef(0)
  const check = useCallback(async (action = "fetchPlaylists") => {
    const request = ++generation.current
    setView({ kind: "checking" })
    try {
      const result = await sendSessionMessage({ action })
      if (request === generation.current) setView(parseView(result))
    } catch {
      if (request === generation.current) setView({ kind: "unavailable" })
    }
  }, [])

  useEffect(() => {
    let live = true
    const update = (value: number | null) => {
      if (!live) return
      if (value === store.CONSENT_VERSION) void check()
      else { generation.current++; setView({ kind: value === -1 ? "revoked" : "consent" }) }
    }
    void store.sessionConsent.getValue().then(update)
    const unwatch = store.sessionConsent.watch(update)
    return () => { live = false; generation.current++; unwatch() }
  }, [check])

  const needsConsent = view.kind === "consent" || view.kind === "revoked"
  return (
    <div className="space-y-4">
      {needsConsent ? (
        <section aria-label="YouTube session access" className="space-y-3">
          <h2 className="text-sm font-semibold">Use your YouTube session</h2>
          {view.kind === "revoked" && <p role="status" className="text-sm">YouTube access was revoked.</p>}
          <p className="text-sm text-muted-foreground">
            Playlist Tools uses the YouTube account signed in on your open YouTube tab. It reads a session cookie only inside that page to sign requests to YouTube. Cookies never leave the page.
          </p>
          <p className="text-sm text-muted-foreground">
            Your chosen playlist settings stay in your browser. No YouTube data is read and no features run until you agree. You can revoke access here at any time.
          </p>
          <p className="text-xs text-muted-foreground">Every add checks YouTube for membership. The old duplicate-prevention switch is no longer needed. Your old playlist choices stay saved and inactive. Choose playlists for each account after you agree.</p>
          <Button className="w-full" onClick={() => void check("grantSession")}>Agree and continue</Button>
        </section>
      ) : view.kind === "checking" ? <p role="status" className="text-sm text-muted-foreground">Checking YouTube session...</p> : (
        <>
          <div className="space-y-2">
            <p role="status" className="text-sm">{view.kind === "ready" ? "Using the account in your YouTube tab." : sessionMessage(view.kind)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void browser.tabs.create({ url: "https://www.youtube.com/" })}>Open YouTube</Button>
              <Button size="sm" variant="outline" onClick={() => void check()}>Check again</Button>
              <Button size="sm" variant="ghost" onClick={() => void check("revokeSession")}>Revoke access</Button>
            </div>
          </div>
          {view.kind === "ready" && children?.(view)}
        </>
      )}
    </div>
  )
}
