import { clearAllText, isClearAllPayload, type ClearAllMessages, type ClearAllAnswer } from "../../shared/contracts/clear-all"
import { resolveSenderOrigin, type NativeSender, type SenderOriginPorts } from "../adapters/sender-origin"
import type { RpcReceiver } from "../../shared/rpc/rpc"
import type { StoreLifecycle, SettingsPageOrigin, ClearAllResult } from "../store/store-lifecycle"

type ClearContext = { readonly origin: SettingsPageOrigin; readonly principal: string; current(): Promise<boolean> }
const unavailable = (reason: Extract<ClearAllAnswer, { kind: "unavailable" }>["reason"]): ClearAllAnswer => ({ kind: "unavailable", reason })
export function clearAllWireResult(result: ClearAllResult, alsoSynced: boolean): ClearAllAnswer {
  const scope = alsoSynced ? "synced" : "local"
  if (result.kind === "cleared") return { kind: "clear-result", scope, erasure: "confirmed", outcome: "cleared", stage: "complete",
    readiness: result.readiness.kind === "ready" ? "ready" : result.readiness.kind === "not-started" ? "not-started" : "held",
    firstRun: result.opening?.kind ?? "not-bound", progress: { effects: result.effects.map(effect => effect.effect) } }
  if (result.kind === "reset-held") {
    const reset = result.result
    return { kind: "clear-result", scope, erasure: "held", outcome: reset.kind,
      stage: reset.kind === "unavailable" ? reset.reason : reset.kind === "unconfirmed" ? reset.stage : "sync-opportunity",
      readiness: "not-started", firstRun: "not-bound", progress: reset.kind === "deferred"
        ? { phase: reset.marker.phase, notBefore: reset.notBefore, history: reset.marker.metadata.id, wait: reset.marker.wait }
        : { effects: "effects" in reset ? reset.effects.map(effect => ({ operation: effect.operation, outcome: effect.outcome.kind })) : [] } }
  }
  return { kind: "clear-result", scope, erasure: "held", outcome: result.kind,
    stage: result.kind === "unavailable" ? result.reason : result.stage, readiness: "not-started", firstRun: "not-bound", progress: null }
}

export function createClearAllReceiver(ports: {
  readonly native: SenderOriginPorts
  readonly lifecycle: Pick<StoreLifecycle, "clearAll"> | undefined
  readonly generation?: () => string
}) {
  let active = true
  const reviews = new Map<string, { readonly principal: string; readonly alsoSynced: boolean }>()
  const receiver: RpcReceiver<ClearAllMessages, NativeSender, ClearContext> = {
    async authenticate({ sender }) {
      const resolved = await resolveSenderOrigin(ports.native, { sender, popupWindowId: undefined })
      if (!active || !("page" in resolved) || resolved.page !== "settings" || resolved.kind !== "ui" && !(resolved.kind === "unavailable" && resolved.reason === "privacy")) return { kind: "rejected" }
      const origin: SettingsPageOrigin = resolved.kind === "ui" ? { kind: "ui", page: "settings", origin: resolved.origin } : { kind: "unavailable", reason: "privacy", page: "settings" }
      const principal = JSON.stringify([sender.id, sender.url, sender.documentId ?? null, sender.tab?.id ?? null, origin])
      return { kind: "accepted", context: { origin, principal, async current() {
        if (!active) return false
        const next = await resolveSenderOrigin(ports.native, { sender, popupWindowId: undefined })
        return active && JSON.stringify(next) === JSON.stringify(origin)
      } } }
    },
    handlers: {
      async "ui.clearAll"(raw, context) {
        if (!active) return unavailable("disposed")
        if (!isClearAllPayload(raw)) return unavailable("confirmation")
        const payload: unknown = JSON.parse(JSON.stringify(raw))
        if (!isClearAllPayload(payload)) return unavailable("confirmation")
        if (!await context.current()) return unavailable("origin")
        if (payload.action === "review") {
          if (reviews.size >= 1024) return unavailable("capacity")
          const review = (ports.generation ?? (() => crypto.randomUUID()))()
          if (!review || review.length > 256 || reviews.has(review)) return unavailable("capacity")
          reviews.set(review, { principal: context.principal, alsoSynced: payload.alsoSynced })
          return { kind: "reviewed", review, alsoSynced: payload.alsoSynced, text: clearAllText,
            button: payload.alsoSynced ? "Clear here and everywhere" : "Clear" }
        }
        const review = reviews.get(payload.review)
        if (!review || review.principal !== context.principal) return unavailable("confirmation")
        reviews.delete(payload.review)
        if (payload.action === "cancel") return { kind: "cancelled" }
        if (payload.alsoSynced !== review.alsoSynced) return unavailable("scope")
        if (!ports.lifecycle) return unavailable("collaborator")
        return clearAllWireResult(await ports.lifecycle.clearAll(context.origin, { alsoSynced: review.alsoSynced }), review.alsoSynced)
      }
    }
  }
  return { receiver, dispose() { active = false; reviews.clear() } }
}
