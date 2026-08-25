import { AUTH_SERVER_URL } from "~config"
import { storage } from "~storage"

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await storage.get("refreshToken")
  if (!refreshToken) {
    console.error("[YT Playlist Tools]: No refresh token found")
    return null
  }

  // Try server-based refresh first (no client credentials needed)
  try {
    const response = await fetch(`${AUTH_SERVER_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    })

    if (response.ok) {
      const data = await response.json()
      if (data.access_token) {
        await storage.set("accessToken", data.access_token)
        return data.access_token
      }
    }
  } catch {
    // Server unavailable, fall through to local refresh
  }

  // Fallback: local refresh using user-provided credentials
  const clientID = await storage.get("clientID")
  const clientSecret = await storage.get("clientSecret")

  if (!clientID || !clientSecret) {
    console.error("[YT Playlist Tools]: No credentials for local refresh")
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
    await storage.set("accessToken", data.access_token)
    return data.access_token
  }

  console.error("[YT Playlist Tools]: Failed to refresh access token")
  return null
}
