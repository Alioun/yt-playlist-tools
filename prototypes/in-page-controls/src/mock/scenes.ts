// THROWAWAY PROTOTYPE (ticket 14). The guided scenes the bottom bar cycles through (`?scene=`). Each puts the mock
// and the fake view in a state, then drives the real controls the way a user would (hover, click, key, right-click).
import { tick } from "svelte";
import { mock, type Page } from "./mock.svelte";
import { go } from "./nav";
import { view, toasts, flows, showToast } from "$kit";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const g = globalThis as any;

async function ready() {
  for (let i = 0; i < 100 && !g.__pp?.kit?.layer; i++) await wait(20);
  await tick();
  await wait(60);
}
function overlayButtons(): HTMLButtonElement[] {
  const h = document.querySelector("pp-overlay") as HTMLElement | null;
  return h?.shadowRoot ? [...h.shadowRoot.querySelectorAll("button")] : [];
}
function pill(): HTMLButtonElement | null {
  const h = document.querySelector("pp-inline") as HTMLElement | null;
  return (h?.shadowRoot?.querySelector("button") as HTMLButtonElement) ?? null;
}
function hover(sel: string, n = 0) {
  const el = document.querySelectorAll(sel)[n] as HTMLElement;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, composed: true, clientX: r.left + 20, clientY: r.top + 20 }));
  el.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false, clientX: r.left + 20, clientY: r.top + 20 }));
  return el;
}
function key(k: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: `Key${k.toUpperCase()}`, bubbles: true, cancelable: true, ...opts }));
}
const THUMB = "a.ytLockupViewModelContentImage";

export type Scene = { id: string; label: string; page: Page; run?: () => Promise<void> | void };

export const scenes: Scene[] = [
  { id: "home", label: "Home: hover a card", page: "home", run: async () => void hover(THUMB, 1) },
  {
    id: "home-keyboard",
    label: "Home: Tab from a thumbnail into our buttons",
    page: "home",
    run: async () => {
      (document.querySelectorAll(THUMB)[2] as HTMLElement).focus();
      await wait(80);
      overlayButtons()[0]?.focus();
    },
  },
  { id: "states", label: "Every state, side by side", page: "states" },
  {
    id: "picker",
    label: "Quick-save ▾ opens the picker",
    page: "home",
    run: async () => {
      hover(THUMB, 1);
      await wait(80);
      overlayButtons()[2]?.click();
    },
  },
  {
    id: "choose",
    label: "First save: choose mode",
    page: "home",
    run: async () => {
      view.quickSave = null;
      hover(THUMB, 3);
      await wait(80);
      overlayButtons()[1]?.click();
    },
  },
  {
    id: "toast-undo",
    label: "One click saves; the toast offers Undo",
    page: "home",
    run: async () => {
      hover(THUMB, 1);
      await wait(80);
      overlayButtons()[1]?.click();
    },
  },
  {
    id: "toast-queue",
    label: "Add to queue: Added, with Undo",
    page: "home",
    run: async () => {
      hover(THUMB, 0);
      await wait(80);
      overlayButtons()[0]?.click();
    },
  },
  {
    id: "queue-unconfirmed",
    label: "Add to queue: sent, not confirmed",
    page: "home",
    run: async () => {
      view.outcome.queue = "unconfirmed";
      hover(THUMB, 2);
      await wait(80);
      overlayButtons()[0]?.click();
    },
  },
  {
    id: "toast-failure",
    label: "A failure toast",
    page: "home",
    run: async () => {
      view.outcome.save = "missing";
      hover(THUMB, 1);
      await wait(80);
      overlayButtons()[1]?.click();
    },
  },
  {
    id: "yt-toggles",
    label: "Where YouTube draws its own Add to queue, ours steps aside",
    page: "home",
    run: async () => {
      mock.ytToggles = true;
      await tick();
      hover(THUMB, 1);
    },
  },
  {
    id: "notice",
    label: "Not working: nothing drawn, one sticky notice",
    page: "home",
    run: async () => {
      view.health.quickSave = "broken";
      view.health.queue = "broken";
      view.features.quickSave = false;
      view.features.queue = false;
      await wait(60);
      view.features.quickSave = true;
      view.features.queue = true;
      await wait(120);
      hover(THUMB, 1);
    },
  },
  { id: "watch", label: "Watch page: the button after Share", page: "watch" },
  {
    id: "watch-menu",
    label: "Watch page: the button's menu",
    page: "watch",
    run: async () => {
      await wait(200);
      pill()?.click();
    },
  },
  {
    id: "watch-plain",
    label: "Watch page without auto-add: icon only",
    page: "watch",
    run: () => void (view.features.autoAdd = false),
  },
  {
    id: "picker-key",
    label: "Alt+Shift+P on the watch page: anchored to the player",
    page: "watch",
    run: async () => {
      await wait(150);
      key("P", { altKey: true, shiftKey: true, code: "KeyP" });
    },
  },
  {
    id: "picker-key-card",
    label: "Alt+Shift+P pointing at a card: beside its thumbnail",
    page: "home",
    run: async () => {
      hover(THUMB, 4);
      await wait(80);
      key("P", { altKey: true, shiftKey: true, code: "KeyP" });
    },
  },
  {
    id: "pending",
    label: "Alt+W with a slow answer: Saving…, then the outcome",
    page: "watch",
    run: async () => {
      view.outcome.latency = 4000;
      await wait(150);
      key("w", { altKey: true, code: "KeyW" });
    },
  },
  { id: "shorts", label: "Shorts: the column button", page: "shorts" },
  {
    id: "fullscreen",
    label: "Fullscreen: Alt+W answers; auto-add's toast waits",
    page: "watch",
    run: async () => {
      await wait(150);
      (document.querySelector("[aria-label='Full screen (f)']") as HTMLElement)?.click();
      await wait(80);
      g.__pp.kit.lib.flows.add(view.watchVideo, ["PLmusic"], "auto-add");
      await wait(view.outcome.latency + 100);
      key("w", { altKey: true, code: "KeyW" });
    },
  },
  {
    id: "card-menu",
    label: "Right-click a card: YouTube's own ⋮ menu",
    page: "home",
    run: async () => {
      const el = hover(THUMB, 5)!;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 80, clientY: r.top + 60, button: 2 }));
    },
  },
  {
    id: "signed-out",
    label: "Signed out: buttons stay and answer",
    page: "home",
    run: async () => {
      view.signedIn = false;
      hover(THUMB, 1);
      await wait(80);
      overlayButtons()[1]?.click();
    },
  },
  {
    id: "hidden-tab",
    label: "A failure while the tab was hidden waits for you",
    page: "watch",
    run: async () => {
      toasts.simHidden = true;
      view.outcome.save = "fail";
      await g.__pp.kit.lib.flows.add(view.watchVideo, ["PLmusic"], "auto-add");
      showToast({ text: 'Auto-added "Something else" to Music videos', unprompted: true });
      await wait(300);
      toasts.simHidden = false;
      g.__pp.kit.lib.recheck();
    },
  },
];

export async function runScene(id: string) {
  const s = scenes.find((x) => x.id === id) ?? scenes[0];
  mock.scene = s.id;
  await go(s.page);
  await ready();
  await s.run?.();
  void flows;
}
