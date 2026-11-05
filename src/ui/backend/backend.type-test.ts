import type { UiMessages } from "../../shared/contracts/ui"
import type { Backend, ReadOnlyLocal, ReadScope, AgreeChange, DestinationChange, AgreementAnswer, DestinationAnswer } from "./backend"
import type { Change, FeatureApplication } from "../../shared/contracts/first-run"
import type { AccountKey, PlaylistId } from "../../shared/model/validation"
import type { FirstRunOwner, AgreementRequest } from "../onboarding/owner"
import type { createFirstRunOwner, FirstRunServices } from "./first-run-owner"
import type { RpcCaller } from "../../shared/rpc/rpc"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type FirstRunBackendProofs = [
  Check<Equal<keyof ReadOnlyLocal, "get" | "all" | "onChanged">>,
  Check<Equal<keyof RpcCaller<UiMessages>, "call" | "dispose">>,
  Check<Equal<"origin" extends keyof Change ? true : false, false>>,
  Check<Equal<"permissions" extends keyof AgreeChange ? true : false, false>>,
  Check<Equal<"review" extends keyof AgreeChange ? true : false, false>>,
  Check<Equal<ReturnType<typeof createFirstRunOwner> extends FirstRunOwner ? true : false, true>>,
  Check<Equal<AgreementRequest["permissions"], Promise<{ readonly music: boolean; readonly browserMenu: boolean }>>>
]

function operations(backend: Backend, local: ReadOnlyLocal, acct: AccountKey, playlist: PlaylistId, agree: AgreeChange, destination: DestinationChange, services: FirstRunServices) {
  const agreement: Promise<AgreementAnswer> = backend.change(agree)
  const setup: Promise<DestinationAnswer> = backend.change(destination)
  const scope: ReadScope = { acct }
  void backend.load(scope)
  void backend.call("ui.syncedChoices", {})
  void backend.playlistList({ acct, site: "www" })
  void backend.call("ui.change", { change: agree })
  void services.chooser
  // @ts-expect-error negative: readonly-local-set. UI storage cannot write.
  local.set({ device: {} })
  // @ts-expect-error negative: readonly-local-remove. UI storage cannot remove.
  local.remove(["device"])
  // @ts-expect-error negative: readonly-local-clear. UI storage cannot clear.
  local.clear()
  // @ts-expect-error negative: readonly-local-all. A read names its canonical keys.
  local.get(null)
  // @ts-expect-error negative: dto-origin. Origin comes from the native sender.
  backend.change({ ...agree, origin: { kind: "ui", windowId: 1, incognito: false } })
  // @ts-expect-error negative: dto-review. The review cannot cross the wire.
  backend.change({ ...agree, review: { kind: "agreement-review" } })
  // @ts-expect-error negative: dto-promise. Permission evidence stays in its process.
  backend.change({ ...agree, permissions: Promise.resolve({ music: true, browserMenu: true }) })
  // @ts-expect-error negative: operation-result. Setup and agreement answers differ.
  const wrong: Promise<AgreementAnswer> = backend.change(destination)
  // @ts-expect-error negative: operation-args. The pre-consent lookup accepts no agreement body.
  backend.call("ui.syncedChoices", { change: agree })
  // @ts-expect-error negative: subset. Remaining unbuilt calls have no successful placeholder.
  backend.call("ui.diagnostics", {})
  // @ts-expect-error negative: account-brand. A native account identifier is not an AccountKey.
  backend.load({ acct: "native-account-id" })
  // @ts-expect-error negative: playlist-brand. A raw string has not passed validation.
  backend.change({ ...destination, playlist: "PL_unvalidated" })
  // @ts-expect-error negative: music-scopes. Shortcuts needs an explicit Music disposition.
  const missingMusic: FeatureApplication = { feature: "shortcuts", state: "enabled" }
  // @ts-expect-error negative: no-chooser. Playlist choices require an actual chooser port.
  const incomplete: FirstRunServices = { account: services.account, playlists: services.playlists, open: services.open }
  void [agreement, setup, playlist]
}
void operations

function autoAddOperations(backend: Backend, request: import("./backend").AutoAddChoiceChange, read: import("./backend").AutoAddReadChange) {
  const choice: Promise<import("./backend").AutoAddChoiceAnswer> = backend.change(request)
  const capture: Promise<import("./backend").AutoAddReadAnswer> = backend.change(read)
  // @ts-expect-error negative: auto-add-not-agreement. Agreement cannot satisfy a choice.
  const agreement: Promise<AgreementAnswer> = backend.change(request)
  // @ts-expect-error negative: auto-add-not-destination. Scalar destination calls require their own result.
  const destination: Promise<DestinationAnswer> = backend.change(request)
  // @ts-expect-error negative: destination-not-auto-add. A destination answer cannot prove an auto-add fact.
  const wrong: Promise<import("./backend").AutoAddChoiceAnswer> = backend.change({
    kind: "setup-destination",
    acct: request.acct,
    playlist: request.playlist,
    destination: { kind: "quick-save" },
    expected: { setup: "none" }
  })
  void [choice, capture, agreement, destination, wrong]
}
void autoAddOperations
