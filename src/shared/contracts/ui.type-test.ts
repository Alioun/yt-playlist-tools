import type { RpcHandlers, RpcRequest } from "../rpc/rpc"
import type { UiMessages } from "./ui"
import type { FirstRunMessages } from "./first-run"

type Check<T extends true> = T
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
export type CatalogueProofs = [
  Check<Equal<UiMessages["ui.change"], FirstRunMessages["ui.change"]>>,
  Check<Equal<UiMessages["ui.syncedChoices"], FirstRunMessages["ui.syncedChoices"]>>,
  Check<Equal<keyof UiMessages, "ui.clearAll" | "ui.change" | "ui.syncedChoices" | "ui.accountInView" | "ui.playlists" | "ui.create" | "ui.resolveChannel" | "ui.status" | "ui.pause" | "ui.recentAdds" | "ui.device" | "ui.filter" | "ui.withdraw" | "ui.removeSetup" | "ui.exportSettings" | "ui.importSettings" | "ui.noteSeen" | "ui.noteAgree">>
]
function negatives(handlers: RpcHandlers<UiMessages, undefined>) {
  // @ts-expect-error negative: invented-message. Every UI call is in the composed catalogue.
  const invented: RpcRequest<UiMessages> = { kind: "ui.invented", payload: {} }
  // @ts-expect-error negative: cross-kind-answer. Account answers cannot be playlist creation answers.
  const wrong: UiMessages["ui.accountInView"]["result"] = { kind: "created", id: "PL_alpha" }
  // @ts-expect-error negative: narrow-first-run. New catalogue members do not widen the first-run handler.
  handlers["ui.change"]({ change: { kind: "create", title: "Wrong domain" } }, undefined)
  void [invented, wrong]
}
void negatives
