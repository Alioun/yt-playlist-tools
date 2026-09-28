import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  GOOGLE_TOKEN_ENDPOINT,
  createFetchHandler,
  isValidExtRedirect
} from "./handler"

const CONFIG = { clientId: "test-client-id", clientSecret: "test-secret" }
const handle = createFetchHandler(CONFIG)

function req(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Request {
  const { json, ...rest } = init
  return new Request(`https://broker.test${path}`, {
    ...rest,
    ...(json !== undefined
      ? {
          method: rest.method ?? "POST",
          headers: { "Content-Type": "application/json", ...rest.headers },
          body: JSON.stringify(json)
        }
      : {})
  })
}

/** Stubs global fetch and records the calls Google would have received. */
function stubGoogle(response: unknown, ok = true) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(response), {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "application/json" }
    })
  )
  vi.stubGlobal("fetch", spy)
  return spy
}

/** The form body the handler actually sent to Google, as URLSearchParams. */
function sentParams(spy: ReturnType<typeof stubGoogle>, call = 0): URLSearchParams {
  const init = spy.mock.calls[call]?.[1]
  // The handler passes a URLSearchParams instance directly as the body.
  return init!.body as unknown as URLSearchParams
}

beforeEach(() => {
  // The handler logs to console.error on upstream failures; keep output clean.
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("isValidExtRedirect", () => {
  it("accepts a Chrome chromiumapp.org redirect", () => {
    expect(isValidExtRedirect("https://abcdef.chromiumapp.org/")).toBe(true)
  })

  it("accepts the Firefox loopback form", () => {
    // This is the case an earlier version rejected, which silently made the
    // broker unusable on the extension's primary platform.
    expect(
      isValidExtRedirect("http://127.0.0.1/mozoauth2/35b64b676900f491c00e7f")
    ).toBe(true)
  })

  it("accepts a traversal that normalises back into mozoauth2", () => {
    // new URL() resolves "/evil/../mozoauth2/x" to "/mozoauth2/x", so this is
    // the same safe URL rather than a bypass. Pinned so nobody "hardens" it
    // into a false rejection later.
    expect(isValidExtRedirect("http://127.0.0.1/evil/../mozoauth2/x")).toBe(true)
  })

  it.each([
    ["a plain attacker origin", "https://evil.com/"],
    ["chromiumapp.org as a query param", "https://evil.com/?x=.chromiumapp.org"],
    ["chromiumapp.org as a subdomain of evil", "https://foo.chromiumapp.org.evil.com/"],
    ["loopback without the mozoauth2 path", "http://127.0.0.1/evil"],
    ["http (not https) chromiumapp", "http://abc.chromiumapp.org/"],
    ["a non-loopback host with the mozoauth2 path", "http://evil.com/mozoauth2/x"],
    ["garbage that is not a URL", "not-a-url"],
    ["an empty string", ""],
    ["a javascript: scheme", "javascript:alert(1)"],
    ["a data: scheme", "data:text/html,hi"]
  ])("rejects %s", (_label, uri) => {
    expect(isValidExtRedirect(uri)).toBe(false)
  })
})

describe("isValidExtRedirect with allowedExtensionIds", () => {
  const ids = ["myextensionid", "deadbeef"]

  it("accepts a redirect belonging to a configured extension", () => {
    expect(isValidExtRedirect("https://myextensionid.chromiumapp.org/", ids)).toBe(true)
    expect(isValidExtRedirect("http://127.0.0.1/mozoauth2/deadbeef", ids)).toBe(true)
  })

  it("rejects a well-formed redirect for someone else's extension", () => {
    // Without this the broker is an open token-exchange service: any third
    // party can drive its Google client using the client secret they lack.
    expect(isValidExtRedirect("https://someoneelse.chromiumapp.org/", ids)).toBe(false)
    expect(isValidExtRedirect("http://127.0.0.1/mozoauth2/cafebabe", ids)).toBe(false)
  })

  it("stays permissive when no ids are configured", () => {
    expect(isValidExtRedirect("https://anything.chromiumapp.org/", [])).toBe(true)
    expect(isValidExtRedirect("https://anything.chromiumapp.org/")).toBe(true)
  })
})

describe("GET /health", () => {
  it("returns ok without touching the network", async () => {
    const spy = stubGoogle({})
    const res = await handle(req("/health"))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: "ok" })
    // The container healthcheck runs this on an interval -- it must not make
    // an upstream call to Google every 30 seconds.
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("GET /auth/config", () => {
  it("exposes the client id but never the secret", async () => {
    const res = await handle(req("/auth/config"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ client_id: CONFIG.clientId })
    expect(JSON.stringify(body)).not.toContain(CONFIG.clientSecret)
  })
})

describe("POST /auth/exchange", () => {
  const valid = {
    code: "auth-code",
    code_verifier: "verifier",
    redirect_uri: "https://abcdef.chromiumapp.org/"
  }

  it("exchanges a code and returns both tokens", async () => {
    const spy = stubGoogle({
      access_token: "at-123",
      refresh_token: "rt-456"
    })

    const res = await handle(req("/auth/exchange", { json: valid }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      access_token: "at-123",
      refresh_token: "rt-456"
    })

    // The whole point of the broker: the secret is attached server-side.
    expect(spy.mock.calls[0]![0]).toBe(GOOGLE_TOKEN_ENDPOINT)
    const sent = sentParams(spy)
    expect(sent.get("client_secret")).toBe(CONFIG.clientSecret)
    expect(sent.get("client_id")).toBe(CONFIG.clientId)
    expect(sent.get("code_verifier")).toBe("verifier")
    expect(sent.get("grant_type")).toBe("authorization_code")
  })

  it("forwards the Firefox loopback redirect unchanged", async () => {
    const spy = stubGoogle({ access_token: "at", refresh_token: "rt" })
    const redirect = "http://127.0.0.1/mozoauth2/deadbeef"

    await handle(req("/auth/exchange", { json: { ...valid, redirect_uri: redirect } }))

    const sent = sentParams(spy)
    // Google matches redirect_uri byte-for-byte; any rewriting here would
    // produce redirect_uri_mismatch.
    expect(sent.get("redirect_uri")).toBe(redirect)
  })

  it.each([
    ["code", { ...valid, code: undefined }],
    ["code_verifier", { ...valid, code_verifier: undefined }],
    ["redirect_uri", { ...valid, redirect_uri: undefined }]
  ])("rejects a request missing %s", async (_field, body) => {
    const spy = stubGoogle({})
    const res = await handle(req("/auth/exchange", { json: body }))

    expect(res.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it("rejects an untrusted redirect_uri without calling Google", async () => {
    const spy = stubGoogle({ access_token: "should-not-be-issued" })
    const res = await handle(
      req("/auth/exchange", { json: { ...valid, redirect_uri: "https://evil.com/" } })
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "Invalid redirect_uri" })
    expect(spy).not.toHaveBeenCalled()
  })

  it("rejects a malformed JSON body", async () => {
    const res = await handle(
      new Request("https://broker.test/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json"
      })
    )
    expect(res.status).toBe(400)
  })

  it("surfaces an upstream failure as 502 and does not leak the secret", async () => {
    stubGoogle({ error: "invalid_grant", error_description: "Bad code" }, false)

    const res = await handle(req("/auth/exchange", { json: valid }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.details).toBe("Bad code")
    expect(JSON.stringify(body)).not.toContain(CONFIG.clientSecret)
  })

  it("rejects GET on the exchange endpoint", async () => {
    const res = await handle(req("/auth/exchange", { method: "GET" }))
    expect(res.status).toBe(404)
  })
})

describe("POST /auth/refresh", () => {
  it("refreshes and returns only the access token", async () => {
    const spy = stubGoogle({ access_token: "fresh", refresh_token: "rotated" })

    const res = await handle(
      req("/auth/refresh", { json: { refresh_token: "rt-456" } })
    )

    expect(res.status).toBe(200)
    // Deliberately access_token only -- the extension keeps its refresh token.
    await expect(res.json()).resolves.toEqual({ access_token: "fresh" })

    const sent = sentParams(spy)
    expect(sent.get("grant_type")).toBe("refresh_token")
    expect(sent.get("refresh_token")).toBe("rt-456")
    expect(sent.get("client_secret")).toBe(CONFIG.clientSecret)
  })

  it("rejects a missing refresh_token", async () => {
    const spy = stubGoogle({})
    const res = await handle(req("/auth/refresh", { json: {} }))

    expect(res.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it("returns 502 when Google refuses the refresh token", async () => {
    stubGoogle({ error: "invalid_grant" }, false)
    const res = await handle(
      req("/auth/refresh", { json: { refresh_token: "revoked" } })
    )
    expect(res.status).toBe(502)
  })
})

describe("CORS and routing", () => {
  it("answers preflight with 204 and permissive headers", async () => {
    const res = await handle(req("/auth/exchange", { method: "OPTIONS" }))

    expect(res.status).toBe(204)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST")
  })

  it("sets CORS headers on real responses too", async () => {
    // The extension calls these from a chrome-extension:// origin.
    const res = await handle(req("/auth/config"))
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
  })

  it("serves a service banner at the root", async () => {
    const res = await handle(req("/"))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: "ok" })
  })

  it("404s an unknown path", async () => {
    const res = await handle(req("/nope"))
    expect(res.status).toBe(404)
  })
})
