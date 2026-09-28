/**
 * Request handling for the OAuth token broker.
 *
 * Deliberately separated from index.ts and written against Web APIs only
 * (Request/Response/fetch/URL) so it can be unit tested without starting a
 * server or depending on the Bun runtime. index.ts owns process concerns:
 * reading env, validating it, and calling Bun.serve.
 *
 * Why this broker exists at all: Google will not issue tokens to a public
 * client. Only a "Web application" OAuth client can register the redirect URIs
 * a browser extension needs, and that client type always requires a
 * client_secret at the token endpoint -- PKCE is not accepted as a substitute.
 * Shipping the secret inside the extension would make it trivially
 * extractable, so it lives here instead.
 *
 * Why there is no database: the extension calls identity.launchWebAuthFlow,
 * which intercepts the redirect, so the authorization code comes back to the
 * EXTENSION rather than through this server. There is no /auth/callback hop and
 * therefore no PKCE state to correlate across requests. Every endpoint below is
 * a pure function of its request.
 */

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

export interface BrokerConfig {
  clientId: string
  clientSecret: string
  /**
   * Extension IDs this broker will exchange tokens for. When set, a redirect
   * URI must belong to one of them.
   *
   * These endpoints are necessarily unauthenticated -- an extension cannot send
   * a meaningful Origin, and CORS is `*` for the same reason -- so without this
   * the broker is an open token-exchange service: anyone can drive its Google
   * client, spend its quota, and turn a stolen refresh token into an access
   * token using the client secret they do not have. Binding to known extension
   * IDs is the only check available that does not require new infrastructure.
   * Leaving it unset preserves the previous behaviour and logs a warning.
   */
  allowedExtensionIds?: string[]
}

/**
 * Only ever exchange codes destined for a real extension redirect.
 *
 * Chrome:  https://<extension-id>.chromiumapp.org/
 * Firefox: http://127.0.0.1/mozoauth2/<sha1-of-extension-id>
 *
 * The Firefox form matters -- an earlier version accepted only chromiumapp.org,
 * which silently made the broker unusable on the extension's primary platform.
 */
export function isValidExtRedirect(
  uri: string,
  allowedExtensionIds?: string[]
): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }

  // The identifier the redirect claims to belong to: the chromiumapp.org
  // subdomain on Chrome, the first mozoauth2 path segment on Firefox.
  let identifier: string | null = null

  if (url.protocol === "https:" && url.hostname.endsWith(".chromiumapp.org")) {
    const subdomain = url.hostname.slice(0, -".chromiumapp.org".length)
    // Reject the bare apex; a real redirect always has a subdomain.
    if (!subdomain) return false
    identifier = subdomain
  } else if (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "[::1]")
  ) {
    if (!url.pathname.startsWith("/mozoauth2/")) return false
    identifier = url.pathname.slice("/mozoauth2/".length).split("/")[0] ?? ""
    if (!identifier) return false
  }

  if (identifier === null) return false
  if (!allowedExtensionIds || allowedExtensionIds.length === 0) return true

  return allowedExtensionIds.some(
    (id) => id.toLowerCase() === identifier!.toLowerCase()
  )
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

export function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

async function requestGoogleToken(
  config: BrokerConfig,
  params: Record<string, string>
): Promise<Record<string, string>> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...params
    })
  })
  return (await response.json()) as Record<string, string>
}

async function readJsonBody(
  req: Request
): Promise<Record<string, string> | null> {
  try {
    const body = await req.json()
    return body && typeof body === "object" ? body : null
  } catch {
    return null
  }
}

export function createFetchHandler(config: BrokerConfig) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }))
    }

    // ── GET /health ────────────────────────────────────────────────────
    // Used by the container healthcheck. Deliberately does no I/O.
    if (url.pathname === "/health") {
      return json({ status: "ok" })
    }

    // ── GET /auth/config ───────────────────────────────────────────────
    // The extension needs the client ID to build the authorize URL. The ID is
    // public by design; only the secret is withheld.
    if (url.pathname === "/auth/config" && req.method === "GET") {
      return cors(json({ client_id: config.clientId }))
    }

    // ── POST /auth/exchange ────────────────────────────────────────────
    // { code, code_verifier, redirect_uri } -> { access_token, refresh_token }
    if (url.pathname === "/auth/exchange" && req.method === "POST") {
      const body = await readJsonBody(req)
      if (!body) return cors(json({ error: "Invalid JSON body" }, 400))

      const { code, code_verifier, redirect_uri } = body

      if (!code || !code_verifier || !redirect_uri) {
        return cors(
          json(
            { error: "code, code_verifier and redirect_uri are all required" },
            400
          )
        )
      }

      if (!isValidExtRedirect(redirect_uri, config.allowedExtensionIds)) {
        return cors(json({ error: "Invalid redirect_uri" }, 400))
      }

      const tokens = await requestGoogleToken(config, {
        code,
        code_verifier,
        redirect_uri,
        grant_type: "authorization_code"
      })

      if (!tokens.access_token) {
        console.error("Token exchange failed:", tokens.error)
        return cors(
          json(
            {
              error: "Token exchange failed",
              details: tokens.error_description ?? tokens.error
            },
            502
          )
        )
      }

      return cors(
        json({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token
        })
      )
    }

    // ── POST /auth/refresh ─────────────────────────────────────────────
    if (url.pathname === "/auth/refresh" && req.method === "POST") {
      const body = await readJsonBody(req)
      if (!body) return cors(json({ error: "Invalid JSON body" }, 400))

      if (!body.refresh_token) {
        return cors(json({ error: "Missing refresh_token" }, 400))
      }

      const tokens = await requestGoogleToken(config, {
        refresh_token: body.refresh_token,
        grant_type: "refresh_token"
      })

      if (!tokens.access_token) {
        console.error("Refresh failed:", tokens.error)
        return cors(
          json(
            {
              error: "Refresh failed",
              details: tokens.error_description ?? tokens.error
            },
            502
          )
        )
      }

      return cors(json({ access_token: tokens.access_token }))
    }

    if (url.pathname === "/") {
      return cors(json({ status: "ok", service: "yt-playlist-tools-auth" }))
    }

    return cors(json({ error: "Not found" }, 404))
  }
}
