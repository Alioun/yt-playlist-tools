// THROWAWAY PROTOTYPE (ticket 15), shaped on ticket 17's UI seam so the views carry into the product:
//
//   interface Backend {
//     load(): Promise<UiSnapshot>                    // one storage.local.get for the first view (ticket 24)
//     watch(fn: (e: UiEvent) => void): () => void    // storage.onChanged
//     change(c: Change): Promise<ChangeResult>       // through the background; the popup adds its window ID
//     call<K extends UiCall>(kind: K, args: UiArgs<K>): Promise<UiResult<K>>
//     access: { has(site): Promise<boolean>; request(site): Promise<boolean> }  // request() first, in the click handler
//   }
//
// Only the fake adapter exists here (`fake/`). Views never touch storage or `browser.*`; they read the snapshot and
// send Changes. The Change kinds are the prototype's guess at ticket 17's one discriminated union.
import type { Playlist } from "./fake/catalog";
import type {
  AccountId,
  AccountLabel,
  ChannelFilter,
  Doc,
  FeatureId,
  MusicButton,
  MusicKeyAction,
  PlayingSong,
  Privacy,
  Site,
  Takes,
  ThisVideo,
} from "$shared/model/types";

export type { Playlist };

/** What `load()` returns: settings, setups, device and sync state, cached titles and marks, and what the
 *  background knows about this window (the prototype folds that into `env`). */
export type UiSnapshot = Omit<Doc, "thisVideo" | "playing">;

export type UiEvent = { kind: "changed"; snapshot: UiSnapshot };

export type Change =
  | { kind: "feature"; id: FeatureId; on: boolean }
  | { kind: "featureOption"; id: FeatureId; option: string; value: boolean | number | string }
  | { kind: "pause"; paused: boolean }
  | { kind: "skipVideo"; skip: boolean }
  | { kind: "musicSection"; on: boolean }
  | { kind: "musicButton"; button: MusicButton; on: boolean }
  | { kind: "musicKey"; action: MusicKeyAction; key: string }
  | { kind: "key"; which: "picker" | "undo"; key: string }
  | { kind: "autoAddPlaylist"; acct: AccountId; playlist: string; on: boolean }
  | { kind: "playlistOptions"; acct: AccountId; playlist: string; takes?: Takes; percent?: number | null }
  | { kind: "filter"; acct: AccountId; playlist: string; filter: ChannelFilter }
  | { kind: "shortcutAdd" }
  | { kind: "shortcut"; id: string; key?: string; label?: string }
  | { kind: "shortcutRemove"; id: string }
  | { kind: "shortcutRestore"; shortcut: Doc["features"]["shortcuts"]["list"][number]; at: number; targets: [AccountId, string][] }
  | { kind: "shortcutTarget"; acct: AccountId; id: string; playlist: string | null }
  | { kind: "quickSave"; acct: AccountId; site: Site; playlist: string | null }
  | { kind: "removeChosen"; acct: AccountId; playlist: string }
  | { kind: "removeSetup"; acct: AccountId }
  | { kind: "removeKeptFilters" }
  | { kind: "theme"; theme: "system" | "light" | "dark" }
  | { kind: "sync"; on: boolean }
  | { kind: "consent"; accepted: boolean; turnOn?: FeatureId[] }
  | { kind: "discardUnclaimed" }
  | { kind: "dismiss"; notice: "claim" | "remoteReset" }
  | { kind: "detailedLog"; on: boolean };

export type ChangeResult = { ok: true } | { ok: false; refused: "private" | "sync-full" | "update-needed" | "invalid" };

export interface AccountInView {
  acct: AccountId | null;
  label: AccountLabel | null;
  signedIn: boolean;
  /** "tab": the active tab's account; "recent": the most recent YouTube tab's; "cached": no tab, last known. */
  from: "tab" | "recent" | "cached" | "picked";
}

export type AddOutcome = { outcome: "added" | "already" } | { outcome: "failed"; error: string };

export interface UiCalls {
  accountInView: { args: Record<string, never>; result: AccountInView };
  thisTab: { args: Record<string, never>; result: { video: ThisVideo | null; playing: PlayingSong | null } };
  playlists: { args: { acct: AccountId }; result: { list: Playlist[]; fromCache: boolean; savedAgo: string } };
  membership: { args: { acct: AccountId; item: string }; result: string[] | null };
  add: { args: { acct: AccountId; item: string; playlist: string }; result: AddOutcome };
  remove: { args: { acct: AccountId; item: string; playlist: string }; result: { ok: boolean } };
  create: {
    args: { acct: AccountId; title: string; privacy: Privacy; withItem?: string };
    result: { id: string } | { error: string };
  };
  resolveChannel: { args: { input: string }; result: { id: string; title: string; handle?: string } | { error: string } };
  syncJoin: { args: { choice: "synced" | "local" | "cancel" }; result: { ok: boolean } };
  clearAll: { args: { alsoSynced: boolean }; result: { ok: boolean } };
  checkNow: { args: Record<string, never>; result: { when: string; result: string } };
  diagnostics: { args: Record<string, never>; result: { report: string } };
  channel: { args: { id: string }; result: { id: string; title: string; handle?: string; hue: number } | null };
  /** Ticket 11's claim of the unclaimed 1.x setup, run only after the upgrade note's Agree (ticket 19 §2.4). */
  claim: {
    args: Record<string, never>;
    result:
      | { outcome: "claimed"; acct: AccountId; titles: string[]; leftOut: number }
      | { outcome: "sign-in" | "open-youtube" | "other-account" | "nothing" };
  };
}
export type UiCall = keyof UiCalls;
export type UiArgs<K extends UiCall> = UiCalls[K]["args"];
export type UiResult<K extends UiCall> = UiCalls[K]["result"];

export interface Backend {
  load(): Promise<UiSnapshot>;
  watch(fn: (e: UiEvent) => void): () => void;
  change(c: Change): Promise<ChangeResult>;
  call<K extends UiCall>(kind: K, args: UiArgs<K>): Promise<UiResult<K>>;
  access: { has(site: Site): Promise<boolean>; request(site: Site): Promise<boolean> };
}
