import { isJsonValue } from "../../shared/contracts"
import type { JsonObject, Site } from "../../shared/contracts"
import { field } from "../read-parsers"
import type { AttemptContext, Dispatch, HttpAnswer, RequestSpec } from "./port"

export type CookieName = "SAPISID" | "__Secure-1PAPISID" | "__Secure-3PAPISID"
export type NativeRequest = {
  method: "POST"; credentials: "same-origin"; headers: Record<string, string>; body: string; signal: AbortSignal
}
export interface WwwRequestBoundary {
  readonly site: Site
  origin(): string
  config(key: string): unknown
  cookie(name: CookieName): string | null
  now(): number
  sha1(bytes: Uint8Array): Promise<ArrayBuffer>
  fetch(url: string, init: NativeRequest): Promise<HttpAnswer>
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined
}
function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}
function cloneObject(value: unknown): JsonObject | undefined {
  if (!object(value)) return undefined
  const copy: unknown = JSON.parse(JSON.stringify(value))
  return object(copy) ? copy : undefined
}
function contextAndHeaders(port: WwwRequestBoundary, signed: boolean): { context: JsonObject; headers: Record<string, string>; session?: string } | undefined {
  const context = cloneObject(port.config("INNERTUBE_CONTEXT"))
  if (!context || !object(context.client)) return undefined
  const clientName = stringValue(port.config("INNERTUBE_CONTEXT_CLIENT_NAME"))
  const clientVersion = stringValue(port.config("INNERTUBE_CONTEXT_CLIENT_VERSION"))
  const visitor = stringValue(port.config("VISITOR_DATA")), loggedIn = port.config("LOGGED_IN")
  const authUser = stringValue(port.config("SESSION_INDEX"))
  if (!clientName || !clientVersion || !visitor || typeof loggedIn !== "boolean" || signed && !authUser) return undefined
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "X-Goog-Visitor-Id": visitor,
    "X-Youtube-Bootstrap-Logged-In": String(loggedIn), "X-Youtube-Client-Name": clientName,
    "X-Youtube-Client-Version": clientVersion, "X-Origin": port.origin(), ...(authUser ? { "X-Goog-AuthUser": authUser } : {})
  }
  const delegated = stringValue(port.config("DELEGATED_SESSION_ID"))
  const user = object(context.user) ? context.user : {}
  if (delegated) {
    if (field(port.config("EXPERIMENT_FLAGS"), "pageid_as_header_web") === true) {
      headers["X-Goog-PageId"] = delegated
      delete user.onBehalfOfUser
    } else user.onBehalfOfUser = delegated
  }
  context.user = user
  const request = object(context.request) ? context.request : {}
  if (request.internalExperimentFlags === undefined) request.internalExperimentFlags = []
  context.request = request
  const session = signed ? stringValue(port.config("USER_SESSION_ID")) : undefined
  return { context, headers, ...(session ? { session } : {}) }
}

export async function dispatchWwwRequest(options: {
  port: WwwRequestBoundary; spec: RequestSpec; signed: boolean; context: AttemptContext
}): Promise<Dispatch> {
  const { port, spec, signed, context } = options
  if (port.site !== "www") return { kind: "not-sent", cause: "missing" }
  let controller: AbortController | undefined
  try {
    if (port.origin() !== "https://www.youtube.com") return { kind: "not-sent", cause: "preflight" }
    const blocked = context.check()
    if (blocked) return { kind: "blocked", failure: blocked }
    const built = contextAndHeaders(port, signed)
    if (!built) return { kind: "not-sent", cause: "preflight" }
    if (signed) {
      const timestamp = Math.floor(port.now() / 1000)
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) return { kind: "not-sent", cause: "preflight" }
      const third = port.cookie("__Secure-3PAPISID")
      const cookies = [
        { scheme: "SAPISIDHASH", value: port.cookie("SAPISID") || third },
        { scheme: "SAPISID1PHASH", value: port.cookie("__Secure-1PAPISID") },
        { scheme: "SAPISID3PHASH", value: third }
      ]
      const parts: string[] = []
      for (const cookie of cookies) {
        if (!cookie.value) continue
        const input = `${built.session ? `${built.session} ` : ""}${timestamp} ${cookie.value} ${port.origin()}`
        const digest = await port.sha1(new TextEncoder().encode(input))
        const afterHash = context.check()
        if (afterHash) return { kind: "blocked", failure: afterHash }
        const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
        if (hex.length !== 40) return { kind: "not-sent", cause: "preflight" }
        parts.push(`${cookie.scheme} ${timestamp}_${hex}${built.session ? "_u" : ""}`)
      }
      if (!parts.length) return { kind: "not-sent", cause: "preflight" }
      built.headers.Authorization = parts.join(" ")
    }
    const body = JSON.stringify({ ...spec.body, context: built.context })
    const beforeSend = context.check()
    if (beforeSend) return { kind: "blocked", failure: beforeSend }
    if (port.origin() !== "https://www.youtube.com") return { kind: "not-sent", cause: "preflight" }
    controller = new AbortController()
    const signal = controller.signal
    // A native fetch invocation may send before it throws. Its failure cannot authorize a write fallback.
    const answer = Promise.resolve().then(() => {
      const failure = context.check()
      if (failure) throw new Error("Request admission closed")
      return port.fetch(`https://www.youtube.com/youtubei/v1/${spec.path}?prettyPrint=false`, {
        method: "POST", credentials: "same-origin", headers: built.headers, body, signal
      })
    }).catch(() => { throw new Error("Request answer lost") })
    return { kind: "pending", answer, cancel: () => controller?.abort() }
  } catch {
    controller?.abort()
    return { kind: "not-sent", cause: "preflight" }
  }
}
