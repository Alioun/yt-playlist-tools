import { createGateway } from "../../../src/page/gateway"
import { createLiveReadPort } from "../../../src/page/live-reads"
import { defineRaw, installRawPlayer } from "../../../src/page/live-read.specimens"
import { rawNavigation } from "../../../src/page/gateway.specimens"
import { servePage } from "../../../src/page/channel"
import { isBuildId, isPageType, parseJsonText } from "../../../src/shared/contracts"
import type { PageChannel } from "../../../src/shared/rpc/page-channel"
import { createDirectPageChannel, createDomPageChannel } from "../../../src/shared/rpc/page-channel"
import { createPageLink } from "../../../src/site/core/page-link"
import { Pointer } from "../../../src/site/core/pointer"
import { Scope } from "../../../src/site/core/scope"
import { WwwItems } from "../../../src/site/core/items-www"
import type { WwwItemFailure, WwwSettleObservation } from "../../../src/site/core/items-www"
import { ManualClock } from "../page-link/support"
import { hitStack, move } from "../pointer-keys/harness"

export async function flush(): Promise<void> { for (let n = 0; n < 12; n++) await Promise.resolve() }

export function manualTimers() {
  let at = 0, serial = 0
  const pending = new Map<number, { at: number; run(): void }>()
  const restoreSet = defineRaw(window, "setTimeout", (handler: TimerHandler, ms = 0, ...args: unknown[]) => {
    const id = ++serial
    pending.set(id, { at: at + ms, run() { if (typeof handler === "function") Reflect.apply(handler, window, args) } })
    return id
  })
  const restoreClear = defineRaw(window, "clearTimeout", (id: number) => { pending.delete(id) })
  return {
    advance(ms: number) {
      at += ms
      for (const [id, timer] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= at && pending.delete(id)) timer.run()
      }
    },
    get count() { return pending.size },
    restore() { restoreSet(); restoreClear(); pending.clear() }
  }
}

export async function itemsFixture(dom = false) {
  const oldUrl = window.location.href
  window.history.replaceState(null, "", "https://www.youtube.com/")
  const restoreConfig = defineRaw(window, "ytcfg", { get: (key: string) => key === "LOGGED_IN" ? false : undefined })
  let navigation: unknown = rawNavigation("other")
  const page = createLiveReadPort({ site: "www", document, window, bindings: { navigation: { read: () => navigation } } })
  const gateway = createGateway({ site: "www", page, now: () => 0 })
  const build = "items-www-synthetic"
  const pageType = "HOME"
  if (!isBuildId(build) || !isPageType(pageType)) throw Error("Invalid synthetic header")
  const inner = dom ? createDomPageChannel(document) : createDirectPageChannel()
  const held: (() => void)[] = []
  let delayed = false, navStarts = 0, navStops = 0
  const reads: { job: string; target: Element | undefined }[] = []
  const channel: PageChannel = {
    send(wire, text, target) {
      const parsed = parseJsonText(text)
      const value = parsed.ok ? parsed.value : null
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        if (wire === "req" && value.kind === "watch" && value.stream === "nav") navStarts++
        if (wire === "req" && value.kind === "unwatch") navStops++
        const job = value.job
        if (wire === "req" && value.kind === "run" && job !== null && typeof job === "object" && !Array.isArray(job) && typeof job.kind === "string") {
          reads.push({ job: job.kind, target })
        }
        if (wire === "res" && value.kind === "run" && delayed) { held.push(() => inner.send(wire, text, target)); return }
      }
      inner.send(wire, text, target)
    },
    listen: (wire, listener) => inner.listen(wire, listener)
  }
  const endpoint = servePage(gateway, { site: "www", build, vocabulary: gateway.vocabulary,
    snapshot: () => ({ signedIn: false, datasyncId: null, pageType, startedHidden: false, navType: "navigate" }),
    signals: listener => gateway.onSignal(listener) }, channel)
  const clock = new ManualClock()
  const link = createPageLink({ site: "www", build, vocabulary: gateway.vocabulary, clock }, channel)
  const hello = await link.hello
  if (!hello.ok) throw Error("Synthetic PageLink hello failed")
  const errors: unknown[] = [], failures: WwwItemFailure[] = [], observations: WwwSettleObservation[] = []
  const scopeOptions = { document, onError: (error: unknown) => { errors.push(error) } }
  const pointer = new Pointer(scopeOptions)
  const items = new WwwItems({ ...scopeOptions, pointer, page: link, report: {
    itemUnrecognised: facts => { failures.push(facts) }, pageSettled: facts => { observations.push(facts) }
  } })
  const stack = hitStack(), timers = manualTimers(), owners: Scope[] = []
  return {
    items, pointer, page, gateway, link, clock, errors, failures, observations, stack, timers, reads, owners,
    get navStarts() { return navStarts }, get navStops() { return navStops }, get heldAnswers() { return held.length },
    owner() { const scope = new Scope(scopeOptions); owners.push(scope); return scope },
    point(element: Element, rest: readonly Element[] = []) { stack.set([element, ...rest]); move(element) },
    delayAnswers(value = true) { delayed = value },
    releaseAnswers() { delayed = false; for (const deliver of held.splice(0)) deliver() },
    navigate(raw: unknown = rawNavigation("other"), path = "/") {
      navigation = raw
      window.history.replaceState(null, "", `https://www.youtube.com${path}`)
      document.dispatchEvent(new CustomEvent("yt-navigate-finish", { detail: raw, bubbles: true }))
    },
    player: () => installRawPlayer(document),
    dispose() {
      items.dispose(); pointer.dispose(); for (const scope of owners) scope.dispose()
      link.dispose(); endpoint.dispose(); gateway.dispose(); page.dispose()
      held.length = 0
      stack.restore(); timers.restore(); restoreConfig()
      window.history.replaceState(null, "", oldUrl)
      document.body.replaceChildren()
    }
  }
}
