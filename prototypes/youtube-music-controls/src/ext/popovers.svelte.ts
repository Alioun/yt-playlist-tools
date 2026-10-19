// THROWAWAY PROTOTYPE (ticket 27, rough dev build). popovers.js: the lazy playlist picker with its own Svelte copy
// and Bits UI (tickets 17 and 24), injected by the background with scripting.executeScript on hover intent, and
// mounted into the kit's shadow host as plain DOM. Signed out here, so the playlists are fake and nothing is sent.
import { mount, unmount } from "svelte";
import PickerHost from "./PickerHost.svelte";
import { PickerModel } from "../popovers/picker-model.svelte";
import { MY_PLAYLISTS } from "../mock/data";

let current: { comp: ReturnType<typeof mount>; el: HTMLElement } | null = null;

function open(o: { portalTo: HTMLElement; anchor: HTMLElement | null; title: string; mode: "normal" | "choose"; onclose: () => void }) {
  close();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const m = new PickerModel({
    tick: async () => (await wait(400), "added"),
    untick: async () => (await wait(400), "removed"),
    pin: () => {},
    create: async (title, privacy) => (await wait(600), { id: `new-${Date.now()}`, title, privacy, count: 1 }),
    chosen: () => {},
  });
  m.rows = MY_PLAYLISTS.map((p) => ({ ...p }));
  m.mode = o.mode;
  m.quickSaveId = "pl-fav";
  m.song = { title: o.title, byline: "dev build · fake playlists", art: "linear-gradient(135deg,#444,#222)" };
  setTimeout(() => {
    m.membership = "known";
    m.contains = { "pl-road": true };
  }, 300);
  const el = document.createElement("div");
  o.portalTo.append(el);
  const centredAnchor = {
    getBoundingClientRect() {
      const bar = document.querySelector("ytmusic-player-bar, ytmusic-miniplayer")?.getBoundingClientRect();
      return new DOMRect(innerWidth / 2, bar && bar.height ? bar.top : innerHeight, 0, 0);
    },
  };
  const props = $state({
    open: true,
    model: m,
    anchor: (o.anchor ?? centredAnchor) as HTMLElement | { getBoundingClientRect(): DOMRect },
    centred: !o.anchor,
    portalTo: o.portalTo,
    onclose: () => {
      o.onclose();
      setTimeout(close, 200);
    },
  });
  current = { comp: mount(PickerHost, { target: el, props }), el };
}

function close() {
  if (!current) return;
  unmount(current.comp);
  current.el.remove();
  current = null;
}

(globalThis as any).__pp27 ??= {};
(globalThis as any).__pp27.popovers = { open, close };
