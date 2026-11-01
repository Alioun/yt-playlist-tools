import { Scope, type Dispose, type ScopeOptions } from "./scope"

export type PointerPoint = { readonly x: number; readonly y: number }
export type PointerFacts =
  | { readonly kind: "none"; readonly reason: "inactive" | "unmoved" | "outside" | "focus-unavailable" | "document-unavailable" }
  | { readonly kind: "focus"; readonly element: Element; readonly stack: readonly Element[] }
  | { readonly kind: "pointer"; readonly point: PointerPoint; readonly stack: readonly Element[] }

export type PointerOptions = Pick<ScopeOptions, "document" | "onError">
type Moved = { readonly kind: "none" } | { readonly kind: "focus"; readonly point: PointerPoint | null }
  | { readonly kind: "pointer"; readonly point: PointerPoint | null }
type Tracking = { readonly scope: Scope; readonly frame: Element | null; moved: Moved }
type Lease = { release: Dispose }
const nothing: Dispose = () => {}

function activeElement(document: Document): Element | null {
  let element = document.activeElement
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement
  return element
}

export class Pointer {
  private readonly leases = new Set<Lease>()
  private tracking: Tracking | undefined
  private ended = false

  constructor(private readonly options: PointerOptions) {}

  track(owner: Scope): Dispose {
    if (this.ended || owner.disposed) return nothing
    const lease: Lease = { release: nothing }
    this.leases.add(lease)
    lease.release = owner.add(() => {
      this.leases.delete(lease)
      if (this.leases.size === 0) this.stop()
    })
    if (!this.ended && this.leases.has(lease) && !this.tracking) {
      try { this.start() } catch (error) { lease.release(); throw error }
    }
    return lease.release
  }

  private start(): void {
    const document = this.options.document
    const window = document.defaultView
    if (!window) throw new Error("Pointer requires a document realm")
    const tracking: Tracking = { scope: new Scope(this.options), frame: window.frameElement, moved: { kind: "none" } }
    this.tracking = tracking
    const current = () => this.tracking === tracking && !tracking.scope.disposed
    const point = (event: PointerEvent) => {
      if (!current()) return
      const inside = Number.isFinite(event.clientX) && Number.isFinite(event.clientY) &&
        event.clientX >= 0 && event.clientY >= 0 && event.clientX < window.innerWidth && event.clientY < window.innerHeight
      const previous = tracking.moved.kind === "none" ? null : tracking.moved.point
      if (inside && tracking.moved.kind === "focus" && previous?.x === event.clientX && previous.y === event.clientY) return
      tracking.moved = { kind: "pointer", point: inside ? { x: event.clientX, y: event.clientY } : null }
    }
    const outside = () => { if (current()) tracking.moved = { kind: "pointer", point: null } }
    try {
      tracking.scope.on(document, "pointerover", point, true)
      tracking.scope.on(document, "pointermove", point, true)
      tracking.scope.on(document, "pointerout", event => { if (event.relatedTarget === null) outside() }, true)
      tracking.scope.on(document, "pointerleave", event => {
        if (event.relatedTarget === null && (event.target === document || event.target === document.documentElement)) outside()
      }, true)
      tracking.scope.on(window, "blur", outside)
      tracking.scope.on(document, "focusin", () => {
        const element = activeElement(document)
        if (current() && element?.matches(":focus-visible")) {
          tracking.moved = { kind: "focus", point: tracking.moved.kind === "none" ? null : tracking.moved.point }
        }
      }, true)
      const focused = activeElement(document)
      if (current() && tracking.moved.kind === "none" && focused?.matches(":focus-visible")) tracking.moved = { kind: "focus", point: null }
    } catch (error) {
      if (this.tracking === tracking) this.tracking = undefined
      tracking.scope.dispose()
      throw error
    }
  }

  private stop(): void {
    const tracking = this.tracking
    this.tracking = undefined
    tracking?.scope.dispose()
  }

  read(): PointerFacts {
    const tracking = this.tracking
    if (this.ended || !tracking || tracking.scope.disposed) return { kind: "none", reason: "inactive" }
    const document = this.options.document
    if (!document.defaultView || document.defaultView.document !== document || tracking.frame && !tracking.frame.isConnected) {
      return { kind: "none", reason: "document-unavailable" }
    }
    switch (tracking.moved.kind) {
      case "none": return { kind: "none", reason: "unmoved" }
      case "focus": {
        const element = activeElement(document)
        if (!element?.isConnected || element.ownerDocument !== document || !element.matches(":focus-visible")) {
          return { kind: "none", reason: "focus-unavailable" }
        }
        const stack: Element[] = []
        let ancestor: Element | null = element
        while (ancestor) {
          stack.push(ancestor)
          const root: Node = ancestor.getRootNode()
          ancestor = ancestor.parentElement ?? (root instanceof document.defaultView.ShadowRoot ? root.host : null)
        }
        if (this.tracking !== tracking || tracking.scope.disposed) return { kind: "none", reason: "inactive" }
        return { kind: "focus", element, stack }
      }
      case "pointer": {
        const point = tracking.moved.point
        if (!point) return { kind: "none", reason: "outside" }
        const window = document.defaultView
        if (point.x >= window.innerWidth || point.y >= window.innerHeight) return { kind: "none", reason: "outside" }
        const stack = document.elementsFromPoint(point.x, point.y)
          .filter(element => element.isConnected && element.ownerDocument === document)
        if (this.tracking !== tracking || tracking.scope.disposed) return { kind: "none", reason: "inactive" }
        return { kind: "pointer", point, stack }
      }
    }
  }

  dispose(): void {
    if (this.ended) return
    this.ended = true
    for (const lease of [...this.leases]) lease.release()
    this.stop()
  }
}
