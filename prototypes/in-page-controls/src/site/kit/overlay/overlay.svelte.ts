// THROWAWAY PROTOTYPE (ticket 14; ticket 17's kit overlay). One overlay per page for every thumbnail button
// (ticket 24), whichever features fill it: quick-save and Add to queue register slots, and the overlay draws the
// accepted slots for the pointed-at card, stacked at the thumbnail's top-left (ticket 09: queue above quick-save),
// mirroring YouTube's own hover toggles at the top-right (32 px, 4 px in, 4 px apart).
//
// Placement: the overlay's host is moved into the card, right after the thumbnail link, and absolutely positioned on
// the visible thumbnail's corner. It scrolls with the card for free (no scroll or rAF work), and Tab from the
// thumbnail link reaches our buttons next (keyboard reach, ticket 24's open question).
//
// Search results: YouTube plays an inline preview in a layer outside the card (ytd-app > #video-preview), above
// anything inside the card. While that preview covers the card, the host moves into the preview's own element.
import { mount } from "svelte";
import OverlayView from "./Overlay.svelte";
import { createHost } from "../host";
import type { Item } from "../../core/items-www";
import type { Core } from "../../core/core";

export type OverlaySlot = { id: string; order: number; accepts(item: Item): boolean; component: any };

const INSET = 4;
const SMALL = 100; // thumbnails shorter than this (the playlist panel's 56 px) get a row instead of a stack
/** Pointer-ish events stop at our host so YouTube's card (ripple, navigation) never sees a click on our buttons. */
const STOPPED = ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "auxclick"];

function visiblePreviewOver(box: DOMRect): HTMLElement | null {
  const p = document.querySelector("#video-preview ytd-video-preview") as HTMLElement | null;
  if (!p || getComputedStyle(p).opacity === "0") return null;
  const r = p.getBoundingClientRect();
  if (r.width < 40 || r.height < 40) return null;
  const ix = Math.min(r.right, box.right) - Math.max(r.left, box.left);
  const iy = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
  return ix > box.width * 0.8 && iy > box.height * 0.8 ? p : null;
}

function positionIn(host: HTMLElement, box: DOMRect) {
  const op = host.offsetParent as HTMLElement | null;
  const ref = op ? op.getBoundingClientRect() : new DOMRect(-scrollX, -scrollY, 0, 0);
  const top = box.top - ref.top - (op?.clientTop ?? 0) + (op?.scrollTop ?? 0) + INSET;
  const left = box.left - ref.left - (op?.clientLeft ?? 0) + (op?.scrollLeft ?? 0) + INSET;
  host.style.top = `${Math.round(top)}px`;
  host.style.left = `${Math.round(left)}px`;
}

export function createOverlay(core: Core) {
  const state = $state({ slots: [] as OverlaySlot[], item: null as Item | null, row: false, small: false, rev: 0 });
  let holds = 0;
  let host: HTMLElement | null = null;
  let disposeHost: (() => void) | null = null;
  let stopTrack: (() => void) | null = null;
  let unsub: (() => void) | null = null;
  let previewMo: MutationObserver | null = null;
  let creating: Promise<void> | null = null;

  async function ensureHost() {
    if (host) return;
    creating ??= createHost("pp-overlay", ":host{position:absolute;z-index:201;}").then(({ host: h, shadow, root, dispose }) => {
      host = h;
      disposeHost = dispose;
      for (const t of STOPPED) shadow.addEventListener(t, (e) => e.stopPropagation());
      core.pointer.own(h, () => state.item);
      mount(OverlayView, { target: root, props: { state } });
    });
    await creating;
  }

  function detach() {
    host?.remove();
    state.item = null;
  }

  function place(item: Item | null) {
    if (!item || item.kind === "unsupported" || !item.videoId || !item.thumb) return detach();
    if (!state.slots.some((s) => s.accepts(item))) return detach();
    const thumb = item.thumb as HTMLElement;
    const boxEl = (item.box ?? thumb) as HTMLElement;
    const box = boxEl.getBoundingClientRect();
    if (!box.width || !box.height) return detach();
    if (!host) return void ensureHost().then(() => place(core.pointer.current()));
    watchPreview();
    const preview = visiblePreviewOver(box);
    if (preview) {
      if (host.parentElement !== preview) preview.append(host);
      positionIn(host, box);
    } else {
      if (host.previousElementSibling !== thumb) thumb.after(host);
      positionIn(host, box);
    }
    state.small = box.height < SMALL;
    const fresh = state.item?.el !== item.el;
    state.item = item;
    // YouTube adds its own hover toggles, and starts search's inline preview, a little after the pointer arrives
    // (100–700 ms on live YouTube): look again twice, so deferring slots step aside and the host follows the preview.
    if (fresh) {
      rechecks.forEach(clearTimeout);
      rechecks = [150, 900].map((ms) =>
        setTimeout(() => {
          if (state.item?.el !== item.el || holds) return;
          state.rev += 1;
          place(item);
        }, ms),
      );
    }
  }
  let rechecks: ReturnType<typeof setTimeout>[] = [];

  const onChange = () => {
    if (holds) return;
    place(core.pointer.current());
  };

  /** YouTube creates its one inline-preview element on the first hover, then moves and shows it per card: follow it
   *  (one element, attributes only), attached lazily once it exists. */
  let previewEl: Element | null = null;
  function watchPreview() {
    const p = document.querySelector("#video-preview ytd-video-preview");
    if (!p || p === previewEl) return;
    previewMo?.disconnect();
    previewEl = p;
    previewMo = new MutationObserver(() => state.item && !holds && place(state.item));
    previewMo.observe(p, { attributes: true, attributeFilter: ["style", "active", "playing", "hidden"] });
  }

  function start() {
    stopTrack = core.pointer.track();
    unsub = core.pointer.subscribe(onChange);
  }
  function stop() {
    unsub?.();
    stopTrack?.();
    previewMo?.disconnect();
    unsub = stopTrack = previewMo = null;
    previewEl = null;
    detach();
    disposeHost?.();
    host = null;
    disposeHost = null;
    creating = null;
  }

  return {
    state,
    /** A feature's slot; the returned function (for its scope) removes it. */
    register(slot: OverlaySlot): () => void {
      state.slots = [...state.slots, slot].sort((a, b) => a.order - b.order);
      if (state.slots.length === 1) start();
      onChange();
      return () => {
        // $state proxies the slot objects, so compare by id, never by identity.
        state.slots = state.slots.filter((s) => s.id !== slot.id);
        if (!state.slots.length) stop();
        else onChange();
      };
    },
    /** Keep the overlay on its card while a popover opened from it is open. */
    hold(on: boolean) {
      holds += on ? 1 : -1;
      if (!holds) onChange();
    },
  };
}
export type Overlay = ReturnType<typeof createOverlay>;
