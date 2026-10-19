// THROWAWAY PROTOTYPE (ticket 15). The fake Backend adapter (ticket 17's `ui/backend/fake.ts`): in-memory, scripted
// by `?s=<scenario>`, with small latencies so loading states show. Pages in the harness follow each other through a
// BroadcastChannel, standing in for storage.onChanged.
//
// URL parameters: s=<scenario> theme=light|dark variant=A|B|C open=<part> os=mac|windows|linux browser=chrome|firefox
import type { Backend, Change, ChangeResult, UiArgs, UiCall, UiEvent, UiResult, UiSnapshot } from "./backend";
import { seed } from "./fake/seed";
import type { AccountId, Doc, Setup, Site } from "$shared/model/types";

import { param } from "$lib/params";
export { param };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function initial(): Doc {
  const d = seed(param("s"));
  const os = param("os");
  if (os === "mac" || os === "windows" || os === "linux") d.env.os = os;
  const browser = param("browser");
  if (browser === "chrome" || browser === "firefox") d.env.browser = browser;
  return d;
}

/** The simulated browser permission prompt. Browser chrome, not product UI: `FakePrompt.svelte` draws it. */
export const fakePrompt: {
  site: Site | null;
  browser: "chrome" | "firefox";
  resolve: ((ok: boolean) => void) | null;
  listeners: Set<() => void>;
} = {
  site: null,
  browser: "chrome",
  resolve: null,
  listeners: new Set(),
};

export function createFakeBackend(): Backend {
  const doc = initial();
  const subs = new Set<(e: UiEvent) => void>();
  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`pigeon-proto:${doc.scenario}`) : null;
  const snapshot = (): UiSnapshot => {
    const { thisVideo: _v, playing: _p, ...rest } = clone(doc);
    return rest;
  };
  const emit = (fromOtherPage = false) => {
    const snap = snapshot();
    for (const fn of subs) fn({ kind: "changed", snapshot: snap });
    if (!fromOtherPage) bc?.postMessage(JSON.stringify(doc));
  };
  if (bc)
    bc.onmessage = (e) => {
      Object.assign(doc, JSON.parse(e.data));
      emit(true);
    };

  const ensureSetup = (a: AccountId): Setup =>
    (doc.setups[a] ??= { autoAdd: [], options: {}, filters: {}, shortcutTargets: {}, quickSave: null, musicQuickSave: null });

  /** Ticket 11: nothing from a private window's session is written; ticket 16: over the sync budget is refused. */
  function refusal(c: Change): ChangeResult | null {
    const setupWrite = "acct" in c && c.kind !== "removeSetup";
    if (doc.env.privateWindow && setupWrite) return { ok: false, refused: "private" };
    const grows =
      (c.kind === "filter" && c.filter.channels.length > (doc.setups[c.acct]?.filters[c.playlist]?.channels.length ?? 0)) ||
      (c.kind === "autoAddPlaylist" && c.on) ||
      c.kind === "shortcutAdd";
    if (doc.sync.on && doc.sync.status === "full" && grows) return { ok: false, refused: "sync-full" };
    return null;
  }

  function apply(c: Change) {
    const f = doc.features;
    switch (c.kind) {
      case "feature":
        f[c.id].on = c.on;
        if (c.id === "autoAdd" && !c.on) f.autoAdd.paused = false;
        // Ticket 08: presets apply the first time a shortcut feature is turned on.
        if (c.id === "shortcuts" && c.on && f.shortcuts.list.length === 0)
          f.shortcuts.list.push({ id: "k1", label: "", key: "Alt+W", watchLaterEverywhere: true });
        break;
      case "featureOption":
        (f[c.id] as unknown as Record<string, unknown>)[c.option] = c.value;
        break;
      case "pause":
        f.autoAdd.paused = c.paused;
        break;
      case "skipVideo":
        if (doc.thisVideo) doc.thisVideo.skipped = c.skip;
        break;
      case "musicSection":
        doc.musicSection = c.on;
        break;
      case "musicButton":
        f.musicQuickActions.buttons[c.button] = c.on;
        break;
      case "musicKey":
        f.musicShortcuts.keys[c.action] = c.key;
        break;
      case "key":
        if (c.which === "picker") f.shortcuts.pickerKey = c.key;
        else doc.undoKey = c.key;
        break;
      case "autoAddPlaylist": {
        const s = ensureSetup(c.acct);
        s.autoAdd = c.on ? [...new Set([...s.autoAdd, c.playlist])] : s.autoAdd.filter((x) => x !== c.playlist);
        break;
      }
      case "playlistOptions": {
        const s = ensureSetup(c.acct);
        const o = (s.options[c.playlist] ??= { takes: "videos", percent: null });
        if (c.takes) o.takes = c.takes;
        if (c.percent !== undefined) o.percent = c.percent;
        break;
      }
      case "filter":
        ensureSetup(c.acct).filters[c.playlist] = clone(c.filter);
        break;
      case "shortcutAdd":
        f.shortcuts.list.push({ id: `k${Date.now().toString(36)}`, label: "", key: "" });
        break;
      case "shortcut": {
        const s = f.shortcuts.list.find((x) => x.id === c.id);
        if (s && c.key !== undefined) s.key = c.key;
        if (s && c.label !== undefined) s.label = c.label;
        break;
      }
      case "shortcutRemove":
        f.shortcuts.list = f.shortcuts.list.filter((s) => s.id !== c.id);
        for (const s of Object.values(doc.setups)) if (s) delete s.shortcutTargets[c.id];
        break;
      case "shortcutRestore":
        f.shortcuts.list.splice(c.at, 0, clone(c.shortcut));
        for (const [a, t] of c.targets) ensureSetup(a).shortcutTargets[c.shortcut.id] = t;
        break;
      case "shortcutTarget": {
        const s = f.shortcuts.list.find((x) => x.id === c.id);
        if (!s) break;
        // Ticket 08: Watch later applies to every account without its own choice; others are per account.
        if (c.playlist === "WL") {
          s.watchLaterEverywhere = true;
          if (doc.setups[c.acct]) delete doc.setups[c.acct]!.shortcutTargets[c.id];
        } else if (!c.playlist) {
          if (doc.setups[c.acct]) delete doc.setups[c.acct]!.shortcutTargets[c.id];
        } else ensureSetup(c.acct).shortcutTargets[c.id] = c.playlist;
        break;
      }
      case "quickSave":
        ensureSetup(c.acct)[c.site === "music" ? "musicQuickSave" : "quickSave"] = c.playlist;
        break;
      case "removeChosen": {
        const s = doc.setups[c.acct];
        if (!s) break;
        s.autoAdd = s.autoAdd.filter((p) => p !== c.playlist);
        for (const k of Object.keys(s.shortcutTargets)) if (s.shortcutTargets[k] === c.playlist) delete s.shortcutTargets[k];
        if (s.quickSave === c.playlist) s.quickSave = null;
        if (s.musicQuickSave === c.playlist) s.musicQuickSave = null;
        delete doc.marks[c.playlist];
        break;
      }
      case "removeSetup":
        delete doc.setups[c.acct];
        if (doc.showing === c.acct) doc.showing = null;
        break;
      case "removeKeptFilters":
        for (const s of Object.values(doc.setups))
          if (s) for (const p of Object.keys(s.filters)) if (!s.autoAdd.includes(p)) delete s.filters[p];
        if (doc.sync.status === "full") doc.sync.status = "ok";
        break;
      case "theme":
        doc.theme = c.theme;
        break;
      case "sync":
        doc.sync.on = c.on;
        if (c.on) {
          doc.sync.status = "looking";
          setTimeout(() => {
            doc.sync.status = "ok";
            doc.sync.joinedBefore = true;
            emit();
          }, 1800);
        }
        break;
      case "consent":
        doc.consent = c.accepted ? "accepted" : "pending";
        doc.consentAt = c.accepted ? "19 October 2026" : null;
        if (c.accepted && doc.upgrade === "pending") doc.upgrade = "accepted";
        for (const id of c.turnOn ?? []) f[id].on = true;
        break;
      case "discardUnclaimed":
        doc.unclaimed = null;
        break;
      case "dismiss":
        if (c.notice === "claim") doc.claimNotice = null;
        else doc.remoteReset = false;
        break;
      case "detailedLog":
        doc.detailedLog = c.on;
        break;
    }
  }

  return {
    async load() {
      return snapshot();
    },
    watch(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    async change(c) {
      const refused = refusal(c);
      if (refused) return refused;
      apply(c);
      emit();
      return { ok: true };
    },
    async call<K extends UiCall>(kind: K, a: UiArgs<K>): Promise<UiResult<K>> {
      const { runCall } = await import("./fake/calls");
      return runCall(kind, a, doc, emit);
    },
    access: {
      async has(site) {
        return doc.env.access[site];
      },
      request(site) {
        return new Promise<boolean>((resolve) => {
          fakePrompt.site = site;
          fakePrompt.browser = doc.env.browser;
          fakePrompt.resolve = (ok) => {
            if (ok) {
              // Firefox's youtube.com grant covers YouTube Music too (one host pattern, ticket 10).
              if (doc.env.browser === "firefox") doc.env.access = { youtube: true, music: true };
              else doc.env.access[site] = true;
              emit();
            }
            fakePrompt.site = null;
            fakePrompt.resolve = null;
            for (const l of fakePrompt.listeners) l();
            resolve(ok);
          };
          for (const l of fakePrompt.listeners) l();
        });
      },
    },
  };
}
