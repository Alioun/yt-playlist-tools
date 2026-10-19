// THROWAWAY PROTOTYPE (ticket 27, rough dev build). core-music.js: a much-reduced SiteCore (ticket 17): the page
// link to the gateway, item tracking ("pointer or focus, whichever moved last", ticket 08) and a Scope for teardown.
import { REQ, RES, type Job } from "./protocol";
import { itemAt, looksLikeItem, pageSettleCheck, SETTLE_MS, type Item } from "./items-music";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; t: ReturnType<typeof setTimeout> };
const pending = new Map<number, Pending>();
let seq = 0;

document.addEventListener(RES, (e) => {
  const m = JSON.parse((e as CustomEvent).detail);
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  clearTimeout(p.t);
  m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
});

/** Run a gateway job, targeted at an item's element when given (ticket 17: item jobs are dispatched on the item). */
function run<T = any>(job: Job, target?: Element, timeoutMs = 10000): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error("timeout"));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, t });
    (target ?? document).dispatchEvent(new CustomEvent(REQ, { detail: JSON.stringify({ id, ...job }), bubbles: true, composed: true }));
  });
}

/** Ticket 17's Scope: everything a feature adds goes through it, and dispose() removes it all. */
export class Scope {
  private disposers: (() => void)[] = [];
  on(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) {
    t.addEventListener(type, fn, opts);
    this.add(() => t.removeEventListener(type, fn, opts));
  }
  observe(el: Node, init: MutationObserverInit, fn: MutationCallback) {
    const o = new MutationObserver(fn);
    o.observe(el, init);
    this.add(() => o.disconnect());
  }
  timeout(fn: () => void, ms: number) {
    const t = setTimeout(fn, ms);
    this.add(() => clearTimeout(t));
  }
  add(fn: () => void) {
    this.disposers.push(fn);
  }
  dispose() {
    for (const d of this.disposers.splice(0).reverse()) d();
  }
}

/** Pointed-at item tracking. Delegated pointerover / focusin on the document, only while some feature tracks. */
type Pointed = { item: Item | null; via: "pointer" | "focus" };
function track(scope: Scope, cb: (p: Pointed) => void) {
  let pointerItem: Item | null = null;
  let focusItem: Item | null = null;
  let pointerAt = 0;
  let focusAt = 0;
  const emit = () => cb(pointerAt >= focusAt ? { item: pointerItem, via: "pointer" } : { item: focusItem, via: "focus" });
  scope.on(document, "pointerover", (e) => {
    const it = itemAt(e.target);
    if (it?.el === pointerItem?.el && pointerAt) return;
    pointerItem = it;
    pointerAt = performance.now();
    emit();
  }, { passive: true });
  scope.on(document.documentElement, "pointerleave", () => {
    pointerItem = null;
    pointerAt = performance.now();
    emit();
  });
  scope.on(document, "focusin", (e) => {
    const t = e.composedPath()[0] as Element;
    if (!t?.matches?.(":focus-visible")) return;
    focusItem = itemAt(e.target);
    focusAt = performance.now();
    emit();
  });
  return {
    current(): Pointed {
      return pointerAt >= focusAt ? { item: pointerItem, via: "pointer" } : { item: focusItem, via: "focus" };
    },
  };
}

const core = { run, Scope, track, itemAt, looksLikeItem, pageSettleCheck, SETTLE_MS };
export type Core = typeof core;
(globalThis as any).__pp27 ??= {};
(globalThis as any).__pp27.core = core;
