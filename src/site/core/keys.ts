import type { TabView } from "../../shared/contracts/tab-view"
import { match, sameTarget } from "../../shared/keys/match"
import type { Binding, KeyFacts, MatchContext, PathDescriptor, ShortcutTarget } from "../../shared/keys/types"
import { Scope, type Dispose, type ScopeOptions } from "./scope"

export type BindingState = { readonly kind: "disabled" } | { readonly kind: "enabled"; readonly key: Binding["key"] }
export type KeyAction<T extends ShortcutTarget> = {
  readonly target: T
  readonly run: (target: NoInfer<T>) => void | Promise<void>
}
export type KeyRegistration = { update(state: BindingState): void; release: Dispose }
export interface KeyBlockers {
  menuOpen(): boolean
  dialogOpen(): boolean
  extensionPopoverOpen(): boolean
}
export type KeyFailure = { readonly phase: "context"; readonly error: unknown }
  | { readonly phase: "action"; readonly target: ShortcutTarget; readonly error: unknown }
export type KeysOptions = Pick<ScopeOptions, "document"> & {
  readonly blockers: KeyBlockers
  onError(failure: KeyFailure): void
}
type ActionGroup = { readonly target: ShortcutTarget; pending: object | null }
type Registration = { readonly group: ActionGroup; readonly invoke: () => void | Promise<void>; state: BindingState; release: Dispose }
const nothing: Dispose = () => {}

function descriptors(event: KeyboardEvent, document: Document): PathDescriptor[] {
  const realm = document.defaultView
  if (!realm) return []
  return event.composedPath().flatMap(node => node instanceof realm.Element ? [{
    tagName: node.tagName,
    inputType: node.getAttribute("type") ?? undefined,
    isContentEditable: node instanceof realm.HTMLElement && node.isContentEditable,
    contentEditable: node.getAttribute("contenteditable") ?? undefined,
    role: node.getAttribute("role") ?? undefined
  }] : [])
}

function visible(element: Element, document: Document): boolean {
  const realm = document.defaultView
  if (!realm || !element.isConnected || element.ownerDocument !== document) return false
  let node: Element | null = element
  while (node) {
    if (node.hasAttribute("hidden") || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") return false
    const style = realm.getComputedStyle(node)
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false
    const root: Node = node.getRootNode()
    node = node.parentElement ?? (root instanceof realm.ShadowRoot ? root.host : null)
  }
  return true
}

function domBlockers(event: KeyboardEvent, document: Document): Pick<MatchContext, "menuOpen" | "dialogOpen"> {
  const realm = document.defaultView
  const candidates = new Set(document.querySelectorAll("dialog[open], [role=menu], [role=dialog], [role=alertdialog]"))
  if (realm) for (const node of event.composedPath()) if (node instanceof realm.Element) candidates.add(node)
  let menuOpen = false
  let dialogOpen = false
  for (const node of candidates) {
    if (!visible(node, document)) continue
    const roles = node.getAttribute("role")?.toLowerCase().split(/\s+/) ?? []
    if (roles.includes("menu")) menuOpen = true
    const nativeDialog = node.localName === "dialog"
    if (nativeDialog ? node.hasAttribute("open") : roles.includes("dialog") || roles.includes("alertdialog")) dialogOpen = true
  }
  return { menuOpen, dialogOpen }
}

export class Keys {
  private readonly registrations = new Set<Registration>()
  private readonly groups = new Set<ActionGroup>()
  private listener: Scope | undefined
  private ended = false

  constructor(private readonly options: KeysOptions) {}

  register<T extends ShortcutTarget>(owner: Scope, action: KeyAction<T>, state: BindingState): KeyRegistration {
    if (this.ended || owner.disposed) return { update() {}, release: nothing }
    let group = [...this.groups].find(candidate => sameTarget(candidate.target, action.target))
    if (!group) { group = { target: action.target, pending: null }; this.groups.add(group) }
    const registration: Registration = { group, invoke: () => action.run(action.target), state, release: nothing }
    this.registrations.add(registration)
    registration.release = owner.add(() => {
      this.registrations.delete(registration)
      if (![...this.registrations].some(other => other.group === registration.group)) this.groups.delete(registration.group)
      this.syncListener()
    })
    try { this.syncListener() } catch (error) { registration.release(); throw error }
    return {
      release: registration.release,
      update: next => {
        if (this.ended || !this.registrations.has(registration)) return
        registration.state = next
        this.syncListener()
      }
    }
  }

  private syncListener(): void {
    const active = !this.ended && [...this.registrations].some(registration => registration.state.kind === "enabled")
    if (!active) {
      const listener = this.listener
      this.listener = undefined
      listener?.dispose()
    } else if (!this.listener) {
      const window = this.options.document.defaultView
      if (!window) throw new Error("Keys requires a document realm")
      const listener = new Scope({ document: this.options.document, onError: error => this.report({ phase: "context", error }) })
      this.listener = listener
      try {
        listener.on(window, "keydown", event => { if (this.listener === listener) this.dispatch(event) }, true)
      } catch (error) {
        if (this.listener === listener) this.listener = undefined
        listener.dispose()
        throw error
      }
    }
  }

  private report(failure: KeyFailure): void {
    try { this.options.onError(failure) } catch {}
  }

  private settle(group: ActionGroup, token: object): void {
    if (!this.ended && this.groups.has(group) && group.pending === token) group.pending = null
  }

  private dispatch(event: KeyboardEvent): void {
    const candidates: { readonly binding: Binding; readonly registration: Registration }[] = []
    const seen = new Set<ActionGroup>()
    for (const registration of this.registrations) {
      if (registration.state.kind === "disabled" || seen.has(registration.group)) continue
      seen.add(registration.group)
      candidates.push({ binding: { target: registration.group.target, key: registration.state.key }, registration })
    }
    let matched: Binding | null
    try {
      const dom = domBlockers(event, this.options.document)
      const blockers = this.options.blockers
      const facts: KeyFacts = {
        key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey,
        shiftKey: event.shiftKey, metaKey: event.metaKey, altGraph: event.getModifierState("AltGraph"),
        isComposing: event.isComposing, keyCode: event.keyCode, repeat: event.repeat
      }
      matched = match(facts, candidates.map(candidate => candidate.binding), {
        path: descriptors(event, this.options.document),
        menuOpen: dom.menuOpen || blockers.menuOpen() || blockers.extensionPopoverOpen(),
        dialogOpen: dom.dialogOpen || blockers.dialogOpen(),
        pending: [...this.groups].filter(group => group.pending !== null).map(group => group.target)
      })
    } catch (error) { this.report({ phase: "context", error }); return }
    const selected = candidates.find(candidate => candidate.binding === matched)
    if (!selected || this.ended || !this.registrations.has(selected.registration) || selected.registration.state.kind === "disabled" ||
      selected.registration.state.key !== selected.binding.key || selected.registration.group.pending !== null) return
    const { group } = selected.registration
    const token = {}
    group.pending = token
    event.preventDefault()
    event.stopImmediatePropagation()
    try {
      const result = selected.registration.invoke()
      if (result === undefined) this.settle(group, token)
      else void result.then(() => this.settle(group, token), error => {
        this.settle(group, token)
        this.report({ phase: "action", target: group.target, error })
      })
    } catch (error) {
      this.settle(group, token)
      this.report({ phase: "action", target: group.target, error })
    }
  }

  dispose(): void {
    if (this.ended) return
    this.ended = true
    for (const registration of [...this.registrations]) registration.release()
    this.syncListener()
  }
}

export type CoreUndoState = {
  readonly undoKey: TabView["undoKey"]
  readonly toastVisible: boolean
  readonly shortcutEnabled: boolean
}
export type CoreUndoOptions = { undoCurrent(): void | Promise<void> }

export function registerCoreUndo(keys: Keys, owner: Scope, options: CoreUndoOptions, state: CoreUndoState): {
  update(next: CoreUndoState): void
  release: Dispose
} {
  const binding = (value: CoreUndoState): BindingState => value.undoKey && (value.toastVisible || value.shortcutEnabled)
    ? { kind: "enabled", key: value.undoKey } : { kind: "disabled" }
  const registration = keys.register(owner, { target: { kind: "undo" }, run: () => options.undoCurrent() }, binding(state))
  return { release: registration.release, update: next => registration.update(binding(next)) }
}
