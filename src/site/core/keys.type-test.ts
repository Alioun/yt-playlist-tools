import type { TabView } from "../../shared/contracts/tab-view"
import type { ShortcutTarget } from "../../shared/keys/types"
import { Scope } from "./scope"
import { Keys, registerCoreUndo, type CoreUndoState, type KeyAction, type KeyBlockers } from "./keys"

export function keyTypes(document: Document, scope: Scope, undoKey: TabView["undoKey"]): void {
  const blockers: KeyBlockers = { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }
  const onError = (_failure: unknown) => {}
  const keys = new Keys({ document, blockers, onError })
  // @ts-expect-error Open-blocker collaborators cannot be omitted.
  new Keys({ document, onError })
  // @ts-expect-error The extension popover state is a required collaborator.
  new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false }, onError })
  // @ts-expect-error An action error collaborator cannot be omitted.
  new Keys({ document, blockers })
  const action: KeyAction<Extract<ShortcutTarget, { kind: "undo" }>> = { target: { kind: "undo" }, run: target => { const kind: "undo" = target.kind; void kind } }
  const registration = keys.register(scope, action, { kind: "disabled" })
  // @ts-expect-error A picker target cannot implement an Undo semantic action.
  const mismatch: KeyAction<Extract<ShortcutTarget, { kind: "undo" }>> = { target: { kind: "picker" }, run() {} }
  // @ts-expect-error Playlist actions require their semantic playlist ID.
  keys.register(scope, { target: { kind: "playlist" }, run() {} }, { kind: "disabled" })
  // @ts-expect-error Music action names come from the canonical ShortcutTarget.
  keys.register(scope, { target: { kind: "music", action: "invented" }, run() {} }, { kind: "disabled" })
  // @ts-expect-error Enabled registrations require a key.
  registration.update({ kind: "enabled" })
  // @ts-expect-error A null setting must become a disabled binding.
  registration.update({ kind: "enabled", key: null })
  // @ts-expect-error A disabled registration cannot carry an active key.
  registration.update({ kind: "disabled", key: undoKey })
  // @ts-expect-error Registration updates cannot change the semantic target.
  registration.update({ kind: "disabled", target: { kind: "picker" } })
  const state: CoreUndoState = { undoKey, toastVisible: false, shortcutEnabled: true }
  const undo = registerCoreUndo(keys, scope, { undoCurrent() {} }, state)
  undo.update({ undoKey: null, toastVisible: true, shortcutEnabled: false })
  // @ts-expect-error The real Undo callback is required.
  registerCoreUndo(keys, scope, {}, state)
  // @ts-expect-error Undo uses the actual nullable TabView key rather than a string.
  undo.update({ undoKey: "Alt+U", toastVisible: true, shortcutEnabled: false })
  // @ts-expect-error Active Undo needs both visibility inputs.
  undo.update({ undoKey, toastVisible: true })
  void mismatch
}
