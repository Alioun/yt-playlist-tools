import { Scope } from "./scope"
import { Pointer, type PointerFacts } from "./pointer"

export function pointerTypes(document: Document, scope: Scope, facts: PointerFacts): void {
  const pointer = new Pointer({ document, onError: (_error: unknown) => {} })
  pointer.track(scope)()
  // @ts-expect-error Pointer requires the actual document collaborator.
  new Pointer({ onError: (_error: unknown) => {} })
  // @ts-expect-error Pointer requires its cleanup error collaborator.
  new Pointer({ document })
  // @ts-expect-error A native target cannot replace a feature Scope.
  pointer.track(document)
  // @ts-expect-error Missing-point facts are not an element.
  const element: Element = pointer.read()
  if (facts.kind === "none") {
    // @ts-expect-error No point exposes no cached target element.
    facts.element
    // @ts-expect-error No point exposes no hit stack.
    facts.stack
  }
  if (facts.kind === "pointer") {
    const x: number = facts.point.x
    const elements: readonly Element[] = facts.stack
    // @ts-expect-error A pointer stack is not a recognized item or focused element.
    facts.element
    void x; void elements
  }
  if (facts.kind === "focus") {
    const focused: Element = facts.element
    // @ts-expect-error Focus facts have no fabricated pointer coordinate.
    facts.point
    void focused
  }
  void element
}
