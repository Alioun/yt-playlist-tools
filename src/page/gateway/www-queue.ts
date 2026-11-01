import type { BreakageKind, JobFailure, JobOf, QueueListId, SetVideoId } from "../../shared/contracts"
import type { PageJobResult } from "../../shared/contracts/page"
import type { VideoId } from "../../shared/model/validation"
import { hasQueueList, isMenuPopup, isQueueToast, parseMiniplayer, parseQueueAnswer, parseQueueCard, parseQueuePanel } from "../parsers/www-queue"
import type { QueueAnswer, QueuePanel } from "../parsers/www-queue"
import { parseTargetVideo } from "../read-parsers"
import type { GatewayClock, JobScope } from "./lanes"
import type { AttemptContext, Dispatch, HttpAnswer, PageUiRoute, RequestRoute } from "./port"
import { queueAddEdit, queueList, queueRefresh, queueRemoveEdit } from "./requests"
import type { QueueCommand } from "./requests"

export interface WwwQueuePort {
  has(): boolean
  resolve(endpoint: Record<string, unknown>, context: AttemptContext): Dispatch | Promise<Dispatch>
  panel(): unknown
  miniplayer(): unknown
  connected(target: Element): boolean
  onAction(seen: (detail: unknown) => void): () => void
  openMenu(target: Element): unknown
}
export type QueueRoutes = { add: RequestRoute; undo: RequestRoute; list: RequestRoute; menu: PageUiRoute }
type Outcome = { kind: "answer"; answer: HttpAnswer; parsed: QueueAnswer } | { kind: "lost" } | { kind: "timeout" }
type Dispatched =
  | { kind: "not-sent"; cause: "missing" | "preflight" }
  | { kind: "blocked"; failure: JobFailure }
  | { kind: "sent"; outcome(): Outcome | undefined; settled: Promise<Outcome>; stop(): void }

export const confirmWindow = 2_000
export const menuWindow = 1_000
const confirmChecks = [0, 150, 400, 800, 1_300, 2_000]
const listChecks = [0, 250, 750, 1_500, 3_000, 5_000, 7_500]
const removalAnswer = 1_500
const laneMargin = 100
const unavailable: JobFailure = { ok: false, reason: "unavailable" }

export function createWwwQueue(options: {
  port: WwwQueuePort; clock: GatewayClock; routes: QueueRoutes; card(target: Element): unknown
  check(): JobFailure | null; notice(kind: BreakageKind, route: RequestRoute | PageUiRoute, raw?: unknown): void
}) {
  const { port, clock, routes, notice } = options
  const menus = new Set<() => void>()
  let disposed = false

  function panel(route: RequestRoute): QueuePanel | undefined {
    let raw: unknown
    try { raw = port.panel() } catch { notice("threw", route); return undefined }
    const value = parseQueuePanel(raw)
    if (!value && hasQueueList(raw)) notice("unrecognised", route, raw)
    return value
  }
  function miniplayer(): boolean | undefined {
    try { return parseMiniplayer(port.miniplayer()) } catch { return undefined }
  }
  function listen(scope: JobScope, route: RequestRoute | PageUiRoute, seen: (detail: unknown) => void): () => void {
    let stop = () => {}
    try { stop = port.onAction(seen) } catch { notice("threw", route) }
    const release = () => { const current = stop; stop = () => {}; try { current() } catch {} }
    const unregister = scope.onClose(release)
    return () => { unregister(); release() }
  }
  function send(command: QueueCommand, scope: JobScope, route: RequestRoute): Promise<Dispatched> {
    return new Promise(resolveDispatch => {
      let active = true
      let dispatched = false
      let outcome: Outcome | undefined
      let cancel = () => {}
      let stopTimer = () => {}
      let stopScope = () => {}
      let settle: (value: Outcome) => void = () => {}
      const settled = new Promise<Outcome>(resolve => { settle = resolve })
      const sent = (): Dispatched => ({ kind: "sent", outcome: () => outcome, settled, stop: () => finish({ kind: "timeout" }) })
      const finish = (value: Outcome | Exclude<Dispatched, { kind: "sent" }>) => {
        if (!active) return
        active = false
        stopTimer(); stopScope()
        try { cancel() } catch {}
        if (value.kind === "not-sent" || value.kind === "blocked") { resolveDispatch(value); return }
        outcome = value
        settle(value)
        if (!dispatched) { dispatched = true; resolveDispatch(sent()) }
      }
      const context: AttemptContext = {
        check: () => options.check() ?? (!active || !scope.active || disposed ? { ok: false, reason: "unconfirmed" } : null),
        notice: kind => { if (active && scope.active) notice(kind, route) },
        observe() {}
      }
      stopScope = scope.onClose(() => finish({ kind: "timeout" }))
      if (!active) return
      stopTimer = clock.after(scope.remaining(), () => finish({ kind: "timeout" }))
      const blocked = context.check()
      if (blocked) { finish({ kind: "blocked", failure: blocked }); return }
      try {
        Promise.resolve(port.resolve(command.endpoint, context)).then(dispatch => {
          if (dispatch.kind !== "pending") { finish(dispatch); return }
          cancel = dispatch.cancel
          if (!active) { try { cancel() } catch {}; return }
          dispatched = true
          resolveDispatch(sent())
          void dispatch.answer.then(answer => finish({ kind: "answer", answer, parsed: parseQueueAnswer(answer.body) }), () => finish({ kind: "lost" }))
        }, () => finish({ kind: "lost" }))
      } catch { finish({ kind: "lost" }) }
    })
  }
  function observe(scope: JobScope, checks: readonly number[], limit: number, look: () => boolean): Promise<boolean> {
    return new Promise(resolve => {
      const start = clock.now()
      let active = true
      let stopTimer = () => {}
      let stopScope = () => {}
      const end = Math.max(0, Math.min(limit, scope.remaining() - laneMargin))
      const offsets = checks.filter(offset => offset < end).concat(end)
      const finish = (found: boolean) => {
        if (!active) return
        active = false
        stopTimer(); stopScope()
        resolve(found)
      }
      stopScope = scope.onClose(() => finish(false))
      if (!active) return
      let index = 0
      const step = () => {
        if (!active) return
        if (!scope.active || disposed) { finish(false); return }
        let found = false
        try { found = look() } catch { found = false }
        if (found) { finish(true); return }
        index++
        const next = offsets[index]
        if (next === undefined) { finish(false); return }
        stopTimer = clock.after(Math.max(0, next - (clock.now() - start)), step)
      }
      step()
    })
  }
  function rejected(outcome: Outcome | undefined): JobFailure | undefined {
    if (outcome?.kind !== "answer") return undefined
    const { http } = outcome.answer, { status } = outcome.parsed
    if (http >= 400 || status === "STATUS_FAILED") {
      return { ok: false, reason: "failed", ...(http >= 400 && http <= 599 ? { http } : {}), ...(status ? { status } : {}) }
    }
    return undefined
  }
  function notSent(sent: Dispatched, route: RequestRoute): JobFailure | undefined {
    if (sent.kind === "blocked") return sent.failure
    if (sent.kind === "not-sent") { notice(sent.cause === "missing" ? "missing" : "threw", route); return unavailable }
    return undefined
  }
  function uncertain(outcome: Outcome | undefined, route: RequestRoute): void {
    if (outcome?.kind === "lost") notice("threw", route)
    else if (outcome === undefined || outcome.kind === "timeout") notice("timeout", route)
  }
  function within(settled: Promise<Outcome>, scope: JobScope, ms: number): Promise<void> {
    return new Promise(resolve => {
      let active = true
      let stopTimer = () => {}
      let stopScope = () => {}
      const done = () => { if (!active) return; active = false; stopTimer(); stopScope(); resolve() }
      stopScope = scope.onClose(done)
      if (!active) return
      stopTimer = clock.after(Math.max(0, Math.min(ms, scope.remaining() - laneMargin)), done)
      void settled.then(done, done)
    })
  }

  async function add(target: Element | undefined, scope: JobScope): Promise<PageJobResult<JobOf<"queueAdd">>> {
    const route = routes.add
    if (!target || !connected(target)) return unavailable
    let raw: unknown
    try { raw = options.card(target) } catch { notice("threw", route); return unavailable }
    const card = parseQueueCard(raw)
    if (!card) { if (raw !== undefined) notice("unrecognised", route, raw); return unavailable }
    const before = panel(route)
    const known = new Set(before?.entries.map(entry => entry.setVideoId))
    const miniplayerBefore = before ? undefined : miniplayer()
    let noisy = false
    const stopActions = listen(scope, route, detail => { if (isQueueToast(detail)) noisy = true })
    const sent = await send(before ? queueAddEdit(before.listId, card.videoId) : { endpoint: card.command }, scope, route)
    try {
      const blocked = notSent(sent, route)
      if (blocked || sent.kind !== "sent") return blocked ?? unavailable
      let failure: JobFailure | undefined
      let undo: { listId: QueueListId; setVideoId: SetVideoId } | undefined
      let confirmed = false
      await observe(scope, confirmChecks, confirmWindow, () => {
        const outcome = sent.outcome()
        failure = rejected(outcome)
        if (failure) return true
        if (outcome?.kind === "answer" && outcome.parsed.noisy) noisy = true
        const after = panel(route)
        if (!after) {
          confirmed = !before && miniplayerBefore === false && miniplayer() === true
          return confirmed
        }
        if (before && after.listId !== before.listId) return false
        const fresh = after.entries.filter(entry => entry.videoId === card.videoId && !known.has(entry.setVideoId))
        const returned = outcome?.kind === "answer" ? outcome.parsed.setVideoId : undefined
        const entry = returned === undefined ? fresh.length === 1 ? fresh[0] : undefined : fresh.find(item => item.setVideoId === returned)
        if (fresh.length === 0 || returned !== undefined && !entry) return false
        confirmed = true
        undo = entry ? { listId: after.listId, setVideoId: entry.setVideoId } : undefined
        return true
      })
      const outcome = sent.outcome()
      if (outcome?.kind === "answer" && outcome.parsed.noisy) noisy = true
      if (failure) { notice("rejected", route); return failure }
      if (!scope.active || disposed) return { ok: false, reason: "unconfirmed" }
      if (!confirmed) {
        uncertain(outcome, route)
        return { ok: true, data: { confirmed: false, quiet: !noisy }, route: route.id }
      }
      if (noisy && before) notice("quiet-route-noisy", route)
      return { ok: true, data: { confirmed: true, quiet: !noisy, ...(undo ? { undo } : {}) }, route: route.id }
    } finally {
      if (sent.kind === "sent") sent.stop()
      stopActions()
    }
  }

  async function undo(job: JobOf<"queueUndo">, scope: JobScope): Promise<PageJobResult<JobOf<"queueUndo">>> {
    const route = routes.undo
    const { listId, setVideoId } = job
    let last: QueuePanel | undefined
    const present = () => last?.listId === listId && last.entries.some(entry => entry.setVideoId === setVideoId)
    const settled = await observe(scope, confirmChecks, confirmWindow, () => { last = panel(route); return present() })
    if (!scope.active || disposed) return { ok: false, reason: "unconfirmed" }
    if (!settled) return last ? { ok: false, reason: "failed" } : unavailable
    let noisy = false
    const stopActions = listen(scope, route, detail => { if (isQueueToast(detail)) noisy = true })
    const owned = new Set<() => void>()
    try {
      for (let round = 0; round < 2; round++) {
        const removal = await send(queueRemoveEdit(listId, setVideoId), scope, route)
        const blocked = notSent(removal, route)
        if (blocked || removal.kind !== "sent") return round === 0 ? blocked ?? unavailable : { ok: false, reason: "failed" }
        owned.add(removal.stop)
        await within(removal.settled, scope, removalAnswer)
        const answered = removal.outcome()
        if (answered?.kind === "answer" && answered.parsed.noisy) noisy = true
        if (rejected(answered)) notice("rejected", route)
        else if (answered?.kind !== "answer") uncertain(answered, route)
        removal.stop()
        if (!scope.active || disposed) return { ok: false, reason: "unconfirmed" }
        const refresh = await send(queueRefresh(listId), scope, route)
        if (refresh.kind === "not-sent") notice(refresh.cause === "missing" ? "missing" : "threw", route)
        if (refresh.kind === "sent") owned.add(refresh.stop)
        let gone = false
        await observe(scope, confirmChecks, confirmWindow, () => {
          last = panel(route)
          gone = last?.listId === listId && !present()
          return gone
        })
        if (refresh.kind === "sent") refresh.stop()
        if (!scope.active || disposed) return { ok: false, reason: "unconfirmed" }
        if (gone) {
          if (noisy) notice("quiet-route-noisy", route)
          return { ok: true, data: null, route: route.id }
        }
        if (!present()) return { ok: false, reason: "unconfirmed" }
      }
      return { ok: false, reason: "failed" }
    } finally {
      for (const stop of owned) stop()
      stopActions()
    }
  }

  async function addList(job: JobOf<"queueAddList">, scope: JobScope): Promise<PageJobResult<JobOf<"queueAddList">>> {
    const route = routes.list
    const before = panel(route)
    const known = new Set(before?.entries.map(entry => entry.setVideoId))
    const wanted = new Map<VideoId, number>()
    for (const id of job.videoIds) wanted.set(id, (wanted.get(id) ?? 0) + 1)
    const sent = await send(queueList(job.videoIds, before !== undefined), scope, route)
    try {
      const blocked = notSent(sent, route)
      if (blocked || sent.kind !== "sent") return blocked ?? unavailable
      let failure: JobFailure | undefined
      let count = 0
      await observe(scope, listChecks, scope.remaining(), () => {
        failure = rejected(sent.outcome())
        if (failure) return true
        const after = panel(route)
        if (!after || before && after.listId !== before.listId) return false
        const found = new Map<VideoId, number>()
        for (const entry of after.entries) if (!known.has(entry.setVideoId)) found.set(entry.videoId, (found.get(entry.videoId) ?? 0) + 1)
        let matched = 0
        for (const [id, times] of wanted) matched += Math.min(times, found.get(id) ?? 0)
        count = matched
        return count === job.videoIds.length
      })
      if (failure) { notice("rejected", route); return failure }
      if (!scope.active || disposed) return { ok: false, reason: "unconfirmed" }
      if (count < job.videoIds.length) uncertain(sent.outcome() ?? undefined, route)
      return { ok: true, data: { confirmed: count === job.videoIds.length, count }, route: route.id }
    } finally { if (sent.kind === "sent") sent.stop() }
  }

  function menu(job: JobOf<"openCardMenu">, target: Element | undefined): Promise<PageJobResult<JobOf<"openCardMenu">>> {
    const route = routes.menu
    if (disposed || !target || !connected(target)) return Promise.resolve(unavailable)
    let raw: unknown
    try { raw = options.card(target) } catch { notice("threw", route); return Promise.resolve(unavailable) }
    const shown = parseTargetVideo(raw)
    if (!shown && raw !== undefined) notice("unrecognised", route, raw)
    if (shown?.videoId !== job.videoId) return Promise.resolve(unavailable)
    return new Promise(resolve => {
      let active = true
      let stopTimer = () => {}
      let stopActions = () => {}
      const finish = (result: PageJobResult<JobOf<"openCardMenu">>) => {
        if (!active) return
        active = false
        menus.delete(close)
        stopTimer()
        const stop = stopActions; stopActions = () => {}
        try { stop() } catch {}
        resolve(result)
      }
      const close = () => finish(unavailable)
      menus.add(close)
      const seen = (detail: unknown) => {
        if (!active || !isMenuPopup(detail)) return
        finish({ ok: true, data: null, route: route.id })
      }
      try { stopActions = port.onAction(seen) } catch { notice("threw", route); finish(unavailable); return }
      let outcome: unknown
      try { outcome = port.openMenu(target) } catch { notice("threw", route); finish(unavailable); return }
      if (!active) return
      if (outcome !== "clicked") { notice("missing", route); finish(unavailable); return }
      stopTimer = clock.after(menuWindow, () => finish({ ok: false, reason: "unconfirmed" }))
    })
  }
  function connected(target: Element): boolean {
    try { return port.connected(target) } catch { return false }
  }
  return {
    add, undo, addList, menu,
    dispose() {
      if (disposed) return
      disposed = true
      for (const close of [...menus]) close()
    }
  }
}
