import { getAuthServerURL } from "@/config"
import * as store from "@/lib/storage"

export const SCOPES = "https://www.googleapis.com/auth/youtube.force-ssl"
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/auth"
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

/**
 * The redirect URI, which differs per browser.
 *
 * Firefox: identity.getRedirectURL() returns
 *   https://<sha1-of-extension-id>.extensions.allizom.org/
 * Google will not let you verify ownership of allizom.org, so we use the
 * loopback form Firefox has accepted since v86 instead. The subdomain of the
 * allizom URL *is* the sha1 hash, so slicing it out gives us the right value.
 * Firefox intercepts this redirect before it hits the network -- nothing needs
 * to listen on 127.0.0.1.
 *
 * Chrome: https://<extension-id>.chromiumapp.org/
 *
 * Both must be registered verbatim on the SAME Google "Web application" client
 * (the only client type with a redirect URI field). Google matches the string
 * exactly, so the trailing slash matters -- keep these in sync with the console.
 */
export function getRedirectURI(): string {
  if (import.meta.env.FIREFOX) {
    const hash = new URL(browser.identity.getRedirectURL()).host.split(".")[0]
    return `http://127.0.0.1/mozoauth2/${hash}`
  }
  return `https://${browser.runtime.id}.chromiumapp.org/`
}

// ── PKCE ─────────────────────────────────────────────────────────────────

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ""
  for (const byte of arr) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function createCodeVerifier(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )
  return base64UrlEncode(digest)
}

// ── Flow ─────────────────────────────────────────────────────────────────

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  error?: string
  error_description?: string
}

function buildAuthUrl(
  clientId: string,
  redirectURI: string,
  codeChallenge: string
): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT)
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectURI)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", SCOPES)
  // Required for Google to issue a refresh token at all.
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

async function launchAndGetCode(authUrl: string): Promise<string> {
  const responseUrl = await browser.identity.launchWebAuthFlow({
    interactive: true,
    url: authUrl
  })
  if (!responseUrl) throw new Error("Authorization was cancelled")

  const params = new URL(responseUrl).searchParams
  const error = params.get("error")
  if (error) throw new Error(`Authorization denied: ${error}`)

  const code = params.get("code")
  if (!code) throw new Error("No authorization code returned")
  return code
}

async function persist(tokens: TokenResponse, mode: store.AuthMode) {
  if (!tokens.access_token) {
    throw new Error(
      tokens.error_description || tokens.error || "No access token returned"
    )
  }
  // isAuthorized() is defined by the presence of a refresh token, so accepting
  // a response without one would show a success toast on a screen that still
  // says "signed out", then break silently an hour later when the access token
  // expires with no way to renew it.
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke the app's access in your " +
        "Google account and sign in again to force a fresh consent."
    )
  }
  await store.accessToken.setValue(tokens.access_token)
  await store.refreshToken.setValue(tokens.refresh_token)
  await store.authMode.setValue(mode)
}

/**
 * Primary path. The broker holds the client secret; the extension ships none.
 *
 * launchWebAuthFlow intercepts the redirect, so the authorization code comes
 * back to *us*, not through the broker. That means the broker needs no
 * callback route and no server-side state -- it is a single stateless endpoint.
 */
export async function signInWithBroker(): Promise<void> {
  const redirectURI = getRedirectURI()
  const verifier = createCodeVerifier()
  const challenge = await createCodeChallenge(verifier)

  const server = await getAuthServerURL()

  const config = await fetch(`${server}/auth/config`).then((r) => {
    if (!r.ok) throw new Error("Auth server is unreachable")
    return r.json() as Promise<{ client_id: string }>
  })

  const code = await launchAndGetCode(
    buildAuthUrl(config.client_id, redirectURI, challenge)
  )

  const response = await fetch(`${server}/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      redirect_uri: redirectURI
    })
  })

  await persist((await response.json()) as TokenResponse, "server")
}

/**
 * Fallback for users who would rather register their own Google client than
 * trust (or reach) the broker. Also the escape hatch while the shared client
 * is still subject to Google's unverified-app user cap, since the YouTube
 * scope is a restricted scope.
 */
export async function signInWithOwnCredentials(
  id: string,
  secret: string
): Promise<void> {
  if (!id || !secret) throw new Error("Client ID and secret are both required")

  const redirectURI = getRedirectURI()
  const verifier = createCodeVerifier()
  const challenge = await createCodeChallenge(verifier)

  const code = await launchAndGetCode(buildAuthUrl(id, redirectURI, challenge))

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectURI,
      code_verifier: verifier,
      grant_type: "authorization_code"
    })
  })

  await persist((await response.json()) as TokenResponse, "manual")
}

export async function signOut(): Promise<void> {
  await Promise.all([
    store.accessToken.removeValue(),
    store.refreshToken.removeValue(),
    store.authMode.removeValue()
  ])
}

export async function isAuthorized(): Promise<boolean> {
  return Boolean(await store.refreshToken.getValue())
}
