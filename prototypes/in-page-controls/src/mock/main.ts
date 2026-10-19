// THROWAWAY PROTOTYPE (ticket 14). The hi-fi mock: mock YouTube pages first, then the same modules the dev build
// registers on youtube.com (gateway, site core, kit, features), in one bundle here. popovers.js loads on first use
// through a dynamic import (the extension injects it with scripting.executeScript instead).
import { mount } from "svelte";
import App from "./App.svelte";
import Gallery from "./Gallery.svelte";
import { mock } from "./mock.svelte";
import { applyTheme } from "./yt-theme";
import { runScene } from "./scenes";
import { startPage } from "../page/start";
import { createCore } from "../site/core/core";
import { createKit } from "../site/kit/kit.svelte";
import { createHost } from "../site/kit/host";
import { definePageFeature } from "../site/feature";
import { shortcuts } from "../site/features/shortcuts/feature";
import { quickSave } from "../site/features/quick-save/feature";
import { queueButton } from "../site/features/queue-button/feature";
import { watchButton } from "../site/features/watch-button/feature";
import { cardMenu } from "../site/features/card-menu/feature";
import { installDevHooks } from "../site/proto/dev";
import { view } from "../site/proto/view.svelte";

const params = new URLSearchParams(location.search);
const v = params.get("variant");
view.look = v === "B" || v === "C" ? v : "A";
applyTheme(mock.theme, mock.varsPresent);
(window as any).ytcfg = { get: (k: string) => (k === "LOGGED_IN" ? view.signedIn : undefined) };

let galleryMounted = false;
async function gallery(el: HTMLElement) {
  if (galleryMounted) return;
  galleryMounted = true;
  const h = await createHost("pp-gallery");
  el.append(h.host);
  mount(Gallery, { target: h.root });
}

mount(App, { target: document.getElementById("app")!, props: { gallery } });

startPage(window);
const core = createCore();
core.setPopoversLoader(async () => {
  const m = await import("../site/popovers/popovers");
  return (globalThis as any).__pp.popovers ?? m.createPopovers();
});
createKit(core);
installDevHooks();
for (const f of [shortcuts, quickSave, queueButton, watchButton, cardMenu]) definePageFeature(f);
void runScene(mock.scene);
