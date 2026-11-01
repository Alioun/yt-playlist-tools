import type { FirstRunMessages, ChangeAnswer } from "../../shared/contracts/first-run"
import { featureSettings, firstRunFeatures } from "../../shared/model/first-run-view"
import type { RpcReceiver } from "../../shared/rpc/rpc"
import { authenticateUi, type UiContext } from "../adapters/runtime"
import type { NativeSender, SenderOriginPorts } from "../adapters/sender-origin"
import type { AgreementAccess } from "../store/consent-agreement"
import type { createLocalFilterWriter } from "../store/local-filter-writer"
import { beginSyncedChoicesLookup, type SyncedChoicesLookup } from "../store/sync-join-lookup"
import { projectAgreement, projectDestination, projectAutoAddChoice } from "./first-run-results"

export type FirstRunCanonicalOwner = Pick<ReturnType<typeof createLocalFilterWriter>, "readAgreement" | "agree" | "changeSetupDestination" | "readAutoAddChoice" | "changeAutoAddChoice">
export type FirstRunReceiverPorts = {
  readonly sender: SenderOriginPorts
  readonly owner: FirstRunCanonicalOwner
  readonly readAccess: () => Promise<AgreementAccess | undefined>
  readonly lookup: Parameters<typeof beginSyncedChoicesLookup>[0]
}

export function createFirstRunReceiver(ports: FirstRunReceiverPorts) {
  let active = true
  const lookups = new Set<SyncedChoicesLookup>()
  const nativeAuthenticate = authenticateUi<FirstRunMessages>(ports.sender, request => request.payload.windowId)
  const receiver: RpcReceiver<FirstRunMessages, NativeSender, UiContext> = {
    async authenticate(input) {
      const accepted = await nativeAuthenticate(input)
      if (!active || accepted.kind !== "accepted" || accepted.context.origin.incognito) return { kind: "rejected" }
      if (accepted.context.page !== "popup" && input.request.payload.windowId !== undefined) return { kind: "rejected" }
      return accepted
    },
    handlers: {
      async "ui.change"({ change }, { origin }): Promise<ChangeAnswer> {
        if (change.kind === "auto-add-read") {
          if (!active) return { kind: "auto-add-read", outcome: { kind: "refused", reason: "unavailable" } }
          try {
            const result = await ports.owner.readAutoAddChoice(origin, change)
            return { kind: "auto-add-read", outcome: active ? result : { kind: "refused", reason: "unavailable" } }
          } catch { return { kind: "auto-add-read", outcome: { kind: "refused", reason: "rejected" } } }
        }
        if (change.kind === "auto-add-choice") {
          if (!active) return { kind: "auto-add-choice", outcome: { kind: "refused", reason: "unavailable" } }
          try {
            const result = await ports.owner.changeAutoAddChoice(origin, change)
            return { kind: "auto-add-choice", outcome: active ? projectAutoAddChoice(change, result) : { kind: "refused", reason: "unavailable" } }
          } catch { return { kind: "auto-add-choice", outcome: { kind: "refused", reason: "rejected" } } }
        }
        if (change.kind === "setup-destination") {
          if (!active) return { kind: "destination", outcome: { kind: "refused", reason: "unavailable" } }
          try {
            const result = await ports.owner.changeSetupDestination(origin, {
              acct: change.acct, destination: change.destination, expected: change.expected, playlist: change.playlist
            })
            return { kind: "destination", outcome: active ? projectDestination(change, result) : { kind: "refused", reason: "unavailable" } }
          } catch { return { kind: "destination", outcome: { kind: "refused", reason: "rejected" } } }
        }
        if (change.kind !== "first-run-agree") throw Error("Shared edits require the canonical UI router")
        const refusal = (reason: "invalid" | "unavailable" | "update-needed" | "rejected"): ChangeAnswer => ({ kind: "agreement", outcome: { kind: "not-agreed", attempt: change.attempt, reason } })
        if (!active) return refusal("unavailable")
        try {
          const read = await ports.owner.readAgreement(origin)
          if (!active) return refusal("unavailable")
          if (read.kind !== "review") return refusal(read.kind === "invalid" ? "invalid" : "unavailable")
          if (read.version !== change.displayedVersion) return refusal("update-needed")
          if (read.presentation.kind !== "canonical" || read.presentation.note?.state === "pending") return refusal("unavailable")
          const access = await ports.readAccess()
          if (!access || !active) return refusal("unavailable")
          const result = await ports.owner.agree(origin, {
            review: read.review,
            displayedVersion: change.displayedVersion,
            choice: change.syncOn ? { kind: "first-run", selected: change.selected, syncOn: true, join: { kind: "prepare" } }
              : { kind: "first-run", selected: change.selected, syncOn: false },
            access: Promise.resolve(access)
          })
          return active ? { kind: "agreement", outcome: projectAgreement(change, result, access) } : refusal("unavailable")
        } catch { return refusal("rejected") }
      },
      async "ui.syncedChoices"() {
        if (!active) return { kind: "unavailable" }
        const lookup = beginSyncedChoicesLookup({ ...ports.lookup, isCurrent: () => active && ports.lookup.isCurrent() })
        lookups.add(lookup)
        try {
          const result = await lookup.result
          if (!active) return { kind: "unavailable" }
          switch (result.kind) {
            case "found": return { kind: "found", features: firstRunFeatures.filter(feature => result.features[featureSettings[feature]]) }
            case "not-found": return { kind: "not-found" }
            case "update-needed": return { kind: "update-needed" }
            case "failed": return { kind: "failed" }
            case "cancelled":
            case "unavailable": return { kind: "unavailable" }
          }
        } finally { lookups.delete(lookup) }
      }
    }
  }
  return {
    receiver,
    dispose() {
      if (!active) return
      active = false
      for (const lookup of lookups) lookup.cancel()
      lookups.clear()
    }
  }
}
