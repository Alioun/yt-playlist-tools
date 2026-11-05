import type { Dispose, Scope } from "../../core/scope"
import { icon, type IconName } from "./icons"
import { musicSkin, tipSkin } from "./skin"

export type HostKind = "row" | "card" | "header" | "bar" | "wiz"
/** One button as drawn. `split` pairs Save's main part with its ▾ (UI-YM-14). */
export type Drawn = {
  readonly id: string
  readonly icon: IconName
  /** The accessible name: the action and the item's title (YM-QA-12). */
  readonly label: string
  readonly tip: string
  readonly disabled: boolean
  readonly pressed: boolean | null
  readonly split: "main" | "more" | null
}
export type Tooltip = { show(target: HTMLElement, text: () => string): void; hide(): void }

// The Wiz miniplayer expands on any click that isn't on a button, and the page's hotkeys must not see ours (YM-QA-14, UI-YM-08).
const isolated = ["click", "dblclick", "auxclick", "pointerdown", "pointerup", "mousedown", "mouseup", "contextmenu", "keydown", "keyup", "keypress"] as const
const tipDelay = 500

/** YouTube's tooltip in one top-level host, 0.5 s after the pointer or focus arrives, above the button (UI-YM-05). */
export function tooltip(document: Document, owner: Scope): Tooltip {
  let host: HTMLElement | null = null, box: HTMLElement | null = null
  let cancel: Dispose = () => {}
  owner.add(() => { cancel(); host?.remove() })
  function hide() { cancel(); cancel = () => {}; host?.remove() }
  return {
    hide,
    show(target, text) {
      hide()
      cancel = owner.timeout(() => {
        if (!target.isConnected) return
        if (!host || !box) {
          host = document.createElement("pp-music-tip")
          const shadow = host.attachShadow({ mode: "open" })
          const style = document.createElement("style"); style.textContent = tipSkin
          box = document.createElement("div"); box.setAttribute("role", "tooltip")
          shadow.append(style, box)
        }
        box.textContent = text()
        const full = document.fullscreenElement
        ;(full && !full.contains(document.body) ? full : document.body).append(host)
        const at = target.getBoundingClientRect(), size = box.getBoundingClientRect()
        host.style.left = `${Math.max(4, at.left + at.width / 2 - size.width / 2)}px`
        host.style.top = `${Math.max(4, at.top - size.height - 8)}px`
      }, tipDelay)
    }
  }
}

/**
 * A host of ours with its buttons. The page sees one element; the buttons live in its open shadow root. Their
 * listeners belong to the feature's scope and end with it, or sooner when the host is disposed.
 */
export function createHost(scope: Scope, document: Document, kind: HostKind, tip: Tooltip, press: (id: string, button: HTMLElement) => void, intent: () => void) {
  const host = document.createElement("pp-music-actions")
  host.dataset.kind = kind
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style"); style.textContent = musicSkin
  const set = document.createElement("div"); set.className = "set"
  shadow.append(style, set)
  const stops: Dispose[] = []
  const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (event: HTMLElementEventMap[K]) => void) => { stops.push(scope.on(target, type, fn)) }
  for (const type of isolated) on(host, type, event => event.stopPropagation())
  const buttons = new Map<string, { readonly element: HTMLButtonElement; drawn: Drawn | null }>()
  let split: HTMLElement | null = null

  function button(id: string) {
    const found = buttons.get(id)
    if (found) return found
    const element = document.createElement("button")
    element.type = "button"
    const entry = { element, drawn: null as Drawn | null }
    on(element, "click", () => { tip.hide(); press(id, element) })
    // Hover intent on a Save preloads the picker's code (YM-SAVE-16).
    const show = () => { if (entry.drawn) tip.show(element, () => entry.drawn?.tip ?? ""); if (entry.drawn?.icon !== undefined && (id === "save" || id === "more" || id === "choose")) intent() }
    on(element, "pointerenter", show)
    on(element, "focus", show)
    on(element, "pointerleave", () => tip.hide())
    on(element, "blur", () => tip.hide())
    buttons.set(id, entry)
    return entry
  }
  return {
    host,
    set kind(next: HostKind) { host.dataset.kind = next },
    /** The split Save, where the picker opens below (YM-PICK-2). */
    get anchor(): HTMLElement | null { return split?.isConnected ? split : buttons.get("save")?.element ?? null },
    draw(entries: readonly Drawn[]) {
      const wanted = new Set(entries.map(entry => entry.id))
      for (const [id, entry] of buttons) if (!wanted.has(id)) { entry.element.remove(); buttons.delete(id) }
      const children: Element[] = [], parts: Element[] = []
      for (const drawn of entries) {
        const entry = button(drawn.id)
        const { element } = entry
        if (JSON.stringify(entry.drawn) !== JSON.stringify(drawn)) {
          element.className = drawn.split ?? ""
          element.setAttribute("aria-label", drawn.label)
          element.setAttribute("aria-disabled", String(drawn.disabled))
          if (drawn.pressed === null) element.removeAttribute("aria-pressed")
          else element.setAttribute("aria-pressed", String(drawn.pressed))
          if (entry.drawn?.icon !== drawn.icon) element.replaceChildren(icon(document, drawn.icon))
          entry.drawn = drawn
        }
        if (drawn.split === "main") {
          split ??= Object.assign(document.createElement("div"), { className: "split" })
          parts.push(element)
          children.push(split)
        } else if (drawn.split === "more") parts.push(element)
        else children.push(element)
      }
      if (!parts.length) split = null
      else if (split && (parts.length !== split.children.length || parts.some((part, index) => split?.children[index] !== part))) split.replaceChildren(...parts)
      if (children.length !== set.children.length || children.some((child, index) => set.children[index] !== child)) set.replaceChildren(...children)
    },
    read: (id: string) => buttons.get(id)?.element ?? null,
    /** Takes the host off the page for good and ends its listeners. */
    dispose() {
      for (const stop of stops.splice(0)) stop()
      host.remove()
    }
  }
}
export type Host = ReturnType<typeof createHost>
