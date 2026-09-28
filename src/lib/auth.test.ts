import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { AUTH_SERVER_URL } from "@/config"
import {
  SCOPES,
  getRedirectURI,
  isAuthorized,
  signInWithBroker,
  signInWithOwnCredentials,
  signOut
} from "@/lib/auth"
import * as store from "@/lib/storage"

const EXTENSION_ID = "abcdefghijklmnop"

/** Captures the authorize URL that launchWebAuthFlow was asked to open. */
let launchedUrl = ""

function stubIdentity(responseUrl: string | undefined) {
  launchedUrl = ""
  const identity = {
    launchWebAuthFlow: vi.fn(async ({ url }: { url: string }) => {
      launchedUrl = url
      return responseUrl
    }),
    getRedirectURL: vi.fn(
      () => "https://35b64b676900f491c00e7f618d43f7040e88422e.extensions.allizom.org/"
    )
  }
  Object.assign(fakeBrowser, { identity })
  return identity
}

type Reply = { status?: number; body?: unknown; text?: string }

function queueFetch(...replies: Reply[]) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = replies.shift() ?? { status: 500 }
    return new Response(next.text ?? JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json" }
    })
  })
  vi.stubGlobal("fetch", spy)
  return spy
}

const redirectWith = (params: Record<string, string>) =>
  `https://${EXTENSION_ID}.chromiumapp.org/?${new URLSearchParams(params)}`

beforeEach(() => {
  Object.assign(fakeBrowser.runtime, { id: EXTENSION_ID })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("getRedirectURI", () => {
  it("uses the chromiumapp.org form with a trailing slash on Chrome", () => {
    // Google matches the registered redirect URI byte-for-byte. The trailing
    // slash here is deliberate and differs from the Firefox form -- a
    // "consistency" cleanup either way breaks sign-in with an opaque error.
    // The Firefox branch is covered in auth.firefox.test.ts.
    stubIdentity(undefined)
    expect(getRedirectURI()).toBe(`https://${EXTENSION_ID}.chromiumapp.org/`)
  })
})

describe("PKCE", () => {
  it("sends a spec-compliant verifier and an S256 challenge", async () => {
    stubIdentity(redirectWith({ code: "the-code" }))
    const spy = queueFetch(
      { body: { client_id: "cid" } },
      { body: { access_token: "at", refresh_token: "rt" } }
    )

    await signInWithBroker()

    const authUrl = new URL(launchedUrl)
    const challenge = authUrl.searchParams.get("code_challenge")!
    const exchangeBody = JSON.parse(spy.mock.calls[1]![1]!.body as string)
    const sentVerifier = exchangeBody.code_verifier as string

    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256")

    // RFC 7636 s4.1: 43-128 chars from the unreserved set.
    expect(sentVerifier.length).toBeGreaterThanOrEqual(43)
    expect(sentVerifier.length).toBeLessThanOrEqual(128)
    expect(sentVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/)

    // The challenge must actually be base64url(SHA-256(verifier)).
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(sentVerifier)
    )
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    expect(challenge).toBe(expected)
    expect(challenge).not.toContain("=")
    expect(challenge).not.toContain("+")
    expect(challenge).not.toContain("/")
  })

  it("generates a different verifier each time", async () => {
    const verifiers: string[] = []
    for (let i = 0; i < 3; i++) {
      stubIdentity(redirectWith({ code: "c" }))
      const spy = queueFetch(
        { body: { client_id: "cid" } },
        { body: { access_token: "at", refresh_token: "rt" } }
      )
      await signInWithBroker()
      verifiers.push(JSON.parse(spy.mock.calls[1]![1]!.body as string).code_verifier)
    }
    expect(new Set(verifiers).size).toBe(3)
  })
})

describe("signInWithBroker", () => {
  it("requests offline access and the YouTube scope", async () => {
    stubIdentity(redirectWith({ code: "c" }))
    queueFetch(
      { body: { client_id: "cid" } },
      { body: { access_token: "at", refresh_token: "rt" } }
    )

    await signInWithBroker()

    const params = new URL(launchedUrl).searchParams
    expect(params.get("client_id")).toBe("cid")
    expect(params.get("scope")).toBe(SCOPES)
    expect(params.get("response_type")).toBe("code")
    // Without both of these Google issues no refresh token at all.
    expect(params.get("access_type")).toBe("offline")
    expect(params.get("prompt")).toBe("consent")
  })

  it("persists both tokens and marks the session as server-mode", async () => {
    stubIdentity(redirectWith({ code: "c" }))
    queueFetch(
      { body: { client_id: "cid" } },
      { body: { access_token: "at-1", refresh_token: "rt-1" } }
    )

    await signInWithBroker()

    await expect(store.accessToken.getValue()).resolves.toBe("at-1")
    await expect(store.refreshToken.getValue()).resolves.toBe("rt-1")
    await expect(store.authMode.getValue()).resolves.toBe("server")
    await expect(isAuthorized()).resolves.toBe(true)
  })

  it("posts the code and redirect_uri to the broker, never a client secret", async () => {
    stubIdentity(redirectWith({ code: "the-code" }))
    const spy = queueFetch(
      { body: { client_id: "cid" } },
      { body: { access_token: "at", refresh_token: "rt" } }
    )

    await signInWithBroker()

    expect(spy.mock.calls[0]![0]).toBe(`${AUTH_SERVER_URL}/auth/config`)
    expect(spy.mock.calls[1]![0]).toBe(`${AUTH_SERVER_URL}/auth/exchange`)

    const body = JSON.parse(spy.mock.calls[1]![1]!.body as string)
    expect(body.code).toBe("the-code")
    expect(body.redirect_uri).toBe(getRedirectURI())
    expect(Object.keys(body)).not.toContain("client_secret")
  })

  it("uses a self-hosted broker URL when one is stored", async () => {
    // Someone running a published build cannot change the build-time
    // WXT_AUTH_SERVER_URL, so both broker calls must follow the stored value.
    await store.authServerURL.setValue("https://broker.example.com/")
    stubIdentity(redirectWith({ code: "c" }))
    const spy = queueFetch(
      { body: { client_id: "cid" } },
      { body: { access_token: "at", refresh_token: "rt" } }
    )

    await signInWithBroker()

    expect(spy.mock.calls[0]![0]).toBe("https://broker.example.com/auth/config")
    expect(spy.mock.calls[1]![0]).toBe(
      "https://broker.example.com/auth/exchange"
    )
  })

  it("throws when the broker is unreachable", async () => {
    stubIdentity(redirectWith({ code: "c" }))
    queueFetch({ status: 502 })

    await expect(signInWithBroker()).rejects.toThrow(/unreachable/i)
  })

  it("throws when the user cancels the flow", async () => {
    stubIdentity(undefined)
    queueFetch({ body: { client_id: "cid" } })

    await expect(signInWithBroker()).rejects.toThrow(/cancelled/i)
  })

  it("throws when Google returns an error in the redirect", async () => {
    stubIdentity(redirectWith({ error: "access_denied" }))
    queueFetch({ body: { client_id: "cid" } })

    await expect(signInWithBroker()).rejects.toThrow(/access_denied/)
  })

  it("throws when the redirect carries no code", async () => {
    stubIdentity(redirectWith({}))
    queueFetch({ body: { client_id: "cid" } })

    await expect(signInWithBroker()).rejects.toThrow(/no authorization code/i)
  })

  it("surfaces the broker's error detail from a failed exchange", async () => {
    stubIdentity(redirectWith({ code: "c" }))
    queueFetch(
      { body: { client_id: "cid" } },
      { status: 502, body: { error: "Token exchange failed", details: "Bad code" } }
    )

    await expect(signInWithBroker()).rejects.toThrow(/Bad code|Token exchange failed/)
  })

  it("rejects a token response with no refresh token instead of half-signing-in", async () => {
    // isAuthorized() is defined by the refresh token, so accepting this would
    // show a success toast on a screen that still says signed out, then break
    // silently an hour later.
    stubIdentity(redirectWith({ code: "c" }))
    queueFetch(
      { body: { client_id: "cid" } },
      { body: { access_token: "at-only" } }
    )

    await expect(signInWithBroker()).rejects.toThrow(/refresh token/i)
    await expect(isAuthorized()).resolves.toBe(false)
  })
})

describe("signInWithOwnCredentials", () => {
  it("requires both id and secret before opening a window", async () => {
    const identity = stubIdentity(redirectWith({ code: "c" }))

    await expect(signInWithOwnCredentials("", "secret")).rejects.toThrow(/required/i)
    await expect(signInWithOwnCredentials("id", "")).rejects.toThrow(/required/i)
    expect(identity.launchWebAuthFlow).not.toHaveBeenCalled()
  })

  it("exchanges directly with Google and records manual mode", async () => {
    stubIdentity(redirectWith({ code: "c" }))
    const spy = queueFetch({ body: { access_token: "at", refresh_token: "rt" } })

    await signInWithOwnCredentials("my-id", "my-secret")

    expect(spy.mock.calls[0]![0]).toBe("https://oauth2.googleapis.com/token")
    const sent = new URLSearchParams(spy.mock.calls[0]![1]!.body as string)
    expect(sent.get("client_id")).toBe("my-id")
    expect(sent.get("client_secret")).toBe("my-secret")
    expect(sent.get("code_verifier")).toBeTruthy()

    // authMode is what keeps refreshAccessToken from routing this user's
    // refresh token through the broker.
    await expect(store.authMode.getValue()).resolves.toBe("manual")
  })

  it("surfaces Google's error description", async () => {
    stubIdentity(redirectWith({ code: "c" }))
    queueFetch({
      status: 400,
      body: { error: "invalid_client", error_description: "Unauthorized" }
    })

    await expect(signInWithOwnCredentials("id", "secret")).rejects.toThrow(/Unauthorized/)
  })
})

describe("signOut", () => {
  it("clears the tokens and the auth mode", async () => {
    await store.accessToken.setValue("at")
    await store.refreshToken.setValue("rt")
    await store.authMode.setValue("manual")

    await signOut()

    await expect(isAuthorized()).resolves.toBe(false)
    await expect(store.accessToken.getValue()).resolves.toBe("")
    await expect(store.authMode.getValue()).resolves.toBe("server")
  })

  it("leaves the user's own credentials in place", async () => {
    // Signing out should not force them to paste their client id again.
    await store.clientID.setValue("cid")
    await store.clientSecret.setValue("sec")
    await store.refreshToken.setValue("rt")

    await signOut()

    await expect(store.clientID.getValue()).resolves.toBe("cid")
    await expect(store.clientSecret.getValue()).resolves.toBe("sec")
  })
})
