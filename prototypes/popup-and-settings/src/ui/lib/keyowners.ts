// THROWAWAY PROTOTYPE (ticket 15). Every key in use, for the recorder's "already used by" check (ticket 08: one key,
// one shortcut, per site). Only the recorder needs it, so it loads with the recorder, not the popup's first view.
import type { Change } from "$ui/backend/backend";
import { shortcutName, ui } from "./view.svelte";

export interface KeyOwner {
  id: string;
  name: string;
  site: "youtube" | "music" | "both";
  key: string;
  clear: Change;
}

export function keyOwners(): KeyOwner[] {
  const f = ui.s.features;
  const out: KeyOwner[] = f.shortcuts.list.map((s) => ({
    id: `shortcut:${s.id}`,
    name: shortcutName(s),
    site: "both" as const,
    key: s.key,
    clear: { kind: "shortcut", id: s.id, key: "" } as Change,
  }));
  out.push({ id: "picker", name: "Save to playlist…", site: "youtube", key: f.shortcuts.pickerKey, clear: { kind: "key", which: "picker", key: "" } });
  out.push({ id: "undo", name: "Undo", site: "both", key: ui.s.undoKey, clear: { kind: "key", which: "undo", key: "" } });
  const names = { playNext: "Play next", addToQueue: "Add to queue", save: "Save to playlist", savePicker: "Save to playlist…", like: "Like", remove: "Remove from queue" } as const;
  for (const [k, v] of Object.entries(f.musicShortcuts.keys))
    out.push({
      id: `music:${k}`,
      name: `${names[k as keyof typeof names]} (YouTube Music)`,
      site: "music",
      key: v,
      clear: { kind: "musicKey", action: k as keyof typeof names, key: "" },
    });
  return out.filter((o) => o.key);
}

