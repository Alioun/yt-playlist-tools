import type { FirstRunMessages } from "../../../src/shared/contracts/first-run"
import type { UiMessages } from "../../../src/shared/contracts/ui"
import type { AutoAddReadAnswer, AutoAddChoiceAnswer } from "../../../src/shared/contracts/auto-add-choice"
import type { CreationId, ListOperationId } from "../../../src/shared/contracts/ui-playlists"
import type { Backend } from "../../../src/ui/backend/backend"
import type { FirstRunCanonicalOwner, FirstRunReceiverPorts } from "../../../src/background/router/first-run"
import type { BrowserStartingOwner } from "../../../src/background/adapters/starting-owner"
import type { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
type Canonical = ReturnType<typeof createStartingLocalFilterWriter>
export type ReconciliationProofs = [
  Check<Equal<UiMessages["ui.change"], FirstRunMessages["ui.change"]>>,
  Check<Equal<FirstRunReceiverPorts["owner"], FirstRunCanonicalOwner>>,
  Check<Equal<BrowserStartingOwner["readAutoAddChoice"], Canonical["readAutoAddChoice"]>>,
  Check<Equal<BrowserStartingOwner["changeAutoAddChoice"], Canonical["changeAutoAddChoice"]>>,
  Check<Equal<{ [Name in keyof Canonical]: Equal<BrowserStartingOwner[Name], Canonical[Name]> }[keyof Canonical], true>>
]

function negatives(
  owner: FirstRunCanonicalOwner,
  backend: Backend,
  list: ListOperationId,
  creation: CreationId,
  read: Parameters<FirstRunCanonicalOwner["readAutoAddChoice"]>[1],
  edit: Parameters<FirstRunCanonicalOwner["changeAutoAddChoice"]>[1]
) {
  const { readAutoAddChoice, ...withoutRead } = owner
  const { changeAutoAddChoice, ...withoutEdit } = owner
  // @ts-expect-error negative: missing-auto-add-read. The receiver needs the canonical read method.
  const missingRead: FirstRunCanonicalOwner = withoutRead
  // @ts-expect-error negative: missing-auto-add-edit. The receiver needs the canonical edit method.
  const missingEdit: FirstRunCanonicalOwner = withoutEdit
  const captured: Promise<AutoAddReadAnswer> = backend.change(read)
  const changed: Promise<AutoAddChoiceAnswer> = backend.change(edit)
  // @ts-expect-error negative: create-as-list. List release needs a list operation identity.
  void backend.call("ui.playlists", { action: "release", operation: creation })
  // @ts-expect-error negative: list-as-create. Creation status needs a creation identity.
  void backend.call("ui.create", { action: "status", operation: list })
  // @ts-expect-error negative: auto-add-origin. Native authentication owns origin.
  void backend.call("ui.change", { change: { ...read, origin: { kind: "ui", windowId: 1, incognito: false } } })
  // @ts-expect-error negative: auto-add-sender. A body cannot provide the native sender.
  void backend.call("ui.change", { change: edit, sender: { id: "fixture-extension" } })
  // @ts-expect-error negative: auto-add-privacy. A message cannot claim its privacy.
  void backend.change({ ...read, incognito: false })
  // @ts-expect-error negative: auto-add-account-body. A message cannot supply a native account fact.
  void backend.call("ui.change", { change: { ...edit, account: { signedIn: true, acct: edit.acct } } })
  void [readAutoAddChoice, changeAutoAddChoice, missingRead, missingEdit, captured, changed]
}
void negatives
