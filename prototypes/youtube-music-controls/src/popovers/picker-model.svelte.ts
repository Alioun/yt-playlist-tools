// THROWAWAY PROTOTYPE (ticket 27). A stand-in for ticket 17's PickerModel: rows, search, membership, per-row
// results, pin, create. The host (mock store or the dev build) supplies the effects.
export type Privacy = "private" | "unlisted" | "public";
export interface PlaylistRow {
  id: string;
  title: string;
  privacy: Privacy;
  count: number;
  /** A playlist shortcut's key on this account (ticket 08: keys shown in the picker). */
  key?: string;
}
export type RowState = { kind: "idle" } | { kind: "busy" } | { kind: "error"; text: string };
export type Membership = "loading" | "known" | "unknown";

export interface PickerEffects {
  tick(id: string): Promise<"added" | "already" | "failed">;
  untick(id: string): Promise<"removed" | "failed">;
  pin(id: string): void;
  create(title: string, privacy: Privacy): Promise<PlaylistRow | null>;
  /** Choose mode: the first pick also becomes the quick-save playlist, and the picker closes with a toast. */
  chosen?(id: string): void;
}

export class PickerModel {
  rows = $state<PlaylistRow[]>([]);
  query = $state("");
  membership = $state<Membership>("loading");
  contains = $state<Record<string, boolean>>({});
  rowState = $state<Record<string, RowState>>({});
  quickSaveId = $state<string | null>(null);
  mode = $state<"normal" | "choose">("normal");
  /** Private windows: pins are disabled (ticket 26). */
  privateWindow = $state(false);
  song = $state<{ title: string; byline: string; art: string }>({ title: "", byline: "", art: "" });
  creating = $state(false);
  createBusy = $state(false);
  createError = $state("");
  newTitle = $state("");
  newPrivacy = $state<Privacy>("private");

  private fx: PickerEffects;
  constructor(fx: PickerEffects) {
    this.fx = fx;
  }

  get filtered() {
    const q = this.query.trim().toLowerCase();
    return q ? this.rows.filter((r) => r.title.toLowerCase().includes(q)) : this.rows;
  }

  async toggle(id: string) {
    const st = this.rowState[id];
    if (st?.kind === "busy") return;
    this.rowState[id] = { kind: "busy" };
    if (this.contains[id]) {
      const r = await this.fx.untick(id);
      if (r === "removed") {
        this.contains[id] = false;
        this.rowState[id] = { kind: "idle" };
      } else this.rowState[id] = { kind: "error", text: "Couldn't remove" };
      return;
    }
    const r = await this.fx.tick(id);
    if (r === "failed") {
      this.rowState[id] = { kind: "error", text: "Couldn't save" };
      return;
    }
    this.contains[id] = true;
    this.rowState[id] = { kind: "idle" };
    if (this.mode === "choose") this.fx.chosen?.(id);
  }

  pin(id: string) {
    if (this.privateWindow) return;
    this.quickSaveId = id;
    this.fx.pin(id);
  }

  async create() {
    const title = this.newTitle.trim();
    if (!title) {
      this.createError = "Give the playlist a title";
      return;
    }
    if (/[<>]/.test(title)) {
      this.createError = "Titles can't contain < or >";
      return;
    }
    this.createBusy = true;
    this.createError = "";
    const row = await this.fx.create(title, this.newPrivacy);
    this.createBusy = false;
    if (!row) {
      this.createError = "Couldn't create the playlist. Try again, or create it on YouTube Music.";
      return;
    }
    this.rows = [row, ...this.rows];
    this.contains[row.id] = true; // created with the song already in it (ticket 12)
    this.creating = false;
    this.newTitle = "";
    if (this.mode === "choose") this.fx.chosen?.(row.id);
  }
}
