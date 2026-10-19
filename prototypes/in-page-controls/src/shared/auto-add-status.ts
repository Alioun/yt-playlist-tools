// THROWAWAY PROTOTYPE (ticket 14). Ticket 07's per-playback states turned into the watch-page button's words, its
// menu's status line and per-playlist rows. Final in-page copy for ticket 07's draft table.
export type Kind =
  | "counting"
  | "partly"
  | "added"
  | "already"
  | "failed"
  | "skipped"
  | "paused"
  | "live"
  | "cantMeasure"
  | "notTracked";

export type Status = {
  kind: Kind | "off";
  /** The pill's label (watch page). */
  pill: string;
  /** The label under the Shorts column button. */
  short: string;
  /** The status line: the pill's tooltip and the menu's first line. */
  line: string;
  lead: "ring" | "check" | "error" | "block" | "pause" | "live" | "warning" | "mark";
  ring: number;
  rows: { id: string; title: string; text: string; done?: boolean; muted?: boolean }[];
};

type Snap = {
  features: { autoAdd: boolean };
  autoAdd: { kind: Kind; progress: number };
  playlists: { id: string; title: string }[];
};
const AUTO = [
  { id: "PLmusic", goal: 50 },
  { id: "PLtalks", goal: 90 },
  { id: "PLkids", goal: 50, filtered: true },
];
const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);

export function statusOf(s: Snap): Status {
  const title = (id: string) => s.playlists.find((p) => p.id === id)?.title ?? id;
  const k = s.autoAdd.kind;
  const p = s.autoAdd.progress;
  const live = AUTO.filter((a) => !a.filtered);
  if (!s.features.autoAdd || k === "notTracked")
    return { kind: s.features.autoAdd ? "notTracked" : "off", pill: "", short: "Save", line: "", lead: "mark", ring: 0, rows: [] };
  const filteredRow = (a: (typeof AUTO)[number]) => ({ id: a.id, title: title(a.id), text: "Filtered out", muted: true });
  const rowsFor = (fn: (a: (typeof AUTO)[number], i: number) => { text: string; done?: boolean }) =>
    AUTO.map((a, i) => (a.filtered ? filteredRow(a) : { id: a.id, title: title(a.id), ...fn(a, i) }));
  const first = title(live[0].id);
  switch (k) {
    case "counting":
      return {
        kind: k,
        pill: `Auto-adds at ${live[0].goal} %`,
        short: `${p} %`,
        line: `Auto-adds at ${live[0].goal} % · ${p} % watched`,
        lead: "ring",
        ring: p / live[0].goal,
        rows: rowsFor((a) => ({ text: `At ${a.goal} %` })),
      };
    case "partly":
      return {
        kind: k,
        pill: `Auto-added · next at ${live[1].goal} %`,
        short: "Added",
        line: `Added to ${first} · ${title(live[1].id)} at ${live[1].goal} %`,
        lead: "ring",
        ring: p / live[1].goal,
        rows: rowsFor((_a, i) => (i === 0 ? { text: "Auto-added", done: true } : { text: `At ${live[1].goal} %` })),
      };
    case "added":
      return {
        kind: k,
        pill: "Auto-added",
        short: "Added",
        line: `Auto-added to ${first} and ${title(live[1].id)}`,
        lead: "check",
        ring: 1,
        rows: rowsFor(() => ({ text: "Auto-added", done: true })),
      };
    case "already":
      return {
        kind: k,
        pill: `Already in ${cut(first, 18)}`,
        short: "Saved",
        line: `Already in ${first}`,
        lead: "check",
        ring: 1,
        rows: rowsFor(() => ({ text: "Already in", done: true })),
      };
    case "failed":
      return {
        kind: k,
        pill: "Couldn't auto-add",
        short: "Failed",
        line: `Couldn't auto-add to ${first}. Check your connection.`,
        lead: "error",
        ring: 1,
        rows: rowsFor((_a, i) => ({ text: i === 0 ? "Couldn't add" : `At ${live[1].goal} %` })),
      };
    case "skipped":
      return {
        kind: k,
        pill: "Not auto-adding",
        short: "Skipped",
        line: "Not auto-adding this video",
        lead: "block",
        ring: 0,
        rows: rowsFor(() => ({ text: "Skipped until you restart the browser" })),
      };
    case "paused":
      return {
        kind: k,
        pill: "Auto-add paused",
        short: "Paused",
        line: "Auto-add paused until you resume it or restart the browser",
        lead: "pause",
        ring: 0,
        rows: rowsFor((a) => ({ text: `At ${a.goal} % · paused` })),
      };
    case "live":
      return { kind: k, pill: "Not auto-added", short: "Live", line: "Live streams aren't auto-added", lead: "live", ring: 0, rows: [] };
    case "cantMeasure":
      return {
        kind: k,
        pill: "Can't follow progress",
        short: "Can't",
        line: "Auto-add can't follow this video's progress, so it won't be added",
        lead: "warning",
        ring: 0,
        rows: [],
      };
  }
}
