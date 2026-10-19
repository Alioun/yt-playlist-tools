// THROWAWAY PROTOTYPE (ticket 14; ticket 17's site/core/pointer). The pointed-at item: under the pointer or holding
// keyboard focus, whichever moved last (ticket 08). Delegated pointerover/focusin on the document, never pointermove,
// and present only while some feature tracks (ticket 24: idle costs nothing, constant cost per card).
import { itemAt, type Item } from "./items-www";

type Listener = (item: Item | null, via: "pointer" | "focus") => void;

export function createPointer() {
  let users = 0;
  let pointerItem: Item | null = null;
  let focusItem: Item | null = null;
  let pointerTarget: Element | null = null;
  let last: "pointer" | "focus" = "pointer";
  let pointerOutside = true;
  const listeners = new Set<Listener>();
  /** Elements that count as part of the card they sit in or belong to (our overlay host). */
  const owners = new WeakMap<Element, () => Item | null>();

  const resolve = (t: EventTarget | null, at?: { clientX: number; clientY: number }): Item | null => {
    if (t instanceof Element) {
      for (let el: Element | null = t; el; el = el.parentElement ?? ((el.getRootNode() as ShadowRoot).host ?? null)) {
        const own = owners.get(el);
        if (own) return own();
      }
      // Search's inline preview sits in its own layer over the card: the card under it is the pointed-at item.
      if (at && t.closest("#video-preview")) {
        for (const el of document.elementsFromPoint(at.clientX, at.clientY)) {
          if (el.closest("#video-preview")) continue;
          const it = itemAt(el);
          if (it) return it;
        }
        return null;
      }
    }
    return itemAt(t);
  };

  const emit = (via: "pointer" | "focus") => listeners.forEach((l) => l(current(), via));

  const onOver = (e: PointerEvent) => {
    pointerOutside = false;
    if (e.target === pointerTarget) return;
    pointerTarget = e.target as Element;
    const next = resolve(e.target, e);
    last = "pointer";
    if (next?.el === pointerItem?.el) return;
    pointerItem = next;
    emit("pointer");
  };
  const onOut = (e: PointerEvent) => {
    if (e.relatedTarget) return;
    pointerOutside = true;
    pointerTarget = null;
    if (pointerItem) {
      pointerItem = null;
      emit("pointer");
    }
  };
  const onFocus = (e: FocusEvent) => {
    const path = e.composedPath();
    const next = resolve(path[0] ?? e.target);
    last = "focus";
    if (next?.el === focusItem?.el) return;
    focusItem = next;
    emit("focus");
  };

  function current(): Item | null {
    if (last === "focus" && focusItem && document.activeElement && document.activeElement !== document.body) return focusItem;
    return pointerOutside ? null : pointerItem;
  }

  return {
    /** Start tracking; returns the stop function (for the caller's scope). */
    track(): () => void {
      if (users++ === 0) {
        document.addEventListener("pointerover", onOver, { passive: true, capture: true });
        document.addEventListener("pointerout", onOut, { passive: true, capture: true });
        document.addEventListener("focusin", onFocus, { capture: true });
      }
      return () => {
        if (--users === 0) {
          document.removeEventListener("pointerover", onOver, { capture: true } as any);
          document.removeEventListener("pointerout", onOut, { capture: true } as any);
          document.removeEventListener("focusin", onFocus, { capture: true } as any);
          pointerItem = focusItem = null;
          pointerTarget = null;
        }
      };
    },
    subscribe(l: Listener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** The pointed-at item at the moment of a key press (re-resolved, so scrolling counts). */
    current,
    /** The raw element under the pointer (for the key-press self-check). */
    target: () => (last === "focus" ? document.activeElement : pointerOutside ? null : pointerTarget),
    /** Our overlay host belongs to the card it's attached to. */
    own(el: Element, item: () => Item | null) {
      owners.set(el, item);
    },
  };
}
export type Pointer = ReturnType<typeof createPointer>;
