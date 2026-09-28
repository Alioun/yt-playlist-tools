import { getAuthServerURL } from "@/config"
import * as store from "@/lib/storage"

/**
 * Exchanges the stored refresh token for a fresh access token.
 *
 * Two tiers, matching the two sign-in paths: the broker (which holds the
 * client secret) first, then the user's own credentials if they configured
 * them. Returns null when neither can produce a token.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await store.refreshToken.getValue()
  if (!refreshToken) {
    console.error("[YT Playlist Tools]: No refresh token found")
    return null
  }

  // Users who deliberately configured their own Google client chose that to
  // avoid involving the broker at all. Sending their refresh token to it
  // anyway would leak a credential to a third party on every refresh -- and it
  // would fail regardless, since the token belongs to a different client.
  const mode = await store.authMode.getValue()

  // ── Tier 1: broker ─────────────────────────────────────────────────────
  if (mode !== "manual") {
    try {
      const response = await fetch(`${await getAuthServerURL()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.access_token) {
          await store.accessToken.setValue(data.access_token)
          return data.access_token
        }
      }
    } catch {
      // Broker unreachable -- fall through to the user's own credentials.
    }
  }

  // ── Tier 2: user-supplied credentials ──────────────────────────────────
  const [clientID, clientSecret] = await Promise.all([
    store.clientID.getValue(),
    store.clientSecret.getValue()
  ])

  if (!clientID || !clientSecret) {
    console.error(
      "[YT Playlist Tools]: Auth server unreachable and no local credentials configured"
    )
    return null
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientID,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  })

  if (response.ok) {
    const data = await response.json()
    if (data.access_token) {
      await store.accessToken.setValue(data.access_token)
      return data.access_token
    }
  }

  console.error("[YT Playlist Tools]: Failed to refresh access token")
  return null
}
