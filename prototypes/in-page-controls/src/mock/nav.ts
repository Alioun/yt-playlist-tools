// THROWAWAY PROTOTYPE (ticket 14). The mock's own YouTube behaviour: SPA navigation (with YouTube's own events, so
// our features hear them exactly as on youtube.com) and YouTube's ⋮ dropdown placement (left edge on the ⋮ button,
// 8 px below it, flipped above when there's no room).
import { mock, type Page } from "./mock.svelte";
import { tick } from "svelte";
import { view } from "$kit";

export async function go(page: Page) {
  mock.page = page;
  mock.menu = null;
  await tick();
  document.dispatchEvent(new CustomEvent("yt-navigate-finish", { detail: { pageType: page } }));
}
export const goWatch = () => go("watch");

export function openYtMenu(btn: HTMLElement) {
  const r = btn.getBoundingClientRect();
  const h = view.signedIn ? 256 : 176; // 6 or 4 items of 40 px, plus padding
  const up = r.bottom + 8 + h > innerHeight;
  mock.menu = { x: r.left, y: up ? r.top - 8 - h : r.bottom + 8, up };
}
