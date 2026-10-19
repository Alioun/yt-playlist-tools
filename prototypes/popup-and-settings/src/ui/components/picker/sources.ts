// THROWAWAY PROTOTYPE (ticket 15). PickerSources over the Backend: what the one picker model reads and does for
// each use. Views pick a source; the model and the picker component are the same everywhere.
import type { PickerSource } from "$shared/picker/model.svelte";
import type { AccountId, Site } from "$shared/model/types";
import { act, call, setupOf, shortcutTarget, ui } from "$lib/view.svelte";
import type { PickerRequest } from "./request";

/** Each playlist's shortcut key on this account, so the picker teaches the keys (ticket 08). */
export function keysFor(acct: AccountId): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of ui.s.features.shortcuts.list) {
    if (!s.key || !ui.s.features.shortcuts.on) continue;
    const t = shortcutTarget(acct, s);
    if (t && !out[t]) out[t] = s.key;
  }
  return out;
}

const base = (acct: AccountId) => ({
  list: () => call("playlists", { acct }),
  keys: () => keysFor(acct),
  marks: () => ui.s.marks,
});

/** Save mode: ticking adds the item; New playlist creates it with the item already in it. */
export function saveSource(req: Extract<PickerRequest, { mode: "save" }>): PickerSource {
  const quick = req.site === "music" ? "musicQuickSave" : "quickSave";
  return {
    ...base(req.acct),
    membership: () => call("membership", { acct: req.acct, item: req.item.id }),
    add: async (playlist) => {
      const r = await call("add", { acct: req.acct, item: req.item.id, playlist });
      // Choose mode (ticket 26): with no quick-save playlist yet, the first pick becomes it.
      if (req.setsQuickSave && r.outcome !== "failed" && !setupOf(req.acct)?.[quick])
        await act({ kind: "quickSave", acct: req.acct, site: req.site, playlist });
      return r;
    },
    remove: (playlist) => call("remove", { acct: req.acct, item: req.item.id, playlist }),
    create: (title, privacy) => call("create", { acct: req.acct, title, privacy, withItem: req.item.id }),
    pinned: () => setupOf(req.acct)?.[quick] ?? null,
    pin: (playlist) => act({ kind: "quickSave", acct: req.acct, site: req.site, playlist }),
  };
}

/** Choose mode: one playlist for a purpose; New playlist creates an empty one and selects it. */
export function chooseSource(acct: AccountId, selected: () => string | null, onchoose: (p: string) => void): PickerSource {
  return {
    ...base(acct),
    create: (title, privacy) => call("create", { acct, title, privacy }),
    chosen: () => {
      const s = selected();
      return s ? [s] : [];
    },
    choose: (p, on) => on && onchoose(p),
  };
}

/** Many: an account's auto-add playlists. */
export function autoAddSource(acct: AccountId): PickerSource {
  return {
    ...base(acct),
    create: (title, privacy) => call("create", { acct, title, privacy }),
    chosen: () => setupOf(acct)?.autoAdd ?? [],
    choose: (playlist, on) => act({ kind: "autoAddPlaylist", acct, playlist, on }),
  };
}

export const siteOf = (req: PickerRequest): Site => req.site;
