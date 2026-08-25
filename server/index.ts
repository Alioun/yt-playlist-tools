const PORT = Number(process.env.PORT) || 3847

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const SCOPES = "https://www.googleapis.com/auth/youtube.force-ssl"

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set")
  process.exit(1)
}

function serverUrl(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") || "http"
  const host = req.headers.get("host") || `localhost:${PORT}`
  return `${proto}://${host}`
}

function isValidExtRedirect(uri: string): boolean {
  try {
    const url = new URL(uri)
    return url.hostname.endsWith(".chromiumapp.org")
  } catch {
    return false
  }
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  })
}

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }))
    }

    // ── GET /auth/google ───────────────────────────────────────────
    // Extension calls this to start the OAuth flow.
    // Query: ext_redirect — the extension's chromiumapp.org redirect URI
    if (url.pathname === "/auth/google" && req.method === "GET") {
      const extRedirect = url.searchParams.get("ext_redirect")
      if (!extRedirect || !isValidExtRedirect(extRedirect)) {
        return cors(json({ error: "Invalid ext_redirect" }, 400))
      }

      // Encode extension redirect in state so we can redirect back after token exchange
      const state = btoa(extRedirect)
      const callbackUrl = `${serverUrl(req)}/auth/callback`

      const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/auth")
      googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID)
      googleAuthUrl.searchParams.set("redirect_uri", callbackUrl)
      googleAuthUrl.searchParams.set("response_type", "code")
      googleAuthUrl.searchParams.set("scope", SCOPES)
      googleAuthUrl.searchParams.set("access_type", "offline")
      googleAuthUrl.searchParams.set("prompt", "consent")
      googleAuthUrl.searchParams.set("state", state)

      return cors(Response.redirect(googleAuthUrl.toString(), 302))
    }

    // ── GET /auth/callback ─────────────────────────────────────────
    // Google redirects here after user consent.
    if (url.pathname === "/auth/callback" && req.method === "GET") {
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      const error = url.searchParams.get("error")

      if (error) {
        return new Response(`Authorization denied: ${error}`, { status: 400 })
      }

      if (!code || !state) {
        return new Response("Missing code or state", { status: 400 })
      }

      let extRedirect: string
      try {
        extRedirect = atob(state)
      } catch {
        return new Response("Invalid state", { status: 400 })
      }

      if (!isValidExtRedirect(extRedirect)) {
        return new Response("Invalid redirect", { status: 400 })
      }

      // Exchange code for tokens
      const callbackUrl = `${serverUrl(req)}/auth/callback`
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: callbackUrl,
          grant_type: "authorization_code"
        })
      })

      const tokenData = await tokenResponse.json()

      if (!tokenData.access_token) {
        return new Response(
          `Token exchange failed: ${JSON.stringify(tokenData)}`,
          { status: 500 }
        )
      }

      // Redirect back to extension with tokens in the hash fragment
      const redirectUrl = new URL(extRedirect)
      redirectUrl.searchParams.set("access_token", tokenData.access_token)
      if (tokenData.refresh_token) {
        redirectUrl.searchParams.set("refresh_token", tokenData.refresh_token)
      }

      return Response.redirect(redirectUrl.toString(), 302)
    }

    // ── POST /auth/refresh ─────────────────────────────────────────
    // Extension calls this to refresh an expired access token.
    if (url.pathname === "/auth/refresh" && req.method === "POST") {
      const body = await req.json()
      const refreshToken = body.refresh_token

      if (!refreshToken) {
        return cors(json({ error: "Missing refresh_token" }, 400))
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      })

      const tokenData = await tokenResponse.json()

      if (!tokenData.access_token) {
        return cors(json({ error: "Refresh failed", details: tokenData }, 500))
      }

      return cors(json({ access_token: tokenData.access_token }))
    }

    // ── GET / ──────────────────────────────────────────────────────
    if (url.pathname === "/") {
      return cors(json({ status: "ok", service: "yt-playlist-tools-auth" }))
    }

    return cors(json({ error: "Not found" }, 404))
  }
})

console.log(`Auth server running on http://localhost:${server.port}`)
