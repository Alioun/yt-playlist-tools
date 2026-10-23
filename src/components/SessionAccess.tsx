import { browser } from "wxt/browser"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { SharedSettings } from "@/components/SharedSettings"
import * as store from "@/lib/storage"
import { isAccountKey, isRecord, isSnapshot, sessionMessage, type SessionSnapshot } from "@/lib/session"

export interface ReadyView {
  kind: "ready"
  session: SessionSnapshot
  playlists: store.CachedPlaylist[]
  setup: store.AccountSetup
  unclaimed: boolean
}

type View = ReadyView | { kind: "cached"; accounts: store.SavedAccount[] } |
  { kind: "checking" | "consent" | "revoked" | "signedOut" | "noTab" | "accountChanged" | "unavailable" }

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

function isSavedAccounts(value: unknown): value is store.SavedAccount[] {
  return Array.isArray(value) && value.every(account =>
    isRecord(account) && isAccountKey(account.accountKey) && isSetup(account.setup))
}

function parseView(value: unknown): View {
  if (!isRecord(value)) return { kind: "unavailable" }
  if (value.kind === "ready" && isSnapshot(value.session) && isPlaylistList(value.playlists) && isSetup(value.setup) && typeof value.unclaimed === "boolean") {
    return { kind: "ready", session: value.session, playlists: value.playlists, setup: value.setup, unclaimed: value.unclaimed }
  }
  if (value.kind === "cached" && isSavedAccounts(value.accounts)) {
    return { kind: "cached", accounts: value.accounts }
  }
  switch (value.kind) {
    case "consent": case "revoked": case "signedOut": case "noTab": case "accountChanged": return { kind: value.kind }
    default: return { kind: "unavailable" }
  }
}

export function SessionAccess({ children }: { children?: (view: ReadyView) => ReactNode }) {
  const [view, setView] = useState<View>({ kind: "checking" })
  const [consented, setConsented] = useState(false)
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
      setConsented(value === store.CONSENT_VERSION)
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
            <p role="status" className="text-sm">{view.kind === "ready" ? "Using the account in your YouTube tab." : sessionMessage(view.kind === "cached" ? "noTab" : view.kind)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void browser.tabs.create({ url: "https://www.youtube.com/" })}>Open YouTube</Button>
              <Button size="sm" variant="outline" onClick={() => void check()}>Check again</Button>
              <Button size="sm" variant="ghost" onClick={() => void check("revokeSession")}>Revoke access</Button>
            </div>
          </div>
          {view.kind === "ready" && children?.(view)}
          {view.kind === "cached" && <CachedSetups accounts={view.accounts} />}
        </>
      )}
      {consented && !needsConsent && <SharedSettings />}
    </div>
  )
}

function CachedSetups({ accounts }: { accounts: store.SavedAccount[] }) {
  return (
    <section aria-label="Cached playlists" className="space-y-3">
      <h2 className="text-sm font-semibold">Cached playlists</h2>
      <p className="text-sm text-muted-foreground">Saved playlist titles and choices. Open YouTube and check again to edit an account setup.</p>
      {accounts.map(({ accountKey, setup }, index) => (
        <section key={accountKey} aria-label={`Saved setup ${index + 1}`} className="space-y-2">
          <h3 className="text-xs font-semibold">Saved setup {index + 1}</h3>
          {setup.cachedPlaylists.length === 0 ? <p className="text-sm text-muted-foreground">No cached playlist titles.</p> : (
            <ul className="max-h-[220px] space-y-1 overflow-y-auto">
              {setup.cachedPlaylists.map(playlist => {
                const selected = setup.playlists.includes(playlist.id)
                const shortcut = setup.shortcutPlaylistId === playlist.id
                return (
                  <li key={playlist.id} className="space-y-0.5 px-2 py-1.5">
                    <p className="truncate text-sm" title={playlist.title}>{playlist.title}</p>
                    <p className="text-xs text-muted-foreground">{[
                      ...(selected ? ["Auto-add"] : []),
                      ...(shortcut ? ["Shortcut playlist"] : []),
                      ...(!selected && !shortcut ? ["Not selected"] : [])
                    ].join(", ")}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </section>
  )
}
