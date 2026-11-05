import { Scope, type Dispose } from "../../core/scope"
import { overlaySkin } from "./skin"

export type OverlaySlot = "queue" | "quick-save"
export type OverlayAnchor = { readonly kind: "thumbnail"; readonly link: HTMLElement }
export type OverlayLease = {
  readonly slot: HTMLElement
  place(anchor: OverlayAnchor | null): void
  tooltip(target: HTMLElement, label: () => string): Dispose
  hideTooltip(): void
  readonly release: Dispose
}
export type OverlayKitOptions = { readonly owner: Scope; readonly document: Document; onError(error: unknown): void }

const slots: readonly OverlaySlot[] = ["queue", "quick-save"]
const inset = 4
const rowBelow = 100
const tooltipDelay = 500
const isolated = ["click", "dblclick", "auxclick", "pointerdown", "pointerup", "mousedown", "mouseup"] as const

type Live = {
  readonly scope: Scope
  readonly host: HTMLElement
  readonly stack: HTMLElement
  readonly tip: HTMLElement
  readonly slots: ReadonlyMap<OverlaySlot, HTMLElement>
  readonly anchors: Map<OverlaySlot, OverlayAnchor | null>
  latest: OverlayAnchor | null
  cancelTip: Dispose
}

function same(a: OverlayAnchor | null, b: OverlayAnchor | null): boolean {
  if (a === null || b === null) return a === b
  return a.link === b.link
}

function coveringPreview(document: Document, link: HTMLElement): HTMLElement | null {
  const preview = document.querySelector("ytd-app > #video-preview ytd-video-preview")
  const realm = document.defaultView
  if (!realm || !(preview instanceof realm.HTMLElement) || preview.hidden) return null
  const box = preview.getBoundingClientRect(), thumb = link.getBoundingClientRect()
  const x = thumb.left + thumb.width / 2, y = thumb.top + thumb.height / 2
  return box.width > 0 && box.height > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom ? preview : null
}

export function createOverlayKit(options: OverlayKitOptions) {
  const { owner, document } = options
  const leases = new Map<OverlaySlot, { readonly scope: Scope }>()
  let live: Live | null = null

  function start(): Live {
    const scope = new Scope({ document, onError: options.onError })
    const host = document.createElement("pp-overlay")
    const shadow = host.attachShadow({ mode: "open" })
    const style = document.createElement("style"); style.textContent = overlaySkin
    const stack = document.createElement("div"); stack.className = "stack"
    const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; tip.setAttribute("aria-hidden", "true")
    const owned = new Map<OverlaySlot, HTMLElement>()
    for (const name of slots) {
      const slot = document.createElement("div"); slot.className = "slot"; slot.dataset.slot = name; slot.hidden = true
      owned.set(name, slot); stack.append(slot)
    }
    stack.append(tip)
    shadow.append(style, stack)
    host.style.cssText = "all: initial; position: absolute; z-index: 10; display: block;"
    for (const type of isolated) scope.on<EventTarget, string>(host, type, event => event.stopPropagation())
    const mirror = () => host.toggleAttribute("dark", document.documentElement.hasAttribute("dark"))
    mirror()
    scope.observe(document.documentElement, { attributes: true, attributeFilter: ["dark"] }, mirror)
    scope.observe(document.getElementById("video-preview") ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"] }, records => {
      if (current.latest && records.some(record => !host.contains(record.target))) layout(current)
    })
    scope.add(() => host.remove())
    const current: Live = { scope, host, stack, tip, slots: owned, anchors: new Map(), latest: null, cancelTip: () => {} }
    return current
  }
  function stop() {
    const current = live
    live = null
    current?.scope.dispose()
  }
  function hideTip(current: Live) {
    current.cancelTip(); current.cancelTip = () => {}
    current.tip.hidden = true
  }
  function layout(current: Live) {
    const anchor = current.latest
    if (!anchor || !anchor.link.isConnected) { hideTip(current); current.host.remove(); return }
    const preview = coveringPreview(document, anchor.link)
    const parent = preview ?? anchor.link.parentElement
    if (!parent) { current.host.remove(); return }
    if (preview) { if (current.host.parentElement !== parent || parent.lastElementChild !== current.host) parent.append(current.host) }
    else if (anchor.link.nextElementSibling !== current.host) anchor.link.after(current.host)
    const padding = preview ? getComputedStyle(preview) : null
    const top = inset + (padding ? parseFloat(padding.paddingTop) : anchor.link.offsetTop)
    const left = inset + (padding ? parseFloat(padding.paddingLeft) : anchor.link.offsetLeft)
    current.host.style.top = `${top}px`
    current.host.style.left = `${left}px`
    current.host.toggleAttribute("data-row", anchor.link.offsetHeight > 0 && anchor.link.offsetHeight < rowBelow)
  }
  owner.add(() => { leases.clear(); stop() })

  return {
    use(consumer: Scope, name: OverlaySlot): OverlayLease | null {
      if (owner.disposed || consumer.disposed || leases.has(name)) return null
      const current = live ?? (live = start())
      const lease = { scope: consumer }
      leases.set(name, lease)
      const slot = current.slots.get(name)
      if (!slot) throw new Error("Overlay slot is unavailable")
      const active = () => live === current && leases.get(name) === lease && !consumer.disposed
      const release = consumer.add(() => {
        if (leases.get(name) !== lease) return
        leases.delete(name)
        current.anchors.delete(name)
        slot.replaceChildren(); slot.hidden = true
        if (current.latest && ![...current.anchors.values()].some(anchor => same(anchor, current.latest))) {
          current.latest = [...current.anchors.values()].find(anchor => anchor !== null) ?? null
          if (live === current) layout(current)
        }
        if (!leases.size && live === current) stop()
      })
      return {
        slot,
        release,
        place(anchor) {
          if (!active()) return
          current.anchors.set(name, anchor)
          slot.hidden = anchor === null
          if (anchor) current.latest = anchor
          else if (!same(current.latest, null) && ![...current.anchors.values()].some(other => same(other, current.latest))) {
            current.latest = [...current.anchors.values()].find(other => other !== null) ?? null
          }
          layout(current)
        },
        tooltip(target, label) {
          if (!active()) return () => {}
          const show = () => {
            if (!active()) return
            hideTip(current)
            current.cancelTip = current.scope.timeout(() => {
              if (!active() || !target.isConnected) return
              current.tip.textContent = label()
              current.tip.style.setProperty("--tip-top", `${target.offsetTop}px`)
              current.tip.hidden = false
            }, tooltipDelay)
          }
          const hide = () => { if (live === current) hideTip(current) }
          const releases = [
            consumer.on(target, "pointerenter", show), consumer.on(target, "focus", show),
            consumer.on(target, "pointerleave", hide), consumer.on(target, "blur", hide), consumer.on(target, "click", hide)
          ]
          return () => { for (const stopListening of releases) stopListening(); hide() }
        },
        hideTooltip() { if (active()) hideTip(current) }
      }
    },
    readHost: () => live?.host ?? null
  }
}
export type OverlayKit = ReturnType<typeof createOverlayKit>
