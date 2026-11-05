import type { AttemptContext, Dispatch, HttpAnswer } from "../gateway/port"
import { field } from "../read-parsers"

export type Resolver = { instance: object; method: Function }
type ResolverCache = { kind: "new" } | { kind: "gone" } | { kind: "ready"; resolver: Resolver; rescanned: boolean; ambiguous: boolean }
function resolverAt(raw: unknown): Resolver | undefined {
  const instance = field(raw, "instance"),
    method = field(instance, "resolveCommand")
  return instance !== null && typeof instance === "object" && typeof method === "function" ? { instance, method } : undefined
}
function httpCode(raw: unknown, fallback: number): number {
  const code = field(raw, "error", "code") ?? field(raw, "code")
  return typeof code === "number" && Number.isInteger(code) && code >= 100 && code <= 599 ? code : fallback
}
export interface WwwResolver {
  find(notice?: AttemptContext["notice"]): Resolver | undefined
  command(endpoint: Record<string, unknown>, context: AttemptContext): Dispatch
}

export function createWwwResolver(win: Window): WwwResolver {
  let cache: ResolverCache = { kind: "new" }
  function discover(notice?: AttemptContext["notice"]): Resolver | undefined {
    if (cache.kind === "gone") return undefined
    if (cache.kind === "ready" && field(cache.resolver.instance, "resolveCommand") === cache.resolver.method) {
      if (cache.ambiguous && notice) {
        notice("resolver-ambiguous")
        cache.ambiguous = false
      }
      return cache.resolver
    }
    const rescanned = cache.kind === "ready"
    if (cache.kind === "ready" && cache.rescanned) {
      cache = { kind: "gone" }
      return undefined
    }
    const root = field(win, "default_kevlar_base")
    if (root === null || typeof root !== "object") {
      cache = { kind: "gone" }
      return undefined
    }
    const matches: Resolver[] = []
    for (const key of Object.getOwnPropertyNames(root)) {
      const value: unknown = Object.getOwnPropertyDescriptor(root, key)?.value
      const found = resolverAt(value)
      if (found) matches.push(found)
    }
    const resolver = matches[0]
    if (!resolver) {
      cache = { kind: "gone" }
      return undefined
    }
    const ambiguous = matches.length > 1
    if (ambiguous) notice?.("resolver-ambiguous")
    cache = { kind: "ready", resolver, rescanned, ambiguous: ambiguous && !notice }
    return resolver
  }
  function command(endpoint: Record<string, unknown>, context: AttemptContext): Dispatch {
    let resolver: Resolver | undefined
    try {
      resolver = discover(context.notice)
    } catch {
      return { kind: "not-sent", cause: "preflight" }
    }
    if (!resolver) return { kind: "not-sent", cause: "missing" }
    const failure = context.check()
    if (failure) return { kind: "blocked", failure }
    let active = true
    let resolveAnswer: (answer: HttpAnswer) => void = () => {}
    let rejectAnswer: () => void = () => {}
    const answer = new Promise<HttpAnswer>((resolve, reject) => {
      resolveAnswer = resolve
      rejectAnswer = () => reject(new Error("Command answer lost"))
    })
    const finish = (body: unknown, failed: boolean) => {
      context.observe(body)
      if (!active) return
      active = false
      resolveAnswer({ http: httpCode(body, failed ? 500 : 200), body })
    }
    const commandController = { onSuccess: (body: unknown) => finish(body, false), onServerError: (body: unknown) => finish(body, true) }
    try {
      const returned: unknown = Reflect.apply(resolver.method, resolver.instance, [endpoint, { commandController }])
      if (returned !== null && (typeof returned === "object" || typeof returned === "function") && typeof field(returned, "then") === "function") {
        void Promise.resolve(returned).catch(error => {
          context.observe(error)
          if (active) {
            active = false
            rejectAnswer()
          }
        })
      }
    } catch {
      if (active) {
        active = false
        rejectAnswer()
      }
    }
    return {
      kind: "pending",
      answer,
      cancel() {
        active = false
      }
    }
  }
  return { find: discover, command }
}
