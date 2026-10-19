// THROWAWAY PROTOTYPE (ticket 14; ticket 17's Kit, site/kit/kit). Installed on globalThis.__pp.kit by kit-www.js,
// which runs after core-www.js and before every feature file. Owns: the layer host (toasts, notices, the popovers'
// mount point), the one thumbnail overlay, inline hosts for in-flow controls, the YouTube skin and the toaster.
// The layer exists only while a running feature needs the kit; the core says when (found on live YouTube: without
// this, switching every feature off left the layer host behind).
import { mount, unmount, type Component } from "svelte";
import Toaster from "./toaster/Toaster.svelte";
import { createHost, themeVariablesPresent } from "./host";
import { createOverlay } from "./overlay/overlay.svelte";
import { toasts, listenPage } from "./toaster/toaster.svelte";
import { view, log } from "../proto/view.svelte";
import * as lib from "./index";
import type { Core } from "../core/core";
import type { Scope } from "../core/scope";

const LAYER_CSS = ":host{position:fixed;top:0;left:0;width:0;height:0;z-index:2300;}";

export function createKit(core: Core) {
  const g = globalThis as any;
  const overlay = createOverlay(core);

  async function mountInline(C: Component<any>, props: Record<string, unknown>, place: (host: HTMLElement) => void, scope: Scope, css = "") {
    const h = await createHost("pp-inline", css);
    if (scope.disposed) return void h.dispose();
    place(h.host);
    const app = mount(C, { target: h.root, props });
    scope.add(() => {
      unmount(app);
      h.dispose();
    });
    return h;
  }

  let layer: null | { dispose(): void } = null;
  let waking: Promise<void> | null = null;

  async function wake() {
    if (layer) return;
    waking ??= createHost("pp-layer", LAYER_CSS).then(({ host, shadow, root, dispose }) => {
      document.body.append(host);
      const toasterRoot = document.createElement("div");
      const portal = document.createElement("div");
      root.append(toasterRoot, portal);
      const app = mount(Toaster, { target: toasterRoot });
      const stopPage = listenPage();
      // Ticket 14's fullscreen rule: toasts the user asked for show in fullscreen; unprompted ones wait until it ends
      // (see the toaster). YouTube makes <html> fullscreen, so the layer stays where it is; only a player that is the
      // fullscreen element itself (another site, or a future YouTube) needs the layer moved inside it.
      const stopEffects = $effect.root(() => {
        $effect(() => {
          const fs = toasts.fullscreenEl;
          const target = fs && !fs.contains(document.body) ? fs : document.body;
          if (host.parentNode !== target) target.append(host);
        });
      });
      Object.assign(kit, { host: shadow, portal, layer: host });
      layer = {
        dispose() {
          stopEffects();
          stopPage();
          unmount(app);
          dispose();
          Object.assign(kit, { host: null, portal: null, layer: null });
        },
      };
      if (g.__pp.timing) g.__pp.timing.kitReady = performance.now();
      if (!themeVariablesPresent()) log("signal: cosmetic (YouTube's theme variables are missing; using the built-in palette)");
    });
    await waking;
    waking = null;
  }

  const kit = {
    /** Loaded: features that need the kit may start (they get the layer as soon as it exists). */
    ready: true,
    lib,
    overlay,
    toast: { show: lib.showToast, undoCurrent: lib.undoKey },
    host: null as ShadowRoot | null,
    /** Where popovers.js mounts its own Svelte app (a sibling of the toaster's mount point). */
    portal: null as HTMLElement | null,
    layer: null as HTMLElement | null,
    mountInline,
    /** The core: whether any running feature needs the kit. */
    setNeeded(needed: boolean) {
      if (needed) void wake();
      else if (layer) {
        layer.dispose();
        layer = null;
      }
    },
  };
  g.__pp.kit = kit;

  // Prototype: the stand-in tab view drives which features run, like the background's bg.view pushes would.
  $effect.root(() => {
    $effect(() => {
      toasts.mark = view.look !== "B";
      overlay.state.row = view.look === "C";
      core.setView({
        on: {
          "auto-add": view.features.autoAdd,
          shortcuts: view.features.shortcuts,
          "quick-save": view.features.quickSave,
          "queue-button": view.features.queue,
          "watch-button": view.features.watchButton,
          "card-menu": view.features.cardMenu,
        },
        layerOpen: !!view.openLayer,
      });
    });
  });
  return kit;
}
export type Kit = ReturnType<typeof createKit>;
