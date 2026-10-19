// THROWAWAY PROTOTYPE (ticket 15). What opening the one playlist picker asks for. Types only, so the popup's first
// view can import it without loading the picker.
import type { AccountId, Site } from "$shared/model/types";

export interface PickerItem {
  id: string;
  title: string;
  kind: "video" | "short" | "song";
}

export type PickerRequest =
  | {
      /** Ticking a row adds the item there; check marks show membership (ticket 12). */
      mode: "save";
      site: Site;
      acct: AccountId;
      item: PickerItem;
      /** Choose mode (ticket 26): no quick-save playlist yet, so the pick also becomes it. */
      setsQuickSave?: boolean;
    }
  | {
      /** One playlist for a purpose: a shortcut's playlist, a quick-save playlist. */
      mode: "choose";
      site: Site;
      acct: AccountId;
      title: string;
      subtitle?: string;
      selected: string | null;
      purpose: "shortcut" | "quickSave" | "musicQuickSave";
      onchoose: (playlist: string) => void;
    };
