// THROWAWAY PROTOTYPE (ticket 14; ticket 17's site/core/keys, ticket 08's rules). One capture-phase keydown listener on
// window, present only while some binding exists. Ignores typing, IME, auto-repeat and open menus or dialogs (ours or
// YouTube's); on a match it calls preventDefault and stopImmediatePropagation (YouTube's Shorts handler ignores
// preventDefault). Matching is character first for plain letters and digits, else the physical key.
export type Combo = { key: string; alt?: boolean; shift?: boolean; ctrl?: boolean; meta?: boolean };
export type Binding = { id: string; combo: Combo; run: (e: KeyboardEvent) => void };

const EDITABLE_INPUT = /^(?!checkbox|radio|range|button|submit|reset|image|color|file)/;

function isTyping(e: KeyboardEvent) {
  for (const n of e.composedPath()) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.isContentEditable) return true;
    if (n instanceof HTMLTextAreaElement || n instanceof HTMLSelectElement) return true;
    if (n instanceof HTMLInputElement && EDITABLE_INPUT.test(n.type)) return true;
    const role = n.getAttribute("role");
    if (role && /^(textbox|searchbox|combobox|spinbutton)$/.test(role)) return true;
  }
  return false;
}

/** YouTube's own menus and dialogs (its ⋮ dropdowns, the Save dialog). */
function youtubeLayerOpen() {
  for (const d of document.querySelectorAll("tp-yt-iron-dropdown, tp-yt-paper-dialog, yt-sheet-view-model")) {
    const s = (d as HTMLElement).style;
    if ((d as HTMLElement).offsetParent !== null && s.display !== "none" && d.getAttribute("aria-hidden") !== "true") return true;
  }
  return false;
}

const matches = (c: Combo, e: KeyboardEvent) => {
  if (!!c.alt !== e.altKey || !!c.shift !== e.shiftKey || !!c.ctrl !== e.ctrlKey || !!c.meta !== e.metaKey) return false;
  const want = c.key.toLowerCase();
  if (/^[a-z0-9]$/.test(want) && /^[a-z0-9]$/i.test(e.key)) return e.key.toLowerCase() === want;
  return e.code === (/^[a-z]$/.test(want) ? `Key${want.toUpperCase()}` : /^[0-9]$/.test(want) ? `Digit${want}` : c.key);
};

export function createKeys(isOurLayerOpen: () => boolean) {
  const bindings = new Map<string, Binding>();
  const pending = new Set<string>();
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.isComposing || e.keyCode === 229) return;
    const b = [...bindings.values()].find((b) => matches(b.combo, e));
    if (!b) return;
    if (isTyping(e) || isOurLayerOpen() || youtubeLayerOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (pending.has(b.id)) return;
    b.run(e);
  };
  return {
    bind(list: Binding[]): () => void {
      if (bindings.size === 0) window.addEventListener("keydown", onKey, true);
      for (const b of list) bindings.set(b.id, b);
      return () => {
        for (const b of list) bindings.delete(b.id);
        if (bindings.size === 0) window.removeEventListener("keydown", onKey, true);
      };
    },
    /** Ticket 12: while an explicit add is pending, the same key is ignored. */
    busy(id: string, on: boolean) {
      on ? pending.add(id) : pending.delete(id);
    },
    label: (c: Combo) => [c.ctrl && "Ctrl", c.alt && "Alt", c.shift && "Shift", c.meta && "Meta", c.key.toUpperCase()].filter(Boolean).join("+"),
  };
}
export type Keys = ReturnType<typeof createKeys>;
