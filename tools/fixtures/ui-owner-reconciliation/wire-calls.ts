import { deepStrictEqual } from "node:assert/strict"
import type { MemoryTrace } from "../../../src/shared/rpc/memory"
import { objectShape } from "../../../src/shared/contracts/object-shape"
import { uiContract } from "../../../src/shared/contracts/ui"
import { check } from "../ui-read-playlist-bridge/harness"

export function wireCalls(trace: readonly MemoryTrace[], lifetime?: string) {
  const lists = new Map<string, string>(), creations = new Map<string, string>(), calls: unknown[] = []
  function operation(identities: Map<string, string>, id: string, action: string, prefix: string) {
    if (action === "open" && !identities.has(id)) identities.set(id, `${prefix}-${identities.size + 1}`)
    const name = identities.get(id)
    check(name !== undefined, "wire command uses its opening operation")
    return name
  }
  for (const event of trace) {
    if (event.event !== "sent") continue
    const message: unknown = JSON.parse(event.text)
    check(objectShape(message, { v: v => v === 1, build: v => typeof v === "string", id: v => typeof v === "string",
      kind: v => typeof v === "string", payload: () => true }), "exact finite request envelope")
    const payload = message.payload
    switch (message.kind) {
      case "ui.change": {
        check(uiContract["ui.change"].payload(payload), "canonical first-run payload")
        if (payload.change.kind === "auto-add-choice") {
          deepStrictEqual(payload.change.lifetime, lifetime, "edit retains its actual canonical capture")
          const change = payload.change
          calls.push({ kind: message.kind, payload: {
            ...(payload.windowId === undefined ? {} : { windowId: payload.windowId }),
            change: { kind: change.kind, acct: change.acct, playlist: change.playlist, lifetime: "canonical-capture", edit: change.edit }
          } })
        } else calls.push({ kind: message.kind, payload })
        break
      }
      case "ui.accountInView":
        check(uiContract["ui.accountInView"].payload(payload), "canonical account payload")
        calls.push({ kind: message.kind, payload }); break
      case "ui.playlists":
        check(uiContract["ui.playlists"].payload(payload), "canonical progressive payload")
        calls.push({ kind: message.kind, payload: { ...payload, operation: operation(lists, payload.operation, payload.action, "list") } }); break
      case "ui.create":
        check(uiContract["ui.create"].payload(payload), "canonical creation payload")
        calls.push({ kind: message.kind, payload: { ...payload, operation: operation(creations, payload.operation, payload.action, "create") } }); break
      default: throw Error("Unexpected consumer wire command")
    }
  }
  return calls
}
