import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_SERVER_URL } from "@/config"
import * as store from "@/lib/storage"
import { refreshAccessToken } from "@/utils"

// Mocked so this exercises the fallback logic without pulling in #imports.
vi.mock("@/lib/storage", () => {
  const item = <T>(initial: T) => {
    let value = initial
    return {
      getValue: vi.fn(async () => value),
      setValue: vi.fn(async (next: T) => {
        value = next
      })
    }
  }
  return {
    authMode: item<"server" | "manual">("server"),
    refreshToken: item(""),
    accessToken: item(""),
    clientID: item(""),
    clientSecret: item(""),
    authServerURL: item("")
  }
})

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

type Reply = { status?: number; body?: unknown } | { throws: true }

/** Replies in order; a `{throws:true}` entry simulates a network failure. */
function queueFetch(...replies: Reply[]) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = replies.shift()
    if (!next) throw new Error("unexpected extra fetch call")
    if ("throws" in next) throw new TypeError("Failed to fetch")
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json" }
    })
  })
  vi.stubGlobal("fetch", spy)
  return spy
}

/** Seeds the mocked storage items. */
async function seed(values: {
  refreshToken?: string
  clientID?: string
  clientSecret?: string
  authMode?: "server" | "manual"
  authServerURL?: string
}) {
  await store.authMode.setValue(values.authMode ?? "server")
  await store.refreshToken.setValue(values.refreshToken ?? "")
  await store.clientID.setValue(values.clientID ?? "")
  await store.clientSecret.setValue(values.clientSecret ?? "")
  await store.accessToken.setValue("")
  await store.authServerURL.setValue(values.authServerURL ?? "")
  vi.mocked(store.accessToken.setValue).mockClear()
}

const urlOf = (spy: ReturnType<typeof queueFetch>, i: number) =>
  spy.mock.calls[i]?.[0]

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("refreshAccessToken", () => {
  it("returns null without any network call when there is no refresh token", async () => {
    await seed({ refreshToken: "" })
    const spy = queueFetch()

    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  describe("tier 1: the broker", () => {
    it("uses the broker and persists the new access token", async () => {
      await seed({ refreshToken: "rt" })
      const spy = queueFetch({ body: { access_token: "from-broker" } })

      await expect(refreshAccessToken()).resolves.toBe("from-broker")

      expect(urlOf(spy, 0)).toBe(`${AUTH_SERVER_URL}/auth/refresh`)
      expect(store.accessToken.setValue).toHaveBeenCalledWith("from-broker")
      // Tier 2 must not run once tier 1 succeeds.
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it("prefers a self-hosted broker URL over the build-time default", async () => {
      // The build-time WXT_AUTH_SERVER_URL cannot be changed by someone running
      // a published build, so the stored value has to win. Trailing slash is
      // trimmed because every call site appends its own path.
      await seed({
        refreshToken: "rt",
        authServerURL: "https://broker.example.com/"
      })
      const spy = queueFetch({ body: { access_token: "from-self-hosted" } })

      await expect(refreshAccessToken()).resolves.toBe("from-self-hosted")
      expect(urlOf(spy, 0)).toBe("https://broker.example.com/auth/refresh")
    })

    it("skips the broker entirely in manual mode", async () => {
      // A user who supplied their own Google client did so to avoid the
      // broker; sending their refresh token to it would leak a credential to
      // a third party on every refresh.
      await seed({
        refreshToken: "1//user-own",
        clientID: "cid",
        clientSecret: "sec",
        authMode: "manual"
      })
      const spy = queueFetch({ body: { access_token: "local" } })

      await expect(refreshAccessToken()).resolves.toBe("local")

      expect(spy).toHaveBeenCalledTimes(1)
      expect(urlOf(spy, 0)).toBe(GOOGLE_TOKEN_ENDPOINT)
      expect(urlOf(spy, 0)).not.toContain(AUTH_SERVER_URL)
    })

    it("sends the refresh token as JSON", async () => {
      await seed({ refreshToken: "rt-abc" })
      const spy = queueFetch({ body: { access_token: "x" } })

      await refreshAccessToken()

      const init = spy.mock.calls[0]![1]!
      expect(JSON.parse(init.body as string)).toEqual({ refresh_token: "rt-abc" })
    })
  })

  describe("falling through to tier 2: user credentials", () => {
    it("falls through when the broker is unreachable", async () => {
      await seed({ refreshToken: "rt", clientID: "cid", clientSecret: "sec" })
      const spy = queueFetch({ throws: true }, { body: { access_token: "local" } })

      await expect(refreshAccessToken()).resolves.toBe("local")
      expect(urlOf(spy, 1)).toBe(GOOGLE_TOKEN_ENDPOINT)
    })

    it("falls through when the broker 200s but returns no access_token", async () => {
      // Easy to get wrong: a 200 with an empty/error body must not be treated
      // as success, or the user is left with a stale token and no fallback.
      await seed({ refreshToken: "rt", clientID: "cid", clientSecret: "sec" })
      const spy = queueFetch({ body: { error: "nope" } }, { body: { access_token: "local" } })

      await expect(refreshAccessToken()).resolves.toBe("local")
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it("falls through when the broker returns a 5xx", async () => {
      await seed({ refreshToken: "rt", clientID: "cid", clientSecret: "sec" })
      queueFetch({ status: 502, body: {} }, { body: { access_token: "local" } })

      await expect(refreshAccessToken()).resolves.toBe("local")
    })

    it("sends client credentials as form-encoded to Google", async () => {
      await seed({ refreshToken: "rt", clientID: "cid", clientSecret: "sec" })
      const spy = queueFetch({ throws: true }, { body: { access_token: "local" } })

      await refreshAccessToken()

      const init = spy.mock.calls[1]![1]!
      const sent = new URLSearchParams(init.body as string)
      expect(sent.get("client_id")).toBe("cid")
      expect(sent.get("client_secret")).toBe("sec")
      expect(sent.get("refresh_token")).toBe("rt")
      expect(sent.get("grant_type")).toBe("refresh_token")
    })

    it("returns null when the broker fails and no credentials are configured", async () => {
      await seed({ refreshToken: "rt" })
      const spy = queueFetch({ throws: true })

      await expect(refreshAccessToken()).resolves.toBeNull()
      // Only the broker attempt -- nothing to try against Google.
      expect(spy).toHaveBeenCalledTimes(1)
      expect(store.accessToken.setValue).not.toHaveBeenCalled()
    })

    it("returns null when only a client id is configured", async () => {
      await seed({ refreshToken: "rt", clientID: "cid" })
      queueFetch({ throws: true })

      await expect(refreshAccessToken()).resolves.toBeNull()
    })

    it("returns null when Google rejects the refresh token", async () => {
      await seed({ refreshToken: "revoked", clientID: "cid", clientSecret: "sec" })
      queueFetch({ throws: true }, { status: 400, body: { error: "invalid_grant" } })

      await expect(refreshAccessToken()).resolves.toBeNull()
      expect(store.accessToken.setValue).not.toHaveBeenCalled()
    })

    it("returns null when Google 200s without an access_token", async () => {
      await seed({ refreshToken: "rt", clientID: "cid", clientSecret: "sec" })
      queueFetch({ throws: true }, { body: {} })

      await expect(refreshAccessToken()).resolves.toBeNull()
      expect(store.accessToken.setValue).not.toHaveBeenCalled()
    })
  })
})
