import type { AttemptContext, Dispatch, GatewayRequestPort, HttpAnswer, RequestSpec } from "../gateway/port"
import { dispatchWwwRequest } from "../gateway/www-request"
import { field } from "../read-parsers"
import type { PageReadPort } from "../read-port"
import { createWwwResolver } from "./www-resolver"
import type { WwwResolver } from "./www-resolver"

function httpCode(raw: unknown, fallback: number): number {
  const code = field(raw, "error", "code") ?? field(raw, "code")
  return typeof code === "number" && Number.isInteger(code) && code >= 100 && code <= 599 ? code : fallback
}

export function createLiveWwwRequests(options: { window: Window; document: Document; page: PageReadPort; resolver?: WwwResolver }): GatewayRequestPort {
  const { window: win, document: doc, page } = options
  const resolver = options.resolver ?? createWwwResolver(win)
  function service(spec: RequestSpec, context: AttemptContext): Dispatch {
    const app = doc.querySelector("ytd-app")
    if (!app) return { kind: "not-sent", cause: "missing" }
    let node: HTMLElement
    try { node = doc.createElement("span"); node.hidden = true; app.append(node) }
    catch { return { kind: "not-sent", cause: "preflight" } }
    const failure = context.check()
    if (failure) { node.remove(); return { kind: "blocked", failure } }
    let active = true
    let resolveAnswer: (answer: HttpAnswer) => void = () => {}
    let rejectAnswer: () => void = () => {}
    const answer = new Promise<HttpAnswer>((resolve, reject) => { resolveAnswer = resolve; rejectAnswer = () => reject(new Error("Service answer lost")) })
    const cleanup = () => { node.removeEventListener("yt-service-request-completed", completed); node.remove() }
    const completed: EventListener = event => {
      if (!active || event.target !== node) return
      active = false
      const detail = "detail" in event ? event.detail : undefined
      const body = field(detail, "response") ?? field(detail, "data") ?? detail
      cleanup()
      resolveAnswer({ http: httpCode(body, 200), body })
    }
    node.addEventListener("yt-service-request-completed", completed)
    try {
      node.dispatchEvent(new CustomEvent("yt-action", { bubbles: true, composed: true, detail: {
        actionName: "yt-service-request", args: [spec.endpoint], returnValue: []
      } }))
    } catch { active = false; cleanup(); rejectAnswer() }
    return { kind: "pending", answer, cancel() { active = false; cleanup() } }
  }
  return {
    has(via) {
      if (win.location.origin !== "https://www.youtube.com") return false
      if (via === "command") return resolver.find() !== undefined
      if (via === "service") return doc.querySelector("ytd-app") !== null
      return (via === "signed" || via === "plain") && typeof win.fetch === "function"
    },
    send(via, spec, context) {
      if (win.location.origin !== "https://www.youtube.com") return { kind: "not-sent", cause: "missing" }
      if (via === "command") return resolver.command(spec.endpoint, context)
      if (via === "service") return service(spec, context)
      if (via !== "signed" && via !== "plain") return { kind: "not-sent", cause: "missing" }
      return dispatchWwwRequest({ signed: via === "signed", spec, context, port: {
        site: "www", origin: () => win.location.origin, config: key => page.config(key), now: () => Date.now(),
        cookie(name) {
          for (const piece of doc.cookie.split(";")) {
            const index = piece.indexOf("=")
            if (index >= 0 && piece.slice(0, index).trim() === name) return piece.slice(index + 1).trim()
          }
          return null
        },
        sha1: bytes => win.crypto.subtle.digest("SHA-1", new Uint8Array(bytes).buffer),
        async fetch(url, init) {
          const response = await win.fetch(url, init)
          let body: unknown = null
          try { body = await response.json() } catch {}
          return { http: response.status, body }
        }
      } })
    }
  }
}
