// THROWAWAY PROTOTYPE (ticket 14; ticket 17's SiteCore, site/core/core). Installed on globalThis.__pp.core by
// core-www.js, which runs first in the isolated list. Holds what several features share (items, pointer, keys, the page
// link) and the FeatureHost: a feature starts when its definition is present, the kit is there if it needs one, and the
// tab view says it's on; it's disposed when the view says off. Nothing here adds a listener until a feature asks.
import { createScope, type Scope } from "./scope";
import { createPageLink } from "./page-link";
import { createPointer } from "./pointer";
import { createKeys } from "./keys";
import * as items from "./items-www";
import type { FeatureContext, FeatureDef, FeatureId, Popovers } from "../feature";

export type TabView = { on: Partial<Record<FeatureId, boolean>>; layerOpen: boolean };

export function createCore() {
  const g = globalThis as any;
  g.__pp ??= {};
  const defs = new Map<FeatureId, FeatureDef>();
  const running = new Map<FeatureId, Scope>();
  let view: TabView = { on: {}, layerOpen: false };
  let loadPopovers: () => Promise<Popovers> = () => Promise.reject(new Error("no popovers loader"));
  let popoversPromise: Promise<Popovers> | null = null;

  const link = createPageLink();
  const pointer = createPointer();
  const keys = createKeys(() => view.layerOpen);

  function contextFor(scope: Scope): FeatureContext {
    return {
      site: "www",
      scope,
      run: link.run,
      watch(stream, cb) {
        scope.add(link.watch(stream, cb));
      },
      items: { ...items, pointed: pointer.current, target: pointer.target },
      pointer,
      keys: {
        bind: (list) => scope.add(keys.bind(list)),
        busy: keys.busy,
      },
      popovers(opts = {}) {
        popoversPromise ??= Promise.race([
          loadPopovers(),
          new Promise<never>((_, no) => setTimeout(() => no(new Error("popovers.js didn't load in 5 s")), 5000)),
        ]).catch((e) => {
          popoversPromise = null;
          console.warn("[Playlist Pigeon] the picker couldn't load", e);
          throw e;
        });
        if (opts.quiet) return popoversPromise; // hover-intent preload: a failure stays in the console
        return popoversPromise.catch((e) => {
          // An explicit click that silently does nothing is a defect (ticket 12): say so.
          g.__pp.kit?.lib.showToast({ failure: true, text: "Couldn't open the playlist list. Try again." });
          throw e;
        });
      },
      kit: g.__pp.kit,
    };
  }

  function reconcile() {
    for (const [id, def] of defs) {
      const on = !!view.on[id] && (!def.needsKit || !!g.__pp.kit?.ready);
      const scope = running.get(id);
      if (on && !scope) {
        const s = createScope();
        running.set(id, s);
        try {
          def.start(contextFor(s));
        } catch (e) {
          console.warn(`[Playlist Pigeon] ${id} failed to start`, e);
        }
      } else if (!on && scope) {
        scope.dispose();
        running.delete(id);
      }
    }
    // The kit's layer lives only while a running feature needs the kit.
    g.__pp.kit?.setNeeded?.([...running.keys()].some((id) => defs.get(id)?.needsKit));
  }

  const core = {
    define(def: FeatureDef) {
      if (defs.has(def.id)) return; // idempotent injection
      defs.set(def.id, def);
      reconcile();
    },
    setView(next: TabView) {
      view = next;
      reconcile();
    },
    setPopoversLoader(fn: () => Promise<Popovers>) {
      loadPopovers = fn;
    },
    /** For the prototype panel and the live run: what's running, and the page-settle check. */
    debug: () => ({ running: [...running.keys()], settle: items.settleCheck() }),
    items,
    pointer,
    keys,
    link,
    reconcile,
  };
  g.__pp.core = core;
  return core;
}
export type Core = ReturnType<typeof createCore>;
