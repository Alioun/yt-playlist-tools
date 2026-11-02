import { test } from "bun:test"
import type { JobFailure, Site } from "../../../src/shared/contracts"
import { createGateway } from "../../../src/page/gateway"
import { dispatchWwwRequest } from "../../../src/page/gateway/www-request"
import type { CookieName, NativeRequest, WwwRequestBoundary } from "../../../src/page/gateway/www-request"
import type { AttemptContext } from "../../../src/page/gateway/port"
import { requestFor } from "../../../src/page/gateway/requests"
import { scriptedPage } from "../../../src/page/gateway.specimens"
import { added, check, Clock, deferred, drain, identity, playlist, same, video } from "./specimens"

function dummy(site: Site = "www") {
  const page = scriptedPage(), clock = new Clock()
  const privateValue = ["fixture", "private", "value"].join("-")
  const session = ["fixture", "session"].join("-")
  const delegation = ["fixture", "delegated"].join("-")
  Object.assign(page.config, {
    INNERTUBE_CONTEXT: { client: { hl: "en", gl: "DE", clientName: "WEB", clientVersion: "2.20261029", configInfo: { appInstallData: "fixture-config" }, userAgent: "fixture-agent" },
      request: { internalExperimentFlags: [] }, user: { lockedSafetyMode: false } },
    INNERTUBE_CONTEXT_CLIENT_NAME: 1, INNERTUBE_CONTEXT_CLIENT_VERSION: "2.20261029", VISITOR_DATA: "fixture-visitor",
    SESSION_INDEX: 0, USER_SESSION_ID: session, DELEGATED_SESSION_ID: delegation, EXPERIMENT_FLAGS: { pageid_as_header_web: true }
  })
  const cookies: Record<CookieName, string | null> = {
    SAPISID: `${privateValue}-a`, "__Secure-1PAPISID": `${privateValue}-b`, "__Secure-3PAPISID": `${privateValue}-c`
  }
  const reads: CookieName[] = [], hashes: string[] = [], sent: { url: string; init: NativeRequest }[] = []
  let admission: JobFailure | null = null
  const notices: unknown[] = []
  const context: AttemptContext = { check: () => admission, notice: kind => notices.push(kind), observe() {} }
  const port: WwwRequestBoundary = {
    site, origin: () => "https://www.youtube.com", config: key => page.port.config(key), now: () => 1_700_000_000_000,
    cookie(name) { reads.push(name); return cookies[name] },
    async sha1(bytes) { hashes.push(new TextDecoder().decode(bytes)); return new Uint8Array(20).fill(hashes.length).buffer },
    async fetch(url, init) { sent.push({ url, init }); return { http: 200, body: added() } }
  }
  const spec = requestFor({ kind: "add", playlistId: playlist, videoId: video }, false)
  check(spec, "Missing dummy request spec")
  return { page, clock, privateValue, session, delegation, cookies, reads, hashes, sent, notices, context, port, spec,
    block(value: JobFailure | null) { admission = value } }
}
function safeOutput(raw: unknown, fixture: ReturnType<typeof dummy>): void {
  const output = JSON.stringify({ result: raw, argv: process.argv })
  for (const secret of [fixture.privateValue, fixture.session, fixture.delegation,
    String(fixture.page.config.DATASYNC_ID), ...fixture.hashes, ...fixture.sent.map(item => item.init.headers.Authorization).filter(value => value !== undefined)]) {
    check(!output.includes(secret), "Dummy secret material reached output")
  }
  check(!output.includes("Authorization"), "Authorization reached output")
}

test("dummy www signer builds exact headers body hash inputs and same-origin URL", async () => {
  const p = dummy(), dispatch = await dispatchWwwRequest({ port: p.port, spec: p.spec, signed: true, context: p.context })
  check(dispatch.kind === "pending", "Dummy signed request was not dispatched")
  await dispatch.answer
  const sent = p.sent[0]
  check(sent, "Dummy request was not observed")
  same(sent.url, "https://www.youtube.com/youtubei/v1/browse/edit_playlist?prettyPrint=false", "Signed URL changed")
  same(p.hashes, [p.cookies.SAPISID, p.cookies["__Secure-1PAPISID"], p.cookies["__Secure-3PAPISID"]].map(cookie => `${p.session} 1700000000 ${cookie} https://www.youtube.com`), "Cookie hash construction changed")
  const auth = ["SAPISIDHASH", "SAPISID1PHASH", "SAPISID3PHASH"].map((scheme, index) => `${scheme} 1700000000_${String(index + 1).padStart(2, "0").repeat(20)}_u`).join(" ")
  same(sent.init.headers, {
    "Content-Type": "application/json", "X-Goog-Visitor-Id": "fixture-visitor", "X-Youtube-Bootstrap-Logged-In": "true",
    "X-Youtube-Client-Name": "1", "X-Youtube-Client-Version": "2.20261029", "X-Origin": "https://www.youtube.com",
    "X-Goog-AuthUser": "0", "X-Goog-PageId": p.delegation, Authorization: auth
  }, "Exact signed headers changed")
  same(JSON.parse(sent.init.body), { ...p.spec.body, context: {
    client: { hl: "en", gl: "DE", clientName: "WEB", clientVersion: "2.20261029", configInfo: { appInstallData: "fixture-config" }, userAgent: "fixture-agent" },
    request: { internalExperimentFlags: [] }, user: { lockedSafetyMode: false }
  } }, "Exact context or request body changed")
  check(sent.init.credentials === "same-origin" && sent.init.method === "POST", "Native request credentials changed")
  safeOutput({ kind: dispatch.kind, notices: p.notices }, p)
  dispatch.cancel()
})

test("dummy signer supports cookie fallback and absent user-session suffix", async () => {
  const p = dummy()
  p.cookies.SAPISID = null; p.cookies["__Secure-1PAPISID"] = null
  delete p.page.config.USER_SESSION_ID
  p.page.config.EXPERIMENT_FLAGS = { pageid_as_header_web: false }
  const dispatch = await dispatchWwwRequest({ port: p.port, spec: p.spec, signed: true, context: p.context })
  check(dispatch.kind === "pending", "Fallback cookie request was not dispatched"); await dispatch.answer
  check(p.hashes.length === 2 && p.hashes.every(hash => hash === `1700000000 ${p.cookies["__Secure-3PAPISID"]} https://www.youtube.com`), "Fallback cookie or no-session hash changed")
  const sent = p.sent[0]; check(sent, "Missing fallback request")
  check(!String(sent.init.headers.Authorization).includes("_u") && !Object.hasOwn(sent.init.headers, "X-Goog-PageId"), "Absent session suffix or delegation header changed")
  same(JSON.parse(sent.init.body).context.user, { lockedSafetyMode: false, onBehalfOfUser: p.delegation }, "Delegation body changed")
  safeOutput({ kind: dispatch.kind, notices: p.notices }, p); dispatch.cancel()
})

test("plain requests read no cookies or signing session and carry no authorization", async () => {
  const p = dummy()
  delete p.page.config.SESSION_INDEX
  const config = p.port.config
  p.port.config = key => { check(key !== "USER_SESSION_ID", "Plain request read a signing session"); return config(key) }
  const dispatch = await dispatchWwwRequest({ port: p.port, spec: p.spec, signed: false, context: p.context })
  check(dispatch.kind === "pending", "Plain request was unavailable"); await dispatch.answer
  check(p.reads.length === 0 && p.hashes.length === 0 && !Object.hasOwn(p.sent[0]?.init.headers ?? {}, "Authorization"), "Plain request accessed signing material")
  dispatch.cancel()
})

test("Music can never enter the www signer even with a misleading origin", async () => {
  const p = dummy("music")
  const dispatch = await dispatchWwwRequest({ port: p.port, spec: p.spec, signed: true, context: p.context })
  check(dispatch.kind === "not-sent" && p.reads.length === 0 && p.hashes.length === 0 && p.sent.length === 0, "Cross-site signing occurred")
  safeOutput(dispatch, p)
})

test("wrong-account write after signing is prevented by a fresh configuration check", async () => {
  const p = dummy(), waiting = deferred<ArrayBuffer>()
  p.port.sha1 = async () => waiting.promise
  const gateway = createGateway({ site: "www", page: p.page.port, clock: p.clock, requests: {
    has: via => via === "signed",
    send: (_via, spec, context) => dispatchWwwRequest({ port: p.port, spec, signed: true, context })
  } })
  const result = gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  await drain(); p.page.config.DATASYNC_ID = ["fixture", "changed", "identity"].join("-")
  waiting.resolve(new Uint8Array(20).buffer); await drain()
  const answer = await result
  check(!answer.ok && answer.reason === "accountChanged" && p.sent.length === 0, "Wrong-account write was sent after signing")
  safeOutput(answer, p)
  gateway.dispose(); check(p.clock.count === 0, "Signing guard leaked deadlines")
})

test("expiry during hashing prevents a late request", async () => {
  const p = dummy(), waiting = deferred<ArrayBuffer>()
  p.port.sha1 = async () => waiting.promise
  const gateway = createGateway({ site: "www", page: p.page.port, clock: p.clock, requests: {
    has: via => via === "signed", send: (_via, spec, context) => dispatchWwwRequest({ port: p.port, spec, signed: true, context })
  } })
  const pending = gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  await drain(); p.clock.advance(10_001)
  check(!(await pending).ok, "Expired hashing job succeeded")
  waiting.resolve(new Uint8Array(20).buffer); await drain()
  check(p.sent.length === 0, "Late hash sent an expired request")
  gateway.dispose()
})

test("all dummy signer failure paths keep secret values out of results and diagnostics", async () => {
  for (const mode of ["config", "cookie", "hash", "missing-cookie", "origin", "context", "fetch", "http", "application", "shape"] as const) {
    const p = dummy(), signals: unknown[] = []
    if (mode === "config") p.port.config = () => { throw new Error(p.privateValue) }
    if (mode === "cookie") p.port.cookie = () => { throw new Error(p.privateValue) }
    if (mode === "hash") p.port.sha1 = async () => { throw new Error(p.privateValue) }
    if (mode === "missing-cookie") for (const name of p.reads.concat(["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"])) p.cookies[name] = null
    if (mode === "origin") p.port.origin = () => "https://example.invalid"
    if (mode === "context") p.page.config.INNERTUBE_CONTEXT = p.privateValue
    if (mode === "fetch") p.port.fetch = () => { throw new Error(p.privateValue) }
    if (mode === "http" || mode === "application" || mode === "shape") p.port.fetch = async () => ({
      http: mode === "http" ? 403 : 200,
      body: { ...identity(), ...(mode === "shape" ? {} : { status: "STATUS_FAILED" }), debug: p.privateValue, headers: { Authorization: p.privateValue } }
    })
    const gateway = createGateway({ site: "www", page: p.page.port, clock: p.clock, signals: signal => signals.push(signal), requests: {
      has: via => via === "signed", send: (_via, spec, context) => dispatchWwwRequest({ port: p.port, spec, signed: true, context })
    } })
    const answer = await gateway.run({ kind: "add", playlistId: playlist, videoId: video })
    check(!answer.ok, "Dummy failure became success")
    const expected: JobFailure = mode === "http" || mode === "application" ? {
      ok: false, reason: "failed", http: mode === "http" ? 403 : 200, status: "STATUS_FAILED"
    } : { ok: false, reason: mode === "fetch" || mode === "shape" ? "unconfirmed" : "unavailable" }
    same(answer, expected, "Dummy failure code changed")
    safeOutput({ answer, signals }, p)
    gateway.dispose(); check(p.clock.count === 0, "Dummy failure leaked deadlines")
  }
})

test("every awaited cookie hash is followed by account admission before another write", async () => {
  for (const changedAt of [1, 2, 3]) {
    const p = dummy()
    const digest = p.port.sha1
    let count = 0
    p.port.sha1 = async bytes => {
      const result = await digest(bytes)
      if (++count === changedAt) p.page.config.DATASYNC_ID = ["fixture", "changed", String(changedAt)].join("-")
      return result
    }
    const gateway = createGateway({ site: "www", page: p.page.port, clock: p.clock, requests: {
      has: via => via === "signed", send: (_via, spec, context) => dispatchWwwRequest({ port: p.port, spec, signed: true, context })
    } })
    const result = await gateway.run({ kind: "add", playlistId: playlist, videoId: video })
    check(!result.ok && result.reason === "accountChanged" && p.sent.length === 0 && count === changedAt, "A hash await skipped account admission")
    safeOutput(result, p); gateway.dispose()
  }
})
