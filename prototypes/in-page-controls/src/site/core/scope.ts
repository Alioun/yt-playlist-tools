// THROWAWAY PROTOTYPE (ticket 14, shaped by ticket 17's site/core/scope). Everything a feature adds to the page goes
// through its scope, and disposing the scope removes it: elements, styles (they live in our shadow roots), listeners,
// observers and timers. Teardown by construction, so switching a feature off leaves no trace.
export type Scope = {
  on(target: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions | boolean): void;
  observe(el: Node, init: MutationObserverInit, fn: MutationCallback): MutationObserver;
  resize(el: Element, fn: ResizeObserverCallback): ResizeObserver;
  timeout(fn: () => void, ms: number): void;
  /** Put a node into YouTube's DOM; it's removed on dispose. */
  place(node: Node): Node;
  add(dispose: () => void): void;
  dispose(): void;
  readonly disposed: boolean;
};

export function createScope(): Scope {
  const undo: (() => void)[] = [];
  let disposed = false;
  const scope: Scope = {
    on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      undo.push(() => target.removeEventListener(type, fn, opts));
    },
    observe(el, init, fn) {
      const mo = new MutationObserver(fn);
      mo.observe(el, init);
      undo.push(() => mo.disconnect());
      return mo;
    },
    resize(el, fn) {
      const ro = new ResizeObserver(fn);
      ro.observe(el);
      undo.push(() => ro.disconnect());
      return ro;
    },
    timeout(fn, ms) {
      const t = setTimeout(fn, ms);
      undo.push(() => clearTimeout(t));
    },
    place(node) {
      undo.push(() => (node as ChildNode).remove?.());
      return node;
    },
    add(d) {
      if (disposed) d();
      else undo.push(d);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      while (undo.length) {
        try {
          undo.pop()!();
        } catch (e) {
          console.warn("[Playlist Pigeon] teardown step failed", e);
        }
      }
    },
    get disposed() {
      return disposed;
    },
  };
  return scope;
}
