import { createGateway } from "../../../src/page/gateway"
import { musicGateway } from "../../../src/page/gateway/music"
import { createLiveReadPort } from "../../../src/page/live-reads"
import { defineRaw, installRawPlayer } from "../../../src/page/live-read.specimens"
import { rawNavigation, rawMusicPlayer } from "../../../src/page/gateway.specimens"
import type { PageRead } from "../../../src/page/read-port"
import { servePage } from "../../../src/page/channel"
import { isBuildId, isPageType, parseJsonText } from "../../../src/shared/contracts"
import type { BreakageSignal, JsonValue } from "../../../src/shared/contracts"
import type { PageChannel } from "../../../src/shared/rpc/page-channel"
import { createDirectPageChannel, createDomPageChannel } from "../../../src/shared/rpc/page-channel"
import { createPageLink } from "../../../src/site/core/page-link"
import { Pointer } from "../../../src/site/core/pointer"
import { Scope } from "../../../src/site/core/scope"
import { MusicItems } from "../../../src/site/core/items-music"
import type { MusicItemFailure, MusicSettleObservation } from "../../../src/site/core/items-music"
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

export async function musicFixture(dom = false, overrides: Partial<Record<PageRead, unknown>> = {}) {
  const oldUrl = window.location.href
  ;(window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("https://music.youtube.com/")
  const restoreConfig = defineRaw(window, "ytcfg", { get: (key: string) => key === "LOGGED_IN" ? false : undefined })
  let navigation: unknown = rawNavigation("other")
  let queue: unknown[] = []
  const app = document.createElement("ytmusic-app")
  defineRaw(app, "queue", { getItems: () => queue })
  document.body.append(app)
  const mediaSession: { metadata: unknown } = { metadata: null }
  const restoreMedia = defineRaw(window.navigator, "mediaSession", mediaSession)
  let queueChanged = () => {}
  const native = createLiveReadPort({ site: "music", document, window, bindings: { navigation: { read: () => navigation }, queueChanges: { onChange(changed) { queueChanged = changed; return () => { queueChanged = () => {} } } } } })
  const page: ReturnType<typeof createLiveReadPort> = {
    get disposed() { return native.disposed },
    config: key => native.config(key),
    read: (what, target) => Object.hasOwn(overrides, what) ? overrides[what] : native.read(what, target),
    on: (event, changed) => native.on(event, changed),
    has: id => native.has(id), dispose: () => native.dispose()
  }
  const signals: BreakageSignal[] = []
  const gateway = createGateway({ site: musicGateway, page, now: () => 0, signals: signal => { signals.push(signal) } })
  const build = "items-music-synthetic"
  const pageType = "HOME"
  if (!isBuildId(build) || !isPageType(pageType)) throw Error("Invalid synthetic header")
  const inner = dom ? createDomPageChannel(document) : createDirectPageChannel()
  const held: (() => void)[] = []
  let delayed = false, navStarts = 0, navStops = 0
  const reads: { job: string; target: Element | undefined }[] = []
  const answers: JsonValue[] = []
  let rewriteResult: ((result: JsonValue) => JsonValue) | undefined
  const channel: PageChannel = {
    send(wire, text, target) {
      const parsed = parseJsonText(text)
      const value = parsed.ok ? parsed.value : null
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        if (wire === "res" && value.kind === "run") {
          if (rewriteResult && value.result !== undefined) text = JSON.stringify({ ...value, result: rewriteResult(value.result) })
          const delivered = parseJsonText(text)
          if (delivered.ok) answers.push(delivered.value)
        }
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
  const endpoint = servePage(gateway, { site: "music", build, vocabulary: gateway.vocabulary,
    snapshot: () => ({ signedIn: false, datasyncId: null, pageType, startedHidden: false, navType: "navigate" }),
    signals: listener => gateway.onSignal(listener) }, channel)
  const clock = new ManualClock()
  const link = createPageLink({ site: "music", build, vocabulary: gateway.vocabulary, clock }, channel)
  const hello = await link.hello
  if (!hello.ok) throw Error("Synthetic PageLink hello failed")
  const errors: unknown[] = [], failures: MusicItemFailure[] = [], observations: MusicSettleObservation[] = []
  const scopeOptions = { document, onError: (error: unknown) => { errors.push(error) } }
  const pointer = new Pointer(scopeOptions)
  const items = new MusicItems({ ...scopeOptions, pointer, page: link, report: {
    itemUnrecognised: facts => { failures.push(facts) }, pageSettled: facts => { observations.push(facts) }
  } })
  const stack = hitStack(), timers = manualTimers(), owners: Scope[] = []
  return {
    items, pointer, page, gateway, link, clock, errors, failures, observations, stack, timers, reads, owners, signals, answers, app,
    transformResult(rewrite?: (result: JsonValue) => JsonValue) { rewriteResult = rewrite },
    get navStarts() { return navStarts }, get navStops() { return navStops }, get heldAnswers() { return held.length },
    owner() { const scope = new Scope(scopeOptions); owners.push(scope); return scope },
    point(element: Element, rest: readonly Element[] = []) { stack.set([element, ...rest]); move(element) },
    delayAnswers(value = true) { delayed = value },
    releaseAnswers() { delayed = false; for (const deliver of held.splice(0)) deliver() },
    navigate(raw: unknown = rawNavigation("other"), path = "/") {
      navigation = raw
      window.history.replaceState(null, "", `https://music.youtube.com${path}`)
      document.dispatchEvent(new CustomEvent("yt-navigate-finish", { detail: raw, bubbles: true }))
    },
    setQueue(items: unknown[]) { queue = items.map(playlistPanelVideoRenderer => ({ playlistPanelVideoRenderer })); queueChanged() },
    setMetadata(metadata: unknown) { mediaSession.metadata = metadata },
    player: () => {
      const player = installRawPlayer(document, "movie_player", rawMusicPlayer())
      document.dispatchEvent(new CustomEvent("yt-player-updated", { bubbles: true, detail: { id: "movie_player" } }))
      player.root.dispatchEvent(new CustomEvent("yt-player-updated", { bubbles: true }))
      return player
    },
    dispose() {
      items.dispose(); pointer.dispose(); for (const scope of owners) scope.dispose()
      link.dispose(); endpoint.dispose(); gateway.dispose(); page.dispose()
      held.length = 0
      stack.restore(); timers.restore(); restoreConfig(); restoreMedia()
      ;(window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(oldUrl)
      document.body.replaceChildren()
    }
  }
}
