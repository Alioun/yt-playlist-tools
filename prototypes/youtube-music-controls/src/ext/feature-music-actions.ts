// THROWAWAY PROTOTYPE (ticket 27, rough dev build). feature-music-actions.js plus a sliver of music-keys: one
// moving host for rows, cards and queue items (variant A: in the item's own layout), the header group, the
// player-bar Save, the toasts with Undo, and Alt keys. Settings come from localStorage "pp27" (dev only).
import type { Core } from "./core-music";
import type { Kit, Slot, SlotProps } from "./kit-music.svelte";
import type { ItemInfo } from "./protocol";
import { anchorOf, barAnchor, NARROW_TITLE_PX, type Item } from "./items-music";
import { copy } from "../kit/copy";
import type { ActionId, ButtonState, ClusterSettings, ItemView } from "../kit/model";

const { core, kit } = (globalThis as any).__pp27 as { core: Core; kit: Kit };
const log: unknown[] = ((globalThis as any).__pp27.log = []);

const dev = (() => {
  try {
    return JSON.parse(localStorage.getItem("pp27") ?? "{}");
  } catch {
    return {};
  }
})();

/** Dev settings. "pretendSignedIn" draws Save and Like (visual only, nothing is sent) to check their placement. */
const settings: ClusterSettings & { barSave: boolean } = {
  buttons: { playNext: true, addToQueue: true, save: false, like: false, remove: false, ...dev.buttons },
  barSave: !!dev.barSave,
  quickSave: dev.quickSave === null ? null : { id: "pl-fav", title: "Favourites" },
  keys: { playNext: "Alt+N", addToQueue: "Alt+Q", save: "Alt+P", picker: "Alt+Shift+P", like: "Alt+L", remove: "Alt+R" },
  signedIn: false,
  casting: false,
  broken: {},
};

const scope = new core.Scope();
/** Our hosts sit inside YouTube Music's own elements, where its rules for children (sizes, absolute positions) can
 *  reach them. Found on real cards: reset everything inline, then set what we need. */
const RESET = "all:initial;display:inline-flex;align-items:center;";
const states: Record<string, Partial<Record<ActionId, ButtonState>>> = {};
let probe: any = null;

function viewOf(info: ItemInfo, key: string): ItemView {
  const offered = { ...info.offered };
  if (dev.pretendSignedIn && (info.kind === "song" || info.kind === "video")) offered.save = offered.like = true;
  return {
    key,
    kind: info.kind === "unknown" ? "song" : info.kind,
    title: info.title,
    offered,
    hasOwnLike: info.hasOwnLike,
    liked: info.liked,
    queue: info.queue ? { playing: info.queue.playing, autoplay: info.queue.autoplay } : undefined,
    count: info.count,
  };
}

// ------------------------------------------------------------------------------------------------------------
// The one moving host (ticket 24: one overlay per page; ticket 27: it joins the item's own layout).

let moving: Slot | null = null;
let current: { item: Item; info: ItemInfo; key: string; elKey: string } | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const keyOf = (el: Element) => ((el as any).__pp27key ??= `i${Math.random().toString(36).slice(2, 8)}`);

function slotProps(): SlotProps {
  return {
    place: null,
    item: null,
    settings: { ...settings, signedIn: settings.signedIn || !!dev.pretendSignedIn },
    states: {},
    pickerOpen: false,
    onaction: (a, el) => current && act(current, a, el, false),
    onpicker: (el) => current && openPicker(current, el),
    onintent: preloadPopovers,
  };
}

/** YouTube Music recycles item elements (a queue move re-renders every item), so a control's state is keyed by the
 *  item's identity from itemInfo, never by the element, and itemInfo is read again after every queue job. */
const identity = (elKey: string, info: ItemInfo) => (info.queue ? `q:${info.queue.itemId}` : `${elKey}:${info.title}`);

async function show(item: Item, force = false) {
  clearTimeout(hideTimer);
  if (item.type === "header") return; // the header group is always there
  const elKey = keyOf(item.el);
  if (!force && current?.elKey === elKey && moving?.el.isConnected) return;
  let info: ItemInfo;
  try {
    info = await core.run<ItemInfo>({ job: "itemInfo" }, item.el);
  } catch (e) {
    log.push({ what: "itemInfo failed", type: item.type, error: String(e) });
    return;
  }
  const key = identity(elKey, info);
  const a = anchorOf(item);
  if (!a) return log.push({ what: "anchor missing", type: item.type });
  moving ??= scope_slot("moving");
  const before = titleWidth(item);
  if (a.mode === "corner") {
    moving.el.style.cssText = `${RESET}position:absolute;left:8px;bottom:17px;z-index:3;`;
    a.parent.append(moving.el);
  } else {
    moving.el.style.cssText = `${RESET}flex:none;margin:0 ${item.type === "queue" ? "4px 0 8px" : "8px"};`;
    a.parent.insertBefore(moving.el, a.before);
  }
  current = { item, info, key, elKey };
  Object.assign(moving.props, {
    place: item.type === "card" ? "card" : item.type === "queue" ? "queue" : "row",
    item: viewOf(info, key),
    states: states[key] ?? {},
    pickerOpen: false,
  });
  requestAnimationFrame(() => {
    const after = titleWidth(item);
    if (after !== null && after < NARROW_TITLE_PX && moving && current?.key === key) moving.props.item = { ...viewOf(info, key), nameInTip: true };
    log.push({ what: "attached", type: item.type, kind: info.kind, title: info.title.slice(0, 30), offered: info.offered, titleBefore: before, titleAfter: after, narrow: after !== null && after < NARROW_TITLE_PX });
  });
}

function refresh() {
  if (current) void show(current.item, true);
}

function titleWidth(item: Item): number | null {
  const t = item.el.querySelector(".title-column, .song-info, .title") as HTMLElement | null;
  return t ? Math.round(t.getBoundingClientRect().width) : null;
}

function hide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (pickerIsOpen) return;
    moving?.el.remove();
    current = null;
  }, 120);
}

function scope_slot(kind: string): Slot {
  const s = kit.createSlot(kind, slotProps());
  scope.add(() => s.destroy());
  return s;
}

function setState(key: string, a: ActionId, s: ButtonState | undefined, hold = 1500) {
  const st = (states[key] ??= {});
  if (s) st[a] = s;
  else delete st[a];
  for (const slot of [moving, header, bar]) if (slot && (slot.props.item as ItemView | null)?.key === key) slot.props.states = { ...st };
  if (s === "done" || s === "failed") setTimeout(() => states[key]?.[a] === s && setState(key, a, undefined), hold);
}

// ------------------------------------------------------------------------------------------------------------
// Actions

async function act(c: { item: Item; info: ItemInfo; key: string; elKey?: string }, a: ActionId, _el: HTMLElement | null, viaKey: boolean) {
  const { info, key } = c;
  const t = info.title;
  if ((a === "playNext" || a === "addToQueue") && settings.casting) return kit.toast.show({ kind: "neutral", text: copy.casting });
  if (a === "playNext" || a === "addToQueue") {
    if (info.queue && !info.queue.playing) {
      // Ticket 28: on a queue item these move it.
      if (info.queue.autoplay) return kit.toast.show({ kind: "neutral", text: copy.autoplayCantMove });
      setState(key, a, "busy");
      try {
        const r: any = await core.run({ job: "queueMove", itemId: info.queue.itemId, to: a === "playNext" ? "next" : "end" });
        if (r.result === "already") {
          setState(key, a, undefined);
          return kit.toast.show({ kind: "neutral", text: a === "playNext" ? copy.alreadyNext(t) : copy.alreadyEnd(t) });
        }
        // The item has moved away from under the pointer: the toast is the feedback, and the row now holds another song.
        setState(key, a, undefined);
        refresh();
        kit.toast.show({
          kind: "confirm",
          text: a === "playNext" ? copy.movedNext(t) : copy.movedEnd(t),
          action: { label: "Undo", isUndo: true, run: () => core.run({ job: "queueMove", itemId: info.queue!.itemId, to: r.from }).then(() => (refresh(), true), () => false) },
        });
      } catch (e) {
        setState(key, a, "failed");
        log.push({ what: "move failed", error: String(e) });
        kit.toast.show({ kind: "failure", text: copy.failMove(t) });
      }
      return;
    }
    if (!info.target) return kit.toast.show({ kind: "failure", text: copy.failQueue(t) });
    if (!viaKey || c.item.el.isConnected) setState(key, a, "busy");
    try {
      const r: any = await core.run({ job: "queueInsert", target: info.target, position: a === "playNext" ? "INSERT_AFTER_CURRENT_VIDEO" : "INSERT_AT_END" });
      setState(key, a, "done");
      if (r.started) return kit.toast.show({ kind: "confirm", text: copy.playing(t) });
      const block = info.kind === "album" || info.kind === "playlist" ? { count: r.count } : undefined;
      kit.toast.show({
        kind: "confirm",
        text: a === "playNext" ? copy.playNext(t, block) : copy.addToQueue(t, block),
        action: { label: "Undo", isUndo: true, run: () => core.run({ job: "queueRemoveIds", itemIds: r.ids }).then(() => (refresh(), true), () => false) },
      });
      log.push({ what: a, inserted: r.count, index: r.index });
    } catch (e) {
      setState(key, a, "failed");
      log.push({ what: "insert failed", error: String(e) });
      kit.toast.show({ kind: "failure", text: copy.failQueue(t) });
    }
    return;
  }
  if (a === "remove") {
    if (!info.queue) return kit.toast.show({ kind: "neutral", text: copy.pointAtQueue });
    setState(key, a, "busy");
    try {
      const r: any = await core.run({ job: "queueRemove", itemId: info.queue.itemId });
      setState(key, a, undefined);
      refresh();
      kit.toast.show({
        kind: "confirm",
        text: copy.removed(t),
        action: { label: "Undo", isUndo: true, run: () => core.run({ job: "queueReinsert", videoId: r.videoId, index: r.index }).then(() => (refresh(), true), () => false) },
      });
    } catch (e) {
      setState(key, a, "failed");
      kit.toast.show({ kind: "failure", text: copy.failRemove(t) });
    }
    return;
  }
  // Save and Like: signed out on this machine, so only their look is checked (dev "pretendSignedIn"). Nothing is sent.
  if (!dev.pretendSignedIn) return kit.toast.show({ kind: "neutral", text: a === "save" ? copy.signInSave : copy.signInLike });
  setState(key, a, "busy");
  setTimeout(() => {
    setState(key, a, "done");
    if (a === "save") kit.toast.show({ kind: "confirm", text: copy.saved(t, settings.quickSave?.title ?? "Favourites") + " (dev build: not sent)", action: { label: "Undo", isUndo: true, run: () => true } });
    else if (viaKey) kit.toast.show({ kind: "confirm", text: copy.liked(t) + " (dev build: not sent)" });
  }, 500);
}

// ------------------------------------------------------------------------------------------------------------
// The lazy picker (popovers.js), injected by the background on hover intent.

let pickerIsOpen = false;
let popoversRequested = false;
function preloadPopovers() {
  if (popoversRequested || (globalThis as any).__pp27.popovers) return;
  popoversRequested = true;
  const t0 = performance.now();
  (globalThis as any).chrome?.runtime
    ?.sendMessage({ type: "pp27:popovers" })
    .then(() => log.push({ what: "popovers injected", ms: Math.round(performance.now() - t0) }))
    .catch((e: unknown) => ((popoversRequested = false), log.push({ what: "popovers failed", error: String(e) })));
}
async function waitPopovers() {
  preloadPopovers();
  // Ticket 14: a 5 s loader timeout, then a visible failure on an explicit click.
  for (let i = 0; i < 125 && !(globalThis as any).__pp27.popovers; i++) await new Promise((r) => setTimeout(r, 40));
  return (globalThis as any).__pp27.popovers;
}
async function openPicker(c: { item: Item; info: ItemInfo; key: string; elKey?: string } | null, anchor: HTMLElement | null) {
  const pop = await waitPopovers();
  if (!pop) {
    log.push({ what: "popovers never loaded" });
    return kit.toast.show({ kind: "failure", text: "Couldn't open the playlist list. Try again." });
  }
  pickerIsOpen = true;
  const t0 = performance.now();
  pop.open({
    portalTo: kit.popoverRoot,
    anchor,
    title: c?.info.title ?? "the playing song",
    mode: settings.quickSave ? "normal" : "choose",
    onclose: () => {
      pickerIsOpen = false;
    },
  });
  requestAnimationFrame(() => requestAnimationFrame(() => log.push({ what: "picker painted", ms: Math.round(performance.now() - t0), centred: !anchor })));
}

// ------------------------------------------------------------------------------------------------------------
// Header group (always visible on album and playlist pages) and the player-bar Save.

let header: Slot | null = null;
let bar: Slot | null = null;
async function syncHeader() {
  const h = document.querySelector("ytmusic-responsive-header-renderer") as HTMLElement | null;
  const a = h && anchorOf({ el: h, type: "header" });
  if (!h || !a || !h.offsetParent) {
    header?.el.remove();
    return;
  }
  if (header?.el.isConnected && header.el.parentElement === a.parent) return;
  let info: ItemInfo;
  try {
    info = await core.run<ItemInfo>({ job: "itemInfo" }, h);
  } catch {
    return;
  }
  if (!info.offered.playNext && !info.offered.addToQueue) return;
  header ??= scope_slot("header");
  header.el.style.cssText = `${RESET}flex:none;margin:0 12px 0 0;`;
  a.parent.insertBefore(header.el, a.before);
  const key = keyOf(h);
  Object.assign(header.props, {
    place: "header",
    item: viewOf(info, key),
    onaction: (act_: ActionId, el: HTMLElement) => act({ item: { el: h, type: "header" }, info, key }, act_, el, false),
  });
  log.push({ what: "header attached", title: info.title, count: info.count, offered: info.offered });
}

async function syncBar() {
  if (!settings.barSave || !(settings.signedIn || dev.pretendSignedIn)) return bar?.el.remove();
  const a = barAnchor();
  if (!a) {
    bar?.el.remove();
    return;
  }
  if (bar?.el.isConnected && bar.el.nextElementSibling === a.before) return;
  const np: any = await core.run({ job: "nowPlaying" }).catch(() => null);
  if (!np) return;
  bar ??= scope_slot("bar");
  bar.el.style.cssText = `${RESET}flex:none;margin-right:8px;`;
  a.parent.insertBefore(bar.el, a.before);
  const info: ItemInfo = { kind: "song", title: np.title, offered: { save: true }, hasOwnLike: true, liked: false, menu: [], target: { videoId: np.videoId } };
  const key = "bar";
  Object.assign(bar.props, {
    place: a.kind === "wiz" ? "wiz" : "bar",
    item: viewOf(info, key),
    onaction: (act_: ActionId, el: HTMLElement) => act({ item: { el: a.before as HTMLElement, type: "row" }, info, key }, act_, el, false),
    onpicker: (el: HTMLElement) => openPicker({ item: { el: a.before as HTMLElement, type: "row" }, info, key }, el),
  });
  log.push({ what: "bar save attached", kind: a.kind });
}

// ------------------------------------------------------------------------------------------------------------
// Keys (quick-action shortcuts): the pointed-at item, else the playing song.

function onKey(e: KeyboardEvent) {
  if (e.repeat || e.isComposing || !e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.composedPath()[0] as HTMLElement;
  if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
  const k = e.code.replace(/^Key/, "").toLowerCase();
  const map: Record<string, ActionId | "picker" | "undo"> = e.shiftKey ? { p: "picker" } : { n: "playNext", q: "addToQueue", p: "save", l: "like", r: "remove", u: "undo" };
  const action = map[k];
  if (!action) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (action === "undo") return void kit.toast.undoCurrent();
  if (pickerIsOpen) return;
  const p = tracker.current();
  const run = async () => {
    let item = p.item;
    if (!item) {
      // The playing song: its queue item.
      const sel = document.querySelector("ytmusic-player-queue-item[selected], ytmusic-player-queue #contents ytmusic-player-queue-item[play-button-state='playing'], ytmusic-player-queue #contents ytmusic-player-queue-item[play-button-state='paused']") as HTMLElement | null;
      if (!sel) return kit.toast.show({ kind: "neutral", text: copy.nothingPlaying });
      item = { el: sel, type: "queue" };
    }
    let info: ItemInfo;
    try {
      info = await core.run<ItemInfo>({ job: "itemInfo" }, item.el);
    } catch {
      return kit.toast.show({ kind: "failure", text: copy.unrecognised });
    }
    const c = { item, info, key: identity(keyOf(item.el), info) };
    if (action === "picker") return openPicker(c, current?.key === c.key ? (moving?.el ?? null) : null);
    // Nothing pointed at, and the playing song: Play next / Add to queue insert a copy, as YouTube Music's own menu does.
    if (!p.item && (action === "playNext" || action === "addToQueue")) c.info = { ...info, queue: undefined };
    act(c, action, null, true);
  };
  void run();
}
const tracker = core.track(scope, (p) => (p.item ? show(p.item) : hide()));
scope.on(window, "keydown", onKey as EventListener, { capture: true });

// ------------------------------------------------------------------------------------------------------------
// Start: probe the gateway, then follow the page. Rough build: one observer on the app layout, throttled.

(async () => {
  for (let i = 0; i < 40; i++) {
    probe = await core.run({ job: "probe" }).catch(() => null);
    if (probe?.app && probe?.queue) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  settings.signedIn = !!probe?.signedIn;
  log.push({ what: "probe", ...probe });
  let pend = false;
  const sync = () => {
    if (pend) return;
    pend = true;
    requestAnimationFrame(() => {
      pend = false;
      void syncHeader();
      void syncBar();
    });
  };
  const layout = document.querySelector("ytmusic-app") ?? document.body;
  scope.observe(layout, { childList: true, subtree: true }, sync);
  sync();
  scope.timeout(() => log.push({ what: "page settle", ...core.pageSettleCheck() }), core.SETTLE_MS);
})();

// Dev hooks for the screenshot driver (dev build only): show the sticky notice, publish the log.
scope.on(document, "pp27:dev", ((e: CustomEvent) => {
  const cmd = String(e.detail);
  if (cmd === "notice") kit.toast.show({ kind: "notice", text: copy.notice(["Play next", "Add to queue"]), action: { label: "Details", run: () => true } });
  if (cmd === "log") document.documentElement.dataset.pp27log = JSON.stringify(log);
  if (cmd === "dispose") scope.dispose();
}) as EventListener);

(globalThis as any).__pp27.feature = { settings, dispose: () => scope.dispose() };
