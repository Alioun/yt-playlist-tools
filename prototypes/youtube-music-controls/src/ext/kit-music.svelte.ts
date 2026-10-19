// THROWAWAY PROTOTYPE (ticket 27, rough dev build). kit-music.js: the Svelte runtime, one shadow host for the
// layers (toast, tooltip, popovers), and small in-flow hosts for controls that have to live inside YouTube Music's
// own layout (the moving row/card/queue host, the header group, the player-bar Save).
//
// Rough-build shortcut: the kit carries the controls' components itself (ticket 17's D4 runner-up). The real build
// links feature files to the kit's runtime instead.
import { mount, unmount } from "svelte";
import KitLayers from "./KitLayers.svelte";
import SlotView from "./SlotView.svelte";
import { show, update, undoCurrent, dismiss } from "../kit/toaster.svelte";
import type { ActionId, ButtonState, ClusterSettings, ItemView, Place } from "../kit/model";

const STOP = ["keydown", "keyup", "keypress", "click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "contextmenu"];

/** Events stop at our hosts (ticket 08's isolateEvents, widened to clicks): YouTube Music rows play on click, cards
 *  navigate and ripple, the Wiz miniplayer expands, and its hotkeys listen on the document. */
function isolate(host: HTMLElement) {
  for (const t of STOP) host.addEventListener(t, (e) => e.stopPropagation());
}

// The one top-level host. YouTube Music fullscreens <html>, so a host on <html> is already inside the fullscreen
// element; for anything else, follow document.fullscreenElement (ticket 17's kit duty).
const host = document.createElement("pp27-kit");
host.setAttribute("style", "position:fixed;left:0;top:0;width:0;height:0;z-index:2100;display:block;");
const root = host.attachShadow({ mode: "open" });
isolate(host);
document.documentElement.append(host);
const layers = document.createElement("div");
root.append(layers);
const popoverRoot = document.createElement("div");
root.append(popoverRoot);
mount(KitLayers, { target: layers });
document.addEventListener("fullscreenchange", () => {
  const fs = document.fullscreenElement;
  (fs && fs !== document.documentElement ? fs : document.documentElement).append(host);
});

export interface SlotProps {
  place: Place | null;
  item: ItemView | null;
  settings: ClusterSettings;
  states: Partial<Record<ActionId, ButtonState>>;
  pickerOpen: boolean;
  onaction: (a: ActionId, el: HTMLElement) => void;
  onpicker: (el: HTMLElement) => void;
  onintent?: () => void;
}

/** An in-flow host. Its own element is what moves; its shadow root keeps our styles in and YouTube Music's out. */
function createSlot(kind: string, init: SlotProps) {
  const el = document.createElement("pp27-slot");
  el.dataset.pp27 = kind;
  el.setAttribute("style", "display:inline-flex;align-items:center;flex:none;");
  const r = el.attachShadow({ mode: "open" });
  isolate(el);
  const props = $state(init);
  const comp = mount(SlotView, { target: r, props });
  return {
    el,
    props,
    destroy() {
      unmount(comp);
      el.remove();
    },
  };
}
export type Slot = ReturnType<typeof createSlot>;

const kit = { host, root, popoverRoot, createSlot, toast: { show, update, undoCurrent, dismiss } };
export type Kit = typeof kit;
(globalThis as any).__pp27 ??= {};
(globalThis as any).__pp27.kit = kit;
