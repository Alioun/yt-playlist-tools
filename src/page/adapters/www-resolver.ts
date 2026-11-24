import type { AttemptContext, Dispatch, HttpAnswer } from "../gateway/port"
import { field } from "../read-parsers"

export type Resolver = { instance: object; method: Function }
type Found = { resolver: Resolver; ambiguous: boolean }
// A scan reads a few thousand property names, so a resolver that isn't there is looked for at most this often.
const rescanAfterMs = 250
function resolverAt(raw: unknown): Resolver | undefined {
  if (raw === null || (typeof raw !== "object" && typeof raw !== "function")) return undefined
  const instance: unknown = Reflect.get(raw, "instance"),
    method = field(instance, "resolveCommand")
  return instance !== null && typeof instance === "object" && typeof method === "function" ? { instance, method } : undefined
}
/** YouTube names its module root after the build it ships. Most sessions have `default_kevlar_base` and some have `default_base_module_set`. */
function resolversIn(win: Window): Resolver[] {
  const matches: Resolver[] = []
  for (const name of Object.getOwnPropertyNames(win)) {
    if (!name.startsWith("default_")) continue
    const root: unknown = Object.getOwnPropertyDescriptor(win, name)?.value
    if (root === null || typeof root !== "object") continue
    for (const key of Object.getOwnPropertyNames(root)) {
      const found = resolverAt(Object.getOwnPropertyDescriptor(root, key)?.value)
      if (found) matches.push(found)
    }
  }
  return matches
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
  let found: Found | undefined
  let scannedAt = -Infinity
  function discover(notice?: AttemptContext["notice"]): Resolver | undefined {
    if (found && field(found.resolver.instance, "resolveCommand") === found.resolver.method) {
      if (found.ambiguous && notice) {
        notice("resolver-ambiguous")
        found.ambiguous = false
      }
      return found.resolver
    }
    // YouTube makes its modules after the page half starts, and can replace them, so a miss is only remembered briefly.
    const at = win.performance.now()
    if (at - scannedAt < rescanAfterMs) return undefined
    scannedAt = at
    const matches = resolversIn(win)
    const resolver = matches[0]
    const ambiguous = matches.length > 1
    if (ambiguous) notice?.("resolver-ambiguous")
    found = resolver ? { resolver, ambiguous: ambiguous && !notice } : undefined
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
    // YouTube passes the command back first and its answer last.
    const commandController = { onSuccess: (...args: unknown[]) => finish(args.at(-1), false), onServerError: (...args: unknown[]) => finish(args.at(-1), true) }
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
