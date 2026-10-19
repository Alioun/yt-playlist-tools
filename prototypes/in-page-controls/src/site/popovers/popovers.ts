// THROWAWAY PROTOTYPE (ticket 14; ticket 17's site/popovers). popovers.js: the playlist picker and the watch-page
// menu, with Bits UI, loaded on first use or hover intent. It carries its own Svelte copy, so it mounts into the kit's
// layer as plain DOM and talks to the kit only through plain calls and snapshots (two Svelte copies can't nest).
import { mount, unmount } from "svelte";
import Picker from "./Picker.svelte";
import WatchMenu from "./WatchMenu.svelte";
import type { Popovers } from "../feature";

export function createPopovers(): Popovers {
  const g = globalThis as any;
  const kit = g.__pp.kit;
  const lib = kit.lib;
  let current: { app: Record<string, any>; onclose?: () => void } | null = null;

  function close() {
    if (!current) return;
    const c = current;
    current = null;
    lib.view.openLayer = null;
    // Let Bits UI finish its own close (focus return) before the DOM goes.
    setTimeout(() => unmount(c.app), 0);
    c.onclose?.();
  }

  const api: Popovers = {
    openPicker(o) {
      close();
      const app = mount(Picker, { target: kit.portal, props: { ...o, lib, close } });
      current = { app, onclose: o.onclose };
      lib.view.openLayer = "picker";
    },
    openWatchMenu(o) {
      close();
      const app = mount(WatchMenu, {
        target: kit.portal,
        props: {
          ...o,
          lib,
          close,
          openPicker: (mode: "pick" | "choose") =>
            api.openPicker({ anchor: o.anchor, video: o.video, mode, side: o.side === "left" ? "right" : "bottom", onclose: o.onclose }),
        },
      });
      current = { app, onclose: o.onclose };
      lib.view.openLayer = "watchMenu";
    },
    close,
  };
  g.__pp.popovers = api;
  return api;
}
