import { storage } from "~storage"

export async function refreshAccessToken(): Promise<string | null> {
  const clientID = await storage.get("clientID")
  const clientSecret = await storage.get("clientSecret")
  const refreshToken = await storage.get("refreshToken")

  const tokenUrl = "https://oauth2.googleapis.com/token"

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientID,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  })

  if (response.ok) {
    const data = await response.json()
    const { access_token } = data
    await storage.set("accessToken", access_token)
    return access_token
  } else {
    console.error(
      "[Youtube Playlist Tools]: Failed to refresh access token",
      response.statusText
    )
    return null
  }
}
