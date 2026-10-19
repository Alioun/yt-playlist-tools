// THROWAWAY PROTOTYPE (ticket 15), shaped on ticket 17's `shared/picker/model.svelte.ts`: one playlist-picker
// behaviour for the popup, settings and onboarding (and, in the product, the in-page popovers).
//
//   new PickerModel({ source, site, mode })  →  rows, query, membership, tick(id), untick(id), pin(id), create(title, privacy)
//
// Modes:
//   save    a check mark means the item is already in that playlist (membership, fetched fresh on open, ticket 12);
//           ticking adds, unticking removes (PROVISIONAL, ticket 26: needs the user's go-ahead).
//   choose  one playlist for a purpose (a shortcut's, a quick-save playlist); ticking selects it.
//   many    several (auto-add playlists); ticking toggles.
import type { Privacy } from "../model/types";

export interface PickerPlaylist {
  id: string;
  title: string;
  privacy: Privacy;
  count: number;
  hue: number;
  fresh?: boolean;
  /** Chosen but no longer in YouTube's list (deleted, or not this account's): a Missing playlist (ticket 12). */
  gone?: boolean;
}

export type RowState = "idle" | "busy" | "done" | "error";

export interface PickerSource {
  list(): Promise<{ list: PickerPlaylist[]; fromCache: boolean; savedAgo: string }>;
  /** save mode: which playlists already hold the item. null = couldn't be read. */
  membership?(): Promise<string[] | null>;
  add?(playlist: string): Promise<{ outcome: "added" | "already" } | { outcome: "failed"; error: string }>;
  remove?(playlist: string): Promise<{ ok: boolean }>;
  create(title: string, privacy: Privacy): Promise<{ id: string } | { error: string }>;
  /** choose / many: what's chosen now, and how a tick changes it. */
  chosen?(): string[];
  choose?(playlist: string, on: boolean): void;
  /** Each playlist's shortcut key on this account (ticket 08: keys shown in the picker). */
  keys(): Record<string, string>;
  /** Ticket 12's Missing / Full marks. */
  marks(): Record<string, "missing" | "full">;
  /** Choose mode on Save (ticket 26): the pin, "Use for one-click save". */
  pinned?(): string | null;
  pin?(playlist: string): void;
}

export interface PickerRow {
  playlist: PickerPlaylist;
  checked: boolean;
  state: RowState;
  error: string;
  key: string;
  mark: "missing" | "full" | null;
}

export class PickerModel {
  readonly mode: "save" | "choose" | "many";
  readonly site: "youtube" | "music";
  private source: PickerSource;

  query = $state("");
  all = $state<PickerPlaylist[]>([]);
  loading = $state(true);
  fromCache = $state(false);
  savedAgo = $state("");
  /** save mode: "loading" until YouTube answers, then "ready", or "unavailable" (no check marks, ticket 12). */
  membership = $state<"loading" | "ready" | "unavailable">("loading");
  private member = $state<string[]>([]);
  private states = $state<Record<string, { state: RowState; error: string }>>({});
  /** Bumped when the source's chosen set changes outside the model. */
  private tickTock = $state(0);

  constructor(opts: { source: PickerSource; site: "youtube" | "music"; mode: "save" | "choose" | "many" }) {
    this.source = opts.source;
    this.site = opts.site;
    this.mode = opts.mode;
    this.load();
  }

  private async load() {
    const [l, m] = await Promise.all([this.source.list(), this.mode === "save" ? this.source.membership?.() : Promise.resolve([])]);
    this.all = l.list;
    this.fromCache = l.fromCache;
    this.savedAgo = l.savedAgo;
    this.loading = false;
    if (this.mode === "save") {
      if (m === null || m === undefined) this.membership = "unavailable";
      else {
        this.member = m;
        this.membership = "ready";
      }
    } else this.membership = "ready";
  }

  /** Rows in YouTube's own Save-dialog order (Watch later first on youtube.com), narrowed by the search. */
  get rows(): PickerRow[] {
    void this.tickTock;
    const q = this.query.trim().toLowerCase();
    const keys = this.source.keys();
    const marks = this.source.marks();
    const chosen = this.mode === "save" ? this.member : (this.source.chosen?.() ?? []);
    return this.all
      .filter((p) => !q || p.title.toLowerCase().includes(q))
      .filter((p) => this.site === "youtube" || p.id !== "WL" || this.mode !== "save")
      .map((p) => ({
        playlist: p,
        checked: chosen.includes(p.id),
        state: this.states[p.id]?.state ?? "idle",
        error: this.states[p.id]?.error ?? "",
        key: keys[p.id] ?? "",
        mark: marks[p.id] ?? null,
      }));
  }

  get pinned() {
    void this.tickTock;
    return this.source.pinned?.() ?? null;
  }

  async tick(id: string) {
    if (this.mode !== "save") {
      this.source.choose?.(id, true);
      this.tickTock++;
      return;
    }
    this.states[id] = { state: "busy", error: "" };
    const r = await this.source.add!(id);
    if (r.outcome === "failed") {
      this.states[id] = { state: "error", error: `Couldn't save: ${r.error.toLowerCase().replace(/\.$/, "")}` };
      return;
    }
    if (!this.member.includes(id)) this.member = [...this.member, id];
    this.states[id] = { state: "done", error: r.outcome === "already" ? "Already in it" : "" };
  }

  async untick(id: string) {
    if (this.mode !== "save") {
      this.source.choose?.(id, false);
      this.tickTock++;
      return;
    }
    this.states[id] = { state: "busy", error: "" };
    const r = await this.source.remove!(id);
    if (!r.ok) {
      this.states[id] = { state: "error", error: "Couldn't remove" };
      return;
    }
    this.member = this.member.filter((x) => x !== id);
    this.states[id] = { state: "idle", error: "" };
  }

  pin(id: string) {
    this.source.pin?.(id);
    this.tickTock++;
  }

  /** New playlist (ticket 12). In save mode it's created with the item already in it, one request. */
  async create(title: string, privacy: Privacy): Promise<string | { error: string }> {
    const r = await this.source.create(title, privacy);
    if ("error" in r) return r;
    // New playlists sit right after Watch later, where YouTube's own dialog puts the most recently updated.
    const fresh = { id: r.id, title, privacy, count: this.mode === "save" ? 1 : 0, hue: 182, fresh: true };
    this.all = [...this.all.filter((p) => p.id === "WL"), fresh, ...this.all.filter((p) => p.id !== "WL")];
    if (this.mode === "save") this.member = [...this.member, r.id];
    else this.source.choose?.(r.id, true);
    this.tickTock++;
    return r.id;
  }

  refresh() {
    this.tickTock++;
  }
}
